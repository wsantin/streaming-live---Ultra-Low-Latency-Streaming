/**
 * Advanced LiveKit Error Handler & Resource Monitor
 * Professional error handling with limits and monitoring
 */

class LiveKitErrorHandler {
    constructor() {
        // System limits configuration
        this.limits = {
            // Concurrent streaming limits
            maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
            maxParticipantsPerRoom: parseInt(process.env.MAX_PARTICIPANTS_PER_ROOM) || 100,
            maxTotalParticipants: parseInt(process.env.MAX_TOTAL_PARTICIPANTS) || 500,
            
            // Resource limits
            maxMemoryUsageMB: parseInt(process.env.MAX_MEMORY_MB) || 1024,
            maxCpuUsagePercent: parseInt(process.env.MAX_CPU_PERCENT) || 80,
            
            // Rate limits
            roomCreationPerMinute: parseInt(process.env.ROOM_CREATION_LIMIT) || 20,
            tokenGenerationPerMinute: parseInt(process.env.TOKEN_LIMIT) || 100,
            
            // Connection limits
            maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 5,
            connectionTimeoutMs: parseInt(process.env.CONNECTION_TIMEOUT) || 30000
        };

        // Tracking objects
        this.metrics = {
            activeStreams: new Map(),
            participantCount: 0,
            connectionsByIP: new Map(),
            rateLimits: new Map(),
            memoryUsage: [],
            cpuUsage: [],
            errors: []
        };

        // Start monitoring
        this.startMonitoring();
        
        console.log('🛡️ LiveKit Error Handler initialized with limits:', this.limits);
    }

    /**
     * Start system monitoring
     */
    startMonitoring() {
        // Memory and CPU monitoring every 30 seconds
        setInterval(() => {
            this.updateSystemMetrics();
        }, 30000);

        // Clean old metrics every 5 minutes
        setInterval(() => {
            this.cleanOldMetrics();
        }, 300000);

        // Rate limit cleanup every minute
        setInterval(() => {
            this.cleanRateLimits();
        }, 60000);
    }

    /**
     * Update system metrics
     */
    updateSystemMetrics() {
        const memUsage = process.memoryUsage();
        const memUsageMB = memUsage.heapUsed / 1024 / 1024;
        
        this.metrics.memoryUsage.push({
            timestamp: Date.now(),
            usage: memUsageMB,
            rss: memUsage.rss / 1024 / 1024,
            heapTotal: memUsage.heapTotal / 1024 / 1024
        });

        // Keep only last 20 readings (10 minutes)
        if (this.metrics.memoryUsage.length > 20) {
            this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-20);
        }

