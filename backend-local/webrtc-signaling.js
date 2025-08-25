const EventEmitter = require('events');

class WebRTCSignalingServer extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.broadcasters = new Map(); // streamerId -> socket
    this.viewers = new Map(); // viewerId -> socket
    this.connections = new Map(); // Map viewer to broadcaster
    
    this.setupSocketHandlers();
    console.log('🚀 WebRTC Signaling Server initialized');
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 Client connected: ${socket.id}`);
      
      // Broadcaster Events
      socket.on('webrtc-broadcaster-ready', (data) => {
        this.handleBroadcasterReady(socket, data);
      });
      
      socket.on('webrtc-broadcaster-stopped', () => {
        this.handleBroadcasterStopped(socket);
      });
      
      // Viewer Events  
      socket.on('webrtc-viewer-join', (data) => {
        this.handleViewerJoin(socket, data);
      });
      
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

  handleBroadcasterReady(socket, { streamerId }) {
    console.log(`📡 Broadcaster ready: ${streamerId}`);
    
    // Store broadcaster
    this.broadcasters.set(streamerId, socket);
    socket.streamerId = streamerId;
    socket.role = 'broadcaster';
    
    // Notify all viewers that a broadcaster is available
    this.viewers.forEach((viewerSocket) => {
      viewerSocket.emit('webrtc-broadcaster-available', {
        streamerId
      });
    });
    
    // Emit broadcaster count update
    this.io.emit('broadcaster-count', this.broadcasters.size);
    
    socket.emit('webrtc-broadcaster-registered', {
      streamerId,
      viewers: this.viewers.size
    });
  }

  handleBroadcasterStopped(socket) {
    const streamerId = socket.streamerId;
    console.log(`📺 Broadcaster stopped: ${streamerId}`);
    
    // Remove broadcaster
    this.broadcasters.delete(streamerId);
    
    // Notify all viewers
    this.viewers.forEach((viewerSocket) => {
      viewerSocket.emit('webrtc-broadcaster-stopped', {
        streamerId
      });
    });
    
    // Clean up connections
    this.connections.forEach((connection, viewerId) => {
      if (connection.streamerId === streamerId) {
        this.connections.delete(viewerId);
      }
    });
    
    // Update broadcaster count
    this.io.emit('broadcaster-count', this.broadcasters.size);
  }

  handleViewerJoin(socket, { viewerId }) {
    console.log(`👥 Viewer joined: ${viewerId}`);
    
    // Store viewer
    this.viewers.set(viewerId, socket);
    socket.viewerId = viewerId;
    socket.role = 'viewer';
    
    // Notify broadcasters about new viewer
    this.broadcasters.forEach((broadcasterSocket, streamerId) => {
      broadcasterSocket.emit('viewer-joined', {
        viewerId,
        totalViewers: this.viewers.size
      });
    });
    
    // If there are active broadcasters, notify this viewer
    if (this.broadcasters.size > 0) {
      const firstBroadcaster = this.broadcasters.keys().next().value;
      socket.emit('webrtc-broadcaster-available', {
        streamerId: firstBroadcaster
      });
    }
    
    // Update viewer count
    this.io.emit('viewer-count', this.viewers.size);
  }

  handleOffer(socket, { offer }) {
    const viewerId = socket.viewerId;
    console.log(`📞 Offer received from viewer: ${viewerId}`);
    
    // Find the first available broadcaster
    const firstBroadcaster = this.broadcasters.values().next().value;
    
    if (firstBroadcaster) {
      const streamerId = firstBroadcaster.streamerId;
      
      // Store connection mapping
      this.connections.set(viewerId, { streamerId, viewerSocket: socket });
      
      // Forward offer to broadcaster
      firstBroadcaster.emit('webrtc-offer', {
        viewerId,
        offer
      });
      
      console.log(`📡 Offer forwarded to broadcaster: ${streamerId}`);
    } else {
      // No broadcaster available
      socket.emit('webrtc-error', {
        error: 'No broadcaster available',
        code: 'NO_BROADCASTER'
      });
      console.log(`❌ No broadcaster available for viewer: ${viewerId}`);
    }
  }

  handleAnswer(socket, { viewerId, answer }) {
    console.log(`📞 Answer received for viewer: ${viewerId}`);
    
    // Find viewer socket
    const viewerSocket = this.viewers.get(viewerId);
    
    if (viewerSocket) {
      // Forward answer to viewer
      viewerSocket.emit('webrtc-answer', {
        answer
      });
      console.log(`📡 Answer forwarded to viewer: ${viewerId}`);
    } else {
      console.log(`❌ Viewer not found: ${viewerId}`);
    }
  }

  handleIceCandidate(socket, data) {
    const { viewerId, candidate } = data;
    
    if (socket.role === 'broadcaster') {
      // Forward ICE candidate from broadcaster to viewer
      const viewerSocket = this.viewers.get(viewerId);
      if (viewerSocket) {
        viewerSocket.emit('webrtc-ice-candidate', {
          candidate
        });
        console.log(`🧊 ICE candidate forwarded to viewer: ${viewerId}`);
      }
    } else if (socket.role === 'viewer') {
      // Forward ICE candidate from viewer to broadcaster
      const connection = this.connections.get(socket.viewerId);
      if (connection) {
        const broadcasterSocket = this.broadcasters.get(connection.streamerId);
        if (broadcasterSocket) {
          broadcasterSocket.emit('webrtc-ice-candidate', {
            viewerId: socket.viewerId,
            candidate
          });
          console.log(`🧊 ICE candidate forwarded to broadcaster: ${connection.streamerId}`);
        }
      }
    }
  }

  handleDisconnect(socket) {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    if (socket.role === 'broadcaster') {
      const streamerId = socket.streamerId;
      console.log(`📺 Broadcaster disconnected: ${streamerId}`);
      
      // Remove broadcaster
      this.broadcasters.delete(streamerId);
      
      // Notify viewers
      this.viewers.forEach((viewerSocket) => {
        viewerSocket.emit('webrtc-broadcaster-stopped', {
          streamerId
        });
      });
      
      // Clean up connections
      this.connections.forEach((connection, viewerId) => {
        if (connection.streamerId === streamerId) {
          this.connections.delete(viewerId);
        }
      });
      
      // Update count
      this.io.emit('broadcaster-count', this.broadcasters.size);
      
    } else if (socket.role === 'viewer') {
      const viewerId = socket.viewerId;
      console.log(`👥 Viewer disconnected: ${viewerId}`);
      
      // Remove viewer
      this.viewers.delete(viewerId);
      this.connections.delete(viewerId);
      
      // Notify broadcasters
      this.broadcasters.forEach((broadcasterSocket) => {
        broadcasterSocket.emit('viewer-left', {
          viewerId,
          totalViewers: this.viewers.size
        });
      });
      
      // Update count
      this.io.emit('viewer-count', this.viewers.size);
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
      activeConnections: this.connections.size,
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

  // Broadcast to all broadcasters
  broadcastToBroadcasters(event, data) {
    this.broadcasters.forEach((socket) => {
      socket.emit(event, data);
    });
  }
}

module.exports = WebRTCSignalingServer;