const { RoomServiceClient, AccessToken } = require('livekit-server-sdk');
const { SERVER_CONFIG } = require('./config/constants');
const LiveKitErrorHandler = require('./utils/errorHandler');

/**
 * LiveKit VPS Integration Manager
 * Handles all LiveKit server operations for streaming
 */
class LiveKitManager {
    constructor() {
        this.livekitHost = SERVER_CONFIG.LIVEKIT.HOST;
        this.apiKey = SERVER_CONFIG.LIVEKIT.API_KEY;
        this.apiSecret = SERVER_CONFIG.LIVEKIT.SECRET;
        
        // Initialize error handler and monitoring
        this.errorHandler = new LiveKitErrorHandler();
        
        // Configure SSL handling for VPS
        this._configureSSL();
        
        // Initialize room service client
        const httpUrl = this._getHttpUrl();
        this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
        
        // Active rooms cache
        this.activeRooms = new Map();
        
        console.log('🚀 LiveKit Manager initialized:', {
            host: this.livekitHost,
            apiKey: this.apiKey
        });
    }

    /**
     * Configure SSL handling based on environment
     * @private
     */
    _configureSSL() {
        const isVPS = this.livekitHost.includes('5.78.143.204');
        const isProd = process.env.NODE_ENV === 'production';
        
        if (isVPS || isProd) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            console.log('🔒 SSL verification disabled for VPS LiveKit');
        }
    }

    /**
     * Convert WebSocket URL to HTTP URL
     * @private
     * @returns {string} HTTP URL
     */
    _getHttpUrl() {
        return this.livekitHost.replace('ws://', 'http://').replace('wss://', 'https://');
    }

    /**
     * Generate access token for participant
     * @param {string} roomName - Room name
     * @param {string} participantName - Participant identity
     * @param {boolean} isPublisher - Can publish streams
     * @param {number} ttlMinutes - Token TTL in minutes
     * @returns {Promise<string>} JWT token
     */
    async generateAccessToken(roomName, participantName, isPublisher = true, ttlMinutes = 30, clientIP = null) {
        try {
            // Check rate limiting
            if (clientIP) {
                const rateLimitCheck = this.errorHandler.checkRateLimit('token_generation', clientIP);
                if (!rateLimitCheck.allowed) {
                    throw new Error(rateLimitCheck.message);
                }
            }

            const at = new AccessToken(this.apiKey, this.apiSecret, {
                identity: participantName,
                ttl: `${ttlMinutes}m`
            });

            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: isPublisher,
                canSubscribe: true,
                canUpdateMetadata: true
            });

            const token = at.toJwt();
            
            console.log('🎫 Access token generated:', {
                room: roomName,
                participant: participantName,
                publisher: isPublisher,
                ttl: `${ttlMinutes}m`
            });
            
            return token;
        } catch (error) {
            const errorResponse = this.errorHandler.handleLiveKitError(error, 'token_generation', {
                roomName,
                participantName,
                isPublisher
            });
            throw new Error(errorResponse.message);
        }
    }

    /**
     * Create or get existing room
     * @param {string} roomName - Room name
     * @param {number} maxParticipants - Maximum participants
     * @returns {Promise<Object>} Room object
     */
    async createOrGetRoom(roomName, maxParticipants = 1000, clientIP = null) {
        try {
            // Validate room creation limits
            const validation = this.errorHandler.validateRoomCreation(roomName, maxParticipants);
            if (!validation.allowed) {
                throw new Error(validation.message);
            }

            // Check rate limiting
            if (clientIP) {
                const rateLimitCheck = this.errorHandler.checkRateLimit('room_creation', clientIP);
                if (!rateLimitCheck.allowed) {
                    throw new Error(rateLimitCheck.message);
                }
            }

            // Check cache first
            let room = this.activeRooms.get(roomName);
            
            if (!room) {
                // Create new room with validated parameters
                room = await this.roomService.createRoom({
                    name: roomName,
                    emptyTimeout: 300, // 5 minutes
                    departureTimeout: 60, // 1 minute
                    maxParticipants: Math.min(maxParticipants, this.errorHandler.limits.maxParticipantsPerRoom),
                    metadata: JSON.stringify({
                        created: new Date().toISOString(),
                        type: 'streaming',
                        vps: true,
                        clientIP: clientIP
                    })
                });
                
                this.activeRooms.set(roomName, room);
                
                // Track room in error handler
                this.errorHandler.trackRoomCreation(roomName, {
                    maxParticipants: room.maxParticipants,
                    createdBy: clientIP
                });
                
                console.log('🏠 Room created:', {
                    name: roomName,
                    maxParticipants: room.maxParticipants,
                    totalRooms: this.activeRooms.size
                });
            }
            
            return room;
        } catch (error) {
            // Handle specific LiveKit errors
            const errorResponse = this.errorHandler.handleLiveKitError(error, 'room_creation', {
                roomName,
                maxParticipants,
                clientIP
            });
            
            // Try to get existing room for specific errors
            if (errorResponse.error === 'ROOM_ALREADY_EXISTS') {
                try {
                    const existingRooms = await this.roomService.listRooms([roomName]);
                    if (existingRooms.length > 0) {
                        const existingRoom = existingRooms[0];
                        this.activeRooms.set(roomName, existingRoom);
                        console.log('📍 Using existing room:', roomName);
                        return existingRoom;
                    }
                } catch (listError) {
                    console.error('❌ Failed to list existing rooms:', listError.message);
                }
            }
            
            throw new Error(errorResponse.message);
        }
    }

    /**
     * Get room statistics
     * @param {string} roomName - Room name
     * @returns {Promise<Object>} Room stats
     */
    async getRoomStats(roomName) {
        try {
            const rooms = await this.roomService.listRooms([roomName]);
            
            if (rooms.length === 0) {
                return { exists: false };
            }
            
            const participants = await this.roomService.listParticipants(roomName);
            
            // Update participant count in error handler
            this.errorHandler.updateRoomParticipants(roomName, participants.length);
            
            const roomStats = {
                exists: true,
                room: rooms[0],
                participantCount: participants.length,
                participants: participants.map(p => ({
                    identity: p.identity,
                    state: p.state,
                    joinedAt: p.joinedAt,
                    tracks: p.tracks?.length || 0
                })),
                limits: {
                    maxParticipants: rooms[0].maxParticipants,
                    remaining: rooms[0].maxParticipants - participants.length
                },
                warnings: []
            };

            // Add warnings for high usage
            if (participants.length > rooms[0].maxParticipants * 0.8) {
                roomStats.warnings.push('High participant usage');
            }

            return roomStats;
        } catch (error) {
            const errorResponse = this.errorHandler.handleLiveKitError(error, 'get_room_stats', { roomName });
            return { exists: false, error: errorResponse.message };
        }
    }

    /**
     * List all active rooms
     * @returns {Promise<Array>} Active rooms list
     */
    async listActiveRooms() {
        try {
            const rooms = await this.roomService.listRooms();
            
            const roomsWithStats = await Promise.all(
                rooms.map(async (room) => {
                    const participants = await this.roomService.listParticipants(room.name);
                    return {
                        name: room.name,
                        creationTime: room.creationTime?.toString() || null,
                        numParticipants: room.numParticipants || 0,
                        maxParticipants: room.maxParticipants || 1000,
                        participants: participants.length,
                        metadata: this._parseMetadata(room.metadata)
                    };
                })
            );
            
            return roomsWithStats;
        } catch (error) {
            console.error('❌ Error listing rooms:', error.message);
            return [];
        }
    }

    /**
     * Health check for LiveKit service
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            await this.roomService.listRooms();
            const systemStatus = this.errorHandler.getSystemStatus();
            
            return {
                status: systemStatus.healthy ? 'healthy' : 'degraded',
                server: this.livekitHost,
                timestamp: new Date().toISOString(),
                metrics: systemStatus.metrics,
                limits: systemStatus.limits,
                recentErrors: systemStatus.recentErrors.length,
                uptime: Math.round(systemStatus.uptime)
            };
        } catch (error) {
            const errorResponse = this.errorHandler.handleLiveKitError(error, 'health_check');
            return {
                status: 'unhealthy',
                server: this.livekitHost,
                error: errorResponse.message,
                timestamp: new Date().toISOString(),
                retryable: errorResponse.retryable
            };
        }
    }

    /**
     * Remove participant from room
     * @param {string} roomName - Room name
     * @param {string} participantIdentity - Participant identity
     * @returns {Promise<boolean>} Success status
     */
    async removeParticipant(roomName, participantIdentity) {
        try {
            await this.roomService.removeParticipant(roomName, participantIdentity);
            console.log('👋 Participant removed:', { room: roomName, participant: participantIdentity });
            return true;
        } catch (error) {
            console.error('❌ Error removing participant:', error.message);
            return false;
        }
    }

    /**
     * Delete room
     * @param {string} roomName - Room name
     * @returns {Promise<boolean>} Success status
     */
    async deleteRoom(roomName) {
        try {
            await this.roomService.deleteRoom(roomName);
            this.activeRooms.delete(roomName);
            
            // Untrack room from error handler
            this.errorHandler.untrackRoom(roomName);
            
            console.log('🗑️ Room deleted:', roomName);
            return true;
        } catch (error) {
            const errorResponse = this.errorHandler.handleLiveKitError(error, 'delete_room', { roomName });
            console.error('❌ Error deleting room:', errorResponse.message);
            return false;
        }
    }

    /**
     * Parse room metadata safely
     * @private
     * @param {string} metadata - JSON metadata string
     * @returns {Object} Parsed metadata
     */
    _parseMetadata(metadata) {
        try {
            return metadata ? JSON.parse(metadata) : {};
        } catch {
            return {};
        }
    }
}

module.exports = LiveKitManager;