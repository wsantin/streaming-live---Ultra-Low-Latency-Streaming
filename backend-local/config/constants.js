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
  
  // LiveKit Configuration - URL dinámico basado en entorno
  LIVEKIT: {
    HOST: process.env.LIVEKIT_HOST || (process.env.NODE_ENV === 'production' ? 
      // En producción, intentar usar variables de entorno de túnel
      'wss://9c3d2ddd0b47.ngrok-free.app' : 
      // En desarrollo, usar localhost
      'ws://localhost:7880'),
    API_KEY: process.env.LIVEKIT_API_KEY || 'devkey1000',
    SECRET: process.env.LIVEKIT_API_SECRET || 'ultralowlatency2025secretkeyforlivekitsfuserver'
  }
};

// CORS Configuration - Dinámico basado en SERVER_HOST
const buildOrigins = () => {
  const serverHost = process.env.SERVER_HOST || 'localhost';
  const origins = [
    // Local development ports
    'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5001',
    // Production ports  
    'http://localhost:4000', 'http://localhost:4001',
    // IP local detectada dinámicamente - development
    `http://${serverHost}:3000`, `http://${serverHost}:3001`, `http://${serverHost}:3002`, `http://${serverHost}:5001`,
    // IP local detectada dinámicamente - production
    `http://${serverHost}:4000`, `http://${serverHost}:4001`,
    // Patrones de red local (cualquier IP 192.168.x.x)
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
    // Cloudflare tunnels (production)
    /^https:\/\/.*\.trycloudflare\.com$/
  ];
  console.log('🌐 CORS Origins configurados para:', serverHost);
  return origins;
};

const CORS_CONFIG = {
  origin: buildOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Stream-Mode'],
  credentials: true
};

// Socket.IO Configuration - También dinámico
const SOCKET_CONFIG = {
  cors: {
    origin: buildOrigins(), // Reutilizar la misma función
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