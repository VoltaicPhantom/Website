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
        for (let i = 0; i < 2; i++) {
            deck.push({ color: color, value: 'S' });
            deck.push({ color: color, value: 'R' });
            deck.push({ color: color, value: 'D2' });
        }
    }
    
    // 3. Wild Cards (4 of each)
    // 'W': Wild, 'W4': Wild Draw Four
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'BL', value: 'W' });
        deck.push({ color: 'BL', value: 'W4' });
    }

    return shuffle(deck);
}

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array} array - The array to shuffle.
 * @returns {Array} The shuffled array.
 */
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

/**
 * Initializes the game state.
 */
function initGame() {
    // Game variables
    gameState.deck = createDeck();
    gameState.discardPile = [];
    gameState.hands = [[], []]; // Player 0 (Human), Player 1 (Computer)
    gameState.topCard = null;
    gameState.currentPlayer = 0; // 0 for Human, 1 for Computer
    gameState.direction = 1; // 1 for clockwise (0 -> 1 -> 0), -1 for counter-clockwise (1 -> 0 -> 1)
    gameState.pendingDraw = 0; // Number of cards the next player must draw
    gameState.unoAwaitingCall = false; // Is the human player waiting to call UNO?
    gameState.gameOver = false;
    gameState.winner = -1;
}

/**
 * Deals initial hands and sets up the starting card.
 */
function dealInitialCards() {
    // Deal 7 cards to each player
    for (let i = 0; i < 7; i++) {
        gameState.hands[0].push(gameState.deck.pop());
        gameState.hands[1].push(gameState.deck.pop());
    }

    // Flip the first card to start the discard pile
    let startCard;
    do {
        // If the deck is empty, reshuffle discard pile (shouldn't happen on startup)
        if (gameState.deck.length === 0) {
            // Note: This needs a robust reshuffle function, but for simplicity, we assume
            // enough cards exist initially or the reshuffle is handled elsewhere.
            // Using the basic array splice/shuffle from the full logic here:
            if (gameState.discardPile.length > 1) {
                const topCard = gameState.discardPile.pop(); 
                gameState.deck = shuffle(gameState.discardPile);
                gameState.discardPile = [topCard];
            } else {
                 // Should never happen, but stop if deck is truly empty
                 break; 
            }
        }
        startCard = gameState.deck.pop();
    } while (startCard.color === 'BL' || startCard.value === 'D2' || startCard.value === 'S' || startCard.value === 'R'); 
    
    gameState.discardPile.push(startCard);
    gameState.topCard = startCard;
}

/**
 * Starts a new game.
 * Must be globally accessible.
 */
function startGame() {
    initGame();
    dealInitialCards();
    showStatus(`Game started! It's your turn.`);
    gameState.gameOver = false;
    renderGame();
    
    START_BUTTON.textContent = 'Restart Game';
}


// --- 2. Card Logic ---

/**
 * Converts a card object to its display text/symbol.
 * @param {Object} card - The card object.
 * @returns {string} The display text for the card.
 */
function getCardText(card) {
    if (card.color === 'BL') {
        if (card.value === 'W') return 'WILD';
        if (card.value === 'W4') return '+4';
    }
    // --- START: SYMBOL UPDATE ---
    switch (card.value) {
        case 'S': return 'Ø'; // Skip symbol
        case 'R': return '⟲'; // Reverse symbol
        case 'D2': return '+2';
        default: return card.value.toString();
    }
    // --- END: SYMBOL UPDATE ---
}

/**
 * Checks if a card can be legally played on the top card.
 * @param {Object} card - The card to be played.
 * @param {Object} topCard - The top card of the discard pile.
 * @returns {boolean} True if the card is playable.
 */
function canPlay(card, topCard) {
    // Wild cards can always be played
    if (card.color === 'BL') return true;
    
    // Match by color or value
    if (card.color === topCard.color) return true;
    if (card.value === topCard.value) return true;
    
    // Check if the top card is a Wild that set a color (it will have a .nextColor property)
    if (topCard.color === 'BL' && topCard.nextColor === card.color) return true;

    return false;
}

/**
 * Checks for an exact match (used for Jump In rule).
 * @param {Object} card1 - The first card.
 * @param {Object} card2 - The second card.
 * @returns {boolean} True if the cards have the same color and value.
 */
function isExactMatch(card1, card2) {
    return card1.color === card2.color && card1.value === card2.value;
}

/**
 * Applies the effect of an action card.
 */
