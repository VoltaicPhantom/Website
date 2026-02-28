// =====================================================================
// === NETWORK CLIENT LOGIC (Revised with Lobby) ===
// =====================================================================

// Global State (Only holds the state received from the server)
let gameState = {};
let myPlayerId = -1; // -1 means not assigned
let myGameId = null;
let myUsername = 'Guest';

// --- DOM Element References ---
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_TITLE = document.getElementById('player-hand-title');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const UNO_BUTTON = document.getElementById('uno-button');

// --- NEW Lobby DOM Elements ---
const LOBBY_SETTINGS = document.getElementById('lobby-settings');
const USERNAME_ELEM = document.getElementById('username-input');
const GAME_TYPE_ELEM = document.getElementById('game-type');
const AI_COUNT_ELEM = document.getElementById('ai-count');
const GAME_ID_ELEM = document.getElementById('game-id');
const LOBBY_ACTION_BUTTON = document.getElementById('lobby-action-button'); // The new main button

// References for Opponent Hand Sizes (Assuming 4-player HTML structure)
const OPPONENT_SIZE_ELEMS = [
    document.getElementById('player-hand-size-1'), // Player 2 Hand Size Slot
    document.getElementById('player-hand-size-2'), // Player 3 Hand Size Slot
    document.getElementById('player-hand-size-3')  // Player 4 Hand Size Slot
];


// =====================================================================
// === SOCKET.IO NETWORK CONNECTION AND LOBBY HANDLERS ===
// =====================================================================

// Connect to the secure API endpoint with the explicit path
// FIX #1: Re-adding the path and transports required for Nginx proxy
const socket = io('https://api.sbrownit.co.uk', { 
    path: '/socket.io/', 
    transports: ['websocket'] 
}); 

socket.on('connect', () => {
    STATUS.textContent = '✅ Connected to server.';
    LOBBY_ACTION_BUTTON.disabled = false;
});

/**
 * Handles the click event for Join/Create/Leave.
 */
function handleLobbyAction() {
    if (!socket.connected) {
        showStatus('Not connected to the server. Please wait.');
        return;
    }
    
    // Read user inputs
    myUsername = USERNAME_ELEM.value.trim() || 'Guest';
    const requestedGameId = GAME_ID_ELEM.value.trim();
    const gameType = GAME_TYPE_ELEM.value;
    const aiCount = parseInt(AI_COUNT_ELEM.value);

    // Validate inputs
    if (aiCount < 0 || aiCount > 3) {
        showStatus('AI count must be between 0 and 3.');
        return;
    }
    if (myUsername.length < 2) {
        showStatus('Please enter a username.');
        return;
    }

    // Send the request to the server
    socket.emit('join_or_create_game', {
        username: myUsername,
        requestedGameId: requestedGameId,
        gameType: gameType,
        aiCount: aiCount
    });

    LOBBY_ACTION_BUTTON.textContent = 'Awaiting Server Response...';
    LOBBY_ACTION_BUTTON.disabled = true;
    showStatus(`Requesting game as ${myUsername}...`);
}

socket.on('game_joined', (data) => {
    myGameId = data.gameId;
    myPlayerId = data.playerId;
    const currentPlayers = data.currentPlayers || []; // Array of {id, username}

    PLAYER_HAND_TITLE.textContent = `👤 ${myUsername} (P${myPlayerId + 1}) Hand:`;
    LOBBY_SETTINGS.style.display = 'none'; // Hide lobby controls
    
    showStatus(`Joined Game ID: ${myGameId}. You are Player ${myPlayerId + 1}. Waiting for game to start...`);
    
    LOBBY_ACTION_BUTTON.textContent = `Leave Game (${myGameId})`;
    LOBBY_ACTION_BUTTON.disabled = false;
    LOBBY_ACTION_BUTTON.onclick = () => leaveLobby(); // Change button action to Leave
});

socket.on('lobby_update', (data) => {
    // This is fired when a new player joins or leaves the lobby
    const neededPlayers = data.neededPlayers || 0;
    
    // Update opponent display names
    updateOpponentNames(data.playerList, data.aiCount);

    if (neededPlayers > 0) {
         showStatus(`Waiting for ${neededPlayers} more human player(s) to start Game ${myGameId}.`);
    } else {
         showStatus(`All player slots filled. Ready to start!`);
         // Optionally, add a start button if it's the game creator's turn to start.
    }
});

