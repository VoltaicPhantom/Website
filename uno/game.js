// =====================================================================
// === CORE GAME STATE AND LOGIC ===
// =====================================================================

// Global Game State Object
let gameState = {};

// --- DOM Element References ---
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
const COMPUTER_SIZE_ELEM = document.getElementById('computer-hand-size');
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const START_BUTTON = document.getElementById('start-button');
const UNO_BUTTON = document.getElementById('uno-button');


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
 * Checks if a card is an EXACT match (for Jump In rule).
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
    
    // --- Step 1: Handle Reverse (if implemented), Skip, Draw Effects ---
    if (cardValue === 'S') {
        nextPlayer = (currentPlayer + 2) % numPlayers;
    } else if (cardValue === 'R') {
         // For 2 players, reverse is treated as a skip
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
                // In a real game, discard pile is reshuffled into the deck. 
                // For simplicity, we just stop drawing here.
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
            // We rely on the global state to have the correct .color set after the choice.
            newTopCardColor = gameState.topCard.color; 
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
                // Default if no colored cards are left
                newTopCardColor = 'R'; 
            }
        }
    }

    // Return the index of the player whose turn is next, and the new virtual top card state
    return { 
        nextPlayer: nextPlayer, 
        newTopCard: { 
            color: newTopCardColor, 
            value: cardValue 
        } 
    };
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
            
    return null; // Indicate drawing (will trigger Draw Till Match in handleComputerTurnLogic)
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
    gameState.mustDraw = false; // Flag for when a player must draw but hasn't yet
    gameState.unoAwaitingCall = false; // Tracks if the previous player (human) needs to call UNO
    gameState.unoPenaltyCheckTimeout = null; // Used to delay computer's turn for penalty/jump-in window
}


// =====================================================================
// === UI CONTROL AND ASYNCHRONOUS GAME FLOW ===
// =====================================================================


/**
 * Helper function to determine the display text for a card value.
 * @param {string | number} value - The internal card value ('S', 'D2', 'W', 5, etc.).
 * @returns {string} The text to display.
 */
function getCardDisplayText(value) {
    switch (value) {
        case 'D2':
            return '+2';
        case 'S':
            return '🚫'; // No Entry (Skip)
        case 'R':
            return 'REVERSE';
        case 'W':
            return 'WILD'; 
        case 'W4':
            return '+4'; 
        default:
            return String(value);
    }
}

/**
 * Renders a single card element.
 * @param {Object} card - The card object {color, value}.
 * @param {boolean} isClickable - Whether the card should respond to clicks.
 * @param {number} index - Index in the player's hand (used for click handler).
 * @returns {HTMLElement} The card element.
 */
function renderCard(card, isClickable = false, index = -1) {
    const cardElem = document.createElement('div');
    cardElem.className = `card ${card.color}`;
    cardElem.dataset.value = card.value;
    cardElem.textContent = getCardDisplayText(card.value);
    
    if (isClickable) {
        // If the card is clickable, check if it's a valid play or a Jump In
        const topCard = gameState.topCard;
        const isPlayerTurn = gameState.currentPlayer === 0;
        
        // A card is 'playable' if it's a valid play on their turn OR an exact match for a Jump In
        const isValid = (isPlayerTurn && isValidPlay(card, topCard)) || (!isPlayerTurn && isExactMatch(card, topCard));
        
        if (isValid) {
            // Note: We use an anonymous function wrapper to call handlePlayerAction
            cardElem.onclick = () => handlePlayerAction(index);
        } else {
            cardElem.classList.add('disabled');
        }
    } else if (card.color === 'BL' && card.value === 'W') {
         // For the top card, if it's a Wild, we show the color it represents
         const colorClass = gameState.topCard.color;
         if (colorClass !== 'BL') {
            cardElem.className = `card ${colorClass}`;
            cardElem.style.background = ''; // Remove conic gradient visual for the active color
            cardElem.textContent = 'WILD';
         }
    }

    return cardElem;
}

/**
 * Updates the entire UI based on the current game state.
 */
