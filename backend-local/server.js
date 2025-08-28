// Load environment-specific .env file based on NODE_ENV FIRST
const getEnvFile = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`🔧 Loading environment: ${nodeEnv}`);
  
  switch (nodeEnv) {
    case 'prod':
    case 'production':
      return '.env.production';
    case 'local':
      return '.env.development';
    case 'development':
    default:
      return '.env.development';
  }
};

const envFile = getEnvFile();
console.log(`📄 Loading env file: ${envFile}`);
require('dotenv').config({ path: envFile });

// Now import dependencies that rely on environment variables
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
// WebRTC P2P removed - using LiveKit SFU only
const LiveKitManager = require('./livekit-integration');
const { 
  SERVER_CONFIG, 
  CORS_CONFIG, 
  SOCKET_CONFIG 
} = require('./config/constants');

console.log(`🔗 LiveKit URL configurada: ${SERVER_CONFIG.LIVEKIT.HOST}`);

const app = express();
const server = http.createServer(app);


// Redis client - conectar a Docker
const redisClient = redis.createClient({
  socket: {
    host: SERVER_CONFIG.REDIS.HOST,
    port: SERVER_CONFIG.REDIS.PORT
  }
});

// Connect to Redis
redisClient.connect().catch(err => {
  console.log('⚠️ Redis connection failed. Using fallback mode:', err.message);
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

// Test token generation endpoint
app.post('/', async (req, res) => {
  try {
    const { action, roomName, participantName, isPublisher } = req.body;
    
    if (action === 'generate-token') {
      const token = await liveKitManager.generateAccessToken(
        roomName, 
        participantName, 
        isPublisher
      );
      
      res.json({
        success: true,
        token,
        livekitUrl: SERVER_CONFIG.LIVEKIT.HOST,
        roomName,
        participantName
      });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('❌ Error generating test token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint with LiveKit integration
app.get('/health', async (req, res) => {
  const livekitHealth = await liveKitManager.healthCheck();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      redis: redisClient.isOpen ? 'connected' : 'disconnected',
      livekit_sfu: livekitHealth.status,
      livekit_server: livekitHealth.server
    }
  });
});

// Endpoint para obtener IP local
app.get('/api/network/local-ip', (req, res) => {
  res.json({
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

// Initialize LiveKit Manager for SFU scaling
const liveKitManager = new LiveKitManager();

// Simplified socket handling for LiveKit SFU only

// Function removed - using LiveKit SFU only, no legacy streaming URLs needed

// ==============================================
// NUEVO PROTOCOLO DE COMUNICACIÓN LIMPIO
// ==============================================

// Estado global del sistema
const globalState = {
  activeStreams: new Map(), // roomName -> streamData
  connectedViewers: new Map(), // socketId -> viewerData
  connectedAdmins: new Map()  // socketId -> adminData
};

// Socket.IO connection handling - REESTRUCTURADO
io.on('connection', (socket) => {
  console.log(`🔗 Cliente conectado: ${socket.id}`);
  
  // 🎬 EVENTOS DE ADMIN (STREAMER)
  socket.on('stream:start', async (data) => {
    console.log(`🚀 [${socket.id}] Iniciando stream:`, data);
    try {
      const { roomName, streamerName } = data;
      
      // Validar que no exista la sala
      if (globalState.activeStreams.has(roomName)) {
        socket.emit('stream:error', {
          success: false,
          error: 'Sala ya existe',
          code: 'ROOM_EXISTS'
        });
        return;
      }
      
      // Crear sala en LiveKit
      await liveKitManager.createOrGetRoom(roomName, 1000);
      
      // Generar token para streamer
      const token = await liveKitManager.generateAccessToken(roomName, streamerName, true);
      
      // Guardar en estado global
      const streamData = {
        roomName,
        streamerName,
        streamerId: socket.id,
        startedAt: new Date().toISOString(),
        viewers: 0,
        isActive: true
      };
      globalState.activeStreams.set(roomName, streamData);
      globalState.connectedAdmins.set(socket.id, { roomName, streamerName });
      
      // Responder al admin
      socket.emit('stream:started', {
        success: true,
        roomName,
        livekitToken: token,
        livekitUrl: SERVER_CONFIG.LIVEKIT.HOST
      });
      
      // Broadcast a todos los clientes
      io.emit('rooms:update', {
        rooms: Array.from(globalState.activeStreams.values()),
        total: globalState.activeStreams.size
      });
      
      console.log(`✅ Stream iniciado: ${roomName} por ${streamerName}`);
      
    } catch (error) {
      console.error(`❌ Error iniciando stream:`, error);
      
      // Determinar tipo de error y código apropiado
      let errorCode = 'LIVEKIT_ERROR';
      let userFriendlyMessage = error.message;
      
      if (error.message.includes('LiveKit server not reachable')) {
        errorCode = 'LIVEKIT_UNAVAILABLE';
        userFriendlyMessage = 'El servidor LiveKit no está disponible. Asegúrate de que el sistema esté iniciado correctamente.';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorCode = 'CONNECTION_REFUSED';
        userFriendlyMessage = 'No se puede conectar al servidor LiveKit. Verifica que esté ejecutándose.';
      }
      
      socket.emit('stream:error', {
        success: false,
        error: userFriendlyMessage,
        code: errorCode,
        technical: error.message
      });
    }
  });
  
  socket.on('stream:stop', async (data) => {
    console.log(`🛑 [${socket.id}] Deteniendo stream:`, data);
    try {
      const { roomName } = data;
      
      if (!globalState.activeStreams.has(roomName)) {
        socket.emit('stream:error', {
          success: false,
          error: 'Sala no encontrada',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }
      
      // Eliminar de LiveKit (opcional, se auto-limpia)
      // await liveKitManager.deleteRoom(roomName);
      
      // Eliminar del estado global
      globalState.activeStreams.delete(roomName);
      globalState.connectedAdmins.delete(socket.id);
      
      // Responder al admin
      socket.emit('stream:stopped', {
        success: true,
        roomName
      });
      
      // Broadcast actualización
      io.emit('rooms:update', {
        rooms: Array.from(globalState.activeStreams.values()),
        total: globalState.activeStreams.size
      });
      
      console.log(`✅ Stream detenido: ${roomName}`);
      
    } catch (error) {
      console.error(`❌ Error deteniendo stream:`, error);
      socket.emit('stream:error', {
        success: false,
        error: error.message,
        code: 'LIVEKIT_ERROR'
      });
    }
  });
  
  socket.on('stream:get-status', () => {
    const adminData = globalState.connectedAdmins.get(socket.id);
    if (adminData && globalState.activeStreams.has(adminData.roomName)) {
      const streamData = globalState.activeStreams.get(adminData.roomName);
      socket.emit('stream:status', {
        isStreaming: true,
        ...streamData,
        duration: Date.now() - new Date(streamData.startedAt).getTime()
      });
    } else {
      socket.emit('stream:status', {
        isStreaming: false,
        roomName: null,
        viewers: 0,
        duration: 0
      });
    }
  });
  
  // 👁️ EVENTOS DE VIEWER
  socket.on('rooms:list', () => {
    console.log(`📋 [${socket.id}] Solicitando lista de salas`);
    socket.emit('rooms:update', {
      rooms: Array.from(globalState.activeStreams.values()),
      total: globalState.activeStreams.size
    });
  });
  
  socket.on('room:join', async (data) => {
    console.log(`👁️ [${socket.id}] Uniéndose a sala:`, data);
    try {
      const { roomName, viewerName } = data;
      
      if (!globalState.activeStreams.has(roomName)) {
        socket.emit('room:error', {
          success: false,
          error: 'Sala no encontrada',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }
      
      // Generar token para viewer
      const token = await liveKitManager.generateAccessToken(roomName, viewerName, false);
      
      // Guardar viewer
      const viewerData = { roomName, viewerName, joinedAt: new Date().toISOString() };
      globalState.connectedViewers.set(socket.id, viewerData);
      
      // Incrementar contador
      const streamData = globalState.activeStreams.get(roomName);
      streamData.viewers++;
      
      // Responder al viewer
      const streamInfo = globalState.activeStreams.get(roomName);
      socket.emit('room:joined', {
        success: true,
        roomName,
        livekitToken: token,
        livekitUrl: SERVER_CONFIG.LIVEKIT.HOST,
        streamerName: streamInfo.streamerName
      });
      
      // Broadcast que se unió un viewer
      io.emit('room:viewer-joined', {
        roomName,
        viewerName,
        totalViewers: streamData.viewers
      });
      
      console.log(`✅ Viewer ${viewerName} se unió a ${roomName}`);
      
    } catch (error) {
      console.error(`❌ Error uniendo a sala:`, error);
      socket.emit('room:error', {
        success: false,
        error: error.message,
        code: 'LIVEKIT_ERROR'
      });
    }
  });
  
  socket.on('room:leave', (data) => {
    console.log(`🚪 [${socket.id}] Saliendo de sala:`, data);
    const viewerData = globalState.connectedViewers.get(socket.id);
    if (viewerData) {
      const { roomName, viewerName } = viewerData;
      
      // Decrementar contador
      if (globalState.activeStreams.has(roomName)) {
        const streamData = globalState.activeStreams.get(roomName);
        streamData.viewers = Math.max(0, streamData.viewers - 1);
        
        // Broadcast que salió un viewer
        io.emit('room:viewer-left', {
          roomName,
          viewerName,
          totalViewers: streamData.viewers
        });
      }
      
      globalState.connectedViewers.delete(socket.id);
      
      socket.emit('room:left', {
        success: true,
        roomName
      });
      
      console.log(`✅ Viewer ${viewerName} salió de ${roomName}`);
    }
  });
  
  // 🔌 DESCONEXIÓN
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Cliente desconectado: ${socket.id} - ${reason}`);
    
    // Limpiar admin si se desconecta
    const adminData = globalState.connectedAdmins.get(socket.id);
    if (adminData) {
      const { roomName } = adminData;
      globalState.activeStreams.delete(roomName);
      globalState.connectedAdmins.delete(socket.id);
      
      // Broadcast que se cerró el stream
      io.emit('rooms:update', {
        rooms: Array.from(globalState.activeStreams.values()),
        total: globalState.activeStreams.size
      });
      
      console.log(`🛑 Stream ${roomName} cerrado por desconexión del admin`);
    }
    
    // Limpiar viewer si se desconecta
    const viewerData = globalState.connectedViewers.get(socket.id);
    if (viewerData) {
      const { roomName, viewerName } = viewerData;
      
      // Decrementar contador
      if (globalState.activeStreams.has(roomName)) {
        const streamData = globalState.activeStreams.get(roomName);
        streamData.viewers = Math.max(0, streamData.viewers - 1);
        
        // Broadcast que salió un viewer
        io.emit('room:viewer-left', {
          roomName,
          viewerName,
          totalViewers: streamData.viewers
        });
      }
      
      globalState.connectedViewers.delete(socket.id);
      console.log(`👋 Viewer ${viewerName} desconectado de ${roomName}`);
    }
  });
  
  console.log(`📊 Estado actual: ${globalState.activeStreams.size} streams, ${globalState.connectedViewers.size} viewers`);
});


// Enterprise HLS Streaming API

// LiveKit SFU routes only - P2P WebRTC removed


// Browser streaming endpoint - simplified
app.post('/api/stream/browser/start', async (req, res) => {
  try {
    const { streamKey = 'default-stream' } = req.body;
    
    if (streamingState.isLive) {
      return res.status(400).json({
        error: 'Stream already active',
        streamId: streamingState.streamId
      });
    }

    const streamId = uuidv4();
    
    streamingState = {
      isLive: true,
      startTime: new Date(),
      viewers: 0,
      streamId
    };

    // Emit stream started event
    io.emit('stream:started', {
      streamId,
      streamKey
    });

    console.log(`🚀 Browser stream started: ${streamId} (${streamKey})`);

    res.json({
      success: true,
      streamId: streamId,
      streamKey,
      message: 'Stream iniciado correctamente - Using LiveKit SFU'
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
    livekitUrl: SERVER_CONFIG.LIVEKIT.HOST
  });
});

// ===== LiveKit SFU API Endpoints =====

// Generate LiveKit access token
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { roomName, participantName, isPublisher = false, canPublish = false } = req.body;
    const actualIsPublisher = isPublisher || canPublish;
    
    if (!roomName || !participantName) {
      return res.status(400).json({
        error: 'roomName and participantName are required'
      });
    }

    const token = await liveKitManager.generateAccessToken(roomName, participantName, actualIsPublisher);
    
    res.json({
      success: true,
      token,
      roomName,
      participantName,
      isPublisher: actualIsPublisher,
      serverUrl: SERVER_CONFIG.LIVEKIT.HOST
    });

  } catch (error) {
    console.error('❌ Error generating LiveKit token:', error);
    res.status(500).json({
      error: 'Error generating access token',
      details: error.message
    });
  }
});

// Create or get LiveKit room
app.post('/api/livekit/rooms', async (req, res) => {
  try {
    const { roomName, maxParticipants = 1000 } = req.body;
    
    if (!roomName) {
      return res.status(400).json({
        error: 'roomName is required'
      });
    }

    const room = await liveKitManager.createOrGetRoom(roomName, maxParticipants);
    
    res.json({
      success: true,
      room: {
        name: room.name,
        creationTime: room.creationTime ? room.creationTime.toString() : null,
        maxParticipants: room.maxParticipants,
        numParticipants: room.numParticipants
      }
    });

  } catch (error) {
    console.error('❌ Error creating LiveKit room:', error);
    res.status(500).json({
      error: 'Error creating room',
      details: error.message
    });
  }
});

// Get LiveKit room statistics
app.get('/api/livekit/rooms/:roomName/stats', async (req, res) => {
  try {
    const { roomName } = req.params;
    const stats = await liveKitManager.getRoomStats(roomName);
    
    res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('❌ Error getting room stats:', error);
    res.status(500).json({
      error: 'Error getting room statistics',
      details: error.message
    });
  }
});

// List all active LiveKit rooms
app.get('/api/livekit/rooms', async (req, res) => {
  try {
    const rooms = await liveKitManager.listActiveRooms();
    
    res.json({
      success: true,
      totalRooms: rooms.length,
      rooms
    });

  } catch (error) {
    console.error('❌ Error listing rooms:', error);
    res.status(500).json({
      error: 'Error listing rooms',
      details: error.message
    });
  }
});

// Remove participant from LiveKit room
app.delete('/api/livekit/rooms/:roomName/participants/:participantId', async (req, res) => {
  try {
    const { roomName, participantId } = req.params;
    const success = await liveKitManager.removeParticipant(roomName, participantId);
    
    res.json({
      success,
      message: success ? 'Participant removed' : 'Failed to remove participant'
    });

  } catch (error) {
    console.error('❌ Error removing participant:', error);
    res.status(500).json({
      error: 'Error removing participant',
      details: error.message
    });
  }
});

// LiveKit health check
app.get('/api/livekit/health', async (req, res) => {
  try {
    const health = await liveKitManager.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Limpiar salas huérfanas (sin participantes activos)
app.delete('/api/livekit/rooms/cleanup', async (req, res) => {
  try {
    const result = await liveKitManager.cleanupEmptyRooms();
    
    res.json({
      success: true,
      message: 'Limpieza completada',
      roomsDeleted: result.deletedRooms,
      totalRoomsAfter: result.totalRoomsAfter
    });

  } catch (error) {
    console.error('❌ Error limpiando salas:', error);
    res.status(500).json({
      error: 'Error limpiando salas huérfanas',
      details: error.message
    });
  }
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
    LiveKit SFU: Active
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
});