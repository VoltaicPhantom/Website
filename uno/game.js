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
// REFERENCES for 4-player HTML (Players 1, 2, 3)
const COMPUTER_SIZE_ELEMS = [
    document.getElementById('computer-hand-size-1'), // Player 1
    document.getElementById('computer-hand-size-2'), // Player 2
    document.getElementById('computer-hand-size-3')  // Player 3
];
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const START_BUTTON = document.getElementById('start-button');
const UNO_BUTTON = document.getElementById('uno-button');


// --- 1. Game Setup ---

/**
 * Creates and shuffles a comprehensive Uno deck.
 * @returns {Array} The shuffled deck array of card objects.
 */
function createDeck() {
    const colors = ['R', 'G', 'B', 'Y'];
    const deck = [];
    
    // 1. Number Cards (0-9)
    for (const color of colors) {
        deck.push({ color: color, value: 0 }); 
        for (let number = 1; number <= 9; number++) {
            deck.push({ color: color, value: number });
            deck.push({ color: color, value: number }); 
        }
    }

    // 2. Colored Action Cards
    for (const color of colors) {
        for (const action of ['S', 'R', 'D2']) {
            deck.push({ color: color, value: action });
            deck.push({ color: color, value: action });
        }
    }

    // 3. Wild Cards 
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
 * Initializes the game state.
 */
function initGame() {
    gameState.deck = createDeck();
    gameState.discardPile = [];
    gameState.hands = Array.from({ length: NUM_PLAYERS }, () => []); 
    gameState.topCard = null;
    gameState.currentPlayer = 0; 
    gameState.direction = 1; // 1: clockwise, -1: counter-clockwise
    gameState.pendingDraw = 0; 
    gameState.unoAwaitingCall = false; 
    gameState.gameOver = false;
    gameState.winner = -1;
    gameState.aiActionTimeout = null; 
}

/**
 * Deals initial hands and sets up the starting card.
 */
function dealInitialCards() {
    for (let i = 0; i < 7; i++) {
        for (let p = 0; p < NUM_PLAYERS; p++) {
            gameState.hands[p].push(gameState.deck.pop());
        }
    }

    // Flip the first card to start the discard pile (must be non-action, non-wild)
    let startCard;
    do {
        if (gameState.deck.length === 0) break; 
        startCard = gameState.deck.pop();
    } while (startCard.color === 'BL' || ['D2', 'S', 'R'].includes(String(startCard.value))); 
    
    gameState.discardPile.push(startCard);
    gameState.topCard = startCard;
}

/**
 * Main function to start or restart the game.
 */
function startGame() {
    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
    }
    initGame();
    dealInitialCards();
    showStatus(`Game started! It's your turn.`);
    gameState.gameOver = false;
    
    renderGame();
    
    START_BUTTON.textContent = 'Restart Game';
    START_BUTTON.disabled = false;
}

// --- 2. Game Logic ---

/**
 * Checks if a card can be played.
 */
function canPlay(cardToPlay, topCard) {
    if (cardToPlay.color === 'BL') return true;
    if (cardToPlay.value === topCard.value) return true;
    
    const activeColor = topCard.nextColor || topCard.color; 
    if (cardToPlay.color === activeColor) return true;
    
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
 */
function calculateNextPlayer(playerIndex, direction, skips = 0) {
    let nextPlayer = playerIndex;
    // Skips + 1 (for the current turn passing)
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
    const playerLabel = playerIndex === 0 ? 'You' : `Computer ${playerIndex}`;
    let skips = 0;
    
    // Clear nextColor if the new card is NOT a wild, preventing color persistence
    if (card.color !== 'BL' && gameState.topCard.nextColor) {
        delete gameState.topCard.nextColor;
    }

    switch (String(card.value)) {
        case 'S':
            skips = 1;
            showStatus(`${playerLabel} played a SKIP (🚫).`);
            break;
        case 'R':
            gameState.direction *= -1;
            showStatus(`${playerLabel} played a REVERSE (⟲). Direction changed.`);
            break;
        case 'D2':
            gameState.pendingDraw += 2;
            showStatus(`${playerLabel} played a +2. The next player must draw 2.`);
            break;
        case 'W4':
            gameState.pendingDraw += 4;
            showStatus(`${playerLabel} played a WILD +4. The next player must draw 4.`);
            break;
        case 'W':
             showStatus(`${playerLabel} played a WILD.`);
             break;
        default:
             showStatus(`${playerLabel} played a ${card.color} ${card.value}.`);
             break;
    }
    
    let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction, skips);
    
    return { nextPlayer };
}

