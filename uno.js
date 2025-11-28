// --- Card Structure Example: { color: 'R', value: 7 } or { color: 'BL', value: 'W4' }

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
 * Applies card effects (Skip, Draw, Wild Color).
 * NOTE: This function needs to be asynchronous or use promises in a real web app 
 * to wait for human input on Wild card color selection.
 * For this translation, we'll use simple prompts/logic.
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
        console.log(`Effect: ${cardValue}! Next player is skipped.`);
        nextPlayer = (currentPlayer + 2) % numPlayers;
    } else if (cardValue === 'D2') {
        mustDraw = 2;
        console.log("Effect: DRAW TWO! Next player draws 2 cards.");
    } else if (cardValue === 'W4') {
        mustDraw = 4;
        console.log("Effect: WILD DRAW FOUR! Next player draws 4 cards.");
    }

    // Apply draw effect immediately
    if (mustDraw > 0) {
        const targetHandIndex = nextPlayer;
        const targetHand = hands[targetHandIndex];
        
        for (let i = 0; i < mustDraw; i++) {
            if (deck.length > 0) {
                targetHand.push(deck.pop());
            } else {
                console.log("Deck is empty, cannot draw.");
                break;
            }
        }
        console.log(`Player ${targetHandIndex} drew ${mustDraw} cards.`);
        // The player who drew cards is skipped
        nextPlayer = (targetHandIndex + 1) % numPlayers;
    }

    // --- Step 2: Handle Wild Color Setting ---
    let