        // Check memory limit
        if (memUsageMB > this.limits.maxMemoryUsageMB) {
            this.handleResourceLimit('MEMORY', memUsageMB);
        }
    }

    /**
     * Check if room creation is allowed
     * @param {string} roomName - Room name
     * @param {number} maxParticipants - Max participants requested
     * @returns {Object} Validation result
     */
    validateRoomCreation(roomName, maxParticipants = 100) {
        // Check concurrent streams limit
        if (this.metrics.activeStreams.size >= this.limits.maxConcurrentStreams) {
            return {
                allowed: false,
                error: 'CONCURRENT_STREAMS_LIMIT',
                message: `Maximum concurrent streams limit reached (${this.limits.maxConcurrentStreams})`
            };
        }

        // Check participants limit
        if (maxParticipants > this.limits.maxParticipantsPerRoom) {
            return {
                allowed: false,
                error: 'PARTICIPANTS_PER_ROOM_LIMIT',
                message: `Requested participants (${maxParticipants}) exceeds limit (${this.limits.maxParticipantsPerRoom})`
            };
        }

        // Check total participants would exceed limit
        const projectedTotal = this.metrics.participantCount + maxParticipants;
        if (projectedTotal > this.limits.maxTotalParticipants) {
            return {
                allowed: false,
                error: 'TOTAL_PARTICIPANTS_LIMIT',
                message: `Total participants would exceed limit (${this.limits.maxTotalParticipants})`
            };
        }

        // Check memory usage
        const currentMemory = this.getCurrentMemoryUsage();
        if (currentMemory > this.limits.maxMemoryUsageMB * 0.9) {
            return {
                allowed: false,
                error: 'MEMORY_LIMIT',
                message: `High memory usage (${Math.round(currentMemory)}MB), cannot create new room`
            };
        }

        return { allowed: true };
    }

    /**
     * Check rate limiting for operations
     * @param {string} operation - Operation type (room_creation, token_generation)
     * @param {string} identifier - Client IP or user ID
     * @returns {Object} Rate limit result
     */
    checkRateLimit(operation, identifier) {
        const key = `${operation}:${identifier}`;
        const now = Date.now();
        const windowMs = 60000; // 1 minute

        if (!this.metrics.rateLimits.has(key)) {
            this.metrics.rateLimits.set(key, []);
        }

        const requests = this.metrics.rateLimits.get(key);
        
        // Remove old requests outside window
        const recentRequests = requests.filter(time => now - time < windowMs);
        this.metrics.rateLimits.set(key, recentRequests);

        // Get limit for operation
        let limit;
        switch (operation) {
            case 'room_creation':
                limit = this.limits.roomCreationPerMinute;
                break;
            case 'token_generation':
                limit = this.limits.tokenGenerationPerMinute;
                break;
            default:
                limit = 10; // Default limit
        }

        if (recentRequests.length >= limit) {
            return {
                allowed: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded for ${operation} (${limit}/min)`
            };
        }

        // Add current request
        recentRequests.push(now);
        return { allowed: true };
    }

    /**
     * Track room creation
     * @param {string} roomName - Room name
     * @param {Object} roomData - Room data
     */
    trackRoomCreation(roomName, roomData) {
        this.metrics.activeStreams.set(roomName, {
            ...roomData,
            createdAt: Date.now(),
            participants: 0,
            maxParticipants: roomData.maxParticipants || 100
        });

        console.log('📊 Room tracked:', roomName, `(${this.metrics.activeStreams.size}/${this.limits.maxConcurrentStreams} streams)`);
    }

    /**
     * Update room participants
     * @param {string} roomName - Room name
     * @param {number} participantCount - Current participant count
     */
    updateRoomParticipants(roomName, participantCount) {
        const room = this.metrics.activeStreams.get(roomName);
        if (room) {
            const oldCount = room.participants || 0;
            room.participants = participantCount;
            
            // Update total participant count
            this.metrics.participantCount = this.metrics.participantCount - oldCount + participantCount;
            
            console.log('👥 Participants updated:', roomName, `${participantCount}/${room.maxParticipants}`, `(Total: ${this.metrics.participantCount})`);
        }
    }

    /**
     * Remove room tracking
     * @param {string} roomName - Room name
     */
    untrackRoom(roomName) {
        const room = this.metrics.activeStreams.get(roomName);
        if (room) {
            this.metrics.participantCount -= (room.participants || 0);
            this.metrics.activeStreams.delete(roomName);
            
            console.log('🗑️ Room untracked:', roomName, `(${this.metrics.activeStreams.size} streams remaining)`);
        }
    }

    /**
     * Handle LiveKit specific errors
     * @param {Error} error - Error object
     * @param {string} operation - Operation that failed
     * @param {Object} context - Additional context
     * @returns {Object} Processed error response
     */
    handleLiveKitError(error, operation, context = {}) {
        const timestamp = new Date().toISOString();
        const errorInfo = {
            timestamp,
            operation,
            error: error.message,
            code: error.code,
            context
        };

        // Add to error log
        this.metrics.errors.push(errorInfo);
        
        // Keep only last 100 errors
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-100);
        }

        // Analyze error type and provide specific response
        let response = { success: false, timestamp };

        switch (true) {
            // Room already exists
            case error.message.includes('already exists') || error.code === 'ALREADY_EXISTS':
                response.error = 'ROOM_ALREADY_EXISTS';
                response.message = `Room "${context.roomName}" already exists`;
                response.suggestion = 'Try joining the existing room or use a different name';
                break;

            // Room not found
            case error.message.includes('not found') || error.code === 'NOT_FOUND':
                response.error = 'ROOM_NOT_FOUND';
                response.message = `Room "${context.roomName}" not found`;
                response.suggestion = 'Check the room name or create a new room';
                break;

            // Permission denied
            case error.message.includes('permission') || error.code === 'PERMISSION_DENIED':
                response.error = 'PERMISSION_DENIED';
                response.message = 'Permission denied for this operation';
                response.suggestion = 'Check API credentials or user permissions';
                break;

            // Resource exhausted
            case error.message.includes('resource') || error.code === 'RESOURCE_EXHAUSTED':
                response.error = 'RESOURCE_EXHAUSTED';
                response.message = 'Server resources exhausted';
                response.suggestion = 'Try again later or reduce concurrent operations';
                break;

            // Connection issues
            case error.message.includes('connection') || error.message.includes('timeout'):
                response.error = 'CONNECTION_ERROR';
                response.message = 'LiveKit server connection failed';
                response.suggestion = 'Check network connection and server status';
                break;

            // SSL/TLS issues
            case error.message.includes('certificate') || error.message.includes('SSL'):
                response.error = 'SSL_ERROR';
                response.message = 'SSL certificate error with LiveKit server';
                response.suggestion = 'SSL configuration issue - contact support';
                break;

            // Participant limits
            case error.message.includes('participant'):
                response.error = 'PARTICIPANT_ERROR';
                response.message = 'Participant limit or permission issue';
                response.suggestion = 'Check room capacity and participant permissions';
                break;

            // Token issues
            case error.message.includes('token') || error.message.includes('auth'):
                response.error = 'TOKEN_ERROR';
                response.message = 'Authentication token invalid or expired';
                response.suggestion = 'Generate a new access token';
                break;

            // Generic server error
            case error.code === 'INTERNAL' || error.message.includes('internal'):
                response.error = 'SERVER_ERROR';
                response.message = 'Internal LiveKit server error';
                response.suggestion = 'Temporary server issue - try again in a moment';
                break;

            // Network/fetch errors
            case error.name === 'TypeError' && error.message.includes('fetch'):
                response.error = 'NETWORK_ERROR';
                response.message = 'Network error connecting to LiveKit server';
                response.suggestion = 'Check internet connection and server availability';
                break;

            // Default case
            default:
                response.error = 'UNKNOWN_ERROR';
                response.message = `LiveKit operation failed: ${error.message}`;
                response.suggestion = 'Check logs for more details';
        }

        // Add retry information for recoverable errors
        const recoverableErrors = ['CONNECTION_ERROR', 'NETWORK_ERROR', 'SERVER_ERROR'];
        if (recoverableErrors.includes(response.error)) {
            response.retryable = true;
            response.retryAfter = 5000; // 5 seconds
        }

        console.error('❌ LiveKit Error:', response.error, '|', response.message);
        return response;
    }

    /**
     * Handle resource limits exceeded
     * @param {string} resource - Resource type
     * @param {number} currentValue - Current value
     */
    handleResourceLimit(resource, currentValue) {
        const alert = {
            type: 'RESOURCE_LIMIT',
            resource,
            currentValue,
            limit: this.limits[`max${resource}UsageMB`] || this.limits[`max${resource}UsagePercent`],
            timestamp: Date.now()
        };

        console.warn('⚠️ Resource limit warning:', alert);

        // Take preventive action
        if (resource === 'MEMORY' && currentValue > this.limits.maxMemoryUsageMB) {
            console.warn('💾 High memory usage detected, forcing garbage collection...');
            if (global.gc) {
                global.gc();
            }
        }
    }

    /**
     * Get current system status
     * @returns {Object} System status
     */
    getSystemStatus() {
        const currentMemory = this.getCurrentMemoryUsage();
        
        return {
            healthy: this.isSystemHealthy(),
            metrics: {
                activeStreams: this.metrics.activeStreams.size,
                totalParticipants: this.metrics.participantCount,
                memoryUsageMB: Math.round(currentMemory),
                memoryUsagePercent: Math.round((currentMemory / this.limits.maxMemoryUsageMB) * 100)
            },
            limits: this.limits,
            recentErrors: this.metrics.errors.slice(-5),
            uptime: process.uptime()
        };
    }

    /**
     * Check if system is healthy
     * @returns {boolean} Health status
     */
    isSystemHealthy() {
        const currentMemory = this.getCurrentMemoryUsage();
        
        return (
            this.metrics.activeStreams.size < this.limits.maxConcurrentStreams &&
            this.metrics.participantCount < this.limits.maxTotalParticipants &&
            currentMemory < this.limits.maxMemoryUsageMB * 0.9
        );
    }

    /**
     * Get current memory usage
     * @returns {number} Memory usage in MB
     */
    getCurrentMemoryUsage() {
        return process.memoryUsage().heapUsed / 1024 / 1024;
    }

    /**
     * Clean old metrics
     */
    cleanOldMetrics() {
        const oneHourAgo = Date.now() - 3600000;
        
        // Clean error logs older than 1 hour
        this.metrics.errors = this.metrics.errors.filter(error => 
            new Date(error.timestamp).getTime() > oneHourAgo
        );

        console.log('🧹 Old metrics cleaned');
    }

    /**
     * Clean rate limits
     */
    cleanRateLimits() {
        const oneHourAgo = Date.now() - 3600000;
        
        for (const [key, requests] of this.metrics.rateLimits.entries()) {
            const recentRequests = requests.filter(time => time > oneHourAgo);
            if (recentRequests.length === 0) {
                this.metrics.rateLimits.delete(key);
            } else {
                this.metrics.rateLimits.set(key, recentRequests);
            }
        }
    }

    /**
     * Get detailed error report
     * @returns {Object} Error report
     */
    getErrorReport() {
        const errorsByType = {};
        const recentErrors = this.metrics.errors.slice(-50);
        
        recentErrors.forEach(error => {
            const type = error.error || 'UNKNOWN';
            if (!errorsByType[type]) {
                errorsByType[type] = [];
            }
            errorsByType[type].push(error);
        });

        return {
            totalErrors: this.metrics.errors.length,
            recentErrors: recentErrors.length,
            errorsByType,
            topErrors: Object.keys(errorsByType)
                .map(type => ({ type, count: errorsByType[type].length }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
        };
    }
}

module.exports = LiveKitErrorHandler;