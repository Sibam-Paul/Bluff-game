// Client-side game logic with accessibility features
const socket = io();

// Game state variables
let playerPosition = -1;
let playerCards = [];
let selectedCards = [];
let currentTurn = -1;
let roomId = null;
let playerCount = 0;
let gameStarted = false;
let currentBluffValue = null;
let isRaiseTime = false;
let scores = {};
let hasBot = false;
let botIndex = -1;

// Audio elements
const cardPlacedSound = document.getElementById('card-placed-sound');
const cardRaisedSound = document.getElementById('card-raised-sound');
const shuffleSound = document.getElementById('shuffle-sound');
const raiseTimerSound = document.getElementById('raise-timer-sound');

// DOM elements
const playerStatus = document.getElementById('player-status');
const gameNotification = document.getElementById('game-notification');
const playerContainer = document.getElementById('player-container');
const cardContainer = document.getElementById('card-container');
const containerPlayed = document.getElementById('container-played');
const placeBtn = document.getElementById('place-btn');
const raiseBtn = document.getElementById('raise-btn');
const passBtn = document.getElementById('pass-btn');
const raiseTimer = document.getElementById('raise-timer');

// Initialize URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const withBot = urlParams.has('withBot') || urlParams.get('difficulty');
const botDifficulty = urlParams.get('difficulty') || 'medium';

// If we're in bot mode, pass this info to the server
if (withBot) {
  socket.io.opts.query = {
    withBot: true,
    botDifficulty: botDifficulty
  };
  socket.disconnect().connect();
}

// Socket event handlers
socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

socket.on('STOC-JOINED-ROOM', (data) => {
  roomId = data.roomId;
  playerPosition = data.position;
  playerCount = data.playerCount;
  hasBot = data.hasBot || false;
  botIndex = data.botIndex !== undefined ? data.botIndex : -1;
  
  let statusMessage = `You joined room ${roomId} as Player ${playerPosition + 1}`;
  if (hasBot) {
    statusMessage += `. Playing with Bot (${botDifficulty} difficulty)`;
  }
  
  updateStatus(statusMessage);
  updatePlayers();
  console.log(`Joined room ${roomId} as player ${playerPosition + 1}, hasBot: ${hasBot}`);
});

socket.on('STOC-CARDS-DEALT', (cards) => {
  playerCards = cards;
  if (shuffleSound) shuffleSound.play().catch(err => console.log('Error playing sound:', err));
  updateStatus('Cards have been dealt');
  updateCards();
  console.log('Cards dealt:', playerCards);
});

socket.on('STOC-GAME-STARTED', (firstTurn) => {
  gameStarted = true;
  currentTurn = firstTurn;
  updateStatus(`Game has started. ${firstTurn === playerPosition ? "It's your turn!" : `It's Player ${firstTurn + 1}'s turn.`}`);
  updatePlayers();
  updateButtons();
  announceGameState();
  console.log('Game started with first turn:', firstTurn);
});

socket.on('STOC-TURN-CHANGED', (turnIndex) => {
  currentTurn = turnIndex;
  updateStatus(`${turnIndex === playerPosition ? "It's your turn!" : `It's Player ${turnIndex + 1}'s turn.`}`);
  updatePlayers();
  updateButtons();
  announceGameState();
  console.log('Turn changed to player:', turnIndex);
});

socket.on('STOC-GAME-PLAYED', (cardCount, bluffValue) => {
  if (cardCount > 0) {
    if (cardPlacedSound) cardPlacedSound.play().catch(err => console.log('Error playing sound:', err));
    updateStatus(`Player ${currentTurn + 1} placed ${cardCount} card(s) claiming to be ${bluffValue}`);
  } else {
    updateStatus(`Player ${currentTurn + 1} passed their turn`);
  }
  
  currentBluffValue = bluffValue;
  showNotification(`Player ${currentTurn + 1} played ${cardCount} card(s) as ${bluffValue}`);
  console.log(`Player ${currentTurn + 1} played ${cardCount} cards as ${bluffValue}`);
});

