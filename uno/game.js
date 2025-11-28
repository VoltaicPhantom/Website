// =====================================================================
// === CORE GAME STATE AND LOGIC (Translated from Python) ===
// =====================================================================

// Global Game State Object
let gameState = {};

// --- 1. Game Setup ---

/**
 * Creates a comprehensive Uno deck including action and wild cards.
 * @returns {Array} The shuffled deck array of card objects.
 */
function createDeck() {
    const colors = ['R', 'G', 'B', 'Y'];
    const deck = [];
    
    // 1. Number Cards (0-9)
    for (const color of colors) {
        deck.push({ color: color, value: 0 }); // One '0' per color
        for (let number = 1; number <= 9; number++) {
            deck.push({ color: color, value: number });
            deck.push({ color: color, value: number }); // Two of numbers 1-9
        }
    }

    // 2. Colored Action Cards (2 of each per color)
    // 'S': Skip, 'R': Reverse, 'D2': Draw Two
    for (const color of colors) {
        for (const action of ['S', 'R', 'D2']) {
            deck.push({ color: color, value: action });
            deck.push({ color: color, value: action });
        }
    }

    // 3. Wild Cards (4 of each)
    // 'BL': Black (Wild), 'W': Wild, 'W4': Wild Draw Four
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'BL', value: 'W' });
        deck.push({ color: 'BL', value: 'W4' });
    }

    // Shuffle the deck (Fisher-Yates)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}

/**
 * Deals starting hands for Player 0 (Human) and Player 1 (Computer).
 * @param {Array} deck - The current deck array.
 * @param {number} numCards - Number of cards to deal.
 * @returns {Array} An array containing the two hand arrays.
 */
function dealStartingHands(deck, numCards = 7) {
    const hands = [[], []]; // hands[0] = Player, hands[1] = Computer
    for (let i = 0; i < numCards; i++) {
        hands[0].push(deck.pop());
        hands[1].push(deck.pop());
    }
    return hands;
}

/**
 * Finds the first non-wild card to start the discard pile.
 * @param {Array} deck - The current deck array.
 * @returns {Object} The initial top card.
 */
function getInitialTopCard(deck) {
    let card;
    do {
        card = deck.pop();
        if (card.color === 'BL') {
            deck.unshift(card); // Put wild back on top
            // Simple shuffle of first 10 cards to not disrupt the entire deck too much
            deck.sort(() => Math.random() - 0.5); 
        }
    } while (card.color === 'BL');
    return card;
}

// --- 2. Game Logic ---

/**
 * Checks if a card can be played.
 * @param {Object} cardToPlay - The card the player wants to play.
 * @param {Object} topCard - The current top card/state of the discard pile.
 * @returns {boolean} True if the play is valid.
 */
function isValidPlay(cardToPlay, topCard) {
    // Wild cards can always be played
    if (cardToPlay.color === 'BL') {
        return true;
    }
    
    // Must match the current active color OR the current active value
    return cardToPlay.color === topCard.color || cardToPlay.value === topCard.value;
}

/**
 * NEW: Checks if a card is an EXACT match (for Jump In rule).
 * @param {Object} cardToPlay - The card the player wants to play.
 * @param {Object} topCard - The current top card.
 * @returns {boolean} True if color AND value match.
 */
function isExactMatch(cardToPlay, topCard) {
    // Wilds cannot be used to Jump In (must be non-BL color)
    if (cardToPlay.color === 'BL') return false; 
    
    return cardToPlay.color === topCard.color && cardToPlay.value === topCard.value;
}


/**
 * Applies card effects (Skip, Draw, Wild Color).
 * * @param {Object} cardPlayed - The card played this turn.
 * @param {number} currentPlayer - Index of the player who played the card (0 or 1).
 * @param {Array} deck - The deck array.
 * @param {Array<Array>} hands - Array of player hands.
 * @returns {{nextPlayer: number, newTopCard: Object}} Object containing the next player index and the new top card state.
 */
