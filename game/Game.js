// game/Game.js - Game logic for Tussie Mussie

// Card class definition
class Card {
  constructor(id, name, color, hearts, effect, effectText, flavorText) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.hearts = hearts;
    this.effect = effect; // Function to calculate score
    this.effectText = effectText;
    this.flavorText = flavorText;
    this.faceUp = false;
    this.location = null; // 'bouquet' or 'keepsakes'
    this.owner = null;
    // NEW: Track if the card's ability has been used
    this.abilityUsed = false;
  }

  flip() {
    this.faceUp = !this.faceUp;
    return this;
  }

  setOwner(playerId) {
    this.owner = playerId;
    return this;
  }

  setLocation(location) {
    this.location = location;
    return this;
  }
}

// Player class definition
class Player {
  constructor(id, nickname) {
    this.id = id;
    this.nickname = nickname;
    this.bouquet = []; // face-up cards
    this.keepsakes = []; // face-down cards
    this.score = 0;
    this.doneScoring = false;
  }

  addCard(card, location) {
    card.setOwner(this.id);
    card.setLocation(location);
    
    if (location === 'bouquet') {
      card.faceUp = true;
      this.bouquet.push(card);
    } else if (location === 'keepsakes') {
      // Keep the card's current face-up/face-down state for keepsakes
      this.keepsakes.push(card);
    }
  }

  removeCard(cardId, location) {
    if (location === 'bouquet') {
      const index = this.bouquet.findIndex(c => c.id === cardId);
      if (index !== -1) {
        return this.bouquet.splice(index, 1)[0];
      }
    } else if (location === 'keepsakes') {
      const index = this.keepsakes.findIndex(c => c.id === cardId);
      if (index !== -1) {
        return this.keepsakes.splice(index, 1)[0];
      }
    }
    return null;
  }

  moveCard(cardId, fromLocation, toLocation) {
    const card = this.removeCard(cardId, fromLocation);
    if (card) {
      this.addCard(card, toLocation);
      return true;
    }
    return false;
  }
  
  getAllCards() {
    return [...this.bouquet, ...this.keepsakes];
  }

  calculateScore() {
    let score = 0;
    
    // Base heart score
    const cards = this.getAllCards();
    score += cards.reduce((sum, card) => sum + card.hearts, 0);
    
    // Additional scores from card effects
    for (const card of this.bouquet) {
      score += card.effect(this);
    }
    
    for (const card of this.keepsakes) {
      score += card.effect(this);
    }
    
    this.score = score;
    return score;
  }
}

// Game class definition
class Game {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.deck = [];
    this.activeCards = [];
    this.currentPlayerIndex = 0;
    this.currentPhase = 'waiting'; // waiting, offering, selection, scoring, gameOver
    this.round = 0;
    this.turnCount = 0; // Add turn counter to track total turns
    this.turnTimer = null;
    this.scoringTimer = null;
    
