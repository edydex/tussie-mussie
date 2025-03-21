// public/js/client.js
document.addEventListener('DOMContentLoaded', () => {
  // Initialize socket connection only when needed
  let socket = null;
  
  // Game state
  let currentRoomCode = '';
  let currentPlayerId = '';
  let gameStarted = false;
  
  // DOM elements - Landing page
  const createRoomForm = document.getElementById('createRoomForm');
  const joinRoomForm = document.getElementById('joinRoomForm');
  const nicknameInput = document.getElementById('nicknameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const landingPage = document.getElementById('landingPage');
  
  // DOM elements - Game page
  const gamePage = document.getElementById('gamePage');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const playersList = document.getElementById('playersList');
  const startGameBtn = document.getElementById('startGameBtn');
  const waitingArea = document.getElementById('waitingArea');
  const gameArea = document.getElementById('gameArea');
  const activeCardsArea = document.getElementById('activeCardsArea');
  const myBouquetArea = document.getElementById('myBouquetArea');
  const myKeepsakesArea = document.getElementById('myKeepsakesArea');
  const opponentsArea = document.getElementById('opponentsArea');
  const gameStatus = document.getElementById('gameStatus');
  const scoringArea = document.getElementById('scoringArea');
  const doneScoring = document.getElementById('doneScoring');
  const newGameBtn = document.getElementById('newGameBtn');
  
  // Check URL for room code
  const urlParams = new URLSearchParams(window.location.search);
  const roomCodeFromUrl = urlParams.get('room');
  
  if (roomCodeFromUrl) {
    roomCodeInput.value = roomCodeFromUrl;
    document.getElementById('joinRoomPanel').classList.add('active');
    document.getElementById('createRoomPanel').classList.remove('active');
  }
  
  // Handle tab switching on landing page
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      const target = button.getAttribute('data-target');
      document.getElementById(target).classList.add('active');
      button.classList.add('active');
    });
  });
  
  // Handle create room form submission
  if (createRoomForm) {
    createRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const nickname = nicknameInput.value.trim();
      
      if (!nickname) {
        showError('Please enter a nickname');
        return;
      }
      
      // Set current room code
      currentRoomCode = generateRoomCode();
      
      // Redirect to the game room URL with nickname
      window.location.href = `/room/${currentRoomCode}?nickname=${encodeURIComponent(nickname)}`;
    });
  }
  
  // Handle join room form submission
  if (joinRoomForm) {
    joinRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const nickname = document.getElementById('joinNicknameInput') 
                       ? document.getElementById('joinNicknameInput').value.trim() 
                       : nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim().toUpperCase();
      
      if (!nickname) {
        showError('Please enter a nickname');
        return;
      }
      
      if (!roomCode) {
        showError('Please enter a room code');
        return;
      }
      
      // Redirect to the game room URL with nickname
      window.location.href = `/room/${roomCode}?nickname=${encodeURIComponent(nickname)}`;
    });
  }
  
  // Handle start game button
  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      socket.emit('startGame', { roomCode: currentRoomCode });
    });
  }
  
  // Handle done scoring button
  if (doneScoring) {
    doneScoring.addEventListener('click', () => {
      socket.emit('doneScoring', { roomCode: currentRoomCode });
      doneScoring.disabled = true;
    });
  }
  
  // Handle new game button
  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => {
      socket.emit('newGame', { roomCode: currentRoomCode });
    });
  }
  
  // Initialize WebSocket connection
  function initializeSocket() {
    if (socket) return; // Already initialized
    
    socket = io();
    console.log('Socket connection initialized');
    
    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to server with socket ID:', socket.id);
    });
    
    socket.on('updatePlayers', ({ players, canStart }) => {
      console.log('Received updatePlayers:', players);
      updatePlayersList(players);
      
      if (startGameBtn) {
        startGameBtn.disabled = !canStart;
      }
    });
    
    socket.on('gameStarted', () => {
      console.log('Received gameStarted event');
      gameStarted = true;
      showGameArea();
    });
    
    socket.on('updateGameState', (gameState) => {
      console.log('Received gameState:', gameState);
      updateGameUI(gameState);
    });
    
    socket.on('playerLeft', ({ players, canStart }) => {
      console.log('Player left, remaining players:', players);
      updatePlayersList(players);
      
      if (startGameBtn) {
        startGameBtn.disabled = !canStart;
      }
    });
    
    socket.on('gameReset', () => {
      console.log('Game reset');
      resetGame();
    });
    
    socket.on('error', (message) => {
      console.error('Socket error:', message);
      showError(message);
    });
  }
  
  // Helper function to generate a random room code
  function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < 4; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return code;
  }
  
  // Update the players list in the lobby
  function updatePlayersList(players) {
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    players.forEach(player => {
      const playerItem = document.createElement('div');
      playerItem.classList.add('player-item');
      
      if (player.id === socket.id) {
        playerItem.classList.add('current-player');
        currentPlayerId = player.id;
      }
      
      playerItem.textContent = player.nickname;
      playersList.appendChild(playerItem);
    });
  }
  
  // Show the game lobby
  function showGameLobby(roomCode) {
    if (!landingPage || !gamePage) return;
    
    landingPage.style.display = 'none';
    gamePage.style.display = 'block';
    waitingArea.style.display = 'block';
    gameArea.style.display = 'none';
    
    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = roomCode;
    }
  }
  
  // Show the game area
  function showGameArea() {
    if (!waitingArea || !gameArea) return;
    
    waitingArea.style.display = 'none';
    gameArea.style.display = 'block';
  }
  
  // Update the game UI based on the game state
  function updateGameUI(gameState) {
    console.log('Received game state:', gameState);
    
    // First, determine if we are the current player
    const isCurrentPlayer = gameState.currentPlayerId === currentPlayerId;
    const isReceivingPlayer = gameState.receivingPlayerId === currentPlayerId;
    
    console.log('I am', isCurrentPlayer ? 'the current player' : 'not the current player');
    console.log('I am', isReceivingPlayer ? 'the receiving player' : 'not the receiving player');
    
    // Update game status message
    updateGameStatus(gameState, isCurrentPlayer, isReceivingPlayer);
    
    // Update active cards area
    updateActiveCards(gameState.activeCards, gameState.phase, isCurrentPlayer, isReceivingPlayer);
    
    // Find current player data
    const currentPlayerData = gameState.players.find(p => p.id === currentPlayerId);
    
    // Update player's cards
    if (currentPlayerData) {
      updatePlayerCards(currentPlayerData);
    }
    
    // Update opponents' cards
    updateOpponentsCards(gameState.players);
    
    // Show/hide scoring UI
    if (gameState.phase === 'scoring') {
      showScoringUI(currentPlayerData, gameState);
    } else {
      hideScoringUI();
    }
    
    // Show game over UI if game is over
    if (gameState.phase === 'gameOver') {
      showGameOverUI(gameState.players);
    }
  }
  
  // Update the game status message
  function updateGameStatus(gameState, isCurrentPlayer, isReceivingPlayer) {
    if (!gameStatus) return;
    
    let statusText = '';
    
    switch (gameState.phase) {
      case 'offering':
        if (isCurrentPlayer) {
          statusText = 'Your turn! Choose a card to flip face up.';
        } else {
          const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
          statusText = `${currentPlayer?.nickname || 'Current player'} is choosing a card...`;
        }
        break;
        
      case 'selection':
        if (isReceivingPlayer) {
          statusText = 'Choose a card to take into your bouquet.';
        } else {
          const receivingPlayer = gameState.players.find(p => p.id === gameState.receivingPlayerId);
          statusText = `${receivingPlayer?.nickname || 'Next player'} is choosing a card...`;
        }
        break;
        
      case 'scoring':
        statusText = 'Scoring phase! Use your card abilities before final scoring.';
        break;
        
      case 'gameOver':
        statusText = 'Game over! Final scores are shown.';
        break;
    }
    
    gameStatus.textContent = statusText;
  }
  
  // Update the active cards area
  function updateActiveCards(activeCards, phase, isCurrentPlayer, isReceivingPlayer) {
    if (!activeCardsArea) return;
    
    console.log('Updating active cards:', activeCards);
    
    // Clear current cards
    activeCardsArea.innerHTML = '';
    
    if (!activeCards || activeCards.length === 0) {
      console.log('No active cards to display');
      return;
    }
    
    // Create and add card elements
    activeCards.forEach((card, index) => {
      console.log('Creating card element for active card:', card);
      const cardElement = createCardElement(card);
      
      // Add click handler based on game phase
      if (phase === 'offering' && isCurrentPlayer) {
        cardElement.classList.add('selectable');
        cardElement.addEventListener('click', () => {
          console.log('Flipping card at index', index);
          socket.emit('flipCard', { roomCode: currentRoomCode, cardIndex: index });
        });
      } else if (phase === 'selection' && isReceivingPlayer) {
        cardElement.classList.add('selectable');
        cardElement.addEventListener('click', () => {
          console.log('Selecting card at index', index);
          socket.emit('selectCard', { roomCode: currentRoomCode, cardIndex: index });
        });
      }
      
      activeCardsArea.appendChild(cardElement);
    });
  }
  
  // Update player's cards
  function updatePlayerCards(playerData) {
    if (!myBouquetArea || !myKeepsakesArea) return;
    
    // Update bouquet cards
    myBouquetArea.innerHTML = '';
    playerData.bouquet.forEach(card => {
      const cardElement = createCardElement(card);
      cardElement.classList.add('player-card');
      
      // Add drag-drop functionality for scoring phase
      if (card.canMove) {
        cardElement.classList.add('movable');
        cardElement.setAttribute('draggable', true);
        cardElement.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({
            cardId: card.id,
            source: 'bouquet'
          }));
        });
      }
      
      myBouquetArea.appendChild(cardElement);
    });
    
    // Update keepsakes cards
    myKeepsakesArea.innerHTML = '';
    playerData.keepsakes.forEach(card => {
      // Use the card's actual faceUp state instead of forcing face-down
      const cardElement = createCardElement(card);
      cardElement.classList.add('player-card');
      
      // Add drag-drop functionality for scoring phase
      if (card.canMove) {
        cardElement.classList.add('movable');
        cardElement.setAttribute('draggable', true);
        cardElement.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({
            cardId: card.id,
            source: 'keepsakes'
          }));
        });
      }
      
      myKeepsakesArea.appendChild(cardElement);
    });
    
    // Set up drop areas for scoring phase
    setupDropAreas(playerData);
  }
  
  // Set up drop areas for card movement during scoring phase
  function setupDropAreas(playerData) {
    if (!myBouquetArea || !myKeepsakesArea) return;
    
    // Only set up drop areas during scoring phase
    if (!playerData.canMoveCards) return;
    
    // Bouquet drop area
    myBouquetArea.classList.add('drop-area');
    myBouquetArea.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    myBouquetArea.addEventListener('drop', (e) => {
      e.preventDefault();
      
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        if (data.source === 'keepsakes') {
          socket.emit('placeCard', {
            roomCode: currentRoomCode,
            cardId: data.cardId,
            location: 'bouquet'
          });
        }
      } catch (err) {
        console.error('Error parsing drag data:', err);
      }
    });
    
    // Keepsakes drop area
    myKeepsakesArea.classList.add('drop-area');
    myKeepsakesArea.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    myKeepsakesArea.addEventListener('drop', (e) => {
      e.preventDefault();
      
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        if (data.source === 'bouquet') {
          socket.emit('placeCard', {
            roomCode: currentRoomCode,
            cardId: data.cardId,
            location: 'keepsakes'
          });
        }
      } catch (err) {
        console.error('Error parsing drag data:', err);
      }
    });
  }
  
  // Update opponents' cards
  function updateOpponentsCards(players) {
    if (!opponentsArea) return;
    
    // Clear current opponents
    opponentsArea.innerHTML = '';
    
    // Add each opponent
    players.forEach(player => {
      if (player.id === currentPlayerId) return; // Skip current player
      
      const opponentElement = document.createElement('div');
      opponentElement.classList.add('opponent');
      
      // Add opponent name
      const nameElement = document.createElement('div');
      nameElement.classList.add('opponent-name');
      nameElement.textContent = player.nickname;
      opponentElement.appendChild(nameElement);
      
      // Add opponent score if available
      if (player.score !== undefined) {
        const scoreElement = document.createElement('div');
        scoreElement.classList.add('opponent-score');
        scoreElement.textContent = `Score: ${player.score}`;
        opponentElement.appendChild(scoreElement);
      }
      
      // Add opponent's bouquet
      const bouquetElement = document.createElement('div');
      bouquetElement.classList.add('opponent-bouquet');
      
      const bouquetLabel = document.createElement('div');
      bouquetLabel.classList.add('area-label');
      bouquetLabel.textContent = 'Bouquet';
      bouquetElement.appendChild(bouquetLabel);
      
      const bouquetCardsElement = document.createElement('div');
      bouquetCardsElement.classList.add('opponent-cards');
      
      player.bouquet.forEach(card => {
        bouquetCardsElement.appendChild(createCardElement(card, true));
      });
      
      bouquetElement.appendChild(bouquetCardsElement);
      opponentElement.appendChild(bouquetElement);
      
      // Add opponent's keepsakes
      const keepsakesElement = document.createElement('div');
      keepsakesElement.classList.add('opponent-keepsakes');
      
      const keepsakesLabel = document.createElement('div');
      keepsakesLabel.classList.add('area-label');
      keepsakesLabel.textContent = 'Keepsakes';
      keepsakesElement.appendChild(keepsakesLabel);
      
      const keepsakesCardsElement = document.createElement('div');
      keepsakesCardsElement.classList.add('opponent-cards');
      
      player.keepsakes.forEach(card => {
        keepsakesCardsElement.appendChild(createCardElement(card, true));
      });
      
      keepsakesElement.appendChild(keepsakesCardsElement);
      opponentElement.appendChild(keepsakesElement);
      
      opponentsArea.appendChild(opponentElement);
    });
  }
  
  // Show scoring UI
  function showScoringUI(playerData, gameState) {
    if (!scoringArea || !doneScoring) return;
    
    scoringArea.style.display = 'block';
    doneScoring.disabled = playerData?.doneScoring || false;
    
    // Add card ability UI if needed
    const abilityCardsContainer = document.getElementById('abilityCards');
    if (abilityCardsContainer) {
      abilityCardsContainer.innerHTML = '';
      
      // Find cards with abilities
      const cardsWithAbilities = [
        ...playerData.bouquet.filter(card => hasAbility(card.id)),
        ...playerData.keepsakes.filter(card => hasAbility(card.id))
      ];
      
      if (cardsWithAbilities.length > 0) {
        const abilityHeader = document.createElement('h3');
        abilityHeader.textContent = 'Card Abilities';
        abilityCardsContainer.appendChild(abilityHeader);
        
        cardsWithAbilities.forEach(card => {
          const abilityCard = createCardElement(card);
          abilityCard.classList.add('ability-card');
          
          // Add click handler for ability
          abilityCard.addEventListener('click', () => {
            handleCardAbility(card.id, playerData);
          });
          
          abilityCardsContainer.appendChild(abilityCard);
        });
      }
    }
  }
  
  // Hide scoring UI
  function hideScoringUI() {
    if (!scoringArea) return;
    
    scoringArea.style.display = 'none';
  }
  
  // Show game over UI
  function showGameOverUI(players) {
    if (!gameStatus) return;
    
    // Sort players by score (highest first)
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    
    const resultsContainer = document.createElement('div');
    resultsContainer.classList.add('results-container');
    
    const resultsHeader = document.createElement('h2');
    resultsHeader.textContent = 'Final Scores';
    resultsContainer.appendChild(resultsHeader);
    
    sortedPlayers.forEach((player, index) => {
      const playerResult = document.createElement('div');
      playerResult.classList.add('player-result');
      
      if (index === 0) {
        playerResult.classList.add('winner');
      }
      
      if (player.id === currentPlayerId) {
        playerResult.classList.add('current-player');
      }
      
      playerResult.innerHTML = `
        <div class="result-player-name">${player.nickname}</div>
        <div class="result-player-score">${player.score} points</div>
      `;
      
      resultsContainer.appendChild(playerResult);
    });
    
    // Clear existing results before adding new ones
    const existingResults = document.querySelector('.results-container');
    if (existingResults) {
      existingResults.remove();
    }
    
    if (newGameBtn) {
      newGameBtn.style.display = 'block';
    }
    
    // Add results to game area
    gameArea.appendChild(resultsContainer);
  }
  
  // Create a card element
  function createCardElement(card, isOpponent = false) {
    if (!card) {
      console.error('Attempted to create card element with undefined card');
      return document.createElement('div'); // Return empty div to avoid errors
    }
    
    console.log('Creating card element for:', card);
    
    const cardElement = document.createElement('div');
    cardElement.classList.add('card');
    cardElement.dataset.cardId = card.id;
    
    if (card.faceUp) {
      cardElement.classList.add('face-up');
      cardElement.classList.add(card.color);
      
      // Card content for face-up card
      const cardHeader = document.createElement('div');
      cardHeader.classList.add('card-header');
      
      const cardName = document.createElement('div');
      cardName.classList.add('card-name');
      cardName.textContent = card.name;
      cardHeader.appendChild(cardName);
      
      // Add hearts
      const cardHearts = document.createElement('div');
      cardHearts.classList.add('card-hearts');
      for (let i = 0; i < card.hearts; i++) {
        const heart = document.createElement('span');
        heart.textContent = '❤️';
        cardHearts.appendChild(heart);
      }
      cardHeader.appendChild(cardHearts);
      
      cardElement.appendChild(cardHeader);
      
      // Card effect text
      const cardEffect = document.createElement('div');
      cardEffect.classList.add('card-effect');
      cardEffect.textContent = card.effectText;
      cardElement.appendChild(cardEffect);
      
      // Card flavor text
      const cardFlavor = document.createElement('div');
      cardFlavor.classList.add('card-flavor');
      cardFlavor.textContent = card.flavorText;
      cardElement.appendChild(cardFlavor);
    } else {
      cardElement.classList.add('face-down');
      
      // Simple card back design
      const cardBack = document.createElement('div');
      cardBack.classList.add('card-back');
      cardBack.textContent = 'Tussie Mussie';
      cardElement.appendChild(cardBack);
    }
    
    // Make opponent cards smaller
    if (isOpponent) {
      cardElement.classList.add('opponent-card');
    }
    
    return cardElement;
  }
  
  // Check if a card has a usable ability
  function hasAbility(cardId) {
    return ['pink-larkspur', 'snapdragon', 'marigold'].includes(cardId);
  }
  
  // Handle card ability
  function handleCardAbility(cardId, playerData) {
    // For simplicity, we'll implement only a basic UI for abilities
    // In a full implementation, this would be more interactive
    
    switch (cardId) {
      case 'pink-larkspur':
        // Allow player to replace one card with a new one
        alert('Pink Larkspur: Click a card to replace it with a new one from the deck.');
        
        // Add click handlers to all player cards
        const allPlayerCards = document.querySelectorAll('.player-card');
        allPlayerCards.forEach(cardElement => {
          cardElement.classList.add('selectable');
          cardElement.addEventListener('click', () => {
            const targetCardId = cardElement.dataset.cardId;
            socket.emit('useCardAbility', {
              roomCode: currentRoomCode,
              cardId: 'pink-larkspur',
              targetCardId
            });
            
            // Remove selection state
            allPlayerCards.forEach(c => c.classList.remove('selectable'));
          }, { once: true });
        });
        break;
        
      case 'snapdragon':
        // Allow player to move up to 2 cards between bouquet and keepsakes
        alert('Snapdragon: Click up to 2 cards to move them between bouquet and keepsakes.');
        
        // Add click handlers to all player cards
        const playerCards = document.querySelectorAll('.player-card');
        let movesLeft = 2;
        
        playerCards.forEach(cardElement => {
          cardElement.classList.add('selectable');
          cardElement.addEventListener('click', () => {
            const targetCardId = cardElement.dataset.cardId;
            socket.emit('useCardAbility', {
              roomCode: currentRoomCode,
              cardId: 'snapdragon',
              targetCardId
            });
            
            movesLeft--;
            
            if (movesLeft <= 0) {
              // Remove selection state
              playerCards.forEach(c => c.classList.remove('selectable'));
            }
          }, { once: true });
        });
        break;
        
      case 'marigold':
        // Player must discard one card
        alert('Marigold: You must discard one of your other cards.');
        
        // Add click handlers to all player cards except Marigold
        const otherCards = document.querySelectorAll('.player-card:not([data-card-id="marigold"])');
        otherCards.forEach(cardElement => {
          cardElement.classList.add('selectable');
          cardElement.addEventListener('click', () => {
            const targetCardId = cardElement.dataset.cardId;
            socket.emit('useCardAbility', {
              roomCode: currentRoomCode,
              cardId: 'marigold',
              targetCardId
            });
            
            // Remove selection state
            otherCards.forEach(c => c.classList.remove('selectable'));
          }, { once: true });
        });
        break;
    }
  }
  
  // Reset game UI for a new game
  function resetGame() {
    // Hide game over elements
    if (newGameBtn) {
      newGameBtn.style.display = 'none';
    }
    
    // Remove results container
    const existingResults = document.querySelector('.results-container');
    if (existingResults) {
      existingResults.remove();
    }
    
    // Show waiting area, hide game area
    if (waitingArea && gameArea) {
      waitingArea.style.display = 'block';
      gameArea.style.display = 'none';
    }
    
    // Reset game started flag
    gameStarted = false;
  }
  
  // Show error message
  function showError(message) {
    alert(message);
  }
  
  // Make socket available globally
  window.socket = socket;
  
  // Make functions available globally
  window.initializeSocket = initializeSocket;
  window.showGameLobby = showGameLobby;
  window.updatePlayersList = updatePlayersList;
  window.updateGameUI = updateGameUI;
  window.showGameArea = showGameArea;
  window.resetGame = resetGame;
});