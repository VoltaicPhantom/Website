// =====================================================================
// === CORE GAME STATE AND LOGIC ===
// =====================================================================

// Global Game State Object
let gameState = {};
const NUM_PLAYERS = 4; // Set the game to 4 players: Human (0) + 3 AI (1, 2, 3)

// --- DOM Element References ---
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
// UPDATED REFERENCES for 4-player HTML (Players 1, 2, 3)
const COMPUTER_SIZE_ELEMS = [
    document.getElementById('computer-hand-size-1'), 
    document.getElementById('computer-hand-size-2'), 
    document.getElementById('computer-hand-size-3')  
];
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
    for (const color of colors) {
        for (let i = 0; i < 2; i++) {
            deck.push({ color: color, value: 'S' });
            deck.push({ color: color, value: 'R' });
            deck.push({ color: color, value: 'D2' });
        }
    }
    
    // 3. Wild Cards (4 of each)
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'BL', value: 'W' });
        deck.push({ color: 'BL', value: 'W4' });
    }

    // Fisher-Yates shuffle
    let currentIndex = deck.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [deck[currentIndex], deck[randomIndex]] = [deck[randomIndex], deck[currentIndex]];
    }

    return deck;
}

/**
 * Initializes the game state.
 */
function initGame() {
    gameState.deck = createDeck();
    gameState.discardPile = [];
    // Initialize hands for all players (0=Human, 1-3=AI)
    gameState.hands = Array.from({ length: NUM_PLAYERS }, () => []); 
    gameState.topCard = null;
    gameState.currentPlayer = 0; 
    gameState.direction = 1; // 1: clockwise, -1: counter-clockwise
    gameState.pendingDraw = 0; 
    gameState.unoAwaitingCall = false; 
    gameState.gameOver = false;
    gameState.winner = -1;
    gameState.aiActionTimeout = null; // Used to delay AI moves and manage penalty checks
}

/**
 * Deals initial hands and sets up the starting card.
 */
function dealInitialCards() {
    // Deal 7 cards to each of the NUM_PLAYERS
    for (let i = 0; i < 7; i++) {
        for (let p = 0; p < NUM_PLAYERS; p++) {
            gameState.hands[p].push(gameState.deck.pop());
        }
    }

    // Flip the first card to start the discard pile (must be non-action, non-wild)
    let startCard;
    do {
        if (gameState.deck.length === 0) {
            // Safety measure
            console.error("Deck empty at startup!");
            break; 
        }
        startCard = gameState.deck.pop();
    } while (startCard.color === 'BL' || ['D2', 'S', 'R', 'W', 'W4'].includes(startCard.value)); 
    
    gameState.discardPile.push(startCard);
    gameState.topCard = startCard;
}

/**
 * Starts a new game.
 */
function startGame() {
    // Clear any pending AI action from previous games
    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
    }
    initGame();
    dealInitialCards();
    showStatus(`Game started! It's your turn.`);
    gameState.gameOver = false;
    
    // Check if the starting card requires a color choice (e.g., if we allow house rules for wild start)
    // For standard UNO, the starting card is always non-wild.

    renderGame();
    
    START_BUTTON.textContent = 'Restart Game';
}


// --- 2. Card Logic ---

/**
 * Converts a card object to its display text/symbol.
 * (Ensures symbols Ø and ⟲ are used)
 */
function getCardText(card) {
    if (card.color === 'BL') {
        if (card.value === 'W') return 'WILD';
        if (card.value === 'W4') return '+4';
    }
    switch (card.value) {
        case 'S': return 'Ø'; // Skip symbol
        case 'R': return '⟲'; // Reverse symbol
        case 'D2': return '+2';
        default: return card.value.toString();
    }
}

/**
 * Checks if a card can be legally played on the top card.
 */
function canPlay(card, topCard) {
    if (card.color === 'BL') return true;
    if (card.value === topCard.value) return true;
    
    // Check match by the top card's physical color OR the chosen color (nextColor)
    const activeColor = topCard.nextColor || topCard.color;

    if (card.color === activeColor) return true;
    
    return false;
}

/**
 * Checks for an exact match (used for Jump In rule).
 */
function isExactMatch(card1, card2) {
    return card1.color === card2.color && card1.value === card2.value;
}

