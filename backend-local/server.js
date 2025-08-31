/**
 * Professional Streaming Backend Server
 * Ultra-low latency streaming with LiveKit VPS integration
 */

require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const LiveKitManager = require('./livekit-integration');
const { 
  SERVER_CONFIG, 
  CORS_CONFIG, 
  SOCKET_CONFIG 
} = require('./config/constants');

// Application setup
const app = express();
const server = http.createServer(app);

// LiveKit manager initialization
const liveKitManager = new LiveKitManager();

// Redis client setup
const redisClient = redis.createClient({
  socket: {
    host: SERVER_CONFIG.REDIS.HOST,
    port: SERVER_CONFIG.REDIS.PORT
  },
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.log('⚠️ Redis server refused connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      console.log('⚠️ Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis connection
redisClient.connect().catch(err => {
  console.log('⚠️ Redis connection failed. Using in-memory fallback:', err.message);
});

redisClient.on('connect', () => console.log('✅ Connected to Redis'));
redisClient.on('error', (err) => console.log('⚠️ Redis error:', err.message));

// Middleware
app.use(cors(CORS_CONFIG));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global state management
class GlobalState {
    constructor() {
        this.activeStreams = new Map();
        this.connectedAdmins = new Map();
        this.connectedViewers = new Map();
    }

    // Stream management
    addStream(streamId, streamData) {
        this.activeStreams.set(streamId, {
            ...streamData,
            timestamp: new Date().toISOString(),
            viewers: 0
        });
    }

    removeStream(streamId) {
        this.activeStreams.delete(streamId);
    }

    updateStreamViewers(streamId, viewerCount) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            stream.viewers = viewerCount;
            stream.lastUpdate = new Date().toISOString();
        }
    }

    getActiveStreams() {
        return Array.from(this.activeStreams.values());
    }

    // Connection management
    addConnection(type, socketId, data) {
        const connections = type === 'admin' ? this.connectedAdmins : this.connectedViewers;
        connections.set(socketId, {
            ...data,
            connectedAt: new Date().toISOString()
        });
    }

    removeConnection(type, socketId) {
        const connections = type === 'admin' ? this.connectedAdmins : this.connectedViewers;
        connections.delete(socketId);
    }

    getStats() {
        return {
            activeStreams: this.activeStreams.size,
            connectedAdmins: this.connectedAdmins.size,
            connectedViewers: this.connectedViewers.size,
            totalConnections: this.connectedAdmins.size + this.connectedViewers.size
        };
    }
}

const globalState = new GlobalState();

// Socket.IO setup
const io = socketIO(server, SOCKET_CONFIG);

// Socket.IO event handlers
io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log('🔗 Cliente conectado:', clientId);
    
    // Send current state
    const stats = globalState.getStats();
    socket.emit('stats:update', stats);
    console.log('📊 Estado actual:', `${stats.activeStreams} streams, ${stats.connectedViewers} viewers`);

    // Handle stream start (Admin)
    socket.on('stream:start', async (data) => {
        try {
            const { roomName, streamerName, maxParticipants = 100 } = data;
            const clientIP = socket.handshake.address;
            console.log('🚀 Stream starting:', { roomName, streamerName, client: clientId, ip: clientIP });

            // Create LiveKit room with limits
            const room = await liveKitManager.createOrGetRoom(roomName, maxParticipants, clientIP);
            
            // Generate tokens with rate limiting
            const adminToken = await liveKitManager.generateAccessToken(roomName, streamerName, true, 30, clientIP);
            
            // Add to global state
            globalState.addStream(roomName, {
                roomName,
                streamerName,
                adminSocketId: clientId
            });
            globalState.addConnection('admin', clientId, { roomName, streamerName });

            // Broadcast room creation
            socket.broadcast.emit('rooms:updated', globalState.getActiveStreams());

            // Send success response
            socket.emit('stream:started', {
                success: true,
                room,
                adminToken,
                roomName
            });

            console.log('✅ Stream started successfully:', roomName);
        } catch (error) {
            console.error('❌ Error starting stream:', error.message);
            socket.emit('stream:error', { error: error.message });
        }
    });

    // Handle room join (Viewer)  
    socket.on('room:join', async (data) => {
        try {
            const { roomName, viewerName } = data;
            const clientIP = socket.handshake.address;
            console.log('👁️ Viewer joining:', { roomName, viewerName, client: clientId, ip: clientIP });

            // Generate viewer token with rate limiting
            const viewerToken = await liveKitManager.generateAccessToken(roomName, viewerName, false, 30, clientIP);
            
            // Add to global state
            globalState.addConnection('viewer', clientId, { roomName, viewerName });
            
            // Update viewer count
            const currentViewers = Array.from(globalState.connectedViewers.values())
                .filter(v => v.roomName === roomName).length;
            globalState.updateStreamViewers(roomName, currentViewers);

            // Send success response
            socket.emit('room:joined', {
                success: true,
                viewerToken,
                roomName
            });

            // Broadcast updated stats
            io.emit('stats:update', globalState.getStats());
            
            console.log('✅ Viewer joined successfully:', roomName);
        } catch (error) {
            console.error('❌ Error joining room:', error.message);
            socket.emit('room:error', { error: error.message });
        }
    });

    // Handle stream stop
    socket.on('stream:stop', async (data) => {
        try {
            const { roomName } = data;
            console.log('🛑 Stream stopping:', { roomName, client: clientId });

            // Remove from global state
            globalState.removeStream(roomName);
            globalState.removeConnection('admin', clientId);

            // Broadcast room removal
            socket.broadcast.emit('rooms:updated', globalState.getActiveStreams());
            
            // Send success response
            socket.emit('stream:stopped', { success: true });
            
            console.log('✅ Stream stopped successfully:', roomName);
        } catch (error) {
            console.error('❌ Error stopping stream:', error.message);
            socket.emit('stream:error', { error: error.message });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('🔌 Cliente desconectado:', clientId);
        
        // Clean up connections
        const adminData = globalState.connectedAdmins.get(clientId);
        const viewerData = globalState.connectedViewers.get(clientId);
        
        if (adminData) {
            globalState.removeStream(adminData.roomName);
            globalState.removeConnection('admin', clientId);
            socket.broadcast.emit('rooms:updated', globalState.getActiveStreams());
            console.log('🎯 Admin disconnected, stream removed:', adminData.roomName);
        }
        
        if (viewerData) {
            globalState.removeConnection('viewer', clientId);
            const remainingViewers = Array.from(globalState.connectedViewers.values())
                .filter(v => v.roomName === viewerData.roomName).length;
            globalState.updateStreamViewers(viewerData.roomName, remainingViewers);
            console.log('👁️ Viewer disconnected from:', viewerData.roomName);
        }

        // Broadcast updated stats
        io.emit('stats:update', globalState.getStats());
    });

    // Handle rooms list request
    socket.on('rooms:list', () => {
        socket.emit('rooms:updated', globalState.getActiveStreams());
    });
});

