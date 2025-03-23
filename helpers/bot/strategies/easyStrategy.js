// ...new file...
const easyStrategy = {
  makeMove: (gameState, personality, memory) => {
    // High chance to randomly bluff
    if (Math.random() < personality.bluffFrequency) {
      return gameState.possibleMoves[
        Math.floor(Math.random() * gameState.possibleMoves.length)
      ];
    }
    // Otherwise, pick first previous move or fallback
    return gameState.previousMoves[0] || gameState.possibleMoves[0];
  },
};

module.exports = easyStrategy;