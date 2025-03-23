const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require('path');
const { engine } = require('express-handlebars');
const { v4: uuidv4 } = require('uuid');
const Deck = require('./helpers/deck');
const gameHelper = require('./helpers/game');
const Bot = require('./helpers/bot');

// Set up Handlebars as the view engine
app.engine('hbs', engine({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts')
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'Accessible Bluff - Welcome' });
});

app.get('/home', (req, res) => {
  res.render('home', { title: 'Accessible Bluff - Home' });
});

app.get('/game', (req, res) => {
  res.render('game', { title: 'Accessible Bluff - Game' });
});

app.get('/game-with-bot', (req, res) => {
  const difficulty = req.query.difficulty || 'medium';
  res.render('game', { 
    title: 'Accessible Bluff - Game with Bot', 
    withBot: true,
    botDifficulty: difficulty
  });
});

// Game state
const rooms = {};
const roomCounts = {};
const roomCapacity = 4;
const CardDeck = new Deck.Deck();
const bots = {};

// Helper function to check if a room has enough players to start
function checkRoomReady(roomId) {
  const room = rooms[roomId];
  if (!room) return false;
  
  return room.clients.length >= 2;
}

// Helper function to start a game in a room
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  console.log(`Starting game in room ${roomId} with ${room.clients.length} players`);
  
  // Shuffle deck and distribute cards
  CardDeck.shuffle();
  room.cardset = [...CardDeck.cards];
  
  // Distribute cards to players
  gameHelper.distributeCards(roomId, rooms);
  
  // Set the first player's turn
  room.currentTurnIndex = 0;
  io.to(roomId).emit('STOC-GAME-STARTED', 0);
  
  // If there's a bot in this room, give it its cards
  if (room.hasBot) {
    const bot = bots[roomId];
    if (bot) {
      // Get the bot's cards from the room
      const botIndex = room.botIndex;
      if (botIndex !== undefined && room.playerCards && room.playerCards[botIndex]) {
        bot.setCards(room.playerCards[botIndex]);
      }
    }
    
    // Schedule the first bot move if it's the bot's turn
    if (room.currentTurnIndex === room.botIndex) {
      scheduleBotTurn(roomId);
    }
  }
}

