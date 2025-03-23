// AI Bot logic for Accessible Bluff card game

// Constants
const CARD_VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Import strategies
const easyStrategy = require('./strategies/easyStrategy');
const mediumStrategy = require('./strategies/mediumStrategy');
const hardStrategy = require('./strategies/hardStrategy');

/**
 * Bot class representing an AI player
 */
class Bot {
  constructor(difficulty = 'medium', name = 'Bot') {
    this.name = name;
    this.difficulty = difficulty; // 'easy', 'medium', 'hard'
    this.cards = [];
    this.gameHistory = [];
    this.lastActions = [];
    this.playerPatterns = {}; // For tracking human player patterns (advanced mode)
    this.bluffProbability = this.getBluffProbability();
    this.challengeProbability = this.getChallengeProbability();

    // Reference to strategy module
    this.strategy = this.loadStrategy(difficulty);
    // Example personality object can be injected here
    this.personality = { bluffFrequency: this.bluffProbability, challengeFrequency: this.challengeProbability };

    // Track known bluffs (keyed by move object)
    this.memory = { bluffHistory: {}, previousMoves: [] };
  }

  // Simple loader for strategies
  loadStrategy(difficulty) {
    switch (difficulty) {
      case 'easy': return easyStrategy;
      case 'medium': return mediumStrategy;
      case 'hard': return hardStrategy;
      default: return mediumStrategy;
    }
  }

  /**
   * Set the bot's cards
   * @param {Array} cards - Array of card objects
   */
  setCards(cards) {
    this.cards = cards;
    this.organizeCards();
  }

  /**
   * Organize cards by value for easier decision making
   */
  organizeCards() {
    // Group cards by value
    this.cardsByValue = {};
    CARD_VALUES.forEach(value => {
      this.cardsByValue[value] = this.cards.filter(card => card.value === value);
    });
  }

  /**
   * Record a game action for analysis
   * @param {Object} action - Details of the game action
   */
  recordAction(action) {
    this.gameHistory.push(action);
    this.lastActions.push(action);
    
    // Keep history at a reasonable size
    if (this.lastActions.length > 10) {
      this.lastActions.shift();
    }
    
    // For advanced mode: analyze patterns
    if (this.difficulty === 'hard' && action.player !== this.name) {
      if (!this.playerPatterns[action.player]) {
        this.playerPatterns[action.player] = {
          bluffCount: 0,
          honestCount: 0,
          totalPlays: 0,
          successfulChallenges: 0,
          failedChallenges: 0
        };
      }
      
      const pattern = this.playerPatterns[action.player];
      
      if (action.type === 'place') {
        pattern.totalPlays++;
        if (action.wasBluff) {
          pattern.bluffCount++;
        } else {
          pattern.honestCount++;
        }
      } else if (action.type === 'challenge') {
        if (action.wasSuccessful) {
          pattern.successfulChallenges++;
        } else {
          pattern.failedChallenges++;
        }
      }
    }
  }

  /**
   * Get the bluff probability based on difficulty
   * @returns {Number} Probability (0-1)
   */
  getBluffProbability() {
    switch (this.difficulty) {
      case 'easy':
        return 0.3;  // 30% chance to bluff
      case 'medium':
        return 0.5;  // 50% chance to bluff
      case 'hard':
        return 0.7;  // 70% base chance to bluff, but will be adjusted
      default:
        return 0.5;
    }
  }

  /**
   * Get the challenge probability based on difficulty
   * @returns {Number} Probability (0-1)
   */
  getChallengeProbability() {
    switch (this.difficulty) {
      case 'easy':
        return 0.25;  // 25% chance to challenge
      case 'medium':
        return 0.5;   // 50% chance to challenge
      case 'hard':
        return 0.7;   // 70% base chance to challenge, but will be adjusted
      default:
        return 0.5;
    }
  }

  /**
   * Decide whether to pass or place cards. We now call into the strategy for more advanced logic.
   * @param {boolean} isFirstPlay
   * @param {Object} gameState
   * @returns {Object} Decision with type, cards, declaredValue, etc.
   */
  decidePlayOrPass(isFirstPlay = false, gameState = {}) {
    // Incorporate existing logic: if no cards, pass
    if (this.cards.length === 0) {
      return { type: 'pass' };
    }

    // Our memory object can store previousMoves and bluffHistory
    // Use partial gameState info plus memory
    const strategyGameState = {
      ...gameState,
      previousMoves: this.gameHistory,       // The entire history
      currentHandSize: this.cards.length,
      possibleMoves: this.generatePossibleMoves(), 
    };

    // The chosen move from the strategy
    const chosenAction = this.strategy.makeMove(strategyGameState, this.personality, this.memory);

    // Decide if that action is actually a pass or place, etc.
    // For demonstration, assume any non-undefined action means place.
    // Real usage might need more robust logic.
    if (!chosenAction || chosenAction.type === 'pass') {
      return { type: 'pass' };
    } else {
      // Transform the strategy’s return into a valid “place” action
      // E.g., if chosenAction = { value: 'A', count: 2 }
      return this.decidePlaceCards(chosenAction);
    }
  }

