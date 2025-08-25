import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { API_URL } from '../config/constants';

const RoomCreator = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [roomName, setRoomName] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  
  // Wake Lock API to prevent screen from turning off during streaming
  const wakeLockRef = useRef(null);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const socketRef = useRef(null);
  
  // Estado para IP local dinámica
  const [localIP, setLocalIP] = useState(null);
  
  // WebRTC Configuration dinámica basada en IP local
  const getRTCConfig = () => {
    const baseConfig = {
      iceServers: [
        // Servidores STUN públicos gratuitos 
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    };
    
    // Añadir IP local como candidato preferido si está disponible
    if (localIP) {
      baseConfig.iceServers.unshift({
        urls: `stun:${localIP}:3478`
      });
    }
    
    return baseConfig;
  };

  useEffect(() => {
    // Generate or restore session ID
    const savedSessionId = localStorage.getItem('admin-session-id');
    const newSessionId = savedSessionId || `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    localStorage.setItem('admin-session-id', newSessionId);

    // Obtener IP local del backend primero
    fetch(`${API_URL}/api/network/local-ip`)
      .then(res => res.json())
      .then(data => {
        console.log('🌐 IP local recibida:', data.localIP);
        setLocalIP(data.localIP);
      })
      .catch(err => console.log('⚠️ Error obteniendo IP local:', err));

    // Connect to signaling server
    socketRef.current = io(API_URL, {
      transports: ['polling', 'websocket'],
      forceNew: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current.on('connect', () => {
      console.log('🔗 Connected to WebRTC signaling server');
      
      // Try to restore session
      if (savedSessionId) {
        socketRef.current.emit('restore-session', { sessionId: savedSessionId });
      }
    });

    // Session events
    socketRef.current.on('session-restored', (data) => {
      console.log('🔄 Session restored:', data);
      setCurrentRoom(data.roomName);
      setViewerCount(data.viewerCount);
      setIsStreaming(true);
      
      // Restart camera stream
      restartCameraStream();
    });

    socketRef.current.on('session-not-found', () => {
      console.log('❌ Session not found, starting fresh');
      localStorage.removeItem('admin-session-id');
    });

    // Room events
    socketRef.current.on('room-created', (data) => {
      console.log('🏠 Room created:', data);
      setCurrentRoom(data.roomName);
      setViewerCount(data.viewerCount);
      setIsStreaming(true);
      
      // Notify backend that broadcaster is ready to receive WebRTC offers
      const currentSessionId = sessionId || localStorage.getItem('admin-session-id');
      console.log('📡 Broadcaster ready - sessionId:', currentSessionId, '(state:', sessionId, ')');
      
      socketRef.current.emit('webrtc-broadcaster-ready', {
        streamerId: currentSessionId,
        roomName: data.roomName
      });
      console.log('📡 Broadcaster ready for WebRTC in room:', data.roomName);
    });

    socketRef.current.on('room-error', (data) => {
      setError(data.error);
      setIsStreaming(false);
    });

    socketRef.current.on('viewer-joined', (data) => {
      setViewerCount(data.viewerCount);
    });

    socketRef.current.on('viewer-left', (data) => {
      setViewerCount(data.viewerCount);
    });

    // WebRTC events
    socketRef.current.on('webrtc-offer', handleOffer);
    socketRef.current.on('webrtc-ice-candidate', handleIceCandidate);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      releaseWakeLock(); // Release wake lock on component unmount
      stopStreaming();
    };
  }, []);

  const restartCameraStream = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          // Mobile-optimized audio settings
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      streamRef.current = stream;
      
      // Re-add tracks to existing peer connections
      peerConnectionsRef.current.forEach(pc => {
        // Remove old tracks
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            pc.removeTrack(sender);
          }
        });
        
        // Add new tracks
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      });
      
    } catch (error) {
      console.error('❌ Error restarting camera:', error);
    }
  };

  const createRoom = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    try {
      setError(null);
      
      // Get camera stream first
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          // Mobile-optimized audio settings
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      streamRef.current = stream;
      console.log(`🎥 Stream ready with ${stream.getTracks().length} tracks:`, stream.getTracks().map(t => `${t.kind}:${t.label}`));
      
      // Request wake lock to prevent screen from turning off
      const wakeLockActivated = await requestWakeLock();
      if (!wakeLockActivated) {
        console.log('⚠️ Wake lock not available - screen may turn off during streaming');
      }
      
      // Create room - usar localStorage como fallback
      const currentSessionId = sessionId || localStorage.getItem('admin-session-id');
      console.log('🆔 Creating room with sessionId:', currentSessionId, '(state:', sessionId, ')');
      
      socketRef.current.emit('create-room', { 
        roomName: roomName.trim(),
        sessionId: currentSessionId
      });
      
    } catch (error) {
      console.error('❌ Error creating room:', error);
      setError('Failed to access camera: ' + error.message);
    }
  };

  const stopStreaming = async () => {
    // Release wake lock to allow screen to turn off normally
    await releaseWakeLock();
    
    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    // Stop media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Leave room
    if (socketRef.current && currentRoom) {
      socketRef.current.emit('leave-room');
    }
    
    setIsStreaming(false);
    setCurrentRoom(null);
    setViewerCount(0);
    setRoomName('');
    
    // Clear session
    localStorage.removeItem('admin-session-id');
    
    console.log('🛑 Streaming stopped - screen can now turn off');
  };

  const handleOffer = async ({ viewerId, offer, roomName: offerRoomName }) => {
    try {
      console.log(`📞 Handling offer from viewer: ${viewerId} in room: ${offerRoomName || currentRoom}`);
      console.log('🔍 Viewer offer details:', {
        viewerId,
        offerRoomName,
        currentRoomState: currentRoom,
        offerType: offer?.type,
        sdpLength: offer?.sdp?.length || 0
      });
      
      const rtcConfig = getRTCConfig();
      console.log('🔗 Using WebRTC config for', viewerId, ':', rtcConfig);
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(viewerId, peerConnection);
      
      // Add local stream
      if (streamRef.current) {
        console.log(`📹 Adding ${streamRef.current.getTracks().length} tracks to peer connection`);
        streamRef.current.getTracks().forEach(track => {
          console.log(`🎥 Adding track: ${track.kind} (${track.label})`);
          peerConnection.addTrack(track, streamRef.current);
        });
      } else {
        console.error('❌ No stream available when creating peer connection!');
      }
      
      // Handle ICE candidates with detailed logging
      let candidateCount = 0;
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          console.log(`🧊 Sending ICE candidate ${candidateCount} to ${viewerId}:`, {
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port
          });
          const targetRoom = offerRoomName || currentRoom;
          console.log(`🧊 Sending ICE candidate to room: ${targetRoom}`);
          socketRef.current.emit('webrtc-ice-candidate', {
            viewerId,
            candidate: event.candidate,
            roomName: targetRoom
          });
        } else {
          console.log(`🧊 ICE gathering complete for ${viewerId}`);
        }
      };
      
      // Handle connection state with mobile debugging
      peerConnection.onconnectionstatechange = () => {
        console.log(`🔗 Connection state with ${viewerId}:`, peerConnection.connectionState);
        console.log(`📊 ${viewerId} connection details:`, {
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
          iceGatheringState: peerConnection.iceGatheringState,
          signalingState: peerConnection.signalingState
        });
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
          console.log(`❌ Removing failed connection for viewer: ${viewerId}`);
          peerConnectionsRef.current.delete(viewerId);
        } else if (peerConnection.connectionState === 'connected') {
          console.log(`✅ Successfully connected to viewer: ${viewerId}`);
        }
      };

      // Enhanced ICE debugging for mobile viewers
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`🧊 ICE connection state with ${viewerId}:`, peerConnection.iceConnectionState);
      };

      peerConnection.onicegatheringstatechange = () => {
        console.log(`🧊 ICE gathering state with ${viewerId}:`, peerConnection.iceGatheringState);
      };
      
      // Set remote description and create answer
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send answer
      const targetRoom = offerRoomName || currentRoom;
      console.log(`📞 Sending answer to viewer ${viewerId} in room: ${targetRoom}`);
      socketRef.current.emit('webrtc-answer', {
        viewerId,
        answer,
        roomName: targetRoom
      });
      
    } catch (error) {
      console.error(`❌ Error handling offer from ${viewerId}:`, error);
    }
  };

  const handleIceCandidate = async ({ viewerId, candidate, roomName: candidateRoomName }) => {
    console.log(`🧊 Received ICE candidate from viewer ${viewerId} in room: ${candidateRoomName || currentRoom}`);
    const peerConnection = peerConnectionsRef.current.get(viewerId);
    if (peerConnection && candidate) {
      try {
        console.log(`🧊 Adding ICE candidate: ${candidate.type} ${candidate.address}:${candidate.port}`);
        await peerConnection.addIceCandidate(candidate);
        console.log(`✅ ICE candidate added successfully for ${viewerId}`);
      } catch (error) {
        console.error(`❌ Error adding ICE candidate for ${viewerId}:`, error);
      }
    } else {
      if (!peerConnection) {
        console.warn(`⚠️ No peer connection found for viewer ${viewerId}`);
      }
      if (!candidate) {
        console.log(`🧊 ICE gathering complete from viewer ${viewerId}`);
      }
    }
  };

  // Wake Lock functions to keep screen active during streaming
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('🔒 Screen wake lock activated - screen will stay on');
        
        wakeLockRef.current.addEventListener('release', () => {
          console.log('🔓 Screen wake lock released');
        });
        
        return true;
      } else {
        console.log('⚠️ Wake Lock API not supported on this device');
        return false;
      }
    } catch (err) {
      console.error('❌ Failed to request wake lock:', err);
      return false;
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('🔓 Screen wake lock released manually');
      } catch (err) {
        console.error('❌ Failed to release wake lock:', err);
      }
    }
  };

  // Handle visibility change (when user switches tabs/apps)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (isStreaming && wakeLockRef.current && document.visibilityState === 'visible') {
        // Re-request wake lock when returning to the tab
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('🔒 Wake lock re-activated after returning to tab');
        } catch (err) {
          console.log('⚠️ Could not re-activate wake lock');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isStreaming]);

  return (
    <div className="room-creator">
      <div className="header">
        <h1>🚀 WebRTC Live Streaming - Admin</h1>
        {currentRoom && (
          <div className="room-info">
            <h2>📡 Room: {currentRoom}</h2>
            <div className="stats">
              <span className="stat">👥 Viewers: {viewerCount}</span>
              <span className={`status ${isStreaming ? 'live' : 'offline'}`}>
                {isStreaming ? '🔴 LIVE' : '⚫ OFFLINE'}
              </span>
              {isStreaming && wakeLockRef.current && (
                <span className="wake-lock-indicator" title="Screen will stay on during streaming">
                  🔒 Screen Lock
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="local-video"
        />
        {isStreaming && (
          <div className="live-overlay">
            <div className="live-indicator">🔴 LIVE</div>
          </div>
        )}
      </div>

      <div className="controls">
        {!isStreaming ? (
          <div className="create-room">
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Enter room name (e.g., 'my-stream')"
              className="room-input"
              onKeyPress={(e) => e.key === 'Enter' && createRoom()}
            />
            <button 
              onClick={createRoom}
              className="create-button"
              disabled={!roomName.trim()}
            >
              🚀 Create Room & Start Streaming
            </button>
          </div>
        ) : (
          <button 
            onClick={stopStreaming}
            className="stop-button"
          >
            🛑 Stop Streaming
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {isStreaming && !wakeLockRef.current && (
        <div className="wake-lock-warning">
          📱 <strong>Tip:</strong> To prevent your screen from turning off during streaming, 
          keep this tab active or adjust your device's screen timeout settings.
        </div>
      )}

      <div className="info-panel">
        <h3>🔥 Ultra-Low Latency WebRTC</h3>
        <ul>
          <li>✅ Direct P2P streaming</li>
          <li>✅ Sub-second latency</li>
          <li>✅ Session persistence</li>
          <li>✅ Auto-reconnection</li>
        </ul>
      </div>

      <style jsx>{`
        .room-creator {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .header {
          text-align: center;
          margin-bottom: 20px;
        }

        .header h1 {
          color: #333;
          margin-bottom: 10px;
        }

        .room-info h2 {
          color: #666;
          margin: 10px 0;
        }

        .stats {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin: 10px 0;
        }

        .stat {
          font-size: 18px;
          font-weight: bold;
          color: #333;
        }

        .status {
          font-size: 18px;
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .status.live {
          color: #fff;
          background: #ff4444;
          animation: pulse 1s infinite;
        }

        .status.offline {
          color: #666;
          background: #f0f0f0;
        }

        .wake-lock-indicator {
          font-size: 14px;
          font-weight: bold;
          color: #fff;
          background: #4caf50;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: help;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .video-container {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          margin: 20px 0;
        }

        .local-video {
          width: 100%;
          height: auto;
          max-height: 600px;
          display: block;
          transform: scaleX(-1);
        }

        .live-overlay {
          position: absolute;
          top: 10px;
          left: 10px;
        }

        .live-indicator {
          background: #ff4444;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: bold;
          animation: pulse 1s infinite;
        }

        .controls {
          text-align: center;
          margin: 20px 0;
        }

        .create-room {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
        }

        .room-input {
          padding: 12px;
          font-size: 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          min-width: 250px;
        }

        .room-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .create-button, .stop-button {
          padding: 12px 24px;
          font-size: 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: bold;
        }

        .create-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .create-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .create-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .stop-button {
          background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
          color: white;
        }

        .stop-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255, 65, 108, 0.4);
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #c62828;
          text-align: center;
        }

        .wake-lock-warning {
          background: #fff3cd;
          color: #856404;
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #ffc107;
          text-align: center;
          font-size: 14px;
        }

        .info-panel {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 12px;
          margin-top: 30px;
        }

        .info-panel h3 {
          margin-top: 0;
          color: #333;
        }

        .info-panel ul {
          list-style: none;
          padding: 0;
        }

        .info-panel li {
          padding: 8px 0;
          color: #555;
        }
      `}</style>
    </div>
  );
};

export default RoomCreator;