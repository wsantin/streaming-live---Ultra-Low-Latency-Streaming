// Frontend Viewer Configuration Constants
// ========================================

// Server Configuration
const SERVER_CONFIG = {
  // Backend API Server - MediaMTX + SRS Architecture
  BACKEND: {
    HOST: '192.168.1.33',
    PORT: 5001,
    PROTOCOL: 'http'
  },
  
  // WebSocket Server (same as backend)
  WEBSOCKET: {
    HOST: '192.168.1.33',
    PORT: 5001,
    PROTOCOL: 'ws'
  },
  
};

// Constructed URLs
export const API_URL = `${SERVER_CONFIG.BACKEND.PROTOCOL}://${SERVER_CONFIG.BACKEND.HOST}:${SERVER_CONFIG.BACKEND.PORT}`;
export const WS_URL = API_URL; // Socket.io uses the same URL as the API


// API Endpoints - WebRTC Only
export const API_ENDPOINTS = {
  WEBRTC_STATS: '/api/webrtc/stats',
  HEALTH: '/health'
};


// UI Configuration
export const UI_CONFIG = {
  TOAST_DURATION: 3000,
  LATENCY_UPDATE_INTERVAL: 2000,
  RECONNECT_INTERVAL: 5001,
  MAX_RECONNECT_ATTEMPTS: 5
};

// Stream States
export const STREAM_STATES = {
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  LIVE: 'live',
  ERROR: 'error'
};

export default {
  SERVER_CONFIG,
  API_URL,
  WS_URL,
  API_ENDPOINTS,
  UI_CONFIG,
  STREAM_STATES
};