    // Initialize deck
    this.initializeDeck();
  }

  initializeDeck() {
    // Create all cards based on the PDF
    this.deck = [
      // Red cards
      new Card("camellia", "Camellia", "red", 0, 
               (player) => 0, 
               "No effect", 
               "You're a flame in my heart"),
               
      new Card("red-rose", "Red Rose", "red", 1, 
               (player) => {
                 const hearts = player.getAllCards().reduce((sum, card) => sum + card.hearts, 0);
                 return hearts;
               }, 
               "+1 point for each of your hearts", 
               "I love you"),
               
      new Card("red-tulip", "Red Tulip", "red", 1, 
               (player) => {
                 const redCards = player.getAllCards().filter(card => card.color === "red").length;
                 return redCards;
               }, 
               "+1 point for each of your red cards, including this one", 
               "I love you"),
      
      // Pink cards
      new Card("amaryllis", "Amaryllis", "pink", 0, 
               (player) => {
                 return player.bouquet.length;
               }, 
               "+1 point for each card in your bouquet", 
               "I am determined"),
               
      new Card("pink-rose", "Pink Rose", "pink", 1, 
               (player) => {
                 const pinkCards = player.getAllCards().filter(card => card.color === "pink").length;
                 return pinkCards;
               }, 
               "+1 point for each of your pink cards, including this one", 
               "We are happy friends"),
               
      new Card("pink-larkspur", "Pink Larkspur", "pink", 0, 
               (player) => 0, 
               "Before scoring, you may draw two cards. If you do, you must replace one of your cards with one of them", 
               "You are fickle"),
               
      new Card("peony", "Peony", "pink", 1, 
               (player) => {
                 return player.bouquet.length === 2 ? 2 : 0;
               }, 
               "+2 points if you have exactly two cards in your bouquet", 
               "I am bashful"),
               
      new Card("phlox", "Phlox", "pink", 2, 
               (player) => 0, 
               "No effect", 
               "Our souls are united"),
      
      // Purple cards     
      new Card("forget-me-not", "Forget-Me-Not", "purple", 1, 
               (player) => {
                 let points = 0;
                 const allCards = player.getAllCards();
                 const cardIndex = allCards.findIndex(c => c.id === "forget-me-not");
                 
                 if (cardIndex > 0) {
                   points += allCards[cardIndex - 1].hearts;
                 }
                 
                 if (cardIndex < allCards.length - 1) {
                   points += allCards[cardIndex + 1].hearts;
                 }
                 
                 return points;
               }, 
               "+1 point for each heart on your cards adjacent to this one", 
               "This is true love"),
               
      new Card("hyacinth", "Hyacinth", "purple", 0, 
               (player) => {
                 const hasNoHearts = player.getAllCards().every(card => card.hearts === 0);
                 return hasNoHearts ? 3 : 0;
               }, 
               "+3 points if you have no hearts", 
               "Please forgive me"),
               
      new Card("violet", "Violet", "purple", 1, 
               (player) => {
                 const purpleCards = player.getAllCards().filter(card => card.color === "purple").length;
                 return purpleCards;
               }, 
               "+1 point for each of your purple cards, including this one", 
               "I will always be true"),
               
      new Card("snapdragon", "Snapdragon", "purple", 1, 
               (player) => 0, 
               "Before scoring, you may change up to 2 of your cards, each from bouquet to keepsakes or keepsakes to bouquet", 
               "You have deceived me"),
      
      // Yellow cards
      new Card("honeysuckle", "Honeysuckle", "yellow", 1, 
               (player) => {
                 let points = 0;
                 const bouquetIndex = player.bouquet.findIndex(c => c.id === "honeysuckle");
                 
                 if (bouquetIndex !== -1) {
                   if (bouquetIndex > 0) {
                     points++;
                   }
                   
                   if (bouquetIndex < player.bouquet.length - 1) {
                     points++;
                   }
                 }
                 
                 return points;
               }, 
               "+1 point for each card adjacent to this one in your bouquet", 
               "We are bound by love"),
               
      new Card("carnation", "Carnation", "yellow", 0, 
               (player) => {
                 const colors = new Set();
                 player.getAllCards().forEach(card => colors.add(card.color));
                 return colors.size;
               }, 
               "+1 point for each of your different color cards", 
               "I do not agree"),
               
      new Card("marigold", "Marigold", "yellow", 2, 
               (player) => 0, 
               "Before scoring, you must discard one of your other cards", 
               "You have been cruel"),
      
      // White cards
      new Card("gardenia", "Gardenia", "white", 0, 
               (player) => {
                 return player.keepsakes.length;
               }, 
               "+1 point for each of your keepsakes", 
               "Let's keep a secret"),
               
      new Card("daisy", "Daisy", "white", 0, 
               (player) => {
                 const noHeartCards = player.getAllCards().filter(card => card.hearts === 0 && card.id !== "daisy").length;
                 return noHeartCards;
               }, 
               "+1 point for each of your other cards without a heart", 
               "I am innocent"),
               
      new Card("orchid", "Orchid", "white", 1, 
               (player) => 0, 
               "This card counts as any one color", 
               "You are beautiful")
    ];
    
    this.shuffleDeck();
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  addPlayer(id, nickname) {
    // Don't allow more than 4 players
    if (this.players.length >= 4) {
      return null;
    }
    
    // Don't allow joining if game in progress
    if (this.currentPhase !== 'waiting') {
      return null;
    }
    
    const player = new Player(id, nickname);
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    const index = this.players.findIndex(p => p.id === id);
    if (index !== -1) {
      this.players.splice(index, 1);
      
      // If current player was removed, adjust currentPlayerIndex
      if (this.currentPlayerIndex >= this.players.length) {
        this.currentPlayerIndex = 0;
      }
    }
  }

  getPlayers() {
    return this.players.map(p => ({
      id: p.id,
      nickname: p.nickname
    }));
  }

  canStart() {
    return this.players.length >= 2;
  }

  isGameInProgress() {
    return this.currentPhase !== 'waiting' && this.currentPhase !== 'gameOver';
  }

  start() {
    if (!this.canStart()) return false;
    
    console.log('Starting game with', this.players.length, 'players');
    this.currentPhase = 'offering';
    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    this.round = 0;
    this.turnCount = 0;
    
    // Ensure deck is shuffled
    this.shuffleDeck();
    console.log('Deck shuffled, size:', this.deck.length);
    
    this.startNewTurn();
    
    return true;
  }

  startNewTurn() {
    console.log('Starting new turn, deck size:', this.deck.length);
    
    // Clear active cards
    this.activeCards = [];
    
    // Draw 2 cards if possible
    if (this.deck.length >= 2) {
      const card1 = this.deck.pop();
      const card2 = this.deck.pop();
      
      // Cards start face-up in Tussie Mussie
      card1.faceUp = true;
      card2.faceUp = true;
      
      this.activeCards.push(card1);
      this.activeCards.push(card2);
      
      console.log('Drew 2 face-up cards:', this.activeCards);
    } else {
      console.log('Not enough cards to draw, ending game');
      this.currentPhase = 'scoring';
      return;
    }
  }

  advanceTurn() {
    // Increment turn count
    this.turnCount++;
    
    // Move to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    
    // Check if we've completed a round
    if (this.currentPlayerIndex === 0) {
      this.round++;
    }
    
    // Calculate target cards per player based on player count
    const cardsPerPlayer = this.players.length === 2 ? 4 : (this.players.length === 3 ? 3 : 2);
    
    console.log(`Turn: ${this.turnCount}, Round: ${this.round}, Target cards per player: ${cardsPerPlayer}`);
    console.log('Player cards:');
    
    // Log current card counts for each player
    this.players.forEach((p, i) => {
      console.log(`Player ${i} (${p.nickname}): bouquet=${p.bouquet.length}, keepsakes=${p.keepsakes.length}, total=${p.bouquet.length + p.keepsakes.length}`);
    });
    
    // For exact control in a 2-player game:
    // Each player needs 4 cards, which means 8 total cards
    // This requires 4 turns (each turn gives 2 cards)
    if (this.players.length === 2 && this.turnCount >= 4) {
      console.log('2-player game has completed 4 turns (8 cards distributed) - moving to scoring phase');
      this.currentPhase = 'scoring';
      return;
    }
    
    // For 3 or 4 player games: check if all players have enough cards
    // or if we've completed the required number of rounds
    if (this.players.length > 2) {
      const allPlayersHaveMaxCards = this.players.every(
        p => (p.bouquet.length + p.keepsakes.length) >= cardsPerPlayer
      );
      
      if (this.round >= 1 || allPlayersHaveMaxCards) {
        console.log('Game ending condition met for 3+ player game - moving to scoring phase');
        this.currentPhase = 'scoring';
        return;
      }
    }
    
    // Otherwise, continue to next turn
    console.log('Starting next turn');
    this.currentPhase = 'offering';
    this.startNewTurn();
  }

  flipCard(index) {
    if (index >= 0 && index < this.activeCards.length && this.activeCards[index].faceUp) {
      console.log(`Flipping card at index ${index} from face-up to face-down`);
      this.activeCards[index].faceUp = false; // Always flip to face-down
      return true;
    }
    return false;
  }

  randomFlip() {
    // Get all face-up cards
    const faceUpIndices = this.activeCards
      .map((card, index) => card.faceUp ? index : -1)
      .filter(index => index !== -1);
    
    if (faceUpIndices.length > 0) {
      // Randomly select one of the face-up cards
      const randomIndex = Math.floor(Math.random() * faceUpIndices.length);
      return this.flipCard(faceUpIndices[randomIndex]);
    }
    
    return false;
  }

  getCurrentPlayerId() {
    return this.players[this.currentPlayerIndex]?.id;
  }

  getReceivingPlayerId() {
    // The receiving player is the next player in the rotation
    const receivingIndex = (this.currentPlayerIndex + 1) % this.players.length;
    return this.players[receivingIndex]?.id;
  }

  selectCard(index) {
    if (index < 0 || index >= this.activeCards.length) return false;
    
    const receivingPlayer = this.players[(this.currentPlayerIndex + 1) % this.players.length];
    const offeringPlayer = this.players[this.currentPlayerIndex];
    
    // Receiving player takes selected card
    const selectedCard = this.activeCards[index];
    
    // Card placement depends on face-up/face-down status
    // Face-up cards go to bouquet, face-down cards go to keepsakes
    const selectedCardLocation = selectedCard.faceUp ? 'bouquet' : 'keepsakes';
    receivingPlayer.addCard(selectedCard, selectedCardLocation);
    
    // Offering player takes the other card
    const otherCard = this.activeCards[index === 0 ? 1 : 0];
    const otherCardLocation = otherCard.faceUp ? 'bouquet' : 'keepsakes';
    offeringPlayer.addCard(otherCard, otherCardLocation);
    
    // Clear active cards
    this.activeCards = [];
    
    // Advance to next turn
    this.advanceTurn();
    
    return true;
  }

  randomSelect() {
    // Randomly select one of the active cards
    const index = Math.floor(Math.random() * this.activeCards.length);
    return this.selectCard(index);
  }

  placeCard(playerId, cardId, location) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // Find the card in the player's collection
    let card = null;
    let currentLocation = null;
    
    // Check bouquet
    const bouquetIndex = player.bouquet.findIndex(c => c.id === cardId);
    if (bouquetIndex !== -1) {
      card = player.bouquet[bouquetIndex];
      currentLocation = 'bouquet';
    }
    
    // Check keepsakes
    if (!card) {
      const keepsakeIndex = player.keepsakes.findIndex(c => c.id === cardId);
      if (keepsakeIndex !== -1) {
        card = player.keepsakes[keepsakeIndex];
        currentLocation = 'keepsakes';
      }
    }
    
    if (!card || currentLocation === location) return false;
    
    // Move the card
    return player.moveCard(cardId, currentLocation, location);
  }

  useCardAbility(playerId, cardId, targetCardId) {
    if (this.currentPhase !== 'scoring') return false;
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // Find the card with the ability
    const allCards = [...player.bouquet, ...player.keepsakes];
    const card = allCards.find(c => c.id === cardId);
    
    if (!card) return false;
    
    // For marigold, do not allow re-use if already used
    if (card.id === 'marigold' && card.abilityUsed) return false;
    
    // Implement card abilities
    switch (card.id) {
      case 'pink-larkspur':
        // Allow player to draw 2 cards and replace one of their cards
        if (this.deck.length >= 2) {
          const drawnCards = [this.deck.pop(), this.deck.pop()];
          
          // Find the target card to replace
          let targetCard = null;
          let targetLocation = null;
          
          for (const c of player.bouquet) {
            if (c.id === targetCardId) {
              targetCard = c;
              targetLocation = 'bouquet';
              break;
            }
          }
          
          if (!targetCard) {
            for (const c of player.keepsakes) {
              if (c.id === targetCardId) {
                targetCard = c;
                targetLocation = 'keepsakes';
                break;
              }
            }
          }
          
          if (targetCard && targetLocation) {
            // Remove the target card
            player.removeCard(targetCardId, targetLocation);
            
            // Add one of the drawn cards to the same location
            // (For simplicity, we'll use the first drawn card)
            player.addCard(drawnCards[0], targetLocation);
            
            // Put the second drawn card back in the deck
            this.deck.push(drawnCards[1]);
            this.shuffleDeck();
            
            return true;
          }
        }
        break;
        
      case 'snapdragon':
        // Allow player to move up to 2 cards between bouquet and keepsakes
        if (targetCardId) {
          // Find the target card
          let targetCard = null;
          let targetLocation = null;
          
          for (const c of player.bouquet) {
            if (c.id === targetCardId) {
              targetCard = c;
              targetLocation = 'bouquet';
              break;
            }
          }
          
          if (!targetCard) {
            for (const c of player.keepsakes) {
              if (c.id === targetCardId) {
                targetCard = c;
                targetLocation = 'keepsakes';
                break;
              }
            }
          }
          
          if (targetCard && targetLocation) {
            // Move the card to the opposite location
            const newLocation = targetLocation === 'bouquet' ? 'keepsakes' : 'bouquet';
            return player.moveCard(targetCardId, targetLocation, newLocation);
          }
        }
        break;
        
      case 'marigold':
        // Player must discard one of their other cards
        if (targetCardId && targetCardId !== 'marigold') {
          // Find the target card
          let targetLocation = null;
          
          if (player.bouquet.some(c => c.id === targetCardId)) {
            targetLocation = 'bouquet';
          } else if (player.keepsakes.some(c => c.id === targetCardId)) {
            targetLocation = 'keepsakes';
          }
          
          if (targetLocation) {
            // Remove the card
            player.removeCard(targetCardId, targetLocation);
            // Mark marigold ability as used
            card.abilityUsed = true;
            return true;
          }
        }
        break;
        
      // Other card abilities can be added here
    }
    
    return false;
  }

  setPhase(phase) {
    this.currentPhase = phase;
  }

  playerDoneScoring(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      // Check if player has any marigold card whose ability has not been used
      const hasUnusedMarigold = [...player.bouquet, ...player.keepsakes].some(
        card => card.id === 'marigold' && !card.abilityUsed
      );
      if (hasUnusedMarigold) return false;
      player.doneScoring = true;
      return true;
    }
    return false;
  }

  allPlayersDoneScoring() {
    return this.players.every(p => p.doneScoring);
  }

  finalizeScoring() {
    // Before scoring, reveal all keepsake cards
    this.players.forEach(player => {
      player.keepsakes.forEach(card => {
        card.faceUp = true;
      });
    });
    
    // Calculate final scores for all players
    for (const player of this.players) {
      player.calculateScore();
    }
  }

  getGameState() {
    // Determine if we're in scoring phase to show keepsake cards
    const revealKeepsakes = this.currentPhase === 'scoring' || this.currentPhase === 'gameOver';
    
    return {
      roomCode: this.roomCode,
      phase: this.currentPhase,
      round: this.round,
      turnCount: this.turnCount,
      currentPlayerId: this.getCurrentPlayerId(),
      receivingPlayerId: this.getReceivingPlayerId(),
      activeCards: this.activeCards,
      players: this.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        bouquet: p.bouquet,
        keepsakes: p.keepsakes.map(c => ({ 
          ...c, 
          // Only hide other players' keepsakes during gameplay
          // Players can see their own keepsakes at all times
          faceUp: revealKeepsakes || c.owner === p.id
        })),
        score: p.score,
        doneScoring: p.doneScoring
      })),
      deckSize: this.deck.length
    };
  }
}

module.exports = { Game, Card, Player };