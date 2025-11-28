// --- New UI Utility Functions (ADD THESE TO game.js) ---

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
        STATUS.textContent = "Game Over! " + (gameState.hands[0].length === 0 ? "You Win!" : "Computer Wins!");
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

// --- Wild Card Color Selection (Integrating with applyCardEffect) ---

/**
 * MODIFIED: Overrides the prompt() in the logic file to wait for UI input.
 * This is a major change to integrate human choice into the async flow.
 */
function handleWildChoice(cardPlayed, currentTurn) {
    // Disable game interaction and show the color picker
    DRAW_BUTTON.disabled = true;
    COLOR_PICKER_ELEM.style.display = 'block';
    
    // Create a new promise that resolves when the user clicks a color
    return new Promise(resolve => {
        // Store the resolve function globally or within the color buttons' scope
        window.resolveWildPromise = (choice) => {
            COLOR_PICKER_ELEM.style.display = 'none';
            resolve(choice);
        };
    });
}

/**
 * Called by the color picker buttons in the HTML.
 */
function setWildColor(colorChoice) {
    if (window.resolveWildPromise) {
        window.resolveWildPromise(colorChoice);
    }
}


// --- MODIFIED: Player Action to include UI rendering and computer turn flow ---

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
            newTopColor = await handleWildChoice(cardPlayed, 0); 
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
        // Apply effect manually to integrate the chosen color
        const { nextPlayer, newTopCard } = applyCardEffect(cardPlayed, 0, gameState.deck, gameState.hands);
        
        // Overwrite the color determined by prompt() with the UI chosen color
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

// --- MODIFIED: Computer Turn to simply render the result ---

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
        STATUS.textContent = `Computer played: ${cardPlayed.color}-${cardPlayed.value}`;
        
        // Apply effect
        const { nextPlayer, newTopCard } = applyCardEffect(cardPlayed, 1, gameState.deck, gameState.hands);
        gameState.topCard = newTopCard;
        gameState.currentPlayer = nextPlayer;

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
