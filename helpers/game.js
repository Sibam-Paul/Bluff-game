// Helper functions for game management

function changeTurn(roomId, rooms, io) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.clients.length === 0) return;

  let nextTurnIndex = (room.currentTurnIndex + 1) % room.clients.length;
  
  // Skip players who have already won
  let loopCount = 0;
  const maxLoops = room.clients.length;
  while (room.wonUsers.includes(nextTurnIndex) && loopCount < maxLoops) {
    nextTurnIndex = (nextTurnIndex + 1) % room.clients.length;
    loopCount++;
  }
  
  // If all players have won except one, that player wins automatically
  if (loopCount >= maxLoops - 1) {
    const lastPlayer = findLastActivePlayer(room);
    if (lastPlayer !== -1 && !room.wonUsers.includes(lastPlayer)) {
      room.wonUsers.push(lastPlayer);
      if (io) {
        io.to(roomId).emit('STOC-PLAYER-WON', lastPlayer);
        io.to(roomId).emit('STOC-GAME-OVER');
      }
      return;
    }
  }
  
  room.currentTurnIndex = nextTurnIndex;
  
  if (io) {
    io.to(roomId).emit('STOC-TURN-CHANGED', nextTurnIndex);
  }
  
  return nextTurnIndex;
}

function findLastActivePlayer(room) {
  if (!room) return -1;
  
  for (let i = 0; i < room.clients.length; i++) {
    if (!room.wonUsers.includes(i)) {
      return i;
    }
  }
  
  return -1;
}

function distributeCards(roomId, rooms) {
  const room = rooms[roomId];
  if (!room) return;
  
  const players = room.clients.length;
  const cardsPerPlayer = Math.floor(52 / players);
  
  // Shuffle the deck before distribution
  shuffleArray(room.cardset);
  
  for (let i = 0; i < players; i++) {
    const playerCards = room.cardset.splice(0, cardsPerPlayer);
    if (room.clients[i]) {
      room.clients[i].emit('STOC-CARDS-DEALT', playerCards);
    }
  }
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = {
  changeTurn,
  distributeCards,
  findLastActivePlayer
}; 