// Function to handle bot turns
function scheduleBotTurn(roomId, delay = 2000) {
  const room = rooms[roomId];
  if (!room || !room.hasBot) return;
  
  // Get the bot for this room
  const bot = bots[roomId];
  if (!bot) return;
  
  // Only proceed if it's actually the bot's turn
  if (room.currentTurnIndex !== room.botIndex) return;
  
  // Schedule bot's action after a short delay to make it seem more natural
  setTimeout(() => {
    if (!rooms[roomId]) return; // Room may have been deleted
    
    // Check if it's a first play or mid-game
    const isFirstPlay = room.CardStack.length === 0 && room.newGame;
    
    // Let the bot decide whether to play or pass
    const decision = bot.decidePlayOrPass(isFirstPlay);
    
    if (decision.type === 'place') {
      // Bot decided to place cards
      console.log(`Bot is placing ${decision.cards.length} cards as ${decision.declaredValue}`);
      
      // Add cards to the game state
      room.lastPlayedCardCount = decision.cards.length;
      room.playinguserfail = false;
      
      decision.cards.forEach((card) => {
        room.SuitStack.push(card.suit);
        room.CardStack.push(card.value);
      });
      
      if (bot.cards.length === 0) {
        room.playerGoingToWin = room.botIndex;
        console.log(`Bot is going to win with no cards left`);
      }
      
      room.raiseActionDone = false;
      
      if (room.newGame === true) {
        room.newGame = false;
      }
      
      room.bluff_text = decision.declaredValue;
      
      // Emit the play event to all clients
      io.to(roomId).emit('STOC-GAME-PLAYED', room.lastPlayedCardCount, room.bluff_text);
      io.to(roomId).emit('STOC-RAISE-TIME-START');
      
      // Record the action for bot's history
      bot.recordAction({
        type: 'place',
        player: bot.name,
        declaredValue: decision.declaredValue,
        cardCount: decision.cards.length,
        wasBluff: decision.isBluff
      });
      
      // Start a timer for raise time
      setTimeout(() => {
        if (!rooms[roomId]) return; // Room may have been deleted
        
        if (room.playerGoingToWin !== -1) {
          room.wonUsers.push(room.playerGoingToWin);
          io.to(roomId).emit('STOC-PLAYER-WON', room.playerGoingToWin);
          room.playerGoingToWin = -1;
        }
        
        if (!room.raiseActionDone) {
          io.to(roomId).emit('STOC-RAISE-TIME-OVER');
          gameHelper.changeTurn(roomId, rooms, io);
          
          // Schedule bot's next turn if it's the bot's turn again
          if (room.currentTurnIndex === room.botIndex) {
            scheduleBotTurn(roomId);
          }
        }
      }, 15000);
    } else {
      // Bot decided to pass
      console.log(`Bot passed its turn`);
      
      room.passedPlayers.push(room.botIndex);
      
      io.to(roomId).emit('STOC-GAME-PLAYED', 0, room.bluff_text);
      
      // Record the action for bot's history
      bot.recordAction({
        type: 'pass',
        player: bot.name
      });
      
      if (room.passedPlayers.length === (room.clients.length - room.wonUsers.length)) {
        // All remaining players have passed
        room.CardStack = [];
        room.SuitStack = [];
        io.to(roomId).emit('STOC-PLAY-OVER');
        room.passedPlayers.length = 0;
        room.newGame = true;
        
        setTimeout(() => {
          if (!rooms[roomId]) return;
          
          // Let a random player start the next round
          const activePlayers = room.clients.length - room.wonUsers.length;
          if (activePlayers > 0) {
            const newPos = Math.floor(Math.random() * activePlayers);
            room.currentTurnIndex = newPos;
            gameHelper.changeTurn(roomId, rooms, io);
            
            // Schedule bot's turn if needed
            if (room.currentTurnIndex === room.botIndex) {
              scheduleBotTurn(roomId);
            }
          }
        }, 3000);
      } else {
        gameHelper.changeTurn(roomId, rooms, io);
        
        // Schedule bot's turn if needed
        if (room.currentTurnIndex === room.botIndex) {
          scheduleBotTurn(roomId);
        }
      }
    }
  }, delay);
}

