// ...new file...
const mediumStrategy = {
  makeMove: (gameState, personality, memory) => {
    // Moderate chance to bluff
    if (Math.random() < personality.bluffFrequency) {
      // Choose a random move, slightly favoring new options
      return gameState.possibleMoves[
        Math.floor(Math.random() * gameState.possibleMoves.length)
      ];
    }
    // If there are previous moves, pick one, else fallback
    return gameState.previousMoves.slice(-1)[0] || gameState.possibleMoves[0];
  },
};

module.exports = mediumStrategy;