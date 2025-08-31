/**
 * Backend Configuration Constants
 * Professional streaming server configuration
 */

// Load environment variables with fallbacks
const SERVER_CONFIG = {
  // Server settings
  PORT: parseInt(process.env.PORT) || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVER_HOST: process.env.SERVER_HOST || 'localhost',
  
  // Redis configuration
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT) || 6379,
    PASSWORD: process.env.REDIS_PASSWORD || null
  },
  
  // LiveKit VPS configuration
  LIVEKIT: {
    HOST: process.env.LIVEKIT_HOST || 'wss://5.78.143.204',
    API_KEY: process.env.LIVEKIT_API_KEY || 'APIwTqW8EBDZ3nk',
    SECRET: process.env.LIVEKIT_API_SECRET || '4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM'
  },

  // TURN server configuration
  TURN: {
    HOST: process.env.TURN_HOST || '5.78.143.204',
    PORT: parseInt(process.env.TURN_PORT) || 3478,
    USERNAME: process.env.TURN_USERNAME || 'livekit',
    SECRET: process.env.TURN_SECRET || 'TurnServer2025SecretKey789'
  }
};

// Build CORS origins dynamically
const buildCorsOrigins = () => {
  const serverHost = SERVER_CONFIG.SERVER_HOST;
  const isDev = SERVER_CONFIG.NODE_ENV === 'development';
  
  const origins = [
    // Local development
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:3002',
    'http://localhost:5001',
    
    // Production ports
    'http://localhost:4000',
    'http://localhost:4001',
    
    // Dynamic host (detected IP)
    `http://${serverHost}:3000`,
    `http://${serverHost}:3001`,
    `http://${serverHost}:5001`,
    `http://${serverHost}:4000`,
    `http://${serverHost}:4001`
  ];

  // Add pattern-based origins
  const patterns = [
    // Local network IPs
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/,
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/,
    /^https?:\/\/172\.1[6-9]\.\d{1,3}\.\d{1,3}:\d+$/,
    /^https?:\/\/172\.2[0-9]\.\d{1,3}\.\d{1,3}:\d+$/,
    /^https?:\/\/172\.3[0-1]\.\d{1,3}\.\d{1,3}:\d+$/
  ];

  // Production tunnel patterns
  if (!isDev) {
    patterns.push(
      /^https:\/\/.*\.trycloudflare\.com$/,
      /^https:\/\/.*\.ngrok\.io$/,
      /^https:\/\/.*\.ngrok-free\.app$/
    );
  }

  console.log(`🌐 CORS configured for host: ${serverHost} (${SERVER_CONFIG.NODE_ENV})`);
  return [...origins, ...patterns];
};

// CORS configuration
const CORS_CONFIG = {
  origin: buildCorsOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'X-Stream-Mode',
    'X-API-Key'
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Socket.IO configuration
const SOCKET_CONFIG = {
  cors: {
    origin: buildCorsOrigins(),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8, // 100MB
  connectTimeout: 20000
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
};

// Security configuration
const SECURITY_CONFIG = {
  // JWT settings
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  
  // API key validation
  API_KEY_HEADER: 'X-API-Key',
  
  // SSL settings
  SSL_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
};

// Validation helpers
const validateConfig = () => {
  const requiredEnvVars = [
    'LIVEKIT_HOST',
    'LIVEKIT_API_KEY', 
    'LIVEKIT_API_SECRET'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`⚠️ Missing environment variables: ${missing.join(', ')}`);
    console.warn('Using default values - not recommended for production');
  }

  // Validate LiveKit configuration
  if (!SERVER_CONFIG.LIVEKIT.HOST.startsWith('ws')) {
    throw new Error('LIVEKIT_HOST must be a WebSocket URL (ws:// or wss://)');
  }

  console.log('✅ Configuration validated');
};

// Run validation on import
validateConfig();

module.exports = {
  SERVER_CONFIG,
  CORS_CONFIG,
  SOCKET_CONFIG,
  RATE_LIMIT_CONFIG,
  SECURITY_CONFIG,
  validateConfig
};