socket.on('game_start', (initialState) => {
    gameState = initialState;
    showStatus('Game started! Good luck.');
    LOBBY_ACTION_BUTTON.textContent = `Game ID: ${myGameId}`; 
    LOBBY_ACTION_BUTTON.disabled = true; // Cannot leave once started
    renderGame();
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
    showStatus('🛑 Disconnected from server. Please reconnect.');
    LOBBY_ACTION_BUTTON.disabled = true;
});


// =====================================================================
// === LOBBY UI MANAGEMENT ===
// =====================================================================

function leaveLobby() {
    socket.emit('leave_game', { gameId: myGameId });
    myGameId = null;
    myPlayerId = -1;
    LOBBY_SETTINGS.style.display = 'block';
    LOBBY_ACTION_BUTTON.textContent = 'Join/Create Game';
    LOBBY_ACTION_BUTTON.onclick = () => handleLobbyAction();
    showStatus('You left the game.');
}

/**
 * Updates opponent slots with usernames, AI tags, or empty placeholders.
 */
function updateOpponentNames(playerList, aiCount) {
    // playerList is an array of {id: 0, username: 'Name', type: 'human'} objects for all players (0-N)
    const totalSlots = playerList.length;
    let slotIndex = 0;

    for (let i = 0; i < 3; i++) {
        const opponentIndex = (myPlayerId + i + 1) % totalSlots;
        const elem = OPPONENT_SIZE_ELEMS[i].closest('.player-slot');
        const player = playerList.find(p => p.id === opponentIndex);
        
        if (player) {
            const isAI = player.type === 'ai';
            elem.querySelector('p').textContent = isAI ? `🤖 ${player.username} (AI)` : `${player.username}`;
            // Hand size will be updated by renderGame()
        } else {
             // If the slot isn't filled yet (less than max players), show placeholder
             elem.querySelector('p').textContent = `Waiting for Player ${opponentIndex + 1}`;
             OPPONENT_SIZE_ELEMS[i].textContent = '---';
        }
    }
}


// =====================================================================
// === GAME ACTIONS (Sending Commands to Server) ===
// =====================================================================

function handlePlayerAction(cardIndex) {
    if (!socket.connected || gameState.currentPlayer !== myPlayerId || gameState.gameOver) return;
    
    if (cardIndex === null) {
        // Draw card action
        socket.emit('draw_card', { gameId: myGameId, playerId: myPlayerId });
    } else {
        // Play card action
        socket.emit('play_card', { gameId: myGameId, playerId: myPlayerId, cardIndex: cardIndex });
    }
}

// Handler for choosing a color after playing a Wild card
function setWildColor(color) {
    if (!socket.connected || gameState.currentPlayer !== myPlayerId || gameState.gameOver) return;
    socket.emit('set_wild_color', { gameId: myGameId, playerId: myPlayerId, color: color });
}

// Handler for declaring UNO
function declareUno() {
    if (!socket.connected || gameState.gameOver) return;
    socket.emit('declare_uno', { gameId: myGameId, playerId: myPlayerId });
}


// =====================================================================
// === UI RENDERING ===
// =====================================================================
function renderCard(card, isClickable = false, index = -1) {
    const cardElement = document.createElement('div');
    cardElement.className = `uno-card ${card.color} ${card.value}`;
    // Simple display logic for action cards
    if (card.value === 'D2') cardElement.textContent = 'Draw 2';
    else if (card.value === 'S') cardElement.textContent = 'Skip';
    else if (card.value === 'R') cardElement.textContent = 'Reverse';
    else if (card.value === 'W') cardElement.textContent = 'Wild';
    else if (card.value === 'W4') cardElement.textContent = 'Draw 4';
    else cardElement.textContent = card.value; // Numeric cards
    
    // Add visual for the chosen color of a Black card
    if (card.color === 'BL' && card.nextColor) {
        cardElement.classList.add(`chosen-${card.nextColor}`);
    }

    if (isClickable) {
        cardElement.classList.add('playable');
        cardElement.onclick = () => handlePlayerAction(index);
    }
    return cardElement;
}