/**
 * Calculates the index of the next player, handling skips.
 * @param {number} playerIndex - The current player index.
 * @param {number} direction - The current direction (1 or -1).
 * @param {number} skips - The number of players to skip (0 or 1 for Skip card).
 * @returns {number} The index of the next player.
 */
function calculateNextPlayer(playerIndex, direction, skips = 0) {
    let nextPlayer = playerIndex;
    // Iterate skips + 1 (for the current turn passing)
    for (let i = 0; i <= skips; i++) { 
        nextPlayer = (nextPlayer + direction) % NUM_PLAYERS;
        if (nextPlayer < 0) nextPlayer += NUM_PLAYERS;
    }
    return nextPlayer;
}

/**
 * Applies the effect of an action card.
 */
function applyCardEffect(card, playerIndex) {
    let message = '';

    const playerLabel = playerIndex === 0 ? 'You' : `Computer ${playerIndex}`;
    let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);

    switch (card.value) {
        case 'S':
            message = `${playerLabel} played a SKIP (Ø).`;
            nextPlayer = calculateNextPlayer(playerIndex, gameState.direction, 1); // Skip one extra player
            break;
        case 'R':
            gameState.direction *= -1;
            message = `${playerLabel} played a REVERSE (⟲). Direction changed.`;
            // NOTE: In 4 players, Reverse does NOT skip the next player.
            nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);
            break;
        case 'D2':
            gameState.pendingDraw += 2;
            message = `${playerLabel} played a +2. The next player must draw 2.`;
            break;
        case 'W4':
            gameState.pendingDraw += 4;
            message = `${playerLabel} played a WILD +4. The next player must draw 4.`;
            break;
        case 'W':
            message = `${playerLabel} played a WILD.`;
            break;
        default:
            message = `${playerLabel} played a ${card.color} ${card.value}.`;
            break;
    }
    
    showStatus(message);
    
    return { nextPlayer };
}


// --- 3. UI/Rendering ---

/**
 * Updates the entire game display based on the current gameState.
 */
function renderGame() {
    // 1. Top Card
    if (gameState.topCard) {
        // Set the primary class based on the card's physical color
        TOP_CARD_ELEM.className = `card ${gameState.topCard.color}`;
        TOP_CARD_ELEM.textContent = getCardText(gameState.topCard);
        
        // --- WILD CARD BORDER FIX ---
        if (gameState.topCard.color === 'BL' && gameState.topCard.nextColor) {
             TOP_CARD_ELEM.classList.add('has-next-color');
             TOP_CARD_ELEM.style.borderColor = `var(--color-${gameState.topCard.nextColor})`; 
        } else {
             TOP_CARD_ELEM.classList.remove('has-next-color');
             TOP_CARD_ELEM.style.borderColor = 'transparent'; 
        }
    } else {
        TOP_CARD_ELEM.className = 'card';
        TOP_CARD_ELEM.textContent = 'Deck';
        TOP_CARD_ELEM.style.borderColor = 'transparent'; 
    }

    // 2. Player Hand (Player 0)
    PLAYER_HAND_ELEM.innerHTML = '';
    const isPlayerTurn = gameState.currentPlayer === 0;
    const playerHand = gameState.hands[0];
    
    playerHand.forEach((card, index) => {
        const cardElement = document.createElement('div');
        const playable = isPlayerTurn && canPlay(card, gameState.topCard);
        const isJumpIn = !isPlayerTurn && isExactMatch(card, gameState.topCard); 

        cardElement.className = `card ${card.color} ${playable || isJumpIn ? '' : 'disabled'}`;
        cardElement.setAttribute('data-color', card.color);
        cardElement.setAttribute('data-value', card.value);
        cardElement.textContent = getCardText(card);
        
        if (playable || isJumpIn) {
            // Attach play handler
            cardElement.onclick = () => handlePlayerAction(index);
        } else {
            cardElement.onclick = null;
        }

        PLAYER_HAND_ELEM.appendChild(cardElement);
    });
    
    // 3. Computer Hand Sizes (Players 1, 2, 3)
    for (let i = 0; i < NUM_PLAYERS - 1; i++) {
        const playerIndex = i + 1;
        if (COMPUTER_SIZE_ELEMS[i]) {
            let statusText = `${gameState.hands[playerIndex].length} cards`;
            if (gameState.currentPlayer === playerIndex) {
                 statusText = `▶️ ${statusText}`;
            }
            COMPUTER_SIZE_ELEMS[i].textContent = statusText;
        }
    }
    
    // 4. Button States
    DRAW_BUTTON.disabled = !isPlayerTurn; 
    UNO_BUTTON.disabled = !(isPlayerTurn && playerHand.length === 2);
    
    // 5. Game End State
    if (gameState.gameOver) {
        showStatus(gameState.winner === 0 ? '🎉 YOU WIN! 🎉' : `😔 Computer ${gameState.winner} WINS. 😔`);
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        START_BUTTON.style.display = 'block';
    } else {
        START_BUTTON.style.display = 'none';
        
        // Start computer move if it's an AI's turn (1, 2, or 3)
        if (gameState.currentPlayer !== 0 && COLOR_PICKER_ELEM.style.display === 'none') {
            // Use the wrapper to handle AI flow
            if (!gameState.aiActionTimeout) {
                 gameState.aiActionTimeout = setTimeout(handleComputerTurn, 1500); 
            }
        }
    }
}

