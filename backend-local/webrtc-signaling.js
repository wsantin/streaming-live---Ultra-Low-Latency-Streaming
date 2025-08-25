const EventEmitter = require('events');

class WebRTCSignalingServer extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.broadcasters = new Map(); // streamerId -> socket
    this.viewers = new Map(); // viewerId -> socket
    this.connections = new Map(); // viewerId -> streamerId mapping
    this.rooms = new Map(); // roomName -> { broadcaster: socket, viewers: Map, createdAt: Date }
    
    this.setupSocketHandlers();
    console.log('🚀 WebRTC Signaling Server initialized with Rooms support');
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 Client connected: ${socket.id}`);
      
      // Broadcaster Events
      socket.on('webrtc-broadcaster-ready', (data) => {
        this.handleBroadcasterReady(socket, data);
      });
      
      socket.on('webrtc-broadcaster-stopped', (data) => {
        this.handleBroadcasterStopped(socket, data);
      });
      
      // Viewer Events  
      socket.on('webrtc-viewer-join', (data) => {
        this.handleViewerJoin(socket, data);
      });

      // Room Events
      socket.on('create-room', (data) => {
        this.handleCreateRoom(socket, data);
      });

      socket.on('join-room', (data) => {
        this.handleJoinRoom(socket, data);
      });

      socket.on('get-live-rooms', () => {
        this.handleGetLiveRooms(socket);
      });
      
      // WebRTC Signaling Events
      socket.on('webrtc-offer', (data) => {
        this.handleOffer(socket, data);
      });
      
      socket.on('webrtc-answer', (data) => {
        this.handleAnswer(socket, data);
      });
      
      socket.on('webrtc-ice-candidate', (data) => {
        this.handleIceCandidate(socket, data);
      });
      
      // Connection management
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  handleBroadcasterReady(socket, { streamerId, roomName }) {
    console.log(`📡 Broadcaster ready: ${streamerId}${roomName ? ` in room: ${roomName}` : ''}`);
    
    this.broadcasters.set(streamerId, socket);
    socket.streamerId = streamerId;
    socket.role = 'broadcaster';
    
    // If this is for a specific room, update the room's broadcaster status
    if (roomName) {
      const room = this.rooms.get(roomName);
      if (room) {
        room.broadcasterReady = true;
        console.log(`📡 Room ${roomName} broadcaster is now ready for WebRTC`);
      }
    }
    
    console.log(`✅ Broadcaster registered: ${streamerId}${roomName ? ` for room: ${roomName}` : ''}`);
  }

  handleBroadcasterStopped(socket, data) {
    const streamerId = socket.streamerId;
    console.log(`📺 Broadcaster stopped: ${streamerId}`);
    
    this.broadcasters.delete(streamerId);
    
    // Notify all viewers
    this.viewers.forEach((viewerSocket) => {
      viewerSocket.emit('broadcaster-stopped', { streamerId });
    });
    
    console.log(`✅ Broadcaster removed: ${streamerId}`);
  }

  handleViewerJoin(socket, { viewerId }) {
    console.log(`👥 Viewer trying to join: ${viewerId}`);
    
    // Check if there are active broadcasters
    if (this.broadcasters.size === 0) {
      console.log(`❌ No active broadcasters`);
      socket.emit('join-room-error', {
        error: 'No active stream available'
      });
      return;
    }
    
    this.viewers.set(viewerId, socket);
    socket.viewerId = viewerId;
    socket.role = 'viewer';
    
    console.log(`✅ Viewer joined: ${viewerId}`);
  }

  handleOffer(socket, { offer, roomName, viewerId }) {
    // Use provided viewerId or fallback to socket viewerId
    const actualViewerId = viewerId || socket.viewerId;
    console.log(`📞 Offer received from viewer: ${actualViewerId}${roomName ? ` in room: ${roomName}` : ''}`);
    
    let targetBroadcaster = null;
    
    if (roomName) {
      // Room-based offer - find broadcaster for specific room
      const room = this.rooms.get(roomName);
      if (room) {
        targetBroadcaster = room.broadcaster;
      } else {
        socket.emit('webrtc-error', {
          error: 'Room not found',
          code: 'ROOM_NOT_FOUND',
          roomName
        });
        console.log(`❌ Room not found: ${roomName}`);
        return;
      }
    } else {
      // Legacy behavior - find first available broadcaster
      targetBroadcaster = this.broadcasters.values().next().value;
    }
    
    if (targetBroadcaster) {
      const streamerId = targetBroadcaster.streamerId;
      
      // Store connection mapping
      this.connections.set(actualViewerId, streamerId);
      
      // Forward offer to broadcaster
      targetBroadcaster.emit('webrtc-offer', {
        viewerId: actualViewerId,
        offer,
        roomName
      });
      
      console.log(`📡 Offer forwarded to broadcaster: ${streamerId}${roomName ? ` for room: ${roomName}` : ''}`);
    } else {
      // No broadcaster available
      socket.emit('webrtc-error', {
        error: roomName ? 'No broadcaster in room' : 'No broadcaster available',
        code: 'NO_BROADCASTER',
        roomName
      });
      console.log(`❌ No broadcaster available${roomName ? ` in room: ${roomName}` : ''}`);
    }
  }

  handleAnswer(socket, { viewerId, answer, roomName }) {
    console.log(`📞 Answer received for viewer: ${viewerId}${roomName ? ` in room: ${roomName}` : ''}`);
    
    let viewerSocket = null;
    
    if (roomName) {
      // Room-based: find viewer in specific room
      const room = this.rooms.get(roomName);
      if (room) {
        viewerSocket = room.viewers.get(viewerId);
      }
    } else {
      // Legacy: find viewer globally
      viewerSocket = this.viewers.get(viewerId);
    }
    
    if (viewerSocket) {
      // Forward answer to viewer
      viewerSocket.emit('webrtc-answer', {
        answer
      });
      console.log(`📡 Answer forwarded to viewer: ${viewerId}${roomName ? ` in room: ${roomName}` : ''}`);
    } else {
      console.log(`❌ Viewer not found: ${viewerId}${roomName ? ` in room: ${roomName}` : ''}`);
    }
  }

  handleIceCandidate(socket, data) {
    const { viewerId, candidate, roomName } = data;
    
    if (socket.role === 'broadcaster') {
      // Forward ICE candidate from broadcaster to viewer
      let viewerSocket = null;
      
      if (roomName) {
        // Room-based: find viewer in specific room
        const room = this.rooms.get(roomName);
        if (room) {
          viewerSocket = room.viewers.get(viewerId);
        }
      } else {
        // Legacy: find viewer globally
        viewerSocket = this.viewers.get(viewerId);
      }
      
      if (viewerSocket) {
        viewerSocket.emit('webrtc-ice-candidate', {
          candidate
        });
        console.log(`🧊 ICE candidate forwarded to viewer: ${viewerId}${roomName ? ` in room: ${roomName}` : ''}`);
      }
    } else if (socket.role === 'viewer') {
      // Forward ICE candidate from viewer to broadcaster
      let broadcasterSocket = null;
      const actualViewerId = viewerId || socket.viewerId;
      
      if (roomName) {
        // Room-based: find broadcaster for specific room
        const room = this.rooms.get(roomName);
        if (room) {
          broadcasterSocket = room.broadcaster;
        }
      } else {
        // Legacy: find broadcaster through connections mapping
        const streamerId = this.connections.get(actualViewerId);
        if (streamerId) {
          broadcasterSocket = this.broadcasters.get(streamerId);
        }
      }
      
      if (broadcasterSocket) {
        broadcasterSocket.emit('webrtc-ice-candidate', {
          viewerId: actualViewerId,
          candidate
        });
        console.log(`🧊 ICE candidate forwarded to broadcaster${roomName ? ` for room: ${roomName}` : ''}`);
      }
    }
  }


  // Public methods for external use
  getBroadcasterCount() {
    return this.broadcasters.size;
  }

  getViewerCount() {
    return this.viewers.size;
  }

  getActiveConnections() {
    return this.connections.size;
  }

  // Get stats for monitoring
  getStats() {
    return {
      broadcasters: this.broadcasters.size,
      viewers: this.viewers.size,
      connections: this.connections.size,
      totalConnections: this.broadcasters.size + this.viewers.size
    };
  }

  // Force disconnect a client
  disconnectClient(socketId) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
      return true;
    }
    return false;
  }

  // Broadcast message to all clients
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Broadcast to all viewers
  broadcastToViewers(event, data) {
    this.viewers.forEach((socket) => {
      socket.emit(event, data);
    });
  }

  // Room Management Methods
  handleCreateRoom(socket, { roomName, sessionId }) {
    console.log(`🏠 Creating room: ${roomName} by ${sessionId}`);
    
    // Check if room already exists
    if (this.rooms.has(roomName)) {
      const existingRoom = this.rooms.get(roomName);
      
      // Check if broadcaster is still connected
      if (existingRoom.broadcaster && !existingRoom.broadcaster.connected) {
        console.log(`🧹 Cleaning up disconnected room: ${roomName}`);
        
        // Notify any remaining viewers
        existingRoom.viewers.forEach((viewerSocket) => {
          viewerSocket.emit('broadcaster-stopped', {
            roomName,
            reason: 'Broadcaster disconnected'
          });
        });
        
        // Remove the orphaned room
        this.rooms.delete(roomName);
        this.broadcasters.delete(existingRoom.streamerId);
        
        // Broadcast updated rooms list
        this.broadcastLiveRoomsUpdate();
        
        console.log(`✅ Orphaned room ${roomName} cleaned up, proceeding with new room creation`);
      } else {
        socket.emit('room-error', {
          error: 'Room already exists with active broadcaster',
          roomName
        });
        return;
      }
    }
    
    // Create the room
    const room = {
      broadcaster: socket,
      viewers: new Map(),
      createdAt: new Date(),
      streamerId: sessionId,
      viewerCount: 0
    };
    
    this.rooms.set(roomName, room);
    socket.roomName = roomName;
    socket.role = 'broadcaster';
    socket.streamerId = sessionId;
    
    // Add to broadcasters map for compatibility
    this.broadcasters.set(sessionId, socket);
    
    socket.emit('room-created', {
      roomName,
      streamerId: sessionId,
      viewerCount: 0,
      createdAt: room.createdAt
    });

    // Notify all connected clients about the new room (real-time update)
    this.broadcastLiveRoomsUpdate();
    
    console.log(`✅ Room created: ${roomName}`);
  }

  handleJoinRoom(socket, { roomName, sessionId }) {
    console.log(`👥 Viewer ${sessionId} trying to join room: ${roomName}`);
    
    const room = this.rooms.get(roomName);
    if (!room) {
      socket.emit('join-room-error', {
        error: 'Room not found',
        roomName
      });
      return;
    }
    
    // Add viewer to room
    room.viewers.set(sessionId, socket);
    room.viewerCount = room.viewers.size;
    socket.roomName = roomName;
    socket.role = 'viewer';
    socket.viewerId = sessionId;
    
    // Add to viewers map for compatibility
    this.viewers.set(sessionId, socket);
    
    // Notify viewer they joined
    socket.emit('room-joined', {
      roomName,
      viewerCount: room.viewerCount,
      streamerId: room.streamerId
    });
    
    // Notify broadcaster
    if (room.broadcaster) {
      room.broadcaster.emit('viewer-joined', {
        viewerId: sessionId,
        viewerCount: room.viewerCount
      });
    }

    // Update live rooms list for all clients (real-time viewer count update)
    this.broadcastLiveRoomsUpdate();
    
    console.log(`✅ Viewer ${sessionId} joined room: ${roomName} (${room.viewerCount} viewers)`);
  }

  handleGetLiveRooms(socket) {
    console.log(`📡 Client ${socket.id} requesting live rooms...`);
    const liveRooms = [];
    
    this.rooms.forEach((room, roomName) => {
      liveRooms.push({
        name: roomName,
        viewerCount: room.viewerCount,
        streamerId: room.streamerId,
        createdAt: room.createdAt
      });
    });
    
    console.log(`📋 Sending ${liveRooms.length} live rooms:`, liveRooms.map(r => r.name));
    socket.emit('live-rooms', liveRooms);
    console.log(`📋 Sent ${liveRooms.length} live rooms to ${socket.id}`);
  }

  // Enhanced disconnect handling for rooms
  handleDisconnect(socket) {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    if (socket.role === 'broadcaster' && socket.roomName) {
      const roomName = socket.roomName;
      const room = this.rooms.get(roomName);
      
      console.log(`📺 Broadcaster left room: ${roomName}`);
      
      if (room) {
        // Notify all viewers in the room
        room.viewers.forEach((viewerSocket) => {
          viewerSocket.emit('broadcaster-stopped', {
            roomName,
            streamerId: socket.streamerId
          });
        });
        
        // Clean up room
        this.rooms.delete(roomName);
        this.broadcasters.delete(socket.streamerId);

        // Notify all clients that room was deleted (real-time)
        this.broadcastLiveRoomsUpdate();
        
        console.log(`🗑️ Room deleted: ${roomName}`);
      }
      
    } else if (socket.role === 'viewer' && socket.roomName) {
      const roomName = socket.roomName;
      const room = this.rooms.get(roomName);
      
      console.log(`👥 Viewer left room: ${roomName}`);
      
      if (room) {
        // Remove viewer from room
        room.viewers.delete(socket.viewerId);
        room.viewerCount = room.viewers.size;
        this.viewers.delete(socket.viewerId);
        
        // Notify broadcaster
        if (room.broadcaster) {
          room.broadcaster.emit('viewer-left', {
            viewerId: socket.viewerId,
            viewerCount: room.viewerCount
          });
        }

        // Update live rooms list for all clients (real-time)
        this.broadcastLiveRoomsUpdate();
        
        console.log(`📊 Room ${roomName} now has ${room.viewerCount} viewers`);
      }
    }
    
    // Original disconnect logic for backwards compatibility
    if (socket.role === 'broadcaster') {
      const streamerId = socket.streamerId;
      this.broadcasters.delete(streamerId);
      
      this.connections.forEach((connectionStreamerId, viewerId) => {
        if (connectionStreamerId === streamerId) {
          this.connections.delete(viewerId);
        }
      });
    } else if (socket.role === 'viewer') {
      const viewerId = socket.viewerId;
      this.viewers.delete(viewerId);
      this.connections.delete(viewerId);
    }
  }

  // Broadcast live rooms update to all connected clients (real-time)
  broadcastLiveRoomsUpdate() {
    const liveRooms = [];
    
    this.rooms.forEach((room, roomName) => {
      liveRooms.push({
        name: roomName,
        viewerCount: room.viewerCount,
        streamerId: room.streamerId,
        createdAt: room.createdAt
      });
    });

    // Send to all connected clients
    this.io.emit('live-rooms', liveRooms);
    console.log(`📡 Broadcasted ${liveRooms.length} live rooms to all clients`);
  }

  // Cleanup inactive sessions (call periodically)
  cleanupInactiveSessions() {
    const now = Date.now();
    const sessionTimeout = 5 * 60 * 1000; // 5 minutes
    let cleanedRooms = 0;
    
    // Clean up rooms with disconnected broadcasters
    this.rooms.forEach((room, roomName) => {
      if (!room.broadcaster || !room.broadcaster.connected) {
        console.log(`🧹 Cleaning up disconnected room: ${roomName}`);
        
        // Notify any remaining viewers
        room.viewers.forEach((viewerSocket) => {
          if (viewerSocket.connected) {
            viewerSocket.emit('broadcaster-stopped', {
              roomName,
              reason: 'Broadcaster timeout/disconnected'
            });
          }
        });
        
        // Clean up references
        this.rooms.delete(roomName);
        if (room.streamerId) {
          this.broadcasters.delete(room.streamerId);
        }
        
        cleanedRooms++;
      }
    });
    
    if (cleanedRooms > 0) {
      console.log(`🧹 Cleaned up ${cleanedRooms} orphaned rooms`);
      this.broadcastLiveRoomsUpdate();
    }
    
    // Original session cleanup if sessionStore exists
    if (this.sessionStore) {
      this.sessionStore.forEach((session, sessionId) => {
        const socket = this.io.sockets.sockets.get(session.socketId);
        if (!socket && (now - session.lastActivity > sessionTimeout)) {
          this.sessionStore.delete(sessionId);
          console.log(`🧹 Cleaned up inactive session: ${sessionId}`);
        }
      });
    }
  }
}

module.exports = WebRTCSignalingServer;