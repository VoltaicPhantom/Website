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
 * Applies card effects (Skip, Draw, Wild Color).
 * NOTE: For the computer's turn, this function will internally calculate the Wild color.
 * For the human's turn, the Wild color choice is handled externally by handlePlayerAction.
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
            // NOTE: For the human player (currentPlayer === 0), the color is set by
            // the ASYNC logic in handlePlayerAction(), so we skip the prompt/UI logic here.
            // The return value will be overwritten by handlePlayerAction().
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
            
    return null; // Indicate drawing
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
 * Renders the entire game state to the HTML UI.
 */
function renderGame() {
    if (gameState.gameOver) {
        STATUS.textContent = "Game Over! " + (gameState.hands[0].length === 0 ? "You Win! 🎉" : "Computer Wins! 😢");
        START_BUTTON.textContent = "Play Again";
        START_BUTTON.disabled = false;
        DRAW_BUTTON.disabled = true;
        return;
    }

    const { color, value } = gameState.topCard;
    
    // 1. Render Top Card
    TOP_CARD_ELEM.className = `card ${color}`;
    TOP_CARD_ELEM.textContent = value;

    // 2. Render Computer Hand Size
    COMPUTER_SIZE_ELEM.textContent = `${gameState.hands[1].length} cards`;

    // 3. Render Player Hand
    PLAYER_HAND_ELEM.innerHTML = ''; // Clear previous cards
    gameState.hands[0].forEach((card, index) => {
        const cardElem = document.createElement('div');
        cardElem.className = `card ${card.color}`;
        cardElem.textContent = card.value;
        cardElem.setAttribute('data-index', index);
        
        let canPlay = isValidPlay(card, gameState.topCard);
        
        if (gameState.currentPlayer === 0) {
             // Only allow clicks if it's the player's turn and the card is valid
            cardElem.onclick = () => handlePlayerAction(index);
            if (!canPlay) {
                cardElem.classList.add('disabled');
            }
        } else {
            cardElem.classList.add('disabled');
        }

        PLAYER_HAND_ELEM.appendChild(cardElem);
    });

    // 4. Update Status and Buttons
    STATUS.textContent = gameState.currentPlayer === 0 ? "Your turn!" : "Computer's turn...";
    DRAW_BUTTON.disabled = gameState.currentPlayer !== 0;
    
    // Hide color picker when not needed
    COLOR_PICKER_ELEM.style.display = 'none';

    // Handle UNO button
    if (gameState.hands[0].length === 1) {
        UNO_BUTTON.disabled = false;
    } else {
        UNO_BUTTON.disabled = true;
    }
}

/**
 * Wraps initGame to handle UI state when starting.
 */
function startGame() {
    initGame(); // Call the logic initialization function
    renderGame();
    START_BUTTON.disabled = true;
    STATUS.textContent = "Game Started! Your turn.";
}

// --- Wild Card Color Selection ---

/**
 * Creates a Promise to wait for the user to select a wild color from the UI.
 * @returns {Promise<string>} A promise that resolves with the chosen color (R, G, B, Y).
 */
function handleWildChoice() {
    // Disable game interaction and show the color picker
    DRAW_BUTTON.disabled = true;
    // Disable clicking on cards while choosing color
    PLAYER_HAND_ELEM.querySelectorAll('.card').forEach(card => card.onclick = null); 
    COLOR_PICKER_ELEM.style.display = 'block';
    
    // Create a new promise that resolves when the user clicks a color button
    return new Promise(resolve => {
        // Store the resolve function globally so setWildColor can call it
        window.resolveWildPromise = (choice) => {
            COLOR_PICKER_ELEM.style.display = 'none';
            resolve(choice);
        };
    });
}

/**
 * Called by the color picker buttons in the HTML.
 * @param {string} colorChoice - The color chosen ('R', 'G', 'B', 'Y').
 */
function setWildColor(colorChoice) {
    if (window.resolveWildPromise) {
        window.resolveWildPromise(colorChoice);
    }
}


// --- Player Action and Computer Flow ---

/**
 * Handles the human player's action (playing a card or drawing).
 * @param {number | null} cardIndex - Index of the card to play, or null if drawing.
 */
async function handlePlayerAction(cardIndex) {
    if (gameState.gameOver || gameState.currentPlayer !== 0) return;

    const playerHand = gameState.hands[0];
    let cardPlayed = null;
    let newTopColor = null;

    if (cardIndex !== null) {
        // Play card attempt
        const cardToPlay = playerHand[cardIndex];
        if (!isValidPlay(cardToPlay, gameState.topCard)) {
            STATUS.textContent = "Invalid move. Try again.";
            return;
        }

        cardPlayed = playerHand.splice(cardIndex, 1)[0];
        gameState.discardPile.push(cardPlayed);

        // If a Wild card, wait for player to choose color via UI
        if (cardPlayed.color === 'BL') {
            // Await the color choice from the UI buttons
            newTopColor = await handleWildChoice();
        }

        if (playerHand.length === 1) STATUS.textContent = "You played a card and shouted UNO!";
    } else {
        // Player draws
        if (gameState.deck.length > 0) {
            playerHand.push(gameState.deck.pop());
        }
        gameState.currentPlayer = 1; // Turn ends after drawing
        renderGame();
        setTimeout(handleComputerTurn, 1000); // Start computer turn
        return;
    }

    // Apply effect and advance turn
    if (cardPlayed) {
        const { nextPlayer, newTopCard } = applyCardEffect(cardPlayed, 0, gameState.deck, gameState.hands);
        
        // If a new color was chosen via the UI, overwrite the default color
        if (newTopColor) {
            newTopCard.color = newTopColor; 
        }
        
        gameState.topCard = newTopCard;
        gameState.currentPlayer = nextPlayer;

        if (playerHand.length === 0) {
            gameState.gameOver = true;
            renderGame();
            return;
        }
    }
    
    renderGame(); // Update the board immediately

    // If the computer is next, start their turn
    if (gameState.currentPlayer === 1 && !gameState.gameOver) {
        setTimeout(handleComputerTurn, 1000); 
    }
}

/**
 * Executes the computer's turn (same core logic, but calls renderGame()).
 */
function handleComputerTurn() {
    if (gameState.gameOver || gameState.currentPlayer !== 1) return;

    STATUS.textContent = "Computer's turn...";
    const computerHand = gameState.hands[1];
    let cardPlayed = null;

    const cardIndexToPlay = computerPlay(computerHand, gameState.topCard);

    if (cardIndexToPlay !== null) {
        // Computer plays a card
        cardPlayed = computerHand.splice(cardIndexToPlay, 1)[0];
        gameState.discardPile.push(cardPlayed);
        
        // Apply effect (and determine wild color if necessary)
        const { nextPlayer, newTopCard } = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
        gameState.topCard = newTopCard;
        gameState.currentPlayer = nextPlayer;

        STATUS.textContent = `Computer played: ${cardPlayed.color}-${cardPlayed.value}`;

        if (computerHand.length === 0) {
            gameState.gameOver = true;
            renderGame();
            return;
        }
    } else {
        // Computer draws a card
        if (gameState.deck.length > 0) {
            computerHand.push(gameState.deck.pop());
            STATUS.textContent = "Computer drew a card.";
        } else {
            STATUS.textContent = "Deck is empty! Computer skips turn.";
        }
        gameState.currentPlayer = 0; // Turn ends after drawing
    }

    renderGame();
    
    // If the computer played a Skip/Draw card, it's the computer's turn again immediately
    if (gameState.currentPlayer === 1 && !gameState.gameOver) {
        setTimeout(handleComputerTurn, 1000); 
    }
}
