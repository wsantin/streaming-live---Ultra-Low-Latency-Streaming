// Frontend Admin Configuration Constants
// ========================================

// Constructed URLs
export const API_URL = import.meta.env.VITE_API_URL
console.log("API_URL: ",API_URL)
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
  CONNECTION_TIMEOUT: 5001
};

export default {
  API_URL,
  API_ENDPOINTS,
  UI_CONFIG
};