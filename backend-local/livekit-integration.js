const { RoomServiceClient, AccessToken, Room } = require('livekit-server-sdk');
const { SERVER_CONFIG } = require('./config/constants');

class LiveKitManager {
    constructor() {
        // Configuración LiveKit desde constants.js
        this.livekitHost = SERVER_CONFIG.LIVEKIT.HOST;
        this.apiKey = SERVER_CONFIG.LIVEKIT.API_KEY;
        this.apiSecret = SERVER_CONFIG.LIVEKIT.SECRET;
        
        // Cliente para administración de salas (necesita HTTP, no WS)
        const httpUrl = this.livekitHost.replace('ws://', 'http://').replace('wss://', 'https://');
        this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
        
        // Cache de salas activas
        this.activeRooms = new Map();
        
        console.log('🎯 LiveKit Manager initialized:', {
            host: this.livekitHost,
            apiKey: this.apiKey
        });
    }

    // Generar token de acceso para participante
    async generateAccessToken(roomName, participantName, isPublisher = true) {
        try {
            const at = new AccessToken(this.apiKey, this.apiSecret, {
                identity: participantName,
                ttl: '10m', // Token válido por 10 minutos
            });

            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: isPublisher,
                canSubscribe: true,
                canUpdateMetadata: true,
            });

            const token = at.toJwt();
            
            console.log('🎫 Generated access token:', {
                room: roomName,
                participant: participantName,
                publisher: isPublisher
            });
            