socket.on('STOC-RAISE-TIME-START', () => {
  isRaiseTime = true;
  
  // Disable the raise button for the player who just placed cards
  const isCurrentPlayer = currentTurn === playerPosition;
  raiseBtn.disabled = isCurrentPlayer;
  
  if (!isCurrentPlayer) {
    raiseBtn.classList.add('btn-pulse');
  } else {
    console.log('Raise button disabled for current player who placed cards');
  }
  
  if (raiseTimerSound) raiseTimerSound.play().catch(err => console.log('Error playing sound:', err));
  raiseTimer.classList.remove('d-none');
  
  // Start countdown animation
  const progressBar = raiseTimer.querySelector('.progress-bar');
  progressBar.style.width = '100%';
  
  let progress = 100;
  const interval = setInterval(() => {
    progress -= 1;
    progressBar.style.width = `${progress}%`;
    
    if (progress <= 0) {
      clearInterval(interval);
    }
  }, 150); // 15 seconds total
  
  showNotification('Challenge time! Press F or the Raise button if you think the player is bluffing');
  console.log('Raise time started');
});

socket.on('STOC-RAISE-TIME-OVER', () => {
  isRaiseTime = false;
  raiseBtn.disabled = true;
  raiseBtn.classList.remove('btn-pulse');
  raiseTimer.classList.add('d-none');
  if (raiseTimerSound) {
    raiseTimerSound.pause();
    raiseTimerSound.currentTime = 0;
  }
  console.log('Raise time ended');
});

socket.on('STOC-SHOW-RAISED-CARDS', (cards, suits, raisedPlayer, challenger) => {
  if (cardRaisedSound) cardRaisedSound.play().catch(err => console.log('Error playing sound:', err));
  
  // Display the revealed cards
  containerPlayed.innerHTML = '';
  for (let i = 0; i < cards.length; i++) {
    const cardElement = createCardElement(cards[i], suits[i], false);
    containerPlayed.appendChild(cardElement);
  }
  
  // Show the result of the challenge
  let message = '';
  if (cards.every(card => card === currentBluffValue)) {
    message = `Player ${challenger + 1} challenged incorrectly! Player ${raisedPlayer + 1} was honest.`;
    if (challenger === playerPosition) {
      showNotification('You challenged incorrectly! The player was honest.', 'danger');
    } else if (raisedPlayer === playerPosition) {
      showNotification('Your play was challenged but you were honest!', 'success');
    }
  } else {
    message = `Player ${challenger + 1} challenged correctly! Player ${raisedPlayer + 1} was bluffing.`;
    if (challenger === playerPosition) {
      showNotification('You challenged correctly! The player was bluffing.', 'success');
    } else if (raisedPlayer === playerPosition) {
      showNotification('Your bluff was caught!', 'danger');
    }
  }
  
  showNotification(message);
  updateStatus(message);
  console.log('Challenge result:', message);
});

socket.on('STOC1C-DUMP-PENALTY-CARDS', (stack, cards, suits, poppedSuits) => {
  // Add penalty cards to player's hand
  for (let i = 0; i < cards.length; i++) {
    playerCards.push({ value: cards[i], suit: poppedSuits[i] });
  }
  
  updateCards();
  showNotification(`You received ${cards.length} penalty cards`, 'warning');
  console.log('Received penalty cards:', cards.length);
});

socket.on('STOC-PLAYER-WON', (winnerIndex) => {
  if (winnerIndex === playerPosition) {
    showNotification('Congratulations! You won the game!', 'success');
  } else {
    showNotification(`Player ${winnerIndex + 1} has won the game!`, 'info');
  }
  
  updateStatus(`Player ${winnerIndex + 1} has won the game!`);
  console.log('Player won:', winnerIndex);
});

