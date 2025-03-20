// utils/roomCode.js
// Simple utility to generate random room codes
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

module.exports = { generateRoomCode };