            return token;
        } catch (error) {
            console.error('❌ Error generating access token:', error);
            throw error;
        }
    }

    // Crear o obtener sala
    async createOrGetRoom(roomName, maxParticipants = 1000) {
        try {
            // Verificar primero si LiveKit está disponible
            const httpUrl = this.livekitHost.replace('ws://', 'http://').replace('wss://', 'https://');
            try {
                const healthCheckOptions = {
                    timeout: 10000, // Aumentar timeout para ngrok
                    headers: {}
                };
                
                // Si es ngrok, agregar header especial
                if (httpUrl.includes('ngrok-free.app') || httpUrl.includes('ngrok.io')) {
                    healthCheckOptions.headers['ngrok-skip-browser-warning'] = 'true';
                }
                
                const healthCheck = await fetch(httpUrl, healthCheckOptions);
                if (!healthCheck.ok) {
                    throw new Error(`LiveKit server not available. Status: ${healthCheck.status}`);
                }
            } catch (fetchError) {
                throw new Error(`LiveKit server not reachable at ${httpUrl}. Make sure livekit-server.exe is running.`);
            }

            let room = this.activeRooms.get(roomName);
            
            if (!room) {
                // Crear nueva sala en LiveKit
                room = await this.roomService.createRoom({
                    name: roomName,
                    emptyTimeout: 300, // 5 minutos vacía
                    maxParticipants: maxParticipants,
                    metadata: JSON.stringify({
                        created: new Date().toISOString(),
                        type: 'webrtc-streaming',
                        ultraLowLatency: true
                    })
                });
                
                this.activeRooms.set(roomName, room);
                
                console.log('🏠 Created new LiveKit room:', {
                    name: roomName,
                    maxParticipants: maxParticipants
                });
            }
            
            return room;
        } catch (error) {
            console.error('❌ Error creating/getting room:', error);
            
            // Si es error de conexión, dar mensaje más claro
            if (error.message.includes('LiveKit server not')) {
                throw error; // Re-throw con mensaje claro
            }
            
            // Si la sala ya existe, intentar obtenerla
            try {
                const room = await this.roomService.listRooms([roomName]);
                if (room.length > 0) {
                    this.activeRooms.set(roomName, room[0]);
                    return room[0];
                }
            } catch (listError) {
                console.error('❌ También falló listar salas:', listError.message);
            }
            
            throw new Error(`Failed to create/get room "${roomName}". Make sure LiveKit server is running.`);
        }
    }

    // Obtener estadísticas de sala
    async getRoomStats(roomName) {
        try {
            const room = await this.roomService.listRooms([roomName]);
            
            if (room.length === 0) {
                return { exists: false };
            }
            
            const participants = await this.roomService.listParticipants(roomName);
            
            return {
                exists: true,
                room: room[0],
                participantCount: participants.length,
                participants: participants.map(p => ({
                    identity: p.identity,
                    state: p.state,
                    joinedAt: p.joinedAt,
                    tracks: p.tracks?.length || 0
                }))
            };
        } catch (error) {
            console.error('❌ Error getting room stats:', error);
            return { exists: false, error: error.message };
        }
    }

    // Listar todas las salas activas
    async listActiveRooms() {
        try {
            // Check if LiveKit server is available (use HTTP not WS for health check)
            const livekitHttpUrl = this.livekitHost.replace('ws://', 'http://').replace('wss://', 'https://');
            const response = await fetch(livekitHttpUrl, { 
                timeout: 2000 
            }).catch(() => null);
            
            if (!response || !response.ok) {
                console.log('⚠️  LiveKit SFU server not available - using fallback mode');
                return [];
            }
            
            const rooms = await this.roomService.listRooms();
            
            const roomsWithStats = await Promise.all(
                rooms.map(async (room) => {
                    const participants = await this.roomService.listParticipants(room.name);
                    return {
                        name: room.name,
                        creationTime: room.creationTime ? room.creationTime.toString() : null,
                        numParticipants: room.numParticipants,
                        maxParticipants: room.maxParticipants,
                        participants: participants.length,
                        metadata: room.metadata ? JSON.parse(room.metadata) : {}
                    };
                })
            );
            
            return roomsWithStats;
        } catch (error) {
            console.error('❌ Error listing active rooms:', error);
            return [];
        }
    }

    // Alias método para compatibilidad con servidor
    async listRooms() {
        try {
            const rooms = await this.listActiveRooms();
            return {
                success: true,
                rooms: rooms,
                totalRooms: rooms.length
            };
        } catch (error) {
            console.error('❌ Error in listRooms:', error);
            return {
                success: false,
                error: error.message,
                rooms: [],
                totalRooms: 0
            };
        }
    }

    // Remover participante de sala
    async removeParticipant(roomName, participantIdentity) {
        try {
            await this.roomService.removeParticipant(roomName, participantIdentity);
            console.log('👋 Participant removed:', {
                room: roomName,
                participant: participantIdentity
            });
            return true;
        } catch (error) {
            console.error('❌ Error removing participant:', error);
            return false;
        }
    }

    // Cerrar sala (opcional)
    async closeRoom(roomName) {
        try {
            await this.roomService.deleteRoom(roomName);
            this.activeRooms.delete(roomName);
            console.log('🚪 Room closed:', roomName);
            return true;
        } catch (error) {
            console.error('❌ Error closing room:', error);
            return false;
        }
    }

    // Health check de LiveKit
    async healthCheck() {
        try {
            const rooms = await this.roomService.listRooms();
            return {
                status: 'ok',
                server: this.livekitHost,
                roomCount: rooms.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                server: this.livekitHost,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Limpiar salas sin participantes
    async cleanupEmptyRooms() {
        try {
            console.log('🧹 Iniciando limpieza de salas huérfanas...');
            
            const rooms = await this.roomService.listRooms();
            const deletedRooms = [];
            
            for (const room of rooms) {
                if (room.numParticipants === 0) {
                    try {
                        await this.roomService.deleteRoom(room.name);
                        deletedRooms.push(room.name);
                        console.log(`🗑️ Sala eliminada: ${room.name}`);
                    } catch (deleteError) {
                        console.warn(`⚠️ No se pudo eliminar sala ${room.name}:`, deleteError.message);
                    }
                }
            }
            
            const remainingRooms = await this.roomService.listRooms();
            
            console.log(`🧹 Limpieza completada: ${deletedRooms.length} salas eliminadas`);
            
            return {
                deletedRooms,
                totalRoomsAfter: remainingRooms.length
            };
            
        } catch (error) {
            console.error('❌ Error en limpieza de salas:', error);
            throw error;
        }
    }
}

module.exports = LiveKitManager;