function renderGame() {
    if (gameState.gameOver) {
        STATUS.textContent = 'Game Over! ' + (gameState.winner === 0 ? 'You Win!' : 'Computer Wins!');
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        START_BUTTON.textContent = 'Play Again';
        return;
    }

    // 1. Update Status Message
    if (gameState.currentPlayer === 0) {
        STATUS.textContent = gameState.unoAwaitingCall ? 'YOUR TURN! CALL UNO!' : 'Your turn!';
    } else {
        STATUS.textContent = "Computer's turn...";
    }

    // 2. Update Computer Hand Size
    COMPUTER_SIZE_ELEM.textContent = `${gameState.hands[1].length} cards`;

    // 3. Update Top Card (Discard Pile)
    TOP_CARD_ELEM.innerHTML = '';
    const topCardElement = renderCard(gameState.topCard);
    TOP_CARD_ELEM.appendChild(topCardElement);

    // 4. Update Player Hand
    PLAYER_HAND_ELEM.innerHTML = '';
    gameState.hands[0].forEach((card, index) => {
        // Hand cards are always clickable if the game is active, to allow for Jump In
        const isClickable = !gameState.gameOver; 
        const cardElem = renderCard(card, isClickable, index);
        PLAYER_HAND_ELEM.appendChild(cardElem);
    });

    // 5. Update Control Buttons
    const isPlayerTurn = gameState.currentPlayer === 0;
    DRAW_BUTTON.disabled = !isPlayerTurn || gameState.mustDraw;
    // The UNO button is enabled if the game is running and the player has 1 or 2 cards
    UNO_BUTTON.disabled = gameState.gameOver || gameState.hands[0].length > 2 || gameState.hands[0].length === 0;
}

/**
 * Main function to start or restart the game.
 * Must be globally accessible (no `const` or `let` modifier).
 */
function startGame() {
    initGame();
    START_BUTTON.textContent = 'Restart Game';
    START_BUTTON.disabled = true;
    renderGame();
    if (gameState.topCard.color === 'BL') {
        // Initial card is a wild, player 0 must choose color
        showColorPicker(0, gameState.topCard.value);
    } else {
        START_BUTTON.disabled = false;
    }
}

/**
 * Handles the player clicking a card in their hand.
 * @param {number} cardIndex - The index of the card in the player's hand.
 */
function handlePlayerAction(cardIndex) {
    if (gameState.gameOver) return;

    const cardPlayed = gameState.hands[0][cardIndex];
    
    const isPlayerTurn = gameState.currentPlayer === 0;
    const isJumpIn = gameState.currentPlayer === 1 && isExactMatch(cardPlayed, gameState.topCard);
    
    if (!isPlayerTurn && !isJumpIn) return; // Not your turn and not a valid Jump In

    // If a Jump In or standard play occurs, clear any pending computer move check
    if (gameState.unoPenaltyCheckTimeout) {
        clearTimeout(gameState.unoPenaltyCheckTimeout);
        gameState.unoPenaltyCheckTimeout = null;
    }

    // --- Validation and Preparation ---
    if (isPlayerTurn) {
        if (!isValidPlay(cardPlayed, gameState.topCard)) {
            STATUS.textContent = 'Invalid card! Try again or Draw.';
            return;
        }
        gameState.unoAwaitingCall = false; // Player is playing a regular turn, clears the penalty flag if set
    } else if (isJumpIn) {
        STATUS.textContent = 'JUMP IN! You seized the turn!';
    }
    
    // Remove card from hand and add to discard pile
    gameState.hands[0].splice(cardIndex, 1);
    gameState.discardPile.push(cardPlayed);

    // Handle UNO call anticipation for Human player
    const handSizeAfterPlay = gameState.hands[0].length;
    if (handSizeAfterPlay === 1) {
        gameState.unoAwaitingCall = true;
    }

    // Handle Wild Card Color Choice
    if (cardPlayed.color === 'BL') {
        // Update topCard with the Wild card, but wait for color choice
        gameState.topCard = cardPlayed; 
        // We set the current player to 0 (the jumper) to ensure color picker resolves correctly
        gameState.currentPlayer = 0; 
        showColorPicker(0, cardPlayed.value);
    } else {
        // Non-Wild Card Play: Apply effect and proceed
        const result = applyCardEffect(cardPlayed, 0, gameState.deck, gameState.hands);
        gameState.topCard = result.newTopCard;
        checkWinCondition(0);
        
        if (!gameState.gameOver) {
            // Determine next player
            gameState.currentPlayer = result.nextPlayer;
            
            // If it was a Jump In, the player who jumped in gets the turn back
            if (isJumpIn) {
                gameState.currentPlayer = 0; 
            }
            
            renderGame();
            
            if (gameState.currentPlayer !== 0) {
                // If the turn passed to the computer, start a timeout that checks for penalty first
                gameState.unoPenaltyCheckTimeout = setTimeout(handleComputerTurn, 1000); 
            }
        }
    }
    START_BUTTON.disabled = false;
}


