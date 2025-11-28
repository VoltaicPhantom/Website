// =====================================================================
// === CORE GAME STATE AND LOGIC (Translated from Python) ===
// =====================================================================

// Global Game State Object
let gameState = {};

// --- 1. Game Setup (No changes needed here) ---

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
        
        let canPlayNormal = isValidPlay(card, gameState.topCard);
        let canJumpIn = isExactMatch(card, gameState.topCard); // NEW check for Jump In
        
        // Always allow click if it's the player's turn OR if they can Jump In
        if (gameState.currentPlayer === 0 || canJumpIn) {
            cardElem.onclick = () => handlePlayerAction(index);
        }
        
        // Disable styling if it's not the player's turn AND they can't jump (standard rule)
        if (gameState.currentPlayer === 0 && !canPlayNormal) {
             cardElem.classList.add('disabled');
        } 
        // If it's the computer's turn and the player cannot jump, disable visually
        else if (gameState.currentPlayer !== 0 && !canJumpIn) {
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

// --- Wild Card Color Selection (No changes needed here) ---

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
 * Includes Jump In and Draw Till Match logic.
 * @param {number | null} cardIndex - Index of the card to play, or null if drawing.
 */
async function handlePlayerAction(cardIndex) {
    if (gameState.gameOver) return;

    const playerHand = gameState.hands[0];
    let cardPlayed = null;
    let newTopColor = null;

    if (cardIndex !== null) {
        // === Play card attempt (includes Jump In) ===
        const cardToPlay = playerHand[cardIndex];
        const isJumpIn = (gameState.currentPlayer !== 0) && isExactMatch(cardToPlay, gameState.topCard);
        
        // Block action if it's not our turn AND it's not a valid Jump In
        if (gameState.currentPlayer !== 0 && !isJumpIn) {
            STATUS.textContent = "It's the computer's turn! You can only play if you can 'Jump In' (exact match).";
            return;
        }

        // Check validity for a normal turn/play
        if (gameState.currentPlayer === 0 && !isValidPlay(cardToPlay, gameState.topCard)) {
            STATUS.textContent = "Invalid move. Try again.";
            return;
        }
        
        // Execute the play
        cardPlayed = playerHand.splice(cardIndex, 1)[0];
        gameState.discardPile.push(cardPlayed);

        if (isJumpIn) {
             STATUS.textContent = `JUMP IN! You seized the turn with a ${cardPlayed.color}-${cardPlayed.value}.`;
             gameState.currentPlayer = 0; // The player who jumped keeps the turn
             // Note: Jump Ins can only be colored cards, so no wild choice needed.
        } else if (cardPlayed.color === 'BL') {
            // Await the color choice from the UI buttons
            newTopColor = await handleWildChoice();
        } else if (playerHand.length === 1) {
            STATUS.textContent = "You played a card and shouted UNO!";
        }
        
    } else {
        // === Player draws (Draw Till Match) ===
        let cardDrawn = null;
        let playedDrawnCard = false;

        STATUS.textContent = "Drawing until a match is found...";
        renderGame(); // Update UI with draw status
        
        while (gameState.deck.length > 0) {
            // Simulate slow draw for visual effect
            await new Promise(resolve => setTimeout(resolve, 300));

            cardDrawn = gameState.deck.pop();
            playerHand.push(cardDrawn);
            
            renderGame(); 
            
            // Check if the drawn card can be played immediately
            if (isValidPlay(cardDrawn, gameState.topCard)) {
                // The player is now allowed to play the drawn card immediately (index is always playerHand.length - 1)
                STATUS.textContent = "You drew a playable card. Click it to play, or click DRAW again to end your turn.";
                // We keep the currentPlayer = 0 and exit the loop.
                return; 
            }
        }
        
        // If the loop finished without playing, or the player clicks DRAW again (which is handlePlayerAction(null) again)
        // Check if the player has any valid move (which they should not, otherwise they would have played earlier)
        // Since the current logic allows the player to click DRAW again to end the turn after drawing a match, 
        // we advance the turn here for the final draw/pass action.
        STATUS.textContent = "You finished drawing. Turn passed.";
        gameState.currentPlayer = 1; 
        renderGame();
        setTimeout(handleComputerTurn, 1000); 
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
        // Only update the player if it wasn't a Jump In
        if (gameState.currentPlayer !== 0) {
            gameState.currentPlayer = nextPlayer;
        }

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
 * Executes the computer's turn (includes Draw Till Match logic).
 */
async function handleComputerTurn() {
    if (gameState.gameOver || gameState.currentPlayer !== 1) return;

    STATUS.textContent = "Computer's turn...";
    const computerHand = gameState.hands[1];
    let cardPlayed = null;

    let cardIndexToPlay = computerPlay(computerHand, gameState.topCard);

    if (cardIndexToPlay === null) {
        // === Computer draws (Draw Till Match) ===
        STATUS.textContent = "Computer drawing until a match...";
        renderGame();
        
        let cardDrawn = null;
        let foundMatch = false;

        while (gameState.deck.length > 0) {
            // Simulate drawing time
            await new Promise(resolve => setTimeout(resolve, 500)); 

            cardDrawn = gameState.deck.pop();
            computerHand.push(cardDrawn);
            renderGame(); 
            
            // Computer must play the card if it's valid
            if (isValidPlay(cardDrawn, gameState.topCard)) {
                cardIndexToPlay = computerHand.length - 1;
                foundMatch = true;
                break; // Exit the loop and proceed to playing the card
            }
        }

        if (!foundMatch) {
            // Deck ran out without a match
            STATUS.textContent = "Deck is empty! Computer skips turn.";
            gameState.currentPlayer = 0; // Turn ends
            renderGame();
            return;
        }
    }

    // --- Computer plays the determined card (or the drawn card) ---
    if (cardIndexToPlay !== null) {
        cardPlayed = computerHand.splice(cardIndexToPlay, 1)[0];
        gameState.discardPile.push(cardPlayed);
        
        let newTopColor = null;
        if (cardPlayed.color === 'BL') {
            // The computer must resolve its Wild choice before applying effect
            const colorsInHand = computerHand.map(c => c.color).filter(c => c !== 'BL');
            let colorCounts = {};
            for (const color of colorsInHand) {
                colorCounts[color] = (colorCounts[color] || 0) + 1;
            }
            newTopColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b) || 'R';
        }

        // Apply effect (and determine wild color if necessary)
        const { nextPlayer, newTopCard } = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
        
        // Overwrite wild color if set manually by the computer
        if (newTopColor) {
             newTopCard.color = newTopColor;
        }

        gameState.topCard = newTopCard;
        gameState.currentPlayer = nextPlayer;

        STATUS.textContent = `Computer played: ${cardPlayed.color}-${cardPlayed.value}`;

        if (computerHand.length === 0) {
            gameState.gameOver = true;
            renderGame();
            return;
        }
    }

    renderGame();
    
    // If the computer is still the current player (due to Skip/Draw), run its turn again
    if (gameState.currentPlayer === 1 && !gameState.gameOver) {
        setTimeout(handleComputerTurn, 1000); 
    }
}
