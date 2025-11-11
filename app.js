// app.js - Main Express server file
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const { generateRoomCode } = require('./utils/roomCode');
const { Game } = require('./game/Game');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Set up EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Store active games
const activeGames = {};
// Track room creators to ensure they become hosts
const roomCreators = {};
// Track room activity timestamps
const roomLastActivity = {};
// Configure room timeout (30 minutes in milliseconds)
const ROOM_INACTIVE_TIMEOUT = 30 * 60 * 1000;

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/create-room', (req, res) => {
  const roomCode = generateRoomCode();
  const nickname = req.body.nickname || 'Host'; // Get creator's nickname from form
  
  activeGames[roomCode] = new Game(roomCode);
  
  // Store the creator's nickname to identify them when they join
  roomCreators[roomCode] = nickname;
  
  console.log(`Created new room: ${roomCode} with creator: ${nickname}`);
  
  res.redirect(`/room/${roomCode}?nickname=${encodeURIComponent(nickname)}`);
});

app.get('/room/:roomCode', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const nickname = req.query.nickname || '';
  
  // Create the room if it doesn't exist
  if (!activeGames[roomCode]) {
    activeGames[roomCode] = new Game(roomCode);
    console.log(`Created new room: ${roomCode}`);
  }
  
  // Render the game page with room code and nickname
  res.render('game', { roomCode, nickname });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let currentRoomCode = null;
  
  // Join room
  socket.on('joinRoom', ({ roomCode, nickname }) => {
    console.log(`Socket ${socket.id} attempting to join room: ${roomCode} with nickname: ${nickname}`);
    roomCode = roomCode.toUpperCase();
    
    // Create the room if it doesn't exist
    if (!activeGames[roomCode]) {
      activeGames[roomCode] = new Game(roomCode);
      console.log(`Created new room: ${roomCode} for socket: ${socket.id}`);
    }
    
    const game = activeGames[roomCode];
    const player = game.addPlayer(socket.id, nickname);
    
    if (!player) {
      socket.emit('error', 'Game is full');
      return;
    }
    
    // Check if this player is the room creator and should be host
    if (roomCreators[roomCode] && roomCreators[roomCode] === nickname) {
      console.log(`Setting ${nickname} as host for room ${roomCode}`);
      game.hostId = socket.id;
      // Clear the creator entry as we've set the host
      delete roomCreators[roomCode];
    }
    
    // Store room code for disconnection handling
    currentRoomCode = roomCode;
    socket.join(roomCode);
    console.log(`Socket ${socket.id} joined room: ${roomCode}`);
    
    // Update room activity timestamp
    updateRoomActivity(roomCode);
    
    // Send updated player list to all clients in the room
    io.to(roomCode).emit('updatePlayers', {
      players: game.getPlayers(),
      canStart: game.canStart(),
      hostId: game.getHostId()
    });
  });
  
  // Start game
  socket.on('startGame', ({ roomCode }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    // Check if player is the host
    if (!game.isHost(socket.id)) {
      socket.emit('error', 'Only the host can start the game');
      return;
    }
    
    if (!game.canStart()) {
      socket.emit('error', 'Not enough players');
      return;
    }
    
    game.start();
    
    // Notify all players that game has started
    io.to(roomCode).emit('gameStarted');
    
    // Send initial game state
    updateGameState(roomCode);
    
    // Start turn timer
    startTurnTimer(roomCode);
  });
  
  // Offering player selects which card to flip
  socket.on('flipCard', ({ roomCode, cardIndex }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game || game.currentPhase !== 'offering') return;
    if (game.getCurrentPlayerId() !== socket.id) return;
    
    // Clear the existing timer before changing phase
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }
    
    game.flipCard(cardIndex);
    updateGameState(roomCode);
    
    // Move to selection phase
    game.setPhase('selection');
    updateGameState(roomCode);
    
    // Start a new timer for the selection phase
    startTurnTimer(roomCode);
  });
  
  // Receiving player selects which card to take
  socket.on('selectCard', ({ roomCode, cardIndex }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game || game.currentPhase !== 'selection') return;
    if (game.getReceivingPlayerId() !== socket.id) return;
    
    // Clear the existing timer before processing
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }
    
    game.selectCard(cardIndex);
    
    // Advance to next turn or round
    if (game.currentPhase === 'scoring') {
      // No scoring timer - players will manually indicate when they're done
      // Clear any existing timer just in case
      if (game.scoringTimer) {
        clearTimeout(game.scoringTimer);
      }
    } else {
      // Start the next turn timer
      startTurnTimer(roomCode);
    }
    
    updateGameState(roomCode);
  });
  
  // Player places card in bouquet or keepsakes
  socket.on('placeCard', ({ roomCode, cardId, location }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game) return;
    
    game.placeCard(socket.id, cardId, location);
    updateGameState(roomCode);
  });
  
  // Player uses a card's ability during scoring
  socket.on('useCardAbility', ({ roomCode, cardId, targetCardId }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game || game.currentPhase !== 'scoring') return;
    
    const result = game.useCardAbility(socket.id, cardId, targetCardId);
    
    // Check if the ability returned a special result object (for Pink Larkspur)
    if (result && typeof result === 'object' && result.success) {
      // Send the result back to the client that requested it
      socket.emit('cardAbilityResult', result);
      console.log(`Emitting card ability result: ${result.ability}`, result);
    }
    
    updateGameState(roomCode);
  });
  
  // Player indicates they are done with scoring
  socket.on('doneScoring', ({ roomCode }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game || game.currentPhase !== 'scoring') return;
    
    game.playerDoneScoring(socket.id);
    
    // If all players are done, finalize scoring
    if (game.allPlayersDoneScoring()) {
      game.finalizeScoring();
      
      // Check if we've completed all game rounds
      if (game.isGameComplete()) {
        // All 3 rounds complete, move to game over
        game.setPhase('gameOver');
      } else {
        // Start a new round
        game.startNewRound();
        io.to(roomCode).emit('roundComplete', { gameRound: game.gameRound });
        // Start timer for the new round
        startTurnTimer(roomCode);
      }
      
      // Clear any existing timers just in case
      if (game.scoringTimer) {
        clearTimeout(game.scoringTimer);
      }
      if (game.turnTimer) {
        clearTimeout(game.turnTimer);
        game.turnTimer = null;
      }
      updateGameState(roomCode);
    }
  });
  
  // Start a new game in the same room
  socket.on('newGame', ({ roomCode }) => {
    console.log(`Received newGame request for room: ${roomCode}`);
    roomCode = roomCode.toUpperCase();
    
    if (!activeGames[roomCode]) {
      console.log(`Room ${roomCode} not found for new game request`);
      return;
    }
    
    const game = activeGames[roomCode];
    
    // Check if player is the host
    if (!game.isHost(socket.id)) {
      socket.emit('error', 'Only the host can start a new game');
      return;
    }
    
    const playerIds = game.getPlayers().map(p => p.id);
    const playerNicknames = game.getPlayers().map(p => p.nickname);
    
    console.log(`Creating new game in room ${roomCode} with players:`, playerNicknames);
    
    // Clear any existing timers before creating new game
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
    }
    if (game.scoringTimer) {
      clearTimeout(game.scoringTimer);
    }
    
    // Create a new game with the same players
    activeGames[roomCode] = new Game(roomCode);
    const newGame = activeGames[roomCode];
    
    // Add players back
    playerIds.forEach((id, index) => {
      newGame.addPlayer(id, playerNicknames[index]);
    });
    
    // Set the original host as the host for the new game
    newGame.hostId = game.hostId;
    
    // Tell all clients in the room that game has been reset
    io.to(roomCode).emit('gameReset');
    
    // Send updated player list to all clients
    io.to(roomCode).emit('updatePlayers', {
      players: newGame.getPlayers(),
      canStart: newGame.canStart(),
      hostId: newGame.getHostId()
    });
    
    console.log(`New game created in room ${roomCode}, notified ${playerIds.length} players`);
  });

  // Handle event when host continues to next round
  socket.on('continueToNextRound', ({ roomCode }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game) return;
    
    // Verify this is from the host
    if (!game.isHost(socket.id)) {
      socket.emit('error', 'Only the host can continue to the next round');
      return;
    }
    
    // Broadcast to all players that they should continue to the next round
    io.to(roomCode).emit('continueToNextRound');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (currentRoomCode && activeGames[currentRoomCode]) {
      const game = activeGames[currentRoomCode];
      
      // Check if the disconnecting player is the host
      const wasHost = game.isHost(socket.id);
      
      game.removePlayer(socket.id);
      
      // If room is empty, remove it and clean up associated resources
      if (game.getPlayers().length === 0) {
        cleanupRoom(currentRoomCode);
        return;
      }
      
      // Update host if needed
      const hostChanged = game.updateHostIfNeeded(socket.id);
      
      // Update room activity timestamp
      updateRoomActivity(currentRoomCode);
      
      // Notify remaining players
      io.to(currentRoomCode).emit('playerLeft', {
        players: game.getPlayers(),
        canStart: game.canStart(),
        hostId: game.getHostId(),
        hostChanged: hostChanged,
        previousHostId: wasHost ? socket.id : null
      });
      
      // If game was in progress, handle accordingly
      if (game.isGameInProgress()) {
        // If it was the current player's turn, advance to next player
        if (game.getCurrentPlayerId() === socket.id) {
          // Clear the timer and restart it for the next player
          if (game.turnTimer) {
            clearTimeout(game.turnTimer);
            game.turnTimer = null;
          }
          game.advanceTurn();
          updateGameState(currentRoomCode);
          // Start timer for the new current player
          startTurnTimer(currentRoomCode);
        }
      }
    }
  });
});

