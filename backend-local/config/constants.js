// Backend Configuration Constants
// ================================

// Server Configuration
const SERVER_CONFIG = {
  PORT: process.env.PORT || 5005,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Redis Configuration
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: process.env.REDIS_PORT || 6379
  },
  
};




// CORS Configuration
const CORS_CONFIG = {
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Stream-Mode'],
  credentials: true
};

// Socket.IO Configuration
const SOCKET_CONFIG = {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', '*'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  },
  transports: ['websocket', 'polling']
};


module.exports = {
  SERVER_CONFIG,
  CORS_CONFIG,
  SOCKET_CONFIG
};