socket.on('STOC-PLAY-OVER', () => {
  containerPlayed.innerHTML = '';
  selectedCards = [];
  updateCards();
  console.log('Play over, cleared played cards');
});

socket.on('STOC-PLAYER-DISCONNECTED', (disconnectedPosition) => {
  showNotification(`Player ${disconnectedPosition + 1} has disconnected`);
  updatePlayers();
  console.log('Player disconnected:', disconnectedPosition);
});

// UI update functions
function updateStatus(message) {
  if (playerStatus) {
    playerStatus.textContent = message;
    playerStatus.setAttribute('aria-live', 'polite');
  }
}

function showNotification(message, type = 'warning') {
  if (!gameNotification) return;
  
  gameNotification.textContent = message;
  gameNotification.className = `alert alert-${type}`;
  gameNotification.classList.remove('d-none');
  
  // Announce for screen readers
  try {
    let announcement = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(announcement);
  } catch (err) {
    console.log('Speech synthesis not supported:', err);
  }
  
  setTimeout(() => {
    gameNotification.classList.add('d-none');
  }, 5000);
}

function updatePlayers() {
  if (!playerContainer) return;
  
  playerContainer.innerHTML = '';
  
  // Create player indicators based on count
  for (let i = 0; i < playerCount; i++) {
    const playerElement = document.createElement('div');
    playerElement.className = 'player-indicator';
    
    // Highlight the current player
    if (i === currentTurn) {
      playerElement.classList.add('current-player');
    }
    
    // Identify if this is a bot
    const isBot = hasBot && i === botIndex;
    const playerName = isBot ? 'Bot1' : `Player ${i + 1}`;
    
    playerElement.innerHTML = `
      <div class="player-name ${isBot ? 'bot-player' : ''}" aria-live="polite">
        ${playerName} ${i === currentTurn ? '(Current Turn)' : ''}
        ${i === playerPosition ? '(You)' : ''}
      </div>
    `;
    
    // Add ARIA label for screen readers
    let ariaLabel = playerName;
    if (i === currentTurn) ariaLabel += ', current turn';
    if (i === playerPosition) ariaLabel += ', you';
    if (isBot) ariaLabel += ', AI bot';
    
    playerElement.setAttribute('aria-label', ariaLabel);
    playerElement.setAttribute('role', 'status');
    
    playerContainer.appendChild(playerElement);
  }
  
  // Announce the current player for screen readers
  if (currentTurn !== -1) {
    const currentPlayerName = hasBot && currentTurn === botIndex ? 'Bot1' : `Player ${currentTurn + 1}`;
    try {
      const announcement = new SpeechSynthesisUtterance(`${currentPlayerName}'s turn`);
      window.speechSynthesis.speak(announcement);
    } catch (err) {
      console.log('Speech synthesis not supported:', err);
    }
  }
}

function updateCards() {
  if (!cardContainer) return;
  
  cardContainer.innerHTML = '';
  
  // Sort cards by suit and value for easier navigation
  playerCards.sort((a, b) => {
    if (a.suit === b.suit) {
      const valueOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      return valueOrder.indexOf(a.value) - valueOrder.indexOf(b.value);
    }
    const suitOrder = ['♠', '♣', '♥', '♦'];
    return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
  });
  
  playerCards.forEach((card, index) => {
    const isSelected = selectedCards.some(c => c.value === card.value && c.suit === card.suit);
    const cardElement = createCardElement(card.value, card.suit, isSelected);
    
    // Add accessibility attributes
    cardElement.setAttribute('aria-label', getCardName(card));
    cardElement.setAttribute('tabindex', '0');
    cardElement.setAttribute('role', 'button');
    cardElement.dataset.index = index;
    
    // Handle click/keyboard events for card selection
    cardElement.addEventListener('click', () => toggleCardSelection(index));
    cardElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        toggleCardSelection(index);
        e.preventDefault();
      }
    });
    
    cardContainer.appendChild(cardElement);
  });

  // Update game buttons after updating cards
  updateButtons();
}