/**
 * Displays a status message to the user.
 */
function showStatus(message) {
    STATUS.textContent = message;
}

/**
 * Shows the color picker for Wild cards.
 */
function showColorPicker(playerIndex, wildValue) {
    if (playerIndex === 0) {
        COLOR_PICKER_ELEM.style.display = 'flex'; 
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        PLAYER_HAND_ELEM.querySelectorAll('.card').forEach(c => c.onclick = null); // Disable hand
    } else {
        // Computer picks immediately: strategy is to pick the color it has the most of
        const colors = ['R', 'G', 'B', 'Y'];
        const hand = gameState.hands[playerIndex];
        const colorCounts = hand.reduce((acc, card) => {
            if (card.color !== 'BL') {
                acc[card.color] = (acc[card.color] || 0) + 1;
            }
            return acc;
        }, {});
        
        let bestColor = colors[Math.floor(Math.random() * 4)]; 
        let maxCount = -1;
        
        for (const color of colors) {
            if (colorCounts[color] > maxCount) {
                maxCount = colorCounts[color];
                bestColor = color;
            }
        }
        
        // Set the chosen color and continue game flow
        setWildColor(bestColor);
    }
}

/**
 * Sets the color for a Wild card and continues the game flow.
 */
function setWildColor(color) {
    // This function can be called by human (player 0) or computer (player 1, 2, 3)
    const playerIndex = gameState.currentPlayer;
    
    if (playerIndex === 0) {
        COLOR_PICKER_ELEM.style.display = 'none';
        PLAYER_HAND_ELEM.querySelectorAll('.card').forEach(c => c.onclick = null); // Re-disable cards 
    }
    
    // Update the top card with the chosen color using the .nextColor property
    gameState.topCard.nextColor = color; 
    
    showStatus(`New color is set to ${color}.`);

    // Apply card effects and determine next player
    const result = applyCardEffect(gameState.topCard, playerIndex);
    gameState.currentPlayer = result.nextPlayer;
    
    checkWin(playerIndex); 
    handleUnoCheck(playerIndex);

    // Clear timeout *before* rendering to prevent immediate re-trigger
    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
        gameState.aiActionTimeout = null;
    }

    renderGame();
}


// --- 4. Game Flow and Actions ---

/**
 * Helper to consolidate reshuffle logic.
 */
function reshuffleDeck() {
    if (gameState.discardPile.length <= 1) {
        return false;
    }
    const topCard = gameState.discardPile.pop(); 
    gameState.deck = createDeck(); // Regenerate deck for safety
    gameState.deck = gameState.deck.filter(c => !gameState.discardPile.some(dc => dc.color === c.color && dc.value === c.value)); // Simple filter to remove discarded cards (imperfect but functional)
    gameState.deck = [...gameState.deck, ...shuffle(gameState.discardPile)];

    gameState.discardPile = [topCard];
    showStatus('Deck ran out! Discard pile shuffled into new deck.');
    return true;
}

/**
 * Handles the logic for drawing a card for the current player.
 * @param {number} playerIndex - The index of the player drawing.
 * @returns {boolean} True if a playable card was found/drawn, False if turn must pass.
 */
