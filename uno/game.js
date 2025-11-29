// =====================================================================
// === NETWORK CLIENT LOGIC ===
// =====================================================================

// Global State (Only holds the state received from the server)
let gameState = {};
let myPlayerId = 0; // Placeholder: Assume Player 1 (index 0) is the user on this browser.
                    // In a real lobby, the server assigns this ID (0-3).

// --- DOM Element References ---
// (References remain the same for UI manipulation)
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_TITLE = document.getElementById('player-hand-title');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
// References for 4-player HTML (Assuming 4-player HTML structure from earlier)
const COMPUTER_SIZE_ELEMS = [
    document.getElementById('player-hand-size-1'), // Player 2 Hand Size
    document.getElementById('player-hand-size-2'), // Player 3 Hand Size
    document.getElementById('player-hand-size-3')  // Player 4 Hand Size
];
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const START_BUTTON = document.getElementById('start-button');
const UNO_BUTTON = document.getElementById('uno-button');


// =====================================================================
// === SOCKET.IO NETWORK CONNECTION ===
// =====================================================================

// Connect to the secure API endpoint
// Nginx handles the HTTPS and routing to port 3000
const socket = io('https://api.sbrownit.co.uk'); 

socket.on('connect', () => {
    STATUS.textContent = '✅ Connected to server. Ready to join a game.';
    START_BUTTON.disabled = false;
    // Request a Player ID from the server
    socket.emit('request_player_id'); 
});

socket.on('player_id_assigned', (assignedId) => {
    myPlayerId = assignedId;
    PLAYER_HAND_TITLE.textContent = `👤 Player ${myPlayerId + 1} Hand:`;
    showStatus(`You are Player ${myPlayerId + 1}.`);
});

socket.on('state_update', (newState) => {
    // This is the core update loop: the server sends the entire game state
    gameState = newState;
    renderGame();
});

socket.on('game_error', (message) => {
    showStatus(`❗ Server Error: ${message}`);
    // Optionally re-render to revert any invalid client-side clicks
    renderGame();
});

socket.on('disconnect', () => {
    showStatus('🛑 Disconnected from server. Check VPS status.');
    START_BUTTON.disabled = true;
});


// =====================================================================
// === GAME ACTIONS (Sending Commands to Server) ===
// =====================================================================

/**
 * Sends a command to the server to start/join a game.
 */
function startGame() {
    if (socket.connected) {
        // In a complex game, this would emit a 'create_lobby' or 'join_lobby' event.
        // For simplicity, we emit 'start_game' and let the server handle player setup.
        socket.emit('start_game'); 
        START_BUTTON.textContent = 'Waiting for Players...';
        START_BUTTON.disabled = true;
    } else {
        showStatus('Not connected to the server. Please check the network.');
    }
}

/**
 * Sends the player's action (playing a card or drawing) to the server.
 */
function handlePlayerAction(cardIndex) {
    if (!socket.connected || gameState.currentPlayer !== myPlayerId) return;

    if (cardIndex === null) {
        // Player clicked Draw Card
        socket.emit('draw_card', { playerId: myPlayerId });
    } else {
        // Player clicked a card to play
        // We send the INDEX, the server will check the hand and validate the move.
        socket.emit('play_card', { playerId: myPlayerId, cardIndex: cardIndex });
    }
}

/**
 * Sends the selected wild color to the server.
 */
function setWildColor(chosenColor) {
    COLOR_PICKER_ELEM.style.display = 'none';
    if (!socket.connected) return;

    socket.emit('set_wild_color', { 
        playerId: myPlayerId, 
        color: chosenColor 
    });
}

/**
 * Sends the UNO declaration to the server.
 */
function declareUno() {
    if (!socket.connected || gameState.hands[myPlayerId].length !== 1) return;
    
    // Server handles the validation (did they just play, is it their turn, etc.)
    socket.emit('declare_uno', { playerId: myPlayerId });
}


// =====================================================================
// === UI RENDERING (Based on Server State) ===
// =====================================================================

/**
 * Renders a single card element. (Functions are kept client-side for visuals)
 */
