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

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/create-room', (req, res) => {
  const roomCode = generateRoomCode();
  activeGames[roomCode] = new Game(roomCode);
  res.redirect(`/room/${roomCode}`);
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
    
    // Store room code for disconnection handling
    currentRoomCode = roomCode;
    socket.join(roomCode);
    console.log(`Socket ${socket.id} joined room: ${roomCode}`);
    
    // Send updated player list to all clients in the room
    io.to(roomCode).emit('updatePlayers', {
      players: game.getPlayers(),
      canStart: game.canStart()
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
    
    game.flipCard(cardIndex);
    updateGameState(roomCode);
    
    // Move to selection phase
    game.setPhase('selection');
    updateGameState(roomCode);
  });
  
  // Receiving player selects which card to take
  socket.on('selectCard', ({ roomCode, cardIndex }) => {
    roomCode = roomCode.toUpperCase();
    const game = activeGames[roomCode];
    
    if (!game || game.currentPhase !== 'selection') return;
    if (game.getReceivingPlayerId() !== socket.id) return;
    
    game.selectCard(cardIndex);
    
    // Advance to next turn or round
    if (game.currentPhase === 'scoring') {
      // If we've moved to scoring phase, start scoring timer
      startScoringTimer(roomCode);
    } else {
      // Otherwise start the next turn timer
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
      }
      
      clearTimeout(game.scoringTimer);
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
    const playerIds = game.getPlayers().map(p => p.id);
    const playerNicknames = game.getPlayers().map(p => p.nickname);
    
    console.log(`Creating new game in room ${roomCode} with players:`, playerNicknames);
    
    // Create a new game with the same players
    activeGames[roomCode] = new Game(roomCode);
    const newGame = activeGames[roomCode];
    
    // Add players back
    playerIds.forEach((id, index) => {
      newGame.addPlayer(id, playerNicknames[index]);
    });
    
    // Tell all clients in the room that game has been reset
    io.to(roomCode).emit('gameReset');
    
    // Send updated player list to all clients
    io.to(roomCode).emit('updatePlayers', {
      players: newGame.getPlayers(),
      canStart: newGame.canStart()
    });
    
    console.log(`New game created in room ${roomCode}, notified ${playerIds.length} players`);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (currentRoomCode && activeGames[currentRoomCode]) {
      const game = activeGames[currentRoomCode];
      game.removePlayer(socket.id);
      
      // If room is empty, remove it
      if (game.getPlayers().length === 0) {
        delete activeGames[currentRoomCode];
        return;
      }
      
      // Notify remaining players
      io.to(currentRoomCode).emit('playerLeft', {
        players: game.getPlayers(),
        canStart: game.canStart()
      });
      
      // If game was in progress, handle accordingly
      if (game.isGameInProgress()) {
        // If it was the current player's turn, advance to next player
        if (game.getCurrentPlayerId() === socket.id) {
          game.advanceTurn();
          updateGameState(currentRoomCode);
        }
      }
    }
  });
});

// Update all clients in a room with the current game state
function updateGameState(roomCode) {
  const game = activeGames[roomCode];
  if (!game) return;
  
  io.to(roomCode).emit('updateGameState', game.getGameState());
}

// Start turn timer
function startTurnTimer(roomCode) {
  const game = activeGames[roomCode];
  if (!game) return;
  
  // Clear any existing timer
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
  }
  
  // Set new timer (30 seconds)
  game.turnTimer = setTimeout(() => {
    console.log('Turn time expired for room:', roomCode);
    
    // Auto-complete the turn
    if (game.currentPhase === 'offering') {
      // If offering player hasn't chosen, randomly flip a card
      game.randomFlip();
      game.setPhase('selection');
      updateGameState(roomCode);
      
      // Start another timer for selection phase
      game.turnTimer = setTimeout(() => {
        // If receiving player hasn't chosen, randomly select a card
        game.randomSelect();
        
        // Advance to next turn or round
        if (game.currentPhase === 'scoring') {
          startScoringTimer(roomCode);
        } else {
          startTurnTimer(roomCode);
        }
        
        updateGameState(roomCode);
      }, 30000); // 30 seconds for selection
    } else if (game.currentPhase === 'selection') {
      // If receiving player hasn't chosen, randomly select a card
      game.randomSelect();
      
      // Advance to next turn or round
      if (game.currentPhase === 'scoring') {
        startScoringTimer(roomCode);
      } else {
        startTurnTimer(roomCode);
      }
      
      updateGameState(roomCode);
    }
  }, 30000); // 30 seconds
}

// Start scoring timer
function startScoringTimer(roomCode) {
  const game = activeGames[roomCode];
  if (!game) return;
  
  // Clear any existing timer
  if (game.scoringTimer) {
    clearTimeout(game.scoringTimer);
  }
  
  // Set new timer (90 seconds)
  game.scoringTimer = setTimeout(() => {
    console.log('Scoring time expired for room:', roomCode);
    
    // Finalize scoring
    game.finalizeScoring();
    
    // Check if we've completed all game rounds
    if (game.isGameComplete()) {
      // All 3 rounds complete, end the game
      game.setPhase('gameOver');
    } else {
      // Start a new round
      game.startNewRound();
      io.to(roomCode).emit('roundComplete', { gameRound: game.gameRound });
    }
    
    updateGameState(roomCode);
  }, 90000); // 90 seconds
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});