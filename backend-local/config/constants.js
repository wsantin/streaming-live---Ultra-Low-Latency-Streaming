// Backend Configuration Constants
// ================================

// Server Configuration
const SERVER_CONFIG = {
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Redis Configuration
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: process.env.REDIS_PORT || 6379
  },
  
};

// CORS Configuration
const CORS_CONFIG = {
  origin: [
    // Local development
    'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5001',
    'http://192.168.1.37:3000', 'http://192.168.1.37:3001', 'http://192.168.1.37:3002', 'http://192.168.1.37:5001',
    'http://192.168.1.37:3006', 'http://192.168.1.37:3007', 'http://192.168.1.37:3008', 'http://192.168.1.37:3009',
    /^http:\/\/192\.168\.1\.\d+:\d+$/,
    // Cloudflare tunnels (production)
    /^https:\/\/.*\.trycloudflare\.com$/
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Stream-Mode'],
  credentials: true
};

// Socket.IO Configuration
const SOCKET_CONFIG = {
  cors: {
    origin: [
      // Local development
      'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5001',
      'http://192.168.1.37:3000', 'http://192.168.1.37:3001', 'http://192.168.1.37:3002', 'http://192.168.1.37:5001',
      /^http:\/\/192\.168\.1\.\d+:\d+$/,
      // Cloudflare tunnels (production)
      /^https:\/\/.*\.trycloudflare\.com$/
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
};


module.exports = {
  SERVER_CONFIG,
  CORS_CONFIG,
  SOCKET_CONFIG
};