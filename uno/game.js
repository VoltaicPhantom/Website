// =====================================================================
// === NETWORK CLIENT LOGIC (Revised) ===
// =====================================================================

// Global State (Only holds the state received from the server)
let gameState = {};
let myPlayerId = -1; // -1 means not assigned
let myGameId = null;

// --- DOM Element References ---
const STATUS = document.getElementById('status-message');
const TOP_CARD_ELEM = document.getElementById('top-card');
const PLAYER_HAND_TITLE = document.getElementById('player-hand-title');
const PLAYER_HAND_ELEM = document.getElementById('player-hand-container');
const COLOR_PICKER_ELEM = document.getElementById('color-picker');
const DRAW_BUTTON = document.getElementById('draw-button');
const START_BUTTON = document.getElementById('start-button');
const UNO_BUTTON = document.getElementById('uno-button');

// --- NEW Lobby DOM Elements ---
const LOBBY_SETTINGS = document.getElementById('lobby-settings');
const GAME_TYPE_ELEM = document.getElementById('game-type');
const AI_COUNT_ELEM = document.getElementById('ai-count');
const GAME_ID_ELEM = document.getElementById('game-id');

// References for Opponent Hand Sizes (Assuming 4-player HTML structure)
const OPPONENT_SIZE_ELEMS = [
    document.getElementById('player-hand-size-1'), // Player 2 Hand Size
    document.getElementById('player-hand-size-2'), // Player 3 Hand Size
    document.getElementById('player-hand-size-3')  // Player 4 Hand Size
];


// =====================================================================
// === SOCKET.IO NETWORK CONNECTION AND LOBBY HANDLERS ===
// =====================================================================

const socket = io('https://api.sbrownit.co.uk'); 

socket.on('connect', () => {
    STATUS.textContent = '✅ Connected to server.';
    START_BUTTON.disabled = false;
});

/**
 * Replaces startGame. Collects settings and asks the server to create/join a game.
 */
function joinLobby() {
    if (!socket.connected) {
        showStatus('Not connected to the server. Please wait.');
        return;
    }

    const requestedGameId = GAME_ID_ELEM.value.trim();
    const gameType = GAME_TYPE_ELEM.value;
    const aiCount = parseInt(AI_COUNT_ELEM.value);

    // Send the request to the server
    socket.emit('join_or_create_game', {
        requestedGameId: requestedGameId,
        gameType: gameType,
        aiCount: aiCount
    });

    START_BUTTON.textContent = 'Awaiting Server Response...';
    START_BUTTON.disabled = true;
    showStatus('Requesting game...');
}

socket.on('game_joined', (data) => {
    myGameId = data.gameId;
    myPlayerId = data.playerId;

    PLAYER_HAND_TITLE.textContent = `👤 Player ${myPlayerId + 1} Hand:`;
    LOBBY_SETTINGS.style.display = 'none'; // Hide lobby controls
    
    showStatus(`Joined Game ID: ${myGameId}. You are Player ${myPlayerId + 1}. Waiting for game to start...`);
    START_BUTTON.textContent = `Game ID: ${myGameId}`; // Display ID in the button area
    START_BUTTON.disabled = false; // Allow interaction for now (e.g. leaving game)
});

socket.on('waiting_for_players', (data) => {
    showStatus(`Waiting for ${data.neededPlayers} more human player(s) to start Game ${myGameId}.`);
});

socket.on('game_start', (initialState) => {
    gameState = initialState;
    showStatus('Game started! It\'s your turn.');
    // Start button remains visible but its function is now 'leave game' or similar
    renderGame();
});

// --- Existing Game Handlers (mostly unchanged) ---

socket.on('state_update', (newState) => {
    gameState = newState;
    renderGame();
});

socket.on('game_error', (message) => {
    showStatus(`❗ Server Error: ${message}`);
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
 * Sends the player's action (playing a card or drawing) to the server.
 */
function handlePlayerAction(cardIndex) {
    if (!socket.connected || gameState.currentPlayer !== myPlayerId || gameState.gameOver) return;

    if (cardIndex === null) {
        // Player clicked Draw Card
        socket.emit('draw_card', { gameId: myGameId, playerId: myPlayerId });
    } else {
        // Player clicked a card to play
        socket.emit('play_card', { gameId: myGameId, playerId: myPlayerId, cardIndex: cardIndex });
    }
}

/**
 * Sends the selected wild color to the server.
 */
function setWildColor(chosenColor) {
    COLOR_PICKER_ELEM.style.display = 'none';
    if (!socket.connected || gameState.currentPlayer !== myPlayerId) return;

    socket.emit('set_wild_color', { 
        gameId: myGameId, 
        playerId: myPlayerId, 
        color: chosenColor 
    });
}

/**
 * Sends the UNO declaration to the server.
 */
function declareUno() {
    if (!socket.connected || gameState.hands[myPlayerId].length !== 1) return;
    
    socket.emit('declare_uno', { gameId: myGameId, playerId: myPlayerId });
}


// =====================================================================
// === UI RENDERING (Based on Server State) ===
// =====================================================================

// (Keep the RENDER functions: renderCard, renderGame, showStatus exactly as they were 
// in the previous rewritten game.js, as they handle the visual display.)

function renderGame() {
    // ... (The entire renderGame function from the previous step) ...
    // Note: This must be updated to correctly handle 4 player slots based on myPlayerId
    
    if (!gameState || !gameState.hands || gameState.gameOver) {
        // ... (Game Over and Initial State Logic) ...
        return;
    }
    
    // ... (rest of the rendering logic) ...

    const isMyTurn = gameState.currentPlayer === myPlayerId;
    const myHand = gameState.hands[myPlayerId];

    // ... (Update Status, Top Card, Player Hand) ...

    // 4. Update Opponent Hand Sizes (Handles up to 3 opponents relative to myPlayerId)
    // OPPONENT_SIZE_ELEMS is an array of 3 elements.
    for (let i = 0; i < 3; i++) {
        // Calculate the index of the opponent relative to the full hands array (0-3)
        // If 4 players: (0+1)%4=1, (0+2)%4=2, (0+3)%4=3
        const opponentIndex = (myPlayerId + i + 1) % gameState.hands.length; 
        const elem = OPPONENT_SIZE_ELEMS[i];
        
        if (elem && gameState.hands[opponentIndex]) {
             const handSize = gameState.hands[opponentIndex].length;
             // Display the player number instead of generic "Computer 1"
             elem.textContent = `Player ${opponentIndex + 1}: ${handSize} cards`;
            
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
    // UNO button is enabled if the player has 2 cards and it's their turn
    UNO_BUTTON.disabled = !(isMyTurn && myHand.length === 2);
    
    // Show color picker only if it's our turn and the server says we need to pick a color
    if (isMyTurn && gameState.topCard && (gameState.topCard.value === 'W' || gameState.topCard.value === 'W4') && !gameState.topCard.nextColor) {
        COLOR_PICKER_ELEM.style.display = 'flex';
        DRAW_BUTTON.disabled = true;
        UNO_BUTTON.disabled = true;
    } else {
        COLOR_PICKER_ELEM.style.display = 'none';
    }
}
// ... (The rest of the rendering functions from the previous step) ...
