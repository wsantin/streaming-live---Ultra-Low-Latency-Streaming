// Frontend Admin Configuration Constants
// ========================================

// Server Configuration
const SERVER_CONFIG = {
  // Backend API Server - MediaMTX + SRS Architecture
  BACKEND: {
    HOST: 'localhost',
    PORT: 5000,
    PROTOCOL: 'http'
  },
  
  // WebSocket Server
  WEBSOCKET: {
    HOST: 'localhost',
    PORT: 5000,
    PROTOCOL: 'ws'
  },
  
};

// Constructed URLs
export const API_URL = `${SERVER_CONFIG.BACKEND.PROTOCOL}://${SERVER_CONFIG.BACKEND.HOST}:${SERVER_CONFIG.BACKEND.PORT}`;
export const WS_URL = `${SERVER_CONFIG.WEBSOCKET.PROTOCOL}://${SERVER_CONFIG.WEBSOCKET.HOST}:${SERVER_CONFIG.WEBSOCKET.PORT}`;


// API Endpoints - WebRTC Only
export const API_ENDPOINTS = {
  // WebRTC Stats & Health
  WEBRTC_STATS: '/api/webrtc/stats',
  HEALTH: '/health'
};


// UI Configuration
export const UI_CONFIG = {
  TOAST_DURATION: 3000,
  STATS_UPDATE_INTERVAL: 2000,
  CONNECTION_TIMEOUT: 5000
};

export default {
  SERVER_CONFIG,
  API_URL,
  WS_URL,
  API_ENDPOINTS,
  UI_CONFIG
};