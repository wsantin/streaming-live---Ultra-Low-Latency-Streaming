// Frontend Viewer Configuration Constants
// ========================================

// LiveKit VPS Configuration
export const LIVEKIT_URL = 'wss://5.78.143.204.sslip.io'
export const LIVEKIT_API_KEY = 'APIwTqW8EBDZ3nk'
export const LIVEKIT_API_SECRET = '4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM'

// TURN Server VPS Configuration
export const TURN_CONFIG = {
  host: '5.78.143.204',
  port: 3478,
  username: 'livekit',
  credential: 'TurnServer2025SecretKey789'
}

// URLs principales
export const API_URL = import.meta.env.VITE_API_URL

export default {
  API_URL,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  TURN_CONFIG
};