function renderGame() {
    // FIX #2: Prevent TypeError by checking if the player is actively in a game.
    if (myPlayerId === -1 || !gameState || !gameState.hands || gameState.gameOver) {
        // Clear game board elements if in lobby/game over state
        TOP_CARD_ELEM.innerHTML = '';
        PLAYER_HAND_ELEM.innerHTML = '';
        // Clear opponent slots display when not in a game/lobby state
        for (const elem of OPPONENT_SIZE_ELEMS) {
             if(elem) elem.textContent = '---'; 
        }
        return;
    }
    
    // 1. Update Top Card
    TOP_CARD_ELEM.innerHTML = '';
    if (gameState.topCard) {
        TOP_CARD_ELEM.appendChild(renderCard(gameState.topCard));
    }
    
    // 2. Determine if it's the player's turn
    const isMyTurn = gameState.currentPlayer === myPlayerId;
    const myHand = gameState.hands[myPlayerId];
    
    // 3. Render Player Hand
    PLAYER_HAND_ELEM.innerHTML = '';
    if (myHand && Array.isArray(myHand)) {
        myHand.forEach((card, index) => {
            const isPlayable = isMyTurn && isValidPlay(card, gameState.topCard);
            PLAYER_HAND_ELEM.appendChild(renderCard(card, isPlayable, index));
        });
    }

    // 4. Update Opponent Hand Sizes and highlights
    const totalPlayers = gameState.hands.length;
    for (let i = 0; i < 3; i++) {
        // Calculate the index of the opponent relative to 'myPlayerId'
        const opponentIndex = (myPlayerId + i + 1) % totalPlayers; 
        const elem = OPPONENT_SIZE_ELEMS[i];
        
        if (elem && gameState.hands[opponentIndex]) {
             // gameState.hands[opponentIndex] is an object {length: X} from the server
             const handSize = gameState.hands[opponentIndex].length || 0; 
             elem.textContent = `${handSize} cards`; 
            
             const container = elem.closest('.player-slot');
             if (container) {
                 if (gameState.currentPlayer === opponentIndex) {
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
    
    // Logic for color picker display when a Wild card is played and color hasn't been chosen
    // The server will stop the game flow by not advancing currentPlayer if a BL card is played
    const requiresColorChoice = isMyTurn && 
                                gameState.topCard && 
                                (gameState.topCard.value === 'W' || gameState.topCard.value === 'W4') &&
                                gameState.topCard.color === 'BL'; // Check if it's still a black wild card

    if (requiresColorChoice) {
        COLOR_PICKER_ELEM.style.display = 'flex';
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
        
        // Dynamically create color buttons
        COLOR_PICKER_ELEM.innerHTML = '<h3>Choose a Wild Color:</h3>';
        const colors = ['R', 'G', 'B', 'Y'];
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = `color-btn ${color}`;
            btn.textContent = color;
            btn.onclick = () => setWildColor(color); // setWildColor is the function that emits
            COLOR_PICKER_ELEM.appendChild(btn);
        });
    } else {
        COLOR_PICKER_ELEM.style.display = 'none';
    }
}

// NOTE: This client-side function is only used for local rendering logic 
// before a card is played; the server performs the authoritative check.
function isValidPlay(cardToPlay, topCard) {
    if (!topCard) return false;
    if (cardToPlay.color === 'BL') return true;
    
    // The server is authoritative, but client needs this for enabling play buttons
    return cardToPlay.color === topCard.color || cardToPlay.value === topCard.value;
}


function showStatus(message) {
    STATUS.textContent = message;
}
// ---------------------------------------------------------------------

// Initial setup to display the start screen
document.addEventListener('DOMContentLoaded', () => {
    // Dummy initial state until the server connects
    gameState = { hands: [[], [], [], []], topCard: {color: 'BL', value: 'W'}, gameOver: true, currentPlayer: -1 };
    LOBBY_ACTION_BUTTON.disabled = true; // Wait for socket connection
    showStatus('Connecting to API server...');
    renderGame(); 
    
    // Attach the main lobby button handler
    LOBBY_ACTION_BUTTON.onclick = () => handleLobbyAction();
});