function handleDrawAction(playerIndex) {
    const isHuman = playerIndex === 0;
    const hand = gameState.hands[playerIndex];
    let cardsDrawn = 0;
    
    // --- 1. PENALTY DRAW LOGIC ---
    if (gameState.pendingDraw > 0) {
        const drawAmount = gameState.pendingDraw;
        for (let i = 0; i < drawAmount; i++) {
            if (gameState.deck.length === 0) reshuffleDeck();
            hand.push(gameState.deck.pop());
            cardsDrawn++;
        }
        gameState.pendingDraw = 0; // Penalty complete
        
        // Pass turn after a penalty draw
        let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);
        gameState.currentPlayer = nextPlayer;
        
        showStatus(`${isHuman ? 'You' : `Computer ${playerIndex}`} drew ${cardsDrawn} cards due to penalty. Turn passed.`);
        return false; // Turn passed
    }
    
    // --- 2. DRAW TILL MATCH LOGIC ---
    
    let playableFound = false;
    let cardDrawn = null;
    
    do {
        if (gameState.deck.length === 0) {
            if (!reshuffleDeck()) break;
        }
        
        cardDrawn = gameState.deck.pop();
        hand.push(cardDrawn);
        cardsDrawn++;
        
        if (canPlay(cardDrawn, gameState.topCard)) {
            playableFound = true;
            break; // Stop drawing
        }
        
    } while (isHuman && !playableFound); // Human only draws one card, AI draws till match or deck empty.

    if (cardsDrawn > 0) {
         showStatus(`${isHuman ? 'You' : `Computer ${playerIndex}`} drew ${cardsDrawn} card${cardsDrawn === 1 ? '' : 's'}.`);
    }
    
    if (isHuman) {
         // Human draws ONE card. If playable, they can click it. If not, turn passes via click Draw again, or next action.
         if (!playableFound) {
              // Turn passes
              let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);
              gameState.currentPlayer = nextPlayer;
         }
         return playableFound;
    } else {
        // AI draws till match. If playable, they play it immediately.
        return playableFound; 
    }
}


/**
 * Handles the player clicking a card in their hand or the draw button.
 */
function handlePlayerAction(cardIndex) {
    if (gameState.gameOver || (gameState.currentPlayer !== 0 && cardIndex === null)) return;
    
    // --- Handle Draw Card action if cardIndex is null ---
    if (cardIndex === null) {
        if (gameState.currentPlayer === 0) {
            handleDrawAction(0); 
        }
        renderGame();
        return; 
    }
    // --- END DRAW ---
    
    // The rest of the code is for playing a card (cardIndex is a valid hand index)
    const cardPlayed = gameState.hands[0][cardIndex]; 
    
    const isPlayerTurn = gameState.currentPlayer === 0;
    const isJumpIn = !isPlayerTurn && isExactMatch(cardPlayed, gameState.topCard);

    if (!isPlayerTurn && !isJumpIn) return;
    
    // 1. Check if card is playable
    if (!canPlay(cardPlayed, gameState.topCard) && !isJumpIn) {
        showStatus('Invalid move. Card must match color, value, or be a Wild card.');
        return;
    }

    // 2. Remove the played card from the player's hand
    gameState.hands[0].splice(cardIndex, 1);
    
    // 3. Add the card to the discard pile and update top card
    gameState.discardPile.push(cardPlayed);
    gameState.topCard = cardPlayed;
    
    // Clear the 'nextColor' property
    if (gameState.topCard.nextColor) {
        delete gameState.topCard.nextColor;
    }
    
    // 4. Handle Wild Card color choice for the human player
    if (cardPlayed.color === 'BL') {
        // Pauses flow until setWildColor is called
        showColorPicker(0, cardPlayed.value); 
    } else {
        // Non-Wild Card Play: Apply effect and proceed
        const result = applyCardEffect(cardPlayed, 0);
        
        // 5. Update game state and check for win
        gameState.currentPlayer = result.nextPlayer;
        
        // If it was a Jump In, the player who jumped in gets the turn back
        if (isJumpIn) {
            gameState.currentPlayer = 0; 
        }
        
        checkWin(0);
        handleUnoCheck(0); 
    }
    
    // Clear timeout *before* rendering to prevent immediate re-trigger
    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
        gameState.aiActionTimeout = null;
    }

    renderGame();
}

/**
 * Executes the computer's move logic (for players 1, 2, 3).
 */