// Function to update room activity timestamp
function updateRoomActivity(roomCode) {
  roomLastActivity[roomCode] = Date.now();
}

// Function to clean up a room and all associated resources
function cleanupRoom(roomCode) {
  console.log(`Cleaning up room: ${roomCode}`);
  
  // Clear any timers associated with the room
  if (activeGames[roomCode]) {
    if (activeGames[roomCode].turnTimer) {
      clearTimeout(activeGames[roomCode].turnTimer);
    }
    if (activeGames[roomCode].scoringTimer) {
      clearTimeout(activeGames[roomCode].scoringTimer);
    }
  }
  
  // Delete the game instance
  delete activeGames[roomCode];
  
  // Clean up room creators entry
  delete roomCreators[roomCode];
  
  // Clean up activity timestamp
  delete roomLastActivity[roomCode];
  
  console.log(`Room ${roomCode} has been deleted`);
}

// Periodic cleanup of inactive rooms (runs every 10 minutes)
setInterval(() => {
  console.log('Running periodic cleanup of inactive rooms');
  const now = Date.now();
  
  for (const roomCode in roomLastActivity) {
    const lastActivity = roomLastActivity[roomCode];
    if (now - lastActivity > ROOM_INACTIVE_TIMEOUT) {
      console.log(`Room ${roomCode} has been inactive for ${Math.floor((now - lastActivity) / 60000)} minutes`);
      
      // Notify any connected players that the room is being closed due to inactivity
      if (activeGames[roomCode]) {
        io.to(roomCode).emit('error', 'Room closed due to inactivity');
      }
      
      // Clean up the room
      cleanupRoom(roomCode);
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Update all clients in a room with the current game state
function updateGameState(roomCode) {
  const game = activeGames[roomCode];
  if (!game) return;
  
  // Update room activity timestamp when game state changes
  updateRoomActivity(roomCode);
  
  io.to(roomCode).emit('updateGameState', game.getGameState());
}

// Start turn timer with improved cleanup
function startTurnTimer(roomCode) {
  const game = activeGames[roomCode];
  if (!game) return;
  
  // Clear any existing timer first
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
  
  // Only start timer for offering or selection phases
  if (game.currentPhase !== 'offering' && game.currentPhase !== 'selection') {
    console.log('Not starting timer - phase is:', game.currentPhase);
    return;
  }
  
  // Update room activity timestamp
  updateRoomActivity(roomCode);
  
  console.log(`Starting turn timer for room ${roomCode}, phase: ${game.currentPhase}`);
  
  // Set new timer (30 seconds)
  game.turnTimer = setTimeout(() => {
    console.log(`Turn time expired for room: ${roomCode}, phase: ${game.currentPhase}`);
    
    // Verify game still exists and is in a valid state
    if (!activeGames[roomCode]) {
      console.log('Game no longer exists, timer cancelled');
      return;
    }
    
    const currentGame = activeGames[roomCode];
    
    // Auto-complete the turn based on current phase
    if (currentGame.currentPhase === 'offering') {
      console.log('Auto-flipping card due to timeout');
      // If offering player hasn't chosen, randomly flip a card
      currentGame.randomFlip();
      currentGame.setPhase('selection');
      updateGameState(roomCode);
      
      // Recursively start a new timer for the selection phase
      startTurnTimer(roomCode);
      
    } else if (currentGame.currentPhase === 'selection') {
      console.log('Auto-selecting card due to timeout');
      // If receiving player hasn't chosen, randomly select a card
      currentGame.randomSelect();
      updateGameState(roomCode);
      
      // Start timer for next turn if not in scoring phase
      if (currentGame.currentPhase !== 'scoring') {
        startTurnTimer(roomCode);
      }
    }
  }, 30000); // 30 seconds
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});