function createCardElement(value, suit, isSelected) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card-item';
  
  if (isSelected) {
    cardElement.classList.add('card-selected');
  }
  
  // Add color based on suit
  if (suit === '♥' || suit === '♦') {
    cardElement.classList.add('card-red');
  } else {
    cardElement.classList.add('card-black');
  }
  
  // Create the card content with proper semantic structure
  cardElement.innerHTML = `
    <span class="visually-hidden">${getCardName({value, suit})}</span>
    <span aria-hidden="true">${value}<br>${suit}</span>
  `;
  
  return cardElement;
}

function getCardName(card) {
  const valueNames = {
    'A': 'Ace',
    'K': 'King',
    'Q': 'Queen',
    'J': 'Jack'
  };
  
  const suitNames = {
    '♠': 'Spades',
    '♣': 'Clubs',
    '♥': 'Hearts',
    '♦': 'Diamonds'
  };
  
  const valueName = valueNames[card.value] || card.value;
  const suitName = suitNames[card.suit];
  
  return `${valueName} of ${suitName}`;
}

function toggleCardSelection(index) {
  const card = playerCards[index];
  
  if (!card) return;
  
  const existingIndex = selectedCards.findIndex(c => 
    c.value === card.value && c.suit === card.suit
  );
  
  if (existingIndex === -1) {
    selectedCards.push(card);
  } else {
    selectedCards.splice(existingIndex, 1);
  }
  
  updateCards();
  
  // Announce selection for screen readers
  const message = existingIndex === -1 
    ? `Selected ${getCardName(card)}` 
    : `Unselected ${getCardName(card)}`;
  
  try {
    let announcement = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(announcement);
  } catch (err) {
    console.log('Speech synthesis not supported:', err);
  }
}

function updateButtons() {
  const isPlayerTurn = currentTurn === playerPosition;
  
  if (placeBtn) {
    placeBtn.disabled = !isPlayerTurn || selectedCards.length === 0;
    
    // Add visual highlight when it's your turn and cards are selected
    if (!placeBtn.disabled) {
      placeBtn.classList.add('btn-highlight');
    } else {
      placeBtn.classList.remove('btn-highlight');
    }
  }
  
  if (passBtn) {
    passBtn.disabled = !isPlayerTurn;
    
    if (!passBtn.disabled) {
      passBtn.classList.add('btn-highlight');
    } else {
      passBtn.classList.remove('btn-highlight');
    }
  }
  
  if (raiseBtn) {
    // During raise time, the current player can't challenge their own cards
    if (isRaiseTime) {
      raiseBtn.disabled = currentTurn === playerPosition;
    } else {
      raiseBtn.disabled = !isRaiseTime;
    }
    
    if (!raiseBtn.disabled) {
      raiseBtn.classList.add('btn-highlight');
    } else {
      raiseBtn.classList.remove('btn-highlight');
      raiseBtn.classList.remove('btn-pulse');
    }
  }
  
  console.log('Updated buttons - Turn:', isPlayerTurn, 'Selected cards:', selectedCards.length, 'Raise time:', isRaiseTime);
}

function announceGameState() {
  let message = '';
  
  if (currentTurn === playerPosition) {
    message = "It's your turn now.";
  } else {
    message = `It's Player ${currentTurn + 1}'s turn.`;
  }
  
  message += ` You have ${playerCards.length} cards.`;
  
  try {
    let announcement = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(announcement);
  } catch (err) {
    console.log('Speech synthesis not supported:', err);
  }
}