function handleComputerTurn() {
    if (gameState.currentPlayer === 0 || gameState.gameOver || COLOR_PICKER_ELEM.style.display !== 'none') {
        if (gameState.aiActionTimeout) {
             clearTimeout(gameState.aiActionTimeout);
             gameState.aiActionTimeout = null;
        }
        return;
    }
    
    const playerIndex = gameState.currentPlayer;
    const topCard = gameState.topCard;
    const computerHand = gameState.hands[playerIndex];
    
    // 1. Find a playable card
    let playableIndex = -1;
    for(let i = 0; i < computerHand.length; i++) {
        if (canPlay(computerHand[i], topCard)) {
            playableIndex = i;
            break; 
        }
    }
    
    if (gameState.pendingDraw > 0) {
        // Computer draws penalty cards (handleDrawAction will pass the turn)
        handleDrawAction(playerIndex); 

    } else if (playableIndex !== -1) {
        // 2. Play the card
        
        const cardPlayed = computerHand[playableIndex];
        computerHand.splice(playableIndex, 1);
        gameState.discardPile.push(cardPlayed);
        gameState.topCard = cardPlayed;
        if (gameState.topCard.nextColor) { delete gameState.topCard.nextColor; }

        // Computer UNO Call
        if (computerHand.length === 1) {
             showStatus(`Computer ${playerIndex} called UNO!`);
        }

        // Handle Wild Card color choice and effect
        if (cardPlayed.color === 'BL') {
            showColorPicker(playerIndex, cardPlayed.value); 
            // setWildColor is called immediately by showColorPicker(1, ...)
        } else {
            const result = applyCardEffect(cardPlayed, playerIndex);
            gameState.currentPlayer = result.nextPlayer;
            checkWin(playerIndex);
            handleUnoCheck(playerIndex); 
        }
        
    } else {
        // 3. No playable card, computer must draw (Draw Till Match)
        const playableFound = handleDrawAction(playerIndex); 
        
        // If a playable card was found and turn hasn't passed (currentPlayer is still the AI), play it.
        if (playableFound && gameState.currentPlayer === playerIndex) {
            // Re-check for a playable card (the one just drawn, which will be the last one added)
            const newPlayableIndex = computerHand.findIndex(card => canPlay(card, topCard));
            
            if (newPlayableIndex !== -1) {
                const newPlayableCard = computerHand[newPlayableIndex];
                computerHand.splice(newPlayableIndex, 1);
                gameState.discardPile.push(newPlayableCard);
                gameState.topCard = newPlayableCard;
                if (gameState.topCard.nextColor) { delete gameState.topCard.nextColor; }
                
                // Computer UNO Call
                if (computerHand.length === 1) {
                    showStatus(`Computer ${playerIndex} called UNO!`);
                }

                if (newPlayableCard.color === 'BL') {
                    showColorPicker(playerIndex, newPlayableCard.value); 
                } else {
                    const result = applyCardEffect(newPlayableCard, playerIndex);
                    gameState.currentPlayer = result.nextPlayer;
                    checkWin(playerIndex);
                    handleUnoCheck(playerIndex); 
                }
            }
        }
    }
    
    // Clear timeout and re-render
    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
        gameState.aiActionTimeout = null;
    }
    renderGame();
}


/**
 * Checks for a win condition.
 */
function checkWin(playerIndex) {
    if (gameState.hands[playerIndex].length === 0) {
        gameState.gameOver = true;
        gameState.winner = playerIndex;
    }
}

/**
 * Handles the logic for a player needing to call UNO.
 */
function handleUnoCheck(playerIndex) {
    if (gameState.hands[playerIndex].length === 1) {
        if (playerIndex === 0) {
            gameState.unoAwaitingCall = true;
            STATUS.textContent = "You have 1 card! Call UNO or face a penalty on the next turn.";
        } else {
            // Computer always calls UNO instantly 
        }
    } else {
        gameState.unoAwaitingCall = false;
    }
}

/**
 * Handles the player declaring UNO.
 */
function declareUno() {
    if (gameState.hands[0].length === 1) {
        STATUS.textContent = "UNO declared! Good.";
        gameState.unoAwaitingCall = false; 
    } else if (gameState.hands[0].length === 0) {
        STATUS.textContent = "You already won!";
    } else {
        STATUS.textContent = "Too early to call UNO! Penalty not implemented for false call.";
    }
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    gameState.hands = Array.from({ length: NUM_PLAYERS }, () => []); 
    gameState.deck = []; 
    gameState.gameOver = true; 
    gameState.winner = -1; 
    
    STATUS.textContent = 'Press "Start New Game" to begin!';

    renderGame(); 
});
