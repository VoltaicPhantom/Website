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
const socket = io('https://api.sbrownit.co.uk', { 
    path: '/socket.io/', // <-- ADDED: Matches Nginx and server.js path
    transports: ['websocket'] // <-- ADDED: Ensures WebSocket is used over the proxy
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