/**
 * Displays the color picker when a Wild card is played.
 * @param {number} playerIndex - The player who played the Wild (0 or 1).
 * @param {string} wildValue - 'W' or 'W4'.
 */
function showColorPicker(playerIndex, wildValue) {
    if (playerIndex === 0) {
        // Disable everything while waiting for color choice
        PLAYER_HAND_ELEM.innerHTML = ''; 
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        COLOR_PICKER_ELEM.style.display = 'flex';
        STATUS.textContent = `Choose a color for the ${wildValue === 'W4' ? '+4' : 'WILD'} card.`;
        
        // Clear and create color buttons
        COLOR_PICKER_ELEM.innerHTML = '';
        const colors = ['R', 'G', 'B', 'Y'];
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = `color-btn ${color} rounded-full w-10 h-10`;
            btn.onclick = () => chooseColor(color, wildValue);
            COLOR_PICKER_ELEM.appendChild(btn);
        });
    }
}

/**
 * Finalizes the Wild card play after a color has been chosen.
 * @param {string} chosenColor - The color ('R', 'G', 'B', 'Y').
 * @param {string} wildValue - 'W' or 'W4'.
 */
function chooseColor(chosenColor, wildValue) {
    COLOR_PICKER_ELEM.style.display = 'none';
    
    // Set the new color to the top card state
    gameState.topCard = { color: chosenColor, value: wildValue };

    // Apply card effects and determine next player
    const result = applyCardEffect(gameState.topCard, 0, gameState.deck, gameState.hands);
    
    checkWinCondition(0);
    if (!gameState.gameOver) {
        gameState.currentPlayer = result.nextPlayer;
        renderGame();
        if (gameState.currentPlayer !== 0) {
            setTimeout(handleComputerTurn, 1000);
        }
    }
}

/**
 * Handles the player explicitly drawing a card.
 * Must be globally accessible (no `const` or `let` modifier).
 */
function drawCard() {
    if (gameState.currentPlayer !== 0 || gameState.gameOver) return;
    
    if (gameState.deck.length === 0) {
        STATUS.textContent = 'Deck is empty!';
        return;
    }

    const newCard = gameState.deck.pop();
    gameState.hands[0].push(newCard);
    
    // Check if the drawn card can be played immediately
    if (isValidPlay(newCard, gameState.topCard)) {
        STATUS.textContent = 'You drew a playable card. Click to play it or end your turn by drawing again.';
        // Allow player to play it or keep it (and end turn by clicking Draw again)
        gameState.mustDraw = false; 
    } else {
        // If the drawn card is not playable, the turn passes to the computer
        gameState.unoAwaitingCall = false; // Player's turn is officially over, clear flag
        gameState.mustDraw = false;
        gameState.currentPlayer = 1;
        renderGame();
        // Use the wrapper function to allow for penalty check logic
        gameState.unoPenaltyCheckTimeout = setTimeout(handleComputerTurn, 1000); 
    }
    renderGame();
}

/**
 * Wrapper function for the computer's turn logic, which first checks for a human UNO penalty.
 */
function handleComputerTurn() {
    if (gameState.currentPlayer !== 1 || gameState.gameOver) return;
    
    // --- UNO Penalty Check (Computer catches Human) ---
    if (gameState.unoAwaitingCall) {
        STATUS.textContent = "Computer caught you! UNO Penalty: Draw 2 cards.";
        
        // 1. Draw 2 cards penalty
        for (let i = 0; i < 2; i++) {
             if (gameState.deck.length > 0) gameState.hands[0].push(gameState.deck.pop());
        }
        
        gameState.unoAwaitingCall = false; // Penalty applied, flag cleared
        
        // 2. Turn remains with Computer
        renderGame();
        // Give a short delay after the penalty is applied before the computer actually plays
        gameState.unoPenaltyCheckTimeout = setTimeout(handleComputerTurnLogic, 1500);
        return; 
    }
    
    // If no penalty, proceed directly to computer's play logic
    handleComputerTurnLogic();
}

/**
 * Handles the core logic of the computer's turn (playing or drawing).
 */