// Function to handle bot challenges
function processBotChallenge(roomId, currentPlayerIndex) {
  const room = rooms[roomId];
  if (!room || !room.hasBot) return false;
  
  // Only process if we're in raise time and it's not the bot's turn (bot can't challenge itself)
  if (room.currentTurnIndex === room.botIndex || !room.lastPlayedCardCount) {
    return false;
  }
  
  const bot = bots[roomId];
  if (!bot) return false;
  
  // Let the bot decide whether to challenge
  const shouldChallenge = bot.decideChallenge({
    declaredValue: room.bluff_text,
    cardCount: room.lastPlayedCardCount,
    player: `Player ${currentPlayerIndex + 1}`
  });
  
  if (shouldChallenge) {
    console.log(`Bot decided to challenge`);
    
    // Process the challenge
    room.raiseActionDone = true;
    
    const poppedElements = [];
    const poppedSuits = [];
    room.playinguserfail = false;
    
    for (let i = 0; i < room.lastPlayedCardCount; i++) {
      if (room.CardStack.length > 0) {
        const poppedSuit = room.SuitStack.pop();
        const poppedElement = room.CardStack.pop();
        
        if (poppedElement != room.bluff_text) {
          room.playinguserfail = true;
        }
        
        poppedElements.push(poppedElement);
        poppedSuits.push(poppedSuit);
      } else {
        break;
      }
    }
    
    const challengerIndex = room.botIndex;
    const raisedClientPos = room.currentTurnIndex;
    
    console.log(`Bot challenge result: ${room.playinguserfail ? 'Successful' : 'Failed'} challenge`);
    
    // Record the action for bot's history
    bot.recordAction({
      type: 'challenge',
      player: bot.name,
      target: `Player ${raisedClientPos + 1}`,
      wasSuccessful: room.playinguserfail
    });
    
    if (room.playinguserfail) {
      // Challenge was successful - the player was bluffing
      room.playerGoingToWin = -1;
      io.to(roomId).emit('STOC-SHOW-RAISED-CARDS', poppedElements, poppedSuits, raisedClientPos, challengerIndex);
      
      // Handle if the challenge was against a bot
      if (room.hasBot && raisedClientPos === room.botIndex) {
        // Bot was bluffing and got caught
        const bot = bots[roomId];
        if (bot) {
          // Create card objects from the values and suits
          const newCards = [...poppedElements.map((val, idx) => ({ value: val, suit: poppedSuits[idx] }))];
          bot.addCards(newCards);
          
          // Record this outcome for the bot
          bot.recordAction({
            type: 'challengeReceived',
            player: `Player ${challengerIndex + 1}`,
            wasSuccessful: true
          });
        }
      } else {
        // Give penalty cards to the player who played (was caught bluffing)
        const penaltyTargetSocket = room.clients[raisedClientPos];
        if (penaltyTargetSocket) {
          penaltyTargetSocket.emit('STOC1C-DUMP-PENALTY-CARDS', 
            room.CardStack, poppedElements, 
            room.SuitStack, poppedSuits);
        }
      }
      
      // Next turn goes to the challenger (bot)
      room.currentTurnIndex = challengerIndex;
    } else {
      // Challenge was unsuccessful - the player was honest
      io.to(roomId).emit('STOC-SHOW-RAISED-CARDS', poppedElements, poppedSuits, raisedClientPos, challengerIndex);
      
      // If the challenge was against a bot, record it
      if (room.hasBot && raisedClientPos === room.botIndex) {
        const bot = bots[roomId];
        if (bot) {
          bot.recordAction({
            type: 'challengeReceived',
            player: `Player ${challengerIndex + 1}`,
            wasSuccessful: false
          });
        }
      }
      
      // Give penalty cards to the challenger
      socket.emit('STOC1C-DUMP-PENALTY-CARDS', 
        room.CardStack, poppedElements, 
        room.SuitStack, poppedSuits);
      
      // Check if the player who placed cards has won
      if (room.playerGoingToWin != -1) {
        room.wonUsers.push(room.playerGoingToWin);
        io.to(roomId).emit('STOC-PLAYER-WON', room.playerGoingToWin);
        room.playerGoingToWin = -1;
      }
      
      // Next turn goes to the player who played
      room.currentTurnIndex = raisedClientPos;
    }
    
    // Reset for next round
    room.CardStack = [];
    room.SuitStack = [];
    room.passedPlayers.length = 0;
    room.newGame = true;
    
    // Notify clients that the play is over
    setTimeout(() => {
      if (!rooms[roomId]) return;
      io.to(roomId).emit('STOC-PLAY-OVER');
    }, 3000);
    
    // Start next turn
    setTimeout(() => {
      if (!rooms[roomId]) return;
      gameHelper.changeTurn(roomId, rooms, io);
      
      // Schedule bot turn if needed
      if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
        scheduleBotTurn(roomId);
      }
    }, 5000);
    
    return true;
  }
  
  return false;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log("New connection established. User connected with ID:", socket.id);
  
  let withBot = false;
  let botDifficulty = 'medium';
  
  // Check for bot mode in handshake
  if (socket.handshake.query && socket.handshake.query.withBot) {
    withBot = true;
    botDifficulty = socket.handshake.query.botDifficulty || 'medium';
    console.log(`Client requesting game with bot (Difficulty: ${botDifficulty})`);
  }
  
  // Find or create a room with available capacity
  let roomId;
  for (const [room, count] of Object.entries(roomCounts)) {
    if (count < roomCapacity && count > 0) {  // Join existing room with players
      roomId = room;
      break;
    }
  }

  // If no room has available capacity, create a new room
  if (!roomId) {
    roomId = uuidv4();
    console.log(`Creating new room: ${roomId}`);
    
    roomCounts[roomId] = 0;
    rooms[roomId] = {
      clients: [],
      CardStack: [],
      SuitStack: [],
      passedPlayers: [],
      playerGoingToWin: -1,
      wonUsers: [],
      lastPlayedCardCount: undefined,
      currentTurnIndex: -1,
      playinguserfail: false,
      newGame: true,
      bluff_text: undefined,
      raiseActionDone: false,
      cardset: [...CardDeck.cards],
      hasBot: withBot,
      botIndex: withBot ? 1 : undefined, // Bot will be player 2 (index 1)
      playerCards: [] // Store dealt cards for each player
    };
    
    // If bot mode, create a bot for this room
    if (withBot) {
      const bot = new Bot(botDifficulty, 'Bot1');
      bots[roomId] = bot;
      console.log(`Created bot for room ${roomId} with difficulty ${botDifficulty}`);
    }
  }

  // Join the room
  socket.join(roomId);
  rooms[roomId].clients.push(socket);
  roomCounts[roomId]++;
  
  console.log(`Player joined room ${roomId}, now has ${roomCounts[roomId]} players`);
  
  // Add bot client if this is a bot room and it's the first human player
  if (rooms[roomId].hasBot && roomCounts[roomId] === 1) {
    // Add a placeholder for the bot in the clients array (bot has no socket)
    rooms[roomId].clients.push(null);
    roomCounts[roomId]++;
    console.log(`Added bot to room ${roomId}, now has ${roomCounts[roomId]} players`);
  }
  
  // Send room information to client
  socket.emit('STOC-JOINED-ROOM', { 
    roomId, 
    position: rooms[roomId].clients.indexOf(socket),
    playerCount: roomCounts[roomId],
    hasBot: rooms[roomId].hasBot,
    botIndex: rooms[roomId].botIndex
  });

  // Check if room is ready to start the game (2+ players)
  if (checkRoomReady(roomId) && rooms[roomId].currentTurnIndex === -1) {
    // Start the game after a short delay to make sure clients are ready
    setTimeout(() => {
      startGame(roomId);
    }, 1000);
  }

  // Handle card placement
  socket.on('CTOS-PLACE-CARD', (selectedCards, bluff_text, remainingCards) => {
    if (!rooms[roomId]) return;
    
    const playerPosition = rooms[roomId].clients.indexOf(socket);
    console.log(`Player ${playerPosition} placed ${selectedCards.length} cards as ${bluff_text}`);
    
    rooms[roomId].lastPlayedCardCount = selectedCards.length;
    rooms[roomId].playinguserfail = false;
    
    selectedCards.forEach((card) => {
      rooms[roomId].SuitStack.push(card.suit);
      rooms[roomId].CardStack.push(card.value);
    });
    
    if (remainingCards === 0) {
      rooms[roomId].playerGoingToWin = rooms[roomId].currentTurnIndex;
      console.log(`Player ${rooms[roomId].currentTurnIndex} is going to win with no cards left`);
    }
    
    rooms[roomId].raiseActionDone = false;
    
    if (rooms[roomId].newGame === true) {
      rooms[roomId].newGame = false;
      rooms[roomId].bluff_text = bluff_text;
    }
    
    io.to(roomId).emit('STOC-GAME-PLAYED', rooms[roomId].lastPlayedCardCount, rooms[roomId].bluff_text);
    io.to(roomId).emit('STOC-RAISE-TIME-START');
    
    // If there's a bot, see if it wants to challenge
    if (rooms[roomId].hasBot) {
      // Record this action for the bot
      const bot = bots[roomId];
      if (bot) {
        bot.recordAction({
          type: 'place',
          player: `Player ${playerPosition + 1}`,
          declaredValue: bluff_text,
          cardCount: selectedCards.length
        });
        
        // Schedule bot challenge decision with small random delay
        setTimeout(() => {
          if (!rooms[roomId]) return; // Room may have been deleted
          processBotChallenge(roomId, playerPosition);
        }, 1000 + Math.random() * 3000); // 1-4 second delay
      }
    }
    
    // Start a timer for raise time
    setTimeout(() => {
      if (!rooms[roomId]) return; // Room may have been deleted
      
      if (rooms[roomId].playerGoingToWin !== -1) {
        rooms[roomId].wonUsers.push(rooms[roomId].playerGoingToWin);
        io.to(roomId).emit('STOC-PLAYER-WON', rooms[roomId].playerGoingToWin);
        rooms[roomId].playerGoingToWin = -1;
      }
      
      if (!rooms[roomId].raiseActionDone) {
        io.to(roomId).emit('STOC-RAISE-TIME-OVER');
        gameHelper.changeTurn(roomId, rooms, io);
        
        // Schedule bot turn if needed
        if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
          scheduleBotTurn(roomId);
        }
      }
    }, 15000);
  });

  // Handle challenge
  socket.on('CTOS-RAISE-CARD', () => {
    if (!rooms[roomId]) return;
    
    const challengerIndex = rooms[roomId].clients.indexOf(socket);
    const raisedClientPos = rooms[roomId].currentTurnIndex;
    
    // Prevent players from challenging their own cards
    if (challengerIndex === raisedClientPos) {
      console.log(`Player ${challengerIndex} tried to challenge their own cards - rejected`);
      return;
    }
    
    console.log(`Player ${challengerIndex} raised a challenge`);
    rooms[roomId].raiseActionDone = true;
    
    const poppedElements = [];
    const poppedSuits = [];
    rooms[roomId].playinguserfail = false;
    
    for (let i = 0; i < rooms[roomId].lastPlayedCardCount; i++) {
      if (rooms[roomId].CardStack.length > 0) {
        const poppedSuit = rooms[roomId].SuitStack.pop();
        const poppedElement = rooms[roomId].CardStack.pop();
        
        if (poppedElement != rooms[roomId].bluff_text) {
          rooms[roomId].playinguserfail = true;
        }
        
        poppedElements.push(poppedElement);
        poppedSuits.push(poppedSuit);
      } else {
        break;
      }
    }
    
    console.log(`Challenge result: ${rooms[roomId].playinguserfail ? 'Successful' : 'Failed'} challenge`);
    
    if (rooms[roomId].playinguserfail) {
      // Challenge was successful - the player was bluffing
      rooms[roomId].playerGoingToWin = -1;
      io.to(roomId).emit('STOC-SHOW-RAISED-CARDS', poppedElements, poppedSuits, raisedClientPos, challengerIndex);
      
      // Handle if the challenge was against a bot
      if (rooms[roomId].hasBot && raisedClientPos === rooms[roomId].botIndex) {
        // Bot was bluffing and got caught
        const bot = bots[roomId];
        if (bot) {
          // Create card objects from the values and suits
          const newCards = [...poppedElements.map((val, idx) => ({ value: val, suit: poppedSuits[idx] }))];
          bot.addCards(newCards);
          
          // Record this outcome for the bot
          bot.recordAction({
            type: 'challengeReceived',
            player: `Player ${challengerIndex + 1}`,
            wasSuccessful: true
          });
        }
      } else {
        // Give penalty cards to the player who played (was caught bluffing)
        const penaltyTargetSocket = rooms[roomId].clients[raisedClientPos];
        if (penaltyTargetSocket) {
          penaltyTargetSocket.emit('STOC1C-DUMP-PENALTY-CARDS', 
            rooms[roomId].CardStack, poppedElements, 
            rooms[roomId].SuitStack, poppedSuits);
        }
      }
      
      // Next turn goes to the challenger
      rooms[roomId].currentTurnIndex = challengerIndex;
    } else {
      // Challenge was unsuccessful - the player was honest
      io.to(roomId).emit('STOC-SHOW-RAISED-CARDS', poppedElements, poppedSuits, raisedClientPos, challengerIndex);
      
      // If the challenge was against a bot, record it
      if (rooms[roomId].hasBot && raisedClientPos === rooms[roomId].botIndex) {
        const bot = bots[roomId];
        if (bot) {
          bot.recordAction({
            type: 'challengeReceived',
            player: `Player ${challengerIndex + 1}`,
            wasSuccessful: false
          });
        }
      }
      
      // Give penalty cards to the challenger
      socket.emit('STOC1C-DUMP-PENALTY-CARDS', 
        rooms[roomId].CardStack, poppedElements, 
        rooms[roomId].SuitStack, poppedSuits);
      
      // Check if the player who placed cards has won
      if (rooms[roomId].playerGoingToWin != -1) {
        rooms[roomId].wonUsers.push(rooms[roomId].playerGoingToWin);
        io.to(roomId).emit('STOC-PLAYER-WON', rooms[roomId].playerGoingToWin);
        rooms[roomId].playerGoingToWin = -1;
      }
      
      // Next turn goes to the player who played
      rooms[roomId].currentTurnIndex = raisedClientPos;
    }
    
    // Reset for next round
    rooms[roomId].CardStack = [];
    rooms[roomId].SuitStack = [];
    rooms[roomId].passedPlayers.length = 0;
    rooms[roomId].newGame = true;
    
    // Notify clients that the play is over
    setTimeout(() => {
      if (!rooms[roomId]) return;
      io.to(roomId).emit('STOC-PLAY-OVER');
    }, 3000);
    
    // Start next turn
    setTimeout(() => {
      if (!rooms[roomId]) return;
      gameHelper.changeTurn(roomId, rooms, io);
      
      // Schedule bot turn if needed
      if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
        scheduleBotTurn(roomId);
      }
    }, 5000);
  });

  // Handle pass action
  socket.on('CTOS-PASS-CARD', () => {
    if (!rooms[roomId]) return;
    
    const pos = rooms[roomId].currentTurnIndex;
    rooms[roomId].passedPlayers.push(pos);
    
    console.log(`Player ${pos} passed their turn`);
    
    io.to(roomId).emit('STOC-GAME-PLAYED', 0, rooms[roomId].bluff_text);
    
    if (rooms[roomId].passedPlayers.length === (rooms[roomId].clients.length - rooms[roomId].wonUsers.length)) {
      // All remaining players have passed
      rooms[roomId].CardStack = [];
      rooms[roomId].SuitStack = [];
      io.to(roomId).emit('STOC-PLAY-OVER');
      rooms[roomId].passedPlayers.length = 0;
      rooms[roomId].newGame = true;
      
      setTimeout(() => {
        if (!rooms[roomId]) return;
        
        // Let a random player start the next round
        const activePlayers = rooms[roomId].clients.length - rooms[roomId].wonUsers.length;
        if (activePlayers > 0) {
          const newPos = Math.floor(Math.random() * activePlayers);
          rooms[roomId].currentTurnIndex = newPos;
          gameHelper.changeTurn(roomId, rooms, io);
          
          // Schedule bot turn if needed
          if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
            scheduleBotTurn(roomId);
          }
        }
      }, 3000);
    } else {
      gameHelper.changeTurn(roomId, rooms, io);
      
      // Schedule bot turn if needed
      if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
        scheduleBotTurn(roomId);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (!rooms[roomId]) return;
    
    const pos = rooms[roomId].clients.indexOf(socket);
    
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove client from room
    if (pos !== -1) {
      rooms[roomId].clients[pos] = null; // Keep array indexing intact for remaining players
      roomCounts[roomId]--;
      console.log(`Player left room ${roomId}, now has ${roomCounts[roomId]} players`);
      
      // If no players left, clean up the room
      if (roomCounts[roomId] === 0) {
        delete rooms[roomId];
        delete roomCounts[roomId];
        delete bots[roomId];
        console.log(`Room ${roomId} deleted`);
      }
      // If only the bot is left, clean up the room
      else if (rooms[roomId].hasBot && roomCounts[roomId] === 1) {
        delete rooms[roomId];
        delete roomCounts[roomId];
        delete bots[roomId];
        console.log(`Room ${roomId} deleted because only bot remained`);
      }
      // If the current player disconnected, change turn
      else if (rooms[roomId].currentTurnIndex === pos) {
        gameHelper.changeTurn(roomId, rooms, io);
        
        // Schedule bot turn if needed
        if (rooms[roomId].hasBot && rooms[roomId].currentTurnIndex === rooms[roomId].botIndex) {
          scheduleBotTurn(roomId);
        }
      }
    }
  });
});

// Override the distributeCards function to save cards for bots
const originalDistributeCards = gameHelper.distributeCards;
gameHelper.distributeCards = function(roomId, rooms) {
  const room = rooms[roomId];
  if (!room) return;
  
  const players = room.clients.length;
  const cardsPerPlayer = Math.floor(52 / players);
  
  // Shuffle the deck before distribution
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };
  
  shuffleArray(room.cardset);
  
  // Store dealt cards for each player
  room.playerCards = [];
  
  for (let i = 0; i < players; i++) {
    const playerCards = room.cardset.splice(0, cardsPerPlayer);
    room.playerCards[i] = playerCards;
    
    if (room.clients[i]) {
      room.clients[i].emit('STOC-CARDS-DEALT', playerCards);
    }
  }
};

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});