const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const redis = require('redis');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const WebRTCSignalingServer = require('./webrtc-signaling');
const { 
  SERVER_CONFIG, 
  CORS_CONFIG, 
  SOCKET_CONFIG 
} = require('./config/constants');

// Función para detectar IP local automáticamente
function detectLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Intentar encontrar IP de WiFi o Ethernet primero
  const preferredInterfaces = ['Wi-Fi', 'Ethernet', 'wlan0', 'eth0'];
  
  for (const interfaceName of preferredInterfaces) {
    if (interfaces[interfaceName]) {
      for (const iface of interfaces[interfaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`🌐 IP detectada en ${interfaceName}: ${iface.address}`);
          return iface.address;
        }
      }
    }
  }
  
  // Fallback: buscar cualquier interfaz IPv4 no internal
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`🌐 IP detectada en ${name}: ${iface.address}`);
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

const LOCAL_IP = detectLocalIP();

// Load environment-specific .env file based on NODE_ENV
const getEnvFile = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`🔧 Loading environment: ${nodeEnv}`);
  
  switch (nodeEnv) {
    case 'prod':
    case 'production':
      return '.env.production';
    case 'local':
      return '.env.local';
    case 'development':
    default:
      return '.env.local';
  }
};

const envFile = getEnvFile();
console.log(`📄 Loading env file: ${envFile}`);
require('dotenv').config({ path: envFile });

const app = express();
const server = http.createServer(app);


// Redis client - conectar a Docker
const redisClient = redis.createClient({
  host: SERVER_CONFIG.REDIS.HOST,
  port: SERVER_CONFIG.REDIS.PORT,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.log('⚠️ Redis server connection refused. Using in-memory storage.');
      return undefined; // Stop retrying
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis event handlers
redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redisClient.on('error', (err) => {
  console.log('⚠️ Redis Client Error - Using fallback storage:', err.message);
});

// Middleware
app.use(cors(CORS_CONFIG));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy for production
app.set('trust proxy', true);

// Basic rate limiting
const requests = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requests.has(ip)) {
    requests.set(ip, []);
  }
  
  const userRequests = requests.get(ip);
  const recentRequests = userRequests.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  recentRequests.push(now);
  requests.set(ip, recentRequests);
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      redis: redisClient.connected ? 'connected' : 'disconnected',
      webrtc: 'active',
      webrtc_signaling: 'active'
    }
  });
});