function renderCard(card, isClickable = false, index = -1) {
    const cardElem = document.createElement('div');
    const displayColor = card.nextColor || card.color;
    
    cardElem.className = `card ${displayColor}`;
    cardElem.dataset.value = card.value;
    
    // Helper function (must be moved here from original game.js)
    const getCardDisplayText = (value) => {
        switch (String(value)) {
            case 'D2': return '+2'; case 'S': return '🚫'; 
            case 'R': return '⟲'; case 'W': return 'WILD'; 
            case 'W4': return '+4'; default: return String(value);
        }
    };
    
    cardElem.textContent = getCardDisplayText(card.value);
    
    if (card.color === 'BL' && card.nextColor) {
        cardElem.classList.add('has-next-color');
    }

    if (isClickable) {
        cardElem.onclick = () => handlePlayerAction(index);
    } else {
        cardElem.classList.add('disabled');
        cardElem.onclick = null;
    }

    return cardElem;
}

/**
 * Updates the entire UI based on the current game state received from the server.
 */
function renderGame() {
    if (!gameState || !gameState.hands || gameState.gameOver) {
        if (gameState.gameOver) {
            STATUS.textContent = gameState.winner !== undefined && gameState.winner !== -1 
                ? `🎉 Player ${gameState.winner + 1} WINS! 🎉` 
                : 'Game Ready / Server Disconnected.';
        }
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        START_BUTTON.style.display = 'block';
        return;
    }
    
    START_BUTTON.style.display = 'none';
    const isMyTurn = gameState.currentPlayer === myPlayerId;
    const myHand = gameState.hands[myPlayerId];
    
    // 1. Update Status Message
    STATUS.textContent = isMyTurn ? `Your turn (Player ${myPlayerId + 1}).` : `Waiting for Player ${gameState.currentPlayer + 1}...`;
    if (gameState.pendingDraw > 0) {
        STATUS.textContent += ` (Must Draw ${gameState.pendingDraw}.)`;
    }
    
    // 2. Update Top Card (If topCard exists)
    TOP_CARD_ELEM.innerHTML = '';
    if (gameState.topCard) {
        const topCardElement = renderCard(gameState.topCard);
        if (gameState.topCard.color === 'BL' && gameState.topCard.nextColor) {
            topCardElement.style.borderColor = `var(--color-${gameState.topCard.nextColor})`;
        } else {
            topCardElement.style.borderColor = 'transparent';
        }
        TOP_CARD_ELEM.appendChild(topCardElement);
    }
    
    // 3. Update Player Hand (Only display YOUR hand)
    PLAYER_HAND_ELEM.innerHTML = '';
    myHand.forEach((card, index) => {
        // The server will have told us if the card is playable, but for UI feedback, 
        // we can assume cards are clickable only on our turn.
        const isClickable = isMyTurn; 
        const cardElem = renderCard(card, isClickable, index);
        PLAYER_HAND_ELEM.appendChild(cardElem);
    });

    // 4. Update Opponent Hand Sizes (Rely on 4-player HTML structure)
    for (let i = 0; i < 3; i++) {
        const opponentId = (myPlayerId + i + 1) % gameState.hands.length; // Rotate through opponents
        const elem = COMPUTER_SIZE_ELEMS[i];
        
        if (elem && gameState.hands[opponentId]) {
             const handSize = gameState.hands[opponentId].length;
             elem.textContent = `${handSize} cards`;
            
             const container = elem.closest('.player-slot');
             if (container) {
                 if (gameState.currentPlayer === opponentId) {
                      container.classList.add('is-current-player');
                 } else {
                      container.classList.remove('is-current-player');
                 }
             }
        }
    }
    
    // 5. Button and Color Picker States
    DRAW_BUTTON.disabled = !isMyTurn; 
    UNO_BUTTON.disabled = !(isMyTurn && myHand.length === 2);
    
    // Show color picker only if it's our turn and the server says we need to pick a color (e.g., topCard.value === 'W')
    if (isMyTurn && gameState.topCard && gameState.topCard.value === 'W' && !gameState.topCard.nextColor) {
        COLOR_PICKER_ELEM.style.display = 'flex';
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
    } else {
        COLOR_PICKER_ELEM.style.display = 'none';
    }
}

/**
 * Displays a status message to the user.
 */
function showStatus(message) {
    STATUS.textContent = message;
}

// Initial setup to display the start screen
document.addEventListener('DOMContentLoaded', () => {
    // Dummy initial state until the server connects
    gameState = { hands: [[], [], [], []], topCard: {color: 'BL', value: 'W'}, gameOver: false, currentPlayer: -1 };
    START_BUTTON.disabled = true; // Wait for socket connection
    showStatus('Connecting to API server...');
    renderGame(); 
});