// Game action functions
function placeCards() {
  if (selectedCards.length === 0) {
    showNotification('You must select cards to place');
    return;
  }
  
  // Prompt for card value (with default value from first selected card)
  let bluff_text = prompt('Enter the card value you want to declare (bluff or honest):', selectedCards[0].value);
  
  if (!bluff_text) return;
  
  // Validate bluff_text is a valid card value
  const validValues = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  if (!validValues.includes(bluff_text)) {
    showNotification('Invalid card value. Please enter a valid value (A, 2-10, J, Q, K)', 'danger');
    return;
  }
  
  console.log('Placing cards with value:', bluff_text);
  
  // Remove selected cards from hand
  selectedCards.forEach(selectedCard => {
    const index = playerCards.findIndex(card => 
      card.value === selectedCard.value && card.suit === selectedCard.suit
    );
    
    if (index !== -1) {
      playerCards.splice(index, 1);
    }
  });
  
  socket.emit('CTOS-PLACE-CARD', selectedCards, bluff_text, playerCards.length);
  
  selectedCards = [];
  updateCards();
}

function raiseCards() {
  if (!isRaiseTime) {
    showNotification('You can only challenge during the raise time');
    return;
  }
  
  if (currentTurn === playerPosition) {
    showNotification('You cannot challenge your own cards', 'warning');
    return;
  }
  
  if (confirm('Are you sure you want to challenge the last play?')) {
    console.log('Raising challenge');
    socket.emit('CTOS-RAISE-CARD');
  }
}

function passAction() {
  if (currentTurn !== playerPosition) {
    showNotification('You can only pass on your turn');
    return;
  }
  
  console.log('Passing turn');
  socket.emit('CTOS-PASS-CARD');
}

// Make functions globally available
window.placeCards = placeCards;
window.raiseCards = raiseCards;
window.passAction = passAction;

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Only handle shortcuts when game has started
  if (!gameStarted) return;
  
  switch (e.key) {
    case 'j':
    case 'J':
      if (!placeBtn.disabled) placeCards();
      break;
    case 'f':
    case 'F':
      if (!raiseBtn.disabled) raiseCards();
      break;
    case ';':
      if (!passBtn.disabled) passAction();
      break;
    case '.':
      // Announce selected cards
      if (selectedCards.length > 0) {
        const message = `Selected cards: ${selectedCards.map(getCardName).join(', ')}`;
        try {
          let announcement = new SpeechSynthesisUtterance(message);
          window.speechSynthesis.speak(announcement);
        } catch (err) {
          console.log('Speech synthesis not supported:', err);
        }
      } else {
        try {
          let announcement = new SpeechSynthesisUtterance('No cards selected');
          window.speechSynthesis.speak(announcement);
        } catch (err) {
          console.log('Speech synthesis not supported:', err);
        }
      }
      break;
    case '[':
      // Select first card
      if (playerCards.length > 0) {
        selectedCards = [];
        toggleCardSelection(0);
      }
      break;
    case ']':
      // Select last card
      if (playerCards.length > 0) {
        selectedCards = [];
        toggleCardSelection(playerCards.length - 1);
      }
      break;
    case 'z':
    case 'Z':
      // Repeat last game state
      announceGameState();
      break;
    case '0':
      // Announce all cards organized by sets
      const suits = ['♠', '♣', '♥', '♦'];
      let cardSets = [];
      
      suits.forEach(suit => {
        const cardsInSuit = playerCards.filter(card => card.suit === suit);
        if (cardsInSuit.length > 0) {
          const suitNames = {
            '♠': 'Spades',
            '♣': 'Clubs',
            '♥': 'Hearts',
            '♦': 'Diamonds'
          };
          
          cardSets.push(`${suitNames[suit]}: ${cardsInSuit.map(c => c.value).join(', ')}`);
        }
      });
      
      if (cardSets.length > 0) {
        const message = `Your cards: ${cardSets.join('. ')}`;
        try {
          let announcement = new SpeechSynthesisUtterance(message);
          window.speechSynthesis.speak(announcement);
        } catch (err) {
          console.log('Speech synthesis not supported:', err);
        }
      }
      break;
  }
}); 