function handleComputerTurnLogic() {
    if (gameState.currentPlayer !== 1 || gameState.gameOver) return;

    STATUS.textContent = "Computer's turn...";
    
    const computerHand = gameState.hands[1];
    const topCard = gameState.topCard;
    let cardIndexToPlay = computerPlay(computerHand, topCard);

    if (cardIndexToPlay !== null) {
        // Play Card
        const cardPlayed = computerHand[cardIndexToPlay];
        computerHand.splice(cardIndexToPlay, 1);
        gameState.discardPile.push(cardPlayed);
        
        // --- Computer UNO Call ---
        if (computerHand.length === 1) { 
             STATUS.textContent = "Computer calls UNO!";
        }

        // Handle Wild Card logic for Computer
        if (cardPlayed.color === 'BL') {
            // applyCardEffect will determine the color based on computer's best move
            const result = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
            gameState.topCard = result.newTopCard; 
            
        } else {
            // Non-Wild Card Play: Apply effect and proceed
            const result = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
            gameState.topCard = result.newTopCard;
        }
        
        checkWinCondition(1);
        if (!gameState.gameOver) {
            // The result object contains the index of the next player, accounting for skips/reverses
            gameState.currentPlayer = result.nextPlayer;
            renderGame();
            if (gameState.currentPlayer === 1) {
                // Computer skipped the player or reversed to itself
                gameState.unoPenaltyCheckTimeout = setTimeout(handleComputerTurn, 1000); 
            }
        }
        
    } else {
        // Draw Card (Draw until match)
        STATUS.textContent = "Computer draws a card...";
        let drawnCard;
        let canPlay = false;
        let result = {}; // Initialize result for scope

        while (gameState.deck.length > 0) {
            drawnCard = gameState.deck.pop();
            computerHand.push(drawnCard);
            // Computer must play if possible after drawing
            if (isValidPlay(drawnCard, topCard)) {
                canPlay = true;
                break;
            }
        }
        
        // If a playable card was drawn, play it immediately (it will be the last card in the hand)
        if (canPlay) {
            const playIndex = computerHand.length - 1;
            const cardPlayed = computerHand[playIndex];
            computerHand.splice(playIndex, 1);
            gameState.discardPile.push(cardPlayed);

            // Apply effect
            result = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
            gameState.topCard = result.newTopCard;
            
            // --- Computer UNO Call (after playing the drawn card) ---
            if (computerHand.length === 1) { 
                 STATUS.textContent = "Computer calls UNO!";
            }
        }
        
        // If not playable (or deck ran out), turn passes
        checkWinCondition(1);
        if (!gameState.gameOver) {
            // If the computer played a card (even a drawn one), use the result, otherwise, pass turn to human (0)
            gameState.currentPlayer = canPlay ? result.nextPlayer : 0; 
            renderGame();
            if (gameState.currentPlayer === 1) {
                 // Must have played a card that skipped player 0 back to itself
                 gameState.unoPenaltyCheckTimeout = setTimeout(handleComputerTurn, 1000); 
            }
        }
    }

    renderGame();
}

/**
 * Checks if the player won, and updates the game state.
 * @param {number} playerIndex - The index of the player who just played.
 */
function checkWinCondition(playerIndex) {
    if (gameState.hands[playerIndex].length === 0) {
        gameState.gameOver = true;
        gameState.winner = playerIndex;
    }
}

/**
 * Handles the player declaring UNO.
 * Must be globally accessible (no `const` or `let` modifier).
 */
function declareUno() {
    if (gameState.hands[0].length === 1) {
        STATUS.textContent = "UNO declared! Good.";
        gameState.unoAwaitingCall = false; // Successfully called UNO
        
        // If the computer was about to play, cancel the penalty check
        if (gameState.unoPenaltyCheckTimeout) {
            clearTimeout(gameState.unoPenaltyCheckTimeout);
            gameState.unoPenaltyCheckTimeout = null;
            // Note: If player calls UNO before the computer's turn starts, 
            // the computer won't call a penalty, and its turn will start immediately after the current action.
        }
    } else if (gameState.hands[0].length === 0) {
        STATUS.textContent = "You already won!";
    } else {
        STATUS.textContent = "Too early to call UNO! Penalty not implemented for false call.";
    }
}


// --- Initialization ---

// Set up the initial state to show the UI is ready
document.addEventListener('DOMContentLoaded', () => {
    // We only need to ensure the DOM elements are ready before we attempt to assign the global variables
    // No need to call renderGame() here as the HTML template already contains default text.
});

// Initial game state setup for rendering the 'Start' message
initGame();
gameState.hands = [[], []]; // Clear hands for start screen
gameState.deck = []; // Clear deck for start screen
gameState.gameOver = true; // Set to true so initial state is "ready to start"
gameState.winner = -1; 
renderGame(); // Call once to initialize button states and displays