  /**
   * Overwrite your internal decidePlaceCards method to handle the final step after strategy picks.
   */
  decidePlaceCards(chosenAction) {
    // Example: choose random cards from the bot’s hand based on chosenAction.count
    const count = chosenAction.count || 1;
    let cardsToPlay = this.cards.slice(0, count);
    let declaredValue = chosenAction.value || cardsToPlay[0].value;

    //  Check if we’re bluffing
    const isBluff = declaredValue !== cardsToPlay[0].value;
    this.removeCards(cardsToPlay);

    return {
      type: 'place',
      cards: cardsToPlay,
      declaredValue,
      isBluff
    };
  }

  /**
   * For demonstration, generate possible moves from your current hand or game context
   */
  generatePossibleMoves() {
    // For simplicity, pretend each move is { value, count } for each unique card value
    let moves = [];
    for (const val of Object.keys(this.cardsByValue)) {
      if (this.cardsByValue[val].length > 0) {
        moves.push({
          type: 'place',
          value: val,
          count: this.cardsByValue[val].length
        });
      }
    }
    // Also consider a pass move
    moves.push({ type: 'pass' });
    return moves;
  }

  /**
   * Remove cards from the bot's hand
   * @param {Array} cardsToRemove - Cards to remove
   */
  removeCards(cardsToRemove) {
    // Remove cards from the main array
    cardsToRemove.forEach(cardToRemove => {
      const index = this.cards.findIndex(card => 
        card.value === cardToRemove.value && card.suit === cardToRemove.suit
      );
      if (index !== -1) {
        this.cards.splice(index, 1);
      }
    });
    
    // Update organized cards
    this.organizeCards();
  }

  /**
   * Add cards to the bot's hand (e.g., as penalty)
   * @param {Array} cardsToAdd - Cards to add
   */
  addCards(cardsToAdd) {
    this.cards = [...this.cards, ...cardsToAdd];
    this.organizeCards();
  }

  /**
   * Decide whether to challenge the current play
   * @param {Object} currentPlay - Current play details
   * @returns {boolean} Whether to challenge
   */
  decideChallenge(currentPlay) {
    // Don't challenge if no play or it's our own play
    if (!currentPlay || currentPlay.player === this.name) {
      return false;
    }
    
    const { declaredValue, cardCount, player } = currentPlay;
    
    // Easy mode: simple random decision
    if (this.difficulty === 'easy') {
      // Basic check: more cards of declared value means less likely to challenge
      if (this.cardsByValue[declaredValue].length > 0) {
        // We have some of these cards, so less likely to challenge
        return Math.random() < this.challengeProbability * 0.5;
      }
      // Random challenge based on probability
      return Math.random() < this.challengeProbability;
    }
    
    // Medium mode: more informed decision
    if (this.difficulty === 'medium') {
      // If there are 4+ cards of the same value, more suspicious
      if (cardCount >= 4) {
        return Math.random() < this.challengeProbability * 1.5;
      }
      
      // If we have most/all of the declared cards, more likely to challenge
      const totalPossible = 4; // 4 of each value in the deck
      if (this.cardsByValue[declaredValue].length > totalPossible - cardCount - 1) {
        return Math.random() < this.challengeProbability * 2; // Very likely to challenge
      }
      
      // Standard case
      return Math.random() < this.challengeProbability;
    }
    
    // Hard mode: advanced strategy
    if (this.difficulty === 'hard') {
      // Check player patterns
      if (this.playerPatterns[player]) {
        const pattern = this.playerPatterns[player];
        let bluffRatio = 0;
        
        if (pattern.totalPlays > 0) {
          bluffRatio = pattern.bluffCount / pattern.totalPlays;
        }
        
        // If player bluffs a lot, more likely to challenge
        if (bluffRatio > 0.6) {
          return Math.random() < this.challengeProbability * 1.5;
        }
      }
      
      // Count how many of the declared card we have
      const ourCount = this.cardsByValue[declaredValue].length;
      
      // Calculate probability based on the cards we can see
      // The more of the declared cards we have, the more likely it's a bluff
      const totalAvailable = 4 - ourCount; // There are 4 of each value in a standard deck
      
      // If player is claiming more cards than might exist, definitely challenge
      if (cardCount > totalAvailable) {
        return true;
      }
      
      // If claiming a high proportion of available cards, more likely to challenge
      const proportionClaimed = cardCount / totalAvailable;
      let adjustedProbability = this.challengeProbability;
      
      if (proportionClaimed > 0.5) {
        adjustedProbability += proportionClaimed * 0.4; // Up to 40% increase
      }
      
      // Small penalty for challenging when we have several of the card
      if (ourCount >= 2) {
        adjustedProbability -= 0.1 * ourCount;
      }
      
      // Also more likely to challenge large plays
      if (cardCount >= 3) {
        adjustedProbability += 0.1 * cardCount;
      }
      
      // Cap the probability
      adjustedProbability = Math.min(0.95, Math.max(0.05, adjustedProbability));
      
      return Math.random() < adjustedProbability;
    }
    
    // Default behavior
    return Math.random() < this.challengeProbability;
  }
}

module.exports = Bot;