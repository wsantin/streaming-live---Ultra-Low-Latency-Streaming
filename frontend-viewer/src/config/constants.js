// Frontend Viewer Configuration Constants
// ========================================

// Server Configuration
export const API_URL = import.meta.env.VITE_API_URL

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
  API_URL,
  API_ENDPOINTS,
  UI_CONFIG,
  STREAM_STATES
};