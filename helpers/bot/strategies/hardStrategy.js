// ...new file...
const hardStrategy = {
  makeMove: (gameState, personality, memory) => {
    const lastMove = gameState.previousMoves.slice(-1)[0];
    const bluffCount = memory.bluffHistory[lastMove] || 0;

    // Detect known opponent patterns
    let patternMatch = null;
    if (gameState.opponentBluffPatterns) {
      patternMatch = gameState.opponentBluffPatterns.find(
        (p) => p.pattern === lastMove
      );
    }

    // If pattern is recognized, potentially counter
    if (patternMatch) {
      const counter = gameState.possibleMoves.find(
        (m) => m === patternMatch.counterMove
      );
      if (counter) {
        return counter;
      }
    }

    // Increase bluff if opponents often bluff
    let adjustedBluffFreq = personality.bluffFrequency + (bluffCount * 0.05);

    // Slightly increase if few cards remain
    if (gameState.currentHandSize <= 4) {
      adjustedBluffFreq += 0.1;
    }

    if (Math.random() < adjustedBluffFreq) {
      return gameState.possibleMoves[
        Math.floor(Math.random() * gameState.possibleMoves.length)
      ];
    }

    // Otherwise choose a strategic move if available, else fallback
    const strategicMove = gameState.possibleMoves.find((m) => m.isSafe);
    return strategicMove || gameState.possibleMoves[0];
  },
};

module.exports = hardStrategy;