function applyCardEffect(card, playerIndex, deck, hands) {
    const numPlayers = hands.length;
    let nextPlayer = (playerIndex + gameState.direction) % numPlayers;
    if (nextPlayer < 0) nextPlayer += numPlayers;
    
    let message = '';

    const playerLabel = playerIndex === 0 ? 'You' : 'Computer';

    switch (card.value) {
        case 'S':
            message = `${playerLabel} played a SKIP (Ø).`;
            nextPlayer = (nextPlayer + gameState.direction) % numPlayers;
            if (nextPlayer < 0) nextPlayer += numPlayers;
            break;
        case 'R':
            gameState.direction *= -1;
            message = `${playerLabel} played a REVERSE (⟲). Direction changed.`;
            // In 2-player, Reverse acts like a Skip
            if (numPlayers === 2) {
                nextPlayer = (nextPlayer + gameState.direction) % numPlayers;
                if (nextPlayer < 0) nextPlayer += numPlayers;
            }
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
    
    // Return the calculated next player. The topCard is updated in the calling function.
    return { nextPlayer };
}


// --- 3. UI/Rendering ---

/**
 * Updates the entire game display based on the current gameState.
 */
function renderGame() {
    // 1. Top Card
    if (gameState.topCard) {
        // Set the primary class based on the card's printed color
        TOP_CARD_ELEM.className = `card ${gameState.topCard.color}`;
        TOP_CARD_ELEM.textContent = getCardText(gameState.topCard);
        
        // --- START: WILD CARD VISUAL FIX ---
        if (gameState.topCard.color === 'BL' && gameState.topCard.nextColor) {
             // Add a class for CSS styling (used for border width)
             TOP_CARD_ELEM.classList.add('has-next-color');
             // Update the border color dynamically using a CSS variable
             TOP_CARD_ELEM.style.borderColor = `var(--color-${gameState.topCard.nextColor})`; 
        } else {
             TOP_CARD_ELEM.classList.remove('has-next-color');
             // Reset border for non-Wild or unplayed Wild cards
             TOP_CARD_ELEM.style.borderColor = 'transparent'; 
        }
        // --- END: WILD CARD VISUAL FIX ---
    } else {
        TOP_CARD_ELEM.className = 'card';
        TOP_CARD_ELEM.textContent = 'Deck';
    }

    // 2. Player Hand
    PLAYER_HAND_ELEM.innerHTML = '';
    const isPlayerTurn = gameState.currentPlayer === 0;
    const playerHand = gameState.hands[0];
    
    playerHand.forEach((card, index) => {
        const cardElement = document.createElement('div');
        const playable = isPlayerTurn && canPlay(card, gameState.topCard);
        // Note: The user's provided code uses a more complex Jump In logic, but we stick
        // to the simpler/safer Jump In check here for a functional game:
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
    
    // 3. Computer Hand Size
    COMPUTER_SIZE_ELEM.textContent = `${gameState.hands[1].length} cards`;
    
    // 4. Button States
    DRAW_BUTTON.disabled = !isPlayerTurn || gameState.pendingDraw > 0; // Disable draw if penalty pending
    UNO_BUTTON.disabled = !(isPlayerTurn && playerHand.length === 2);
    
    // 5. Game End State
    if (gameState.gameOver) {
        showStatus(gameState.winner === 0 ? '🎉 YOU WIN! 🎉' : '😔 COMPUTER WINS. 😔');
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        START_BUTTON.style.display = 'block';
    } else {
        START_BUTTON.style.display = 'none';
        
        // Start computer move if it's their turn
        if (gameState.currentPlayer === 1 && COLOR_PICKER_ELEM.style.display === 'none') {
            setTimeout(computerMove, 1500); // 1.5 second delay for computer turn
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
        // Human player must pick
        COLOR_PICKER_ELEM.style.display = 'flex'; // Use flex to center buttons
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
        
        let bestColor = colors[Math.floor(Math.random() * 4)]; // Default random
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
 * Must be globally accessible to match index.html's onclick.
 */
function setWildColor(color) {
    // This function is only called for the human player (playerIndex 0)
    COLOR_PICKER_ELEM.style.display = 'none';
    
    // Update the top card with the chosen color using the .nextColor property
    // We assume the topCard is still the Wild card played in handlePlayerAction
    gameState.topCard.nextColor = color; 
    
    showStatus(`New color is set to ${color}.`);

    // Continue the turn (which was paused for color picking)
    const result = applyCardEffect(gameState.topCard, 0, gameState.deck, gameState.hands);
    gameState.currentPlayer = result.nextPlayer;
    
    checkWin(0); 
    handleUnoCheck(0);

    renderGame();
}


// --- 4. Game Flow and Actions ---

/**
 * Helper to consolidate reshuffle logic.
 * @returns {boolean} True if a new deck was successfully created, false otherwise.
 */
function reshuffleDeck() {
    if (gameState.discardPile.length <= 1) {
        // Cannot reshuffle if only the top card is left
        return false;
    }
    // Remove top card, shuffle the rest, replace top card
    const topCard = gameState.discardPile.pop(); 
    gameState.deck = shuffle(gameState.discardPile);
    gameState.discardPile = [topCard];
    showStatus('Deck ran out! Discard pile shuffled into new deck.');
    return true;
}

/**
 * Handles the logic for drawing a card for the current player.
 * Implements "draw till match" for standard draws and handles penalty draws.
 * @param {number} playerIndex - The index of the player drawing (0 for human, 1 for computer).
 * @returns {boolean} True if a playable card was found/drawn, False if turn must pass.
 */
function handleDrawAction(playerIndex) {
    const isHuman = playerIndex === 0;
    const hand = gameState.hands[playerIndex];
    let cardsDrawn = 0;
    
    // --- 1. PENALTY DRAW LOGIC (Draw 2 or Draw 4) ---
    if (gameState.pendingDraw > 0) {
        const drawAmount = gameState.pendingDraw;
        for (let i = 0; i < drawAmount; i++) {
            if (gameState.deck.length === 0) reshuffleDeck();
            hand.push(gameState.deck.pop());
            cardsDrawn++;
        }
        gameState.pendingDraw = 0; // Penalty complete
        
        // Always pass turn after a penalty draw
        let nextPlayer = (playerIndex + gameState.direction) % 2;
        gameState.currentPlayer = nextPlayer < 0 ? nextPlayer + 2 : nextPlayer;
        
        showStatus(`${isHuman ? 'You' : 'Computer'} drew ${cardsDrawn} cards due to penalty. Turn passed.`);
        return false; // Turn passed
    }
    
    // --- 2. DRAW TILL MATCH LOGIC (Standard Draw) ---
    
    let playableFound = false;
    
    do {
        // Reshuffle if deck is empty
        if (gameState.deck.length === 0) {
            if (!reshuffleDeck()) break; // Deck is truly empty, stop drawing
        }
        
        const newCard = gameState.deck.pop();
        hand.push(newCard);
        cardsDrawn++;
        
        if (canPlay(newCard, gameState.topCard)) {
            playableFound = true;
            break; // Stop drawing
        }
        
    } while (true); // Loop until break

    // Status update for drawing
    if (cardsDrawn > 0) {
         showStatus(`${isHuman ? 'You' : 'Computer'} drew ${cardsDrawn} card${cardsDrawn === 1 ? '' : 's'}.`);
    } else if (!playableFound) {
        showStatus('No cards left to draw. Turn passes.');
    }
    
    if (playableFound) {
        // Player stays the current player
        return true; // Playable card was found/drawn
    } else {
        // No playable card found, turn passes
        let nextPlayer = (playerIndex + gameState.direction) % 2;
        gameState.currentPlayer = nextPlayer < 0 ? nextPlayer + 2 : nextPlayer;
        return false; // Turn passed
    }
}
// Keep the original global name for the HTML onClick
const drawCardForPlayer = handleDrawAction;


/**
 * Handles the player clicking a card in their hand or the draw button.
 * Must be globally accessible.
 * @param {number | null} cardIndex - The index of the card in the player's hand, or null to draw.
 */
function handlePlayerAction(cardIndex) {
    if (gameState.gameOver) return;
    const isPlayerTurn = gameState.currentPlayer === 0;

    // --- Handle Draw Card action if cardIndex is null ---
    if (cardIndex === null) {
        if (isPlayerTurn) {
            drawCardForPlayer(0); // Calls the new draw logic
        }
        renderGame();
        return; // Exit the function after drawing
    }
    // --- END DRAW FIX ---
    
    // The rest of the code is for playing a card (cardIndex is a valid hand index)
    const cardPlayed = gameState.hands[0][cardIndex]; 
    
    // Check for a Jump In (only possible if not the player's turn)
    const isJumpIn = gameState.currentPlayer === 1 && isExactMatch(cardPlayed, gameState.topCard);

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
    
    // Clear the 'nextColor' property if the card played on top of the Wild is NOT a Wild itself
    if (gameState.topCard.nextColor) {
        delete gameState.topCard.nextColor;
    }
    
    // 4. Apply card effects and determine the next player
    
    // 5. Handle Wild Card color choice for the human player
    if (cardPlayed.color === 'BL') {
        showColorPicker(0, cardPlayed.value);
        // The game flow pauses here until setWildColor is called
    } else {
        // Non-Wild Card Play: Apply effect and proceed
        const result = applyCardEffect(cardPlayed, 0, gameState.deck, gameState.hands);
        
        // 6. Update game state and check for win
        gameState.currentPlayer = result.nextPlayer;
        checkWin(0);

        // 7. Check for UNO call and advance turn
        handleUnoCheck(0); 
    }

    renderGame();
}

/**
 * Executes the computer's move logic.
 */
function computerMove() {
    if (gameState.gameOver || gameState.currentPlayer !== 1 || COLOR_PICKER_ELEM.style.display !== 'none') return;
    
    const topCard = gameState.topCard;
    const computerHand = gameState.hands[1];
    
    let playableIndex = -1;
    let playableCard = null;

    // 1. Find a playable card
    for(let i = 0; i < computerHand.length; i++) {
        if (canPlay(computerHand[i], topCard)) {
            playableIndex = i;
            playableCard = computerHand[i];
            break; 
        }
    }
    
    if (gameState.pendingDraw > 0) {
        // Computer draws penalty cards (handleDrawAction will pass the turn)
        handleDrawAction(1); 

    } else if (playableIndex !== -1) {
        // 2. Play the card
        
        computerHand.splice(playableIndex, 1);
        gameState.discardPile.push(playableCard);
        gameState.topCard = playableCard;
        if (gameState.topCard.nextColor) { delete gameState.topCard.nextColor; }

        // Handle Wild Card color choice for the computer (done inside showColorPicker)
        if (playableCard.color === 'BL') {
            showColorPicker(1, playableCard.value); 
            // setWildColor is called immediately by showColorPicker(1, ...)
        } else {
            // Non-Wild: Apply effect and pass turn
            const result = applyCardEffect(playableCard, 1, gameState.deck, gameState.hands);
            gameState.currentPlayer = result.nextPlayer;
            checkWin(1);
            handleUnoCheck(1); 
        }
        
    } else {
        // 3. No playable card, computer must draw (Draw Till Match)
        const playableFound = handleDrawAction(1); // Will draw until match or turn passes
        
        // If a playable card was found and turn hasn't passed (currentPlayer is still 1), computer must play it.
        if (playableFound && gameState.currentPlayer === 1) {
            // Re-check for a playable card (the one just drawn)
            let newPlayableIndex = -1;
            let newPlayableCard = null;
            
            // Find the *first* playable card in the hand (it will be the one just drawn, as older cards were unplayable)
            for(let i = 0; i < computerHand.length; i++) {
                if (canPlay(computerHand[i], topCard)) {
                    newPlayableIndex = i;
                    newPlayableCard = computerHand[i];
                    break;
                }
            }
            
            // Play the card immediately
            if (newPlayableIndex !== -1) {
                computerHand.splice(newPlayableIndex, 1);
                gameState.discardPile.push(newPlayableCard);
                gameState.topCard = newPlayableCard;
                if (gameState.topCard.nextColor) { delete gameState.topCard.nextColor; }

                if (newPlayableCard.color === 'BL') {
                    showColorPicker(1, newPlayableCard.value); 
                    // setWildColor is called immediately by showColorPicker(1, ...)
                } else {
                    const result = applyCardEffect(newPlayableCard, 1, gameState.deck, gameState.hands);
                    gameState.currentPlayer = result.nextPlayer;
                    checkWin(1);
                    handleUnoCheck(1); 
                }
            }
        }
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
            // Computer always calls UNO instantly after playing/drawing
            setTimeout(() => {
                STATUS.textContent = "Computer called UNO!";
            }, 500);
        }
    } else {
        gameState.unoAwaitingCall = false;
    }
}

/**
 * Handles the player declaring UNO.
 * Must be globally accessible.
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

// Set up the initial state to show the UI is ready
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    gameState.hands = [[], []]; 
    gameState.deck = []; 
    gameState.gameOver = true; 
    gameState.winner = -1; 
    
    STATUS.textContent = 'Press "Start New Game" to begin!';

    renderGame(); 
});