// Endpoint para obtener IP local para WebRTC
app.get('/api/network/local-ip', (req, res) => {
  res.json({
    localIP: LOCAL_IP,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic streaming state
let streamingState = {
  isLive: false,
  startTime: null,
  viewers: 0,
  streamId: null
};

const io = socketIO(server, SOCKET_CONFIG);

// Initialize WebRTC Signaling Server for Ultra-Low Latency Streaming
const webrtcSignaling = new WebRTCSignalingServer(io);

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  webrtcSignaling.cleanupInactiveSessions();
}, 5 * 60 * 1000);

// Función para obtener URLs según el entorno
function getStreamUrls() {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    return {
      rtmp: STREAMING_URLS.MEDIAMTX.RTMP,
      hls: STREAMING_URLS.MEDIAMTX.HLS,
      webrtc: STREAMING_URLS.MEDIAMTX.WEBRTC,
      srs: {
        rtmp: STREAMING_URLS.SRS.RTMP,
        hls: STREAMING_URLS.SRS.HLS,
        webrtc: STREAMING_URLS.SRS.WEBRTC,
        api: STREAMING_URLS.SRS.API
      }
    };
  } else {
    return {
      rtmp: process.env.PRODUCTION_RTMP_URL || STREAMING_URLS.MEDIAMTX.RTMP,
      hls: process.env.PRODUCTION_HLS_URL || STREAMING_URLS.MEDIAMTX.HLS,
      webrtc: process.env.PRODUCTION_WEBRTC_URL || STREAMING_URLS.MEDIAMTX.WEBRTC,
      srs: {
        rtmp: process.env.PRODUCTION_SRS_RTMP || STREAMING_URLS.SRS.RTMP,
        hls: process.env.PRODUCTION_SRS_HLS || STREAMING_URLS.SRS.HLS,
        webrtc: process.env.PRODUCTION_SRS_WEBRTC || STREAMING_URLS.SRS.WEBRTC,
        api: process.env.PRODUCTION_SRS_API || STREAMING_URLS.SRS.API
      }
    };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  // Send current streaming state
  socket.emit('stream:status', streamingState);
  
  // Handle viewer count
  socket.on('viewer:join', () => {
    streamingState.viewers++;
    io.emit('viewers:count', streamingState.viewers);
    console.log(`👥 Viewer joined. Total: ${streamingState.viewers}`);
  });
  
  socket.on('viewer:leave', () => {
    streamingState.viewers = Math.max(0, streamingState.viewers - 1);
    io.emit('viewers:count', streamingState.viewers);
    console.log(`👥 Viewer left. Total: ${streamingState.viewers}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    streamingState.viewers = Math.max(0, streamingState.viewers - 1);
    io.emit('viewers:count', streamingState.viewers);
  });
});

// Enterprise HLS Streaming API

// WebRTC Ultra-Low Latency API Routes
app.get('/api/webrtc/stats', (req, res) => {
  res.json(webrtcSignaling.getStats());
});

app.post('/api/webrtc/disconnect/:socketId', (req, res) => {
  const { socketId } = req.params;
  const success = webrtcSignaling.disconnectClient(socketId);
  res.json({ success, socketId });
});

app.post('/api/webrtc/broadcast', (req, res) => {
  const { event, data } = req.body;
  webrtcSignaling.broadcastToAll(event, data);
  res.json({ success: true, event, recipients: webrtcSignaling.getStats().totalConnections });
});


// Browser streaming endpoint - simplified
app.post('/api/stream/browser/start', async (req, res) => {
  try {
    const { streamKey = STREAM_DEFAULTS.KEY } = req.body;
    
    if (streamingState.isLive) {
      return res.status(400).json({
        error: 'Stream already active',
        streamId: streamingState.streamId
      });
    }

    const streamId = uuidv4();
    const urls = getStreamUrls();
    
    streamingState = {
      isLive: true,
      startTime: new Date(),
      viewers: 0,
      streamId
    };

    // Emit stream started event
    io.emit('stream:started', {
      streamId,
      streamKey,
      hlsUrl: `${urls.hls}/${streamKey}/index.m3u8`,
      rtmpUrl: `${urls.rtmp}/${streamKey}`,
      webrtcUrl: `${urls.webrtc}/${streamKey}`,
      srs: urls.srs
    });

    console.log(`🚀 Browser stream started: ${streamId} (${streamKey})`);

    res.json({
      success: true,
      streamId: streamId,
      rtmpUrl: `${urls.rtmp}/${streamKey}`,
      hlsUrl: `${urls.hls}/${streamKey}/index.m3u8`,
      webrtcUrl: `${urls.webrtc}/${streamKey}`,
      srs: urls.srs,
      streamKey,
      message: 'Stream iniciado correctamente'
    });

  } catch (error) {
    console.error('❌ Error starting browser stream:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// Browser streaming stop endpoint
app.post('/api/stream/browser/stop', (req, res) => {
  try {
    const { streamId } = req.body;
    
    if (!streamingState.isLive) {
      return res.status(400).json({ error: 'No active stream to stop' });
    }

    streamingState = {
      isLive: false,
      startTime: null,
      viewers: 0,
      streamId: null
    };

    // Emit stream stopped event
    io.emit('stream:stopped', { streamId });
    
    console.log(`🛑 Browser stream stopped: ${streamId}`);
    
    res.json({
      success: true,
      message: 'Stream detenido correctamente'
    });

  } catch (error) {
    console.error('❌ Error stopping browser stream:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// Get streaming status
app.get('/api/stream/status', (req, res) => {
  res.json({
    ...streamingState,
    uptime: streamingState.isLive ? Date.now() - streamingState.startTime : 0,
    urls: getStreamUrls()
  });
});

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, cleaning up...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, cleaning up...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
const PORT = process.env.PORT || 5001;
console.log(`🔌 Backend will start on PORT: ${PORT}`);

const environment = process.env.NODE_ENV || 'development';
const useDocker = process.env.USE_DOCKER === 'true';

console.log(`
    🚀 Professional Streaming Backend Server
    ==========================================
    Environment: ${environment}
    Port: ${PORT}
    WebRTC Signaling: Active
    Enterprise HLS: Active
    Ultra-Low Latency: 200-500ms
    ==========================================
  `);

if (useDocker) {
  console.log('🐳 Using Docker MediaMTX + SRS architecture');
} else {
  console.log('💻 Using local development configuration');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🎯 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://${LOCAL_IP}:${PORT}/health`);
  console.log(`⚡ WebRTC API: http://${LOCAL_IP}:${PORT}/api/webrtc/stats`);
  console.log(`📱 Local IP endpoint: http://${LOCAL_IP}:${PORT}/api/network/local-ip`);
  console.log(`📱 Mobile access: http://${LOCAL_IP}:${PORT}`);
});