/**
 * Helper to consolidate reshuffle logic.
 */
function reshuffleDeck() {
    if (gameState.discardPile.length <= 1) return false;
    
    const topCard = gameState.discardPile.pop(); 
    let cardsToShuffle = gameState.discardPile;
    // Simple shuffle function
    for (let i = cardsToShuffle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cardsToShuffle[i], cardsToShuffle[j]] = [cardsToShuffle[j], cardsToShuffle[i]];
    }
    gameState.deck = cardsToShuffle;
    gameState.discardPile = [topCard];
    showStatus('Deck ran out! Discard pile shuffled into new deck.');
    return true;
}

// --- 3. UI/Rendering (The Fix for Styled Cards) ---

/**
 * Helper function to determine the display text for a card value.
 */
function getCardDisplayText(value) {
    switch (String(value)) {
        case 'D2': return '+2';
        case 'S': return '🚫'; 
        case 'R': return '⟲'; 
        case 'W': return 'WILD'; 
        case 'W4': return '+4'; 
        default: return String(value);
    }
}

/**
 * Renders a single card element.
 */
function renderCard(card, isClickable = false, index = -1) {
    const cardElem = document.createElement('div');
    
    // Determine the display color: physical color OR the chosen wild color
    const displayColor = card.nextColor || card.color;
    
    cardElem.className = `card ${displayColor}`;
    cardElem.dataset.value = card.value;
    cardElem.textContent = getCardDisplayText(card.value);
    
    // Add the has-next-color class for wild cards to enable the border styling
    if (card.color === 'BL' && card.nextColor) {
        cardElem.classList.add('has-next-color');
    }

    if (isClickable) {
        const topCard = gameState.topCard;
        const isPlayerTurn = gameState.currentPlayer === 0;
        
        const canJumpIn = gameState.currentPlayer !== 0 && isExactMatch(card, topCard);
                          
        const isValid = (isPlayerTurn && canPlay(card, topCard)) || canJumpIn;
        
        if (isValid) {
            cardElem.classList.remove('disabled');
            cardElem.onclick = () => handlePlayerAction(index);
        } else {
            cardElem.classList.add('disabled');
        }
    } 

    return cardElem;
}


/**
 * Updates the entire UI based on the current game state.
 */