// REST API Routes

// Health check
app.get('/health', async (req, res) => {
    const liveKitHealth = await liveKitManager.healthCheck();
    const redisHealth = redisClient.isOpen ? 'connected' : 'disconnected';
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
            redis: redisHealth,
            livekit_sfu: liveKitHealth.status,
            livekit_server: SERVER_CONFIG.LIVEKIT.HOST
        }
    });
});

// LiveKit API Routes

// Generate token
app.post('/api/livekit/token', async (req, res) => {
    try {
        const { roomName, identity, isPublisher = false } = req.body;
        const clientIP = req.ip;
        
        if (!roomName || !identity) {
            return res.status(400).json({ 
                error: 'roomName and identity are required',
                code: 'MISSING_PARAMETERS'
            });
        }

        const token = await liveKitManager.generateAccessToken(roomName, identity, isPublisher, 30, clientIP);
        res.json({ success: true, token });
    } catch (error) {
        console.error('❌ Error generating token:', error.message);
        
        // Handle rate limiting errors
        if (error.message.includes('Rate limit')) {
            return res.status(429).json({ 
                error: error.message,
                retryAfter: 60
            });
        }
        
        res.status(500).json({ error: error.message });
    }
});

// Create room
app.post('/api/livekit/rooms', async (req, res) => {
    try {
        const { roomName, maxParticipants = 100 } = req.body;
        const clientIP = req.ip;
        
        if (!roomName) {
            return res.status(400).json({ 
                error: 'roomName is required',
                code: 'MISSING_PARAMETERS'
            });
        }

        const room = await liveKitManager.createOrGetRoom(roomName, maxParticipants, clientIP);
        res.json({ success: true, room });
    } catch (error) {
        console.error('❌ Error creating room:', error.message);
        
        // Handle specific error types
        if (error.message.includes('limit')) {
            return res.status(429).json({ 
                error: error.message,
                code: 'LIMIT_EXCEEDED'
            });
        }
        
        if (error.message.includes('already exists')) {
            return res.status(409).json({ 
                error: error.message,
                code: 'ROOM_EXISTS'
            });
        }
        
        res.status(500).json({ 
            error: error.message,
            code: 'INTERNAL_ERROR'
        });
    }
});

// List rooms
app.get('/api/livekit/rooms', async (req, res) => {
    try {
        const rooms = await liveKitManager.listActiveRooms();
        res.json({ success: true, rooms });
    } catch (error) {
        console.error('❌ Error listing rooms:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Room stats
app.get('/api/livekit/rooms/:roomName/stats', async (req, res) => {
    try {
        const { roomName } = req.params;
        const stats = await liveKitManager.getRoomStats(roomName);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('❌ Error getting room stats:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// LiveKit health check
app.get('/api/livekit/health', async (req, res) => {
    try {
        const health = await liveKitManager.healthCheck();
        
        // Set appropriate HTTP status based on health
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 206 : 503;
        
        res.status(statusCode).json(health);
    } catch (error) {
        console.error('❌ LiveKit health check failed:', error.message);
        res.status(503).json({ 
            status: 'error', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// System status endpoint
app.get('/api/system/status', (req, res) => {
    try {
        const systemStatus = liveKitManager.errorHandler.getSystemStatus();
        res.json({
            ...systemStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get system status',
            message: error.message
        });
    }
});

// Error report endpoint
app.get('/api/system/errors', (req, res) => {
    try {
        const errorReport = liveKitManager.errorHandler.getErrorReport();
        res.json(errorReport);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get error report',
            message: error.message
        });
    }
});

// Network info
app.get('/api/network/local-ip', (req, res) => {
    res.json({
        detectedIP: process.env.SERVER_HOST || 'localhost',
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Server startup
const PORT = SERVER_CONFIG.PORT;
server.listen(PORT, () => {
    console.log(`
    🚀 Professional Streaming Backend Server
    ==========================================
    Environment: ${SERVER_CONFIG.NODE_ENV}
    Port: ${PORT}
    LiveKit VPS: ${SERVER_CONFIG.LIVEKIT.HOST}
    Redis: ${SERVER_CONFIG.REDIS.HOST}:${SERVER_CONFIG.REDIS.PORT}
    Ultra-Low Latency: 20-50ms
    ==========================================
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    
    server.close(() => {
        console.log('✅ HTTP server closed');
    });
    
    if (redisClient.isOpen) {
        await redisClient.quit();
        console.log('✅ Redis connection closed');
    }
    
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = { app, server };