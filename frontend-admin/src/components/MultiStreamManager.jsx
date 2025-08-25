import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { API_URL } from '../config/constants';

const MultiStreamManager = () => {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [sharedStream, setSharedStream] = useState(null);
  const [error, setError] = useState(null);
  
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // roomName -> Map(viewerId -> RTCPeerConnection)
  
  // WebRTC Configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

  useEffect(() => {
    // Connect to signaling server
    socketRef.current = io(API_URL, {
      transports: ['polling', 'websocket'],
      forceNew: true,
      reconnection: true,
      timeout: 60000
    });

    socketRef.current.on('connect', () => {
      console.log('🔗 Connected to Multi-Stream Manager');
    });

    // Handle WebRTC events for all rooms
    socketRef.current.on('webrtc-offer', handleOffer);
    socketRef.current.on('webrtc-answer', handleAnswer);
    socketRef.current.on('webrtc-ice-candidate', handleIceCandidate);
    socketRef.current.on('viewer-disconnected', handleViewerDisconnected);

    return () => {
      cleanup();
    };
  }, []);

  const initializeSharedStream = async () => {
    if (streamRef.current) {
      console.log('🎥 Stream already exists, reusing:', streamRef.current.getTracks());
      return streamRef.current;
    }

    console.log('🎥 Initializing new shared stream...');
    try {
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      console.log('🎥 Requesting user media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('🎥 Stream received:', stream);
      console.log('🎥 Stream tracks:', stream.getTracks());
      
      streamRef.current = stream;
      setSharedStream(stream);
      
      // Log track details
      stream.getTracks().forEach(track => {
        console.log(`🎥 Track: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      });
      
      console.log('✅ Shared stream initialized successfully');
      return stream;
    } catch (error) {
      console.error('❌ Failed to initialize stream:', error);
      setError('Failed to access camera/microphone: ' + error.message);
      throw error;
    }
  };

  const createRoom = async () => {
    if (!newRoomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    // Check if room already exists
    if (rooms.find(r => r.name === newRoomName.trim())) {
      setError('Room already exists');
      return;
    }

    try {
      // Initialize shared stream if not already done
      await initializeSharedStream();

      const roomData = {
        name: newRoomName.trim(),
        id: 'room_' + Date.now(),
        viewers: 0,
        isLive: true,
        startTime: new Date()
      };

      // Register room with server
      socketRef.current.emit('webrtc-broadcaster-ready', {
        streamerId: roomData.id,
        roomName: roomData.name,
        timestamp: Date.now()
      });

      // Initialize peer connections map for this room
      peerConnectionsRef.current.set(roomData.name, new Map());

      // Add to local rooms list
      setRooms(prev => [...prev, roomData]);
      setNewRoomName('');
      setError(null);

      console.log(`🏠 Room created: ${roomData.name}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      setError('Failed to create room: ' + error.message);
    }
  };

  const closeRoom = (roomName) => {
    // Notify server
    socketRef.current.emit('webrtc-broadcaster-stopped', { roomName });

    // Close all peer connections for this room
    const roomConnections = peerConnectionsRef.current.get(roomName);
    if (roomConnections) {
      roomConnections.forEach(pc => pc.close());
      peerConnectionsRef.current.delete(roomName);
    }

    // Remove from local list
    setRooms(prev => prev.filter(r => r.name !== roomName));
    
    console.log(`🛑 Room closed: ${roomName}`);

    // If no more rooms, stop the stream
    if (rooms.length === 1) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setSharedStream(null);
      }
    }
  };

  const handleOffer = async ({ viewerId, offer, roomName, connectionId }) => {
    console.log(`📞 Received offer - viewerId: ${viewerId}, roomName: ${roomName}, connectionId: ${connectionId}`);
    
    // Check if this room exists in our list
    const room = rooms.find(r => r.name === roomName);
    if (!room) {
      console.log(`Ignoring offer for room ${roomName} - not our room`);
      return;
    }

    console.log(`📞 Handling offer from viewer ${viewerId} for room ${roomName} (connection: ${connectionId})`);
    
    try {
      // Get or create connections map for this room
      let roomConnections = peerConnectionsRef.current.get(roomName);
      if (!roomConnections) {
        roomConnections = new Map();
        peerConnectionsRef.current.set(roomName, roomConnections);
      }
      
      // Check if connection already exists for this viewer
      if (roomConnections.has(viewerId)) {
        console.log(`⚠️ Connection already exists for viewer ${viewerId}, closing old one`);
        const oldConnection = roomConnections.get(viewerId);
        oldConnection.close();
      }
      
      const peerConnection = new RTCPeerConnection(rtcConfig);
      roomConnections.set(viewerId, peerConnection);
      
      // Add shared stream to peer connection
      if (streamRef.current) {
        console.log(`📹 Adding stream tracks to peer connection for viewer ${viewerId}`);
        console.log(`📹 Stream tracks:`, streamRef.current.getTracks());
        streamRef.current.getTracks().forEach(track => {
          console.log(`📹 Adding track:`, track.kind, track.enabled, track.readyState);
          peerConnection.addTrack(track, streamRef.current);
        });
        console.log(`📹 Total tracks added: ${streamRef.current.getTracks().length}`);
      } else {
        console.error(`❌ No stream available for viewer ${viewerId} in room ${roomName}`);
      }
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('webrtc-ice-candidate', {
            viewerId,
            candidate: event.candidate
          });
        }
      };
      
      // Set remote description and create answer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send answer back
      console.log(`📡 Sending answer back for viewer ${viewerId} with connectionId: ${connectionId}`);
      socketRef.current.emit('webrtc-answer', {
        viewerId,
        answer,
        connectionId
      });
      
      // Update viewer count for this room
      setRooms(prev => prev.map(r => 
        r.name === roomName 
          ? { ...r, viewers: r.viewers + 1 }
          : r
      ));
      
      console.log(`✅ Viewer ${viewerId} connected to room ${roomName}`);
    } catch (error) {
      console.error(`Failed to handle offer for room ${roomName}:`, error);
    }
  };

  const handleAnswer = async ({ viewerId, answer }) => {
    // This shouldn't happen for broadcaster, but handle it just in case
    console.log('Received answer from viewer:', viewerId);
  };

  const handleIceCandidate = async ({ viewerId, candidate }) => {
    // Find which room this viewer belongs to
    for (const [roomName, connections] of peerConnectionsRef.current.entries()) {
      const peerConnection = connections.get(viewerId);
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
        break;
      }
    }
  };

  const handleViewerDisconnected = ({ viewerId }) => {
    // Find and remove viewer from all rooms
    for (const [roomName, connections] of peerConnectionsRef.current.entries()) {
      if (connections.has(viewerId)) {
        const pc = connections.get(viewerId);
        pc.close();
        connections.delete(viewerId);
        
        // Update viewer count
        setRooms(prev => prev.map(r => 
          r.name === roomName 
            ? { ...r, viewers: Math.max(0, r.viewers - 1) }
            : r
        ));
        
        console.log(`👋 Viewer ${viewerId} disconnected from room ${roomName}`);
        break;
      }
    }
  };

  const cleanup = () => {
    // Close all peer connections
    peerConnectionsRef.current.forEach(roomConnections => {
      roomConnections.forEach(pc => pc.close());
    });
    peerConnectionsRef.current.clear();
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Disconnect socket
    if (socketRef.current) {
      rooms.forEach(room => {
        socketRef.current.emit('webrtc-broadcaster-stopped', { roomName: room.name });
      });
      socketRef.current.disconnect();
    }
  };

  return (
    <div className="multi-stream-manager">
      <h1>🎯 Multi-Room Streaming Manager</h1>
      <p className="subtitle">Stream to multiple rooms with a single camera!</p>

      <div className="shared-video-container">
        {sharedStream && (
          <video
            autoPlay
            muted
            playsInline
            ref={(video) => {
              if (video && sharedStream) {
                video.srcObject = sharedStream;
              }
            }}
            className="shared-video"
          />
        )}
        {!sharedStream && (
          <div className="no-stream">
            📹 Camera will activate when you create your first room
          </div>
        )}
      </div>

      <div className="create-room-section">
        <h3>➕ Create New Room</h3>
        <div className="create-room-form">
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Enter room name (e.g., 'gaming', 'music', 'tech')"
            className="room-input"
            onKeyPress={(e) => e.key === 'Enter' && createRoom()}
          />
          <button onClick={createRoom} className="create-button">
            🚀 Create Room
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="rooms-grid">
        <h3>📡 Active Rooms ({rooms.length})</h3>
        {rooms.length === 0 ? (
          <div className="no-rooms">
            No active rooms. Create one to start streaming!
          </div>
        ) : (
          <div className="rooms-list">
            {rooms.map(room => (
              <div key={room.id} className="room-card">
                <div className="room-header">
                  <h4>🏠 {room.name}</h4>
                  <span className="live-badge">🔴 LIVE</span>
                </div>
                <div className="room-stats">
                  <div className="stat">
                    <span className="stat-label">👥 Viewers:</span>
                    <span className="stat-value">{room.viewers}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">⏱️ Duration:</span>
                    <span className="stat-value">
                      {Math.floor((Date.now() - new Date(room.startTime).getTime()) / 60000)} min
                    </span>
                  </div>
                </div>
                <div className="room-url">
                  <span className="url-label">Share:</span>
                  <code>http://192.168.1.37:3001 → Room: {room.name}</code>
                </div>
                <button 
                  onClick={() => closeRoom(room.name)} 
                  className="close-room-button"
                >
                  🛑 Close Room
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .multi-stream-manager {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        h1 {
          text-align: center;
          color: #333;
          margin-bottom: 10px;
        }

        .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
        }

        .shared-video-container {
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 30px;
          position: relative;
          max-width: 600px;
          margin: 0 auto 30px;
        }

        .shared-video {
          width: 100%;
          display: block;
        }

        .no-stream {
          padding: 60px 20px;
          text-align: center;
          color: #999;
          font-size: 18px;
        }

        .create-room-section {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 30px;
        }

        .create-room-section h3 {
          margin-top: 0;
          color: #333;
        }

        .create-room-form {
          display: flex;
          gap: 10px;
        }

        .room-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 16px;
        }

        .room-input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
        }

        .create-button {
          padding: 12px 24px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .create-button:hover {
          background: #218838;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(40,167,69,0.3);
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #c62828;
        }

        .rooms-grid h3 {
          color: #333;
          margin-bottom: 20px;
        }

        .no-rooms {
          text-align: center;
          padding: 40px;
          color: #999;
          background: #f8f9fa;
          border-radius: 12px;
        }

        .rooms-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }

        .room-card {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s;
        }

        .room-card:hover {
          border-color: #007bff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .room-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .room-header h4 {
          margin: 0;
          color: #333;
        }

        .live-badge {
          background: #ff4444;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .room-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
        }

        .stat-value {
          font-size: 18px;
          font-weight: bold;
          color: #333;
        }

        .room-url {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 15px;
        }

        .url-label {
          font-size: 12px;
          color: #666;
          display: block;
          margin-bottom: 4px;
        }

        .room-url code {
          font-size: 12px;
          color: #007bff;
          word-break: break-all;
        }

        .close-room-button {
          width: 100%;
          padding: 10px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .close-room-button:hover {
          background: #c82333;
        }
      `}</style>
    </div>
  );
};

export default MultiStreamManager;