function renderGame() {
    if (gameState.gameOver) {
        STATUS.textContent = gameState.winner === 0 ? '🎉 YOU WIN! 🎉' : `😔 Computer ${gameState.winner} WINS. 😔`;
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        START_BUTTON.style.display = 'block';
        return;
    }
    
    START_BUTTON.style.display = 'none';

    // 1. Update Status Message (Includes Draw Penalty info)
    if (gameState.currentPlayer === 0) {
        let drawInfo = gameState.pendingDraw > 0 ? ` (Must Draw ${gameState.pendingDraw} or play Draw card.)` : '';
        STATUS.textContent = gameState.unoAwaitingCall ? 'YOUR TURN! CALL UNO!' : `Your turn! ${drawInfo}`;
    } else {
        STATUS.textContent = `Computer ${gameState.currentPlayer}'s turn...`;
    }

    // 2. Update Top Card (The Renderer Fix)
    TOP_CARD_ELEM.innerHTML = '';
    const topCardElement = renderCard(gameState.topCard);
    
    // Special handling for Wild Card border when active color is chosen
    if (gameState.topCard.color === 'BL' && gameState.topCard.nextColor) {
        topCardElement.style.borderColor = `var(--color-${gameState.topCard.nextColor})`;
    } else {
        topCardElement.style.borderColor = 'transparent';
    }
    TOP_CARD_ELEM.appendChild(topCardElement);

    // 3. Update Player Hand (Player 0)
    PLAYER_HAND_ELEM.innerHTML = '';
    gameState.hands[0].forEach((card, index) => {
        const isClickable = !gameState.gameOver; 
        const cardElem = renderCard(card, isClickable, index);
        PLAYER_HAND_ELEM.appendChild(cardElem);
    });
    
    // 4. Update Computer Hand Sizes (Players 1, 2, 3)
    for (let i = 0; i < NUM_PLAYERS - 1; i++) {
        const playerIndex = i + 1;
        const elem = COMPUTER_SIZE_ELEMS[i];
        if (elem) {
            let statusText = `${gameState.hands[playerIndex].length} cards`;
            elem.textContent = statusText;
            
            // Highlight current player element (using player-slot class from HTML)
            const container = elem.closest('.player-slot');
            if (container) {
                if (gameState.currentPlayer === playerIndex) {
                     container.classList.add('is-current-player');
                } else {
                     container.classList.remove('is-current-player');
                }
            }
        }
    }
    
    // 5. Button States
    const isPlayerTurn = gameState.currentPlayer === 0;
    DRAW_BUTTON.disabled = !isPlayerTurn; 
    UNO_BUTTON.disabled = !(isPlayerTurn && gameState.hands[0].length === 2);
    
    // 6. AI Trigger
    if (gameState.currentPlayer !== 0 && COLOR_PICKER_ELEM.style.display === 'none') {
        if (!gameState.aiActionTimeout) {
            gameState.aiActionTimeout = setTimeout(handleComputerTurn, 1500); 
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
 * Displays the color picker when a Wild card is played.
 */
function showColorPicker(playerIndex, wildValue) {
    if (playerIndex === 0) {
        // Human player
        COLOR_PICKER_ELEM.style.display = 'flex';
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        
        COLOR_PICKER_ELEM.innerHTML = '<h3>Choose a Wild Color:</h3>';
        const colors = ['R', 'G', 'B', 'Y'];
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = `color-btn ${color}`;
            btn.textContent = color;
            btn.onclick = () => setWildColor(color, wildValue);
            COLOR_PICKER_ELEM.appendChild(btn);
        });
        
    } else {
        // Computer picks immediately: simple strategy is to pick the color it has the most of
        const colors = ['R', 'G', 'B', 'Y'];
        const hand = gameState.hands[playerIndex];
        const colorCounts = hand.reduce((acc, card) => {
            if (card.color !== 'BL') {
                acc[card.color] = (acc[card.color] || 0) + 1;
            }
            return acc;
        }, {});
        
        let bestColor = 'R'; 
        let maxCount = -1;
        
        for (const color of colors) {
            if (colorCounts[color] && colorCounts[color] > maxCount) {
                maxCount = colorCounts[color];
                bestColor = color;
            }
        }
        
        setWildColor(bestColor, wildValue);
    }
}

/**
 * Finalizes the Wild card play after a color has been chosen.
 */
function setWildColor(chosenColor, wildValue) {
    const playerIndex = gameState.currentPlayer;
    
    if (playerIndex === 0) {
        COLOR_PICKER_ELEM.style.display = 'none';
    }
    
    // Update the top card state with the chosen color
    gameState.topCard = { color: gameState.topCard.color, value: wildValue, nextColor: chosenColor }; 
    
    showStatus(`${playerIndex === 0 ? 'You' : `Computer ${playerIndex}`} chose the color ${chosenColor}.`);

    // Apply card effects (Skip, Draw) and determine next player
    const result = applyCardEffect(gameState.topCard, playerIndex);
    gameState.currentPlayer = result.nextPlayer;
    
    checkWin(playerIndex); 
    handleUnoCheck(playerIndex);

    if (gameState.aiActionTimeout) {
        clearTimeout(gameState.aiActionTimeout);
        gameState.aiActionTimeout = null;
    }

    renderGame();
}


/**
 * Handles the logic for drawing a card for the current player.
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
            if (gameState.deck.length > 0) hand.push(gameState.deck.pop());
            cardsDrawn++;
        }
        gameState.pendingDraw = 0; // Penalty complete
        
        let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);
        gameState.currentPlayer = nextPlayer;
        
        showStatus(`${isHuman ? 'You' : `Computer ${playerIndex}`} drew ${cardsDrawn} cards due to penalty. Turn passed.`);
        return false; 
    }
    
    // --- 2. DRAW TILL MATCH LOGIC ---
    let playableFound = false;
    
    do {
        if (gameState.deck.length === 0) {
            if (!reshuffleDeck()) break;
        }
        
        const newCard = gameState.deck.pop();
        hand.push(newCard);
        cardsDrawn++;
        
        if (canPlay(newCard, gameState.topCard)) {
            playableFound = true;
            break; 
        }
        
    } while (!isHuman); // Human draws one, AI draws till match.

    if (isHuman) {
         if (!playableFound) {
              // Human drew one non-playable card, turn passes
              let nextPlayer = calculateNextPlayer(playerIndex, gameState.direction);
              gameState.currentPlayer = nextPlayer;
         }
         return playableFound;
    } else {
        return playableFound; 
    }
}


/**
 * Handles the player clicking a card in their hand or the draw button.
 */
function handlePlayerAction(cardIndex) {
    if (gameState.gameOver || (gameState.currentPlayer !== 0 && cardIndex === null)) return;
    
    if (cardIndex === null) {
        if (gameState.currentPlayer === 0) {
            handleDrawAction(0); 
        }
        renderGame();
        return; 
    }
    
    const cardPlayed = gameState.hands[0][cardIndex]; 
    const isPlayerTurn = gameState.currentPlayer === 0;
    const isJumpIn = !isPlayerTurn && isExactMatch(cardPlayed, gameState.topCard);

    if (!isPlayerTurn && !isJumpIn) return;
    
    if (!canPlay(cardPlayed, gameState.topCard) && !isJumpIn) {
        showStatus('Invalid move. Card must match color, value, or be a Wild card.');
        return;
    }

    gameState.hands[0].splice(cardIndex, 1);
    gameState.discardPile.push(cardPlayed);
    gameState.topCard = cardPlayed;
    
    if (isPlayerTurn) {
        gameState.unoAwaitingCall = false; 
    }
    
    if (gameState.hands[0].length === 1) {
        gameState.unoAwaitingCall = true;
    }

    if (cardPlayed.color === 'BL') {
        showColorPicker(0, cardPlayed.value); 
    } else {
        const result = applyCardEffect(cardPlayed, 0);
        
        gameState.currentPlayer = result.nextPlayer;
        
        if (isJumpIn) {
            gameState.currentPlayer = 0; 
        }
        
        checkWin(0);
        handleUnoCheck(0); 
    }
    
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
    
    // UNO Penalty Check
    if (gameState.unoAwaitingCall && playerIndex === calculateNextPlayer(0, gameState.direction)) {
        showStatus(`Computer ${playerIndex} caught you! UNO Penalty: Draw 2 cards.`);
        for (let i = 0; i < 2; i++) {
            if (gameState.deck.length > 0) gameState.hands[0].push(gameState.deck.pop());
        }
        gameState.unoAwaitingCall = false; 
    }

    // 1. Find a playable card
    let playableIndex = -1;
    for(let i = 0; i < computerHand.length; i++) {
        if (canPlay(computerHand[i], topCard)) {
            playableIndex = i;
            break; 
        }
    }
    
    if (gameState.pendingDraw > 0) {
        handleDrawAction(playerIndex); 
    } else if (playableIndex !== -1) {
        // 2. Play the card
        const cardPlayed = computerHand[playableIndex];
        computerHand.splice(playableIndex, 1);
        gameState.discardPile.push(cardPlayed);
        gameState.topCard = cardPlayed;

        if (computerHand.length === 1) { 
             showStatus(`Computer ${playerIndex} called UNO!`);
        }

        if (cardPlayed.color === 'BL') {
            showColorPicker(playerIndex, cardPlayed.value); 
        } else {
            const result = applyCardEffect(cardPlayed, playerIndex);
            gameState.currentPlayer = result.nextPlayer;
            checkWin(playerIndex);
            handleUnoCheck(playerIndex); 
        }
        
    } else {
        // 3. No playable card, computer must draw (Draw Till Match)
        const playableFound = handleDrawAction(playerIndex); 
        
        if (playableFound) {
            const newPlayableCard = computerHand[computerHand.length - 1]; 
            const newPlayableIndex = computerHand.length - 1; 

            computerHand.splice(newPlayableIndex, 1);
            gameState.discardPile.push(newPlayableCard);
            gameState.topCard = newPlayableCard;
                
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
        
        if (gameState.aiActionTimeout) {
            clearTimeout(gameState.aiActionTimeout);
            gameState.aiActionTimeout = null;
        }
    } else {
        STATUS.textContent = "Cannot call UNO yet.";
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