function applyCardEffect(cardPlayed, currentPlayer, deck, hands) {
    const { color: cardColor, value: cardValue } = cardPlayed;
    const numPlayers = hands.length;
    
    let nextPlayer = (currentPlayer + 1) % numPlayers;
    let mustDraw = 0; 

    // --- Step 1: Handle Draw/Skip Effects ---
    if (cardValue === 'S' || cardValue === 'R') {
        nextPlayer = (currentPlayer + 2) % numPlayers;
    } else if (cardValue === 'D2') {
        mustDraw = 2;
    } else if (cardValue === 'W4') {
        mustDraw = 4;
    }

    // Apply draw effect immediately
    if (mustDraw > 0) {
        const targetHandIndex = nextPlayer;
        const targetHand = hands[targetHandIndex];
        
        for (let i = 0; i < mustDraw; i++) {
            if (deck.length > 0) {
                targetHand.push(deck.pop());
            } else {
                break;
            }
        }
        // The player who drew cards is skipped
        nextPlayer = (targetHandIndex + 1) % numPlayers;
    }

    // --- Step 2: Handle Wild Color Setting ---
    let newTopCardColor = cardColor;
    
    if (cardColor === 'BL') {
        if (currentPlayer === 0) {
            // Human choice is handled in handlePlayerAction (async)
            newTopCardColor = 'R'; // Placeholder default
        } else {
            // Computer chooses color (simple logic: choose the color it has most of)
            const colorsInHand = hands[currentPlayer].map(c => c.color).filter(c => c !== 'BL');
            let colorCounts = {};
            for (const color of colorsInHand) {
                colorCounts[color] = (colorCounts[color] || 0) + 1;
            }

            if (Object.keys(colorCounts).length > 0) {
                newTopCardColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b);
            } else {
                newTopCardColor = 'R';
            }
        }
    }

    // Return the index of the player whose turn is next, and the new virtual top card state
    return { nextPlayer: nextPlayer, newTopCard: { color: newTopCardColor, value: cardValue } };
}

/**
 * The computer plays the first valid card it finds based on simple priority.
 * @param {Array} computerHand - The computer's hand array.
 * @param {Object} topCard - The current top card state.
 * @returns {number | null} The index of the card to play, or null to draw.
 */
function computerPlay(computerHand, topCard) {
    // Priority order: W4, W, D2, S, R, then highest numbers down to 0
    const priority = ['W4', 'W', 'D2', 'S', 'R', 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    
    for (const value of priority) {
        for (let i = 0; i < computerHand.length; i++) {
            const card = computerHand[i];
            
            // Play Wilds/W4 first
            if (card.color === 'BL' && card.value === value) {
                 return i;
            }
            // Then check for color/number match
            if (card.value === value && isValidPlay(card, topCard)) {
                return i;
            }
        }
    }
    
    // Fallback: If no high-priority match, just play the first valid card
    for (let i = 0; i < computerHand.length; i++) {
        if (isValidPlay(computerHand[i], topCard)) {
            return i;
        }
    }
            
    return null; // Indicate drawing (will trigger Draw Till Match in handleComputerTurn)
}

/**
 * Initializes and manages the entire game state.
 */
function initGame() {
    gameState.deck = createDeck();
    gameState.hands = dealStartingHands(gameState.deck);
    gameState.discardPile = [];
    gameState.topCard = getInitialTopCard(gameState.deck);
    gameState.discardPile.push(gameState.topCard);
    gameState.currentPlayer = 0; // 0: Human, 1: Computer
    gameState.gameOver = false;
}


// =====================================================================
// === UI CONTROL AND ASYNCHRONOUS GAME FLOW ===
// =====================================================================

// --- DOM Element References ---
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
const COMPUTER_SIZE_ELEM = document.getElementById('computer-hand-size');
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const START_BUTTON = document.getElementById('start-button');
const UNO_BUTTON = document.getElementById('uno-button');


/**
 * Helper function to determine the display text for a card value.
 * @param {string | number} value - The internal card value ('S', 'D2', 'W', 5, etc.).
 * @returns {string} The text to
