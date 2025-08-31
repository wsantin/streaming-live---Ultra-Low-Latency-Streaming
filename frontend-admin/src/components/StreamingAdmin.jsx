/**
 * Professional Streaming Admin Component
 * Ultra-low latency streaming with LiveKit VPS
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Room, createLocalVideoTrack, createLocalAudioTrack, RoomEvent } from 'livekit-client';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { API_URL, LIVEKIT_URL, TURN_CONFIG } from '../config/constants';

const StreamingAdmin = () => {
  // Core state
  const [roomName, setRoomName] = useState('');
  const [streamerName] = useState(() => {
    let saved = localStorage.getItem('streamerName');
    if (!saved) {
      saved = `admin-${Date.now().toString(36)}`;
      localStorage.setItem('streamerName', saved);
    }
    return saved;
  });

  // Connection state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Media state
  const [hasCamera, setHasCamera] = useState(null);
  const [cameraTrack, setCameraTrack] = useState(null);
  const [audioTrack, setAudioTrack] = useState(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);

  // Refs
  const videoRef = useRef(null);
  const livekitRoomRef = useRef(null);
  const socketRef = useRef(null);

  // Socket connection
  useEffect(() => {
    if (!API_URL) {
      console.error('❌ API_URL not configured');
      return;
    }

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('✅ Connected to backend');
      setError(null);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
      setError(`Connection error: ${err.message}`);
    });

    socket.on('stream:started', (data) => {
      if (data.success) {
        console.log('✅ Stream started successfully');
        const tracks = window.currentTracks || {};
        connectToLiveKit(data.adminToken, data.roomName, tracks.videoTrack, tracks.audioTrack);
      } else {
        console.error('❌ Stream start failed:', data.error);
        setError(data.error);
        setIsConnecting(false);
      }
    });

    socket.on('stream:error', (data) => {
      console.error('❌ Stream error:', data.error);
      setError(data.error);
      setIsConnecting(false);
      setIsStreaming(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [API_URL]);

  // WebRTC configuration for VPS
  const getRTCConfig = () => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: `turn:${TURN_CONFIG.host}:${TURN_CONFIG.port}`,
        username: TURN_CONFIG.username,
        credential: TURN_CONFIG.credential
      }
    ],
    iceTransportPolicy: 'all'
  });

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      setHasCamera(null); // checking
      
      const videoTrack = await createLocalVideoTrack({
        resolution: { width: 1280, height: 720 },
        frameRate: 30
      });
      
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true
      });

      setCameraTrack(videoTrack);
      setAudioTrack(audioTrack);
      
      if (videoRef.current) {
        videoTrack.attach(videoRef.current);
      }
      
      setHasCamera(true);
      console.log('✅ Camera initialized');
      
      return { videoTrack, audioTrack };
      
    } catch (error) {
      console.error('❌ Camera initialization failed:', error.message);
      setHasCamera(false);
      setError(`Camera access failed: ${error.message}`);
      return { videoTrack: null, audioTrack: null };
    }
  }, []);

  // Connect to LiveKit
  const connectToLiveKit = async (token, roomName, videoTrack = cameraTrack, audioTrack = audioTrack) => {
    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        rtcConfig: getRTCConfig()
      });

      // Room events
      room.on(RoomEvent.Connected, () => {
        console.log('✅ Connected to LiveKit VPS');
        setIsStreaming(true);
        setIsConnecting(false);
        setParticipantCount(room.remoteParticipants.size);
        toast.success('Streaming started!');
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Viewer joined:', participant.identity);
        setParticipantCount(room.remoteParticipants.size);
        toast.success(`Viewer joined! (${room.remoteParticipants.size} viewers)`);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('👤 Viewer left:', participant.identity);
        setParticipantCount(room.remoteParticipants.size);
        if (room.remoteParticipants.size > 0) {
          toast.info(`Viewer left (${room.remoteParticipants.size} viewers remaining)`);
        }
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('🔌 Disconnected from LiveKit:', reason);
        setIsStreaming(false);
        
        // Handle disconnection reasons properly (LiveKit uses numeric codes)
        if (reason !== 'CLIENT_INITIATED' && reason !== 1) {
          // reason 1 = normal disconnection, don't show error
          if (reason === 0 || reason === 2 || reason === 3) {
            // Connection issues, show error
            setError(`Connection lost (${reason})`);
          }
          // For other reasons, don't show error (normal disconnections)
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('🔄 Connection state:', state);
        if (state === 'failed') {
          setError('LiveKit connection failed');
          setIsConnecting(false);
        }
      });

      // Connect to room
      await room.connect(LIVEKIT_URL, token);

      // Debug: Show track states before publishing
      console.log('🔍 Pre-publish states:', {
        cameraTrack: !!videoTrack,
        audioTrack: !!audioTrack,
        isCameraEnabled,
        isAudioEnabled,
        cameraTrackState: videoTrack ? videoTrack.isMuted : 'no track',
        audioTrackState: audioTrack ? audioTrack.isMuted : 'no track'
      });

      // Always publish tracks, then mute if needed
      if (videoTrack) {
        try {
          console.log('📹 Publishing camera track...');
          // Ensure track is unmuted before publishing
          await videoTrack.unmute();
          
          const publication = await room.localParticipant.publishTrack(videoTrack, { 
            name: 'camera',
            videoCodec: 'vp8'
          });
          
          console.log('✅ Camera track published successfully:', publication.trackSid);
          
          // Mute after publishing if disabled
          if (!isCameraEnabled) {
            await videoTrack.mute();
            console.log('🔇 Camera muted after publishing');
          }
        } catch (error) {
          console.error('❌ Failed to publish camera track:', error);
        }
      } else {
        console.log('⚠️ No camera track to publish');
      }
      
      if (audioTrack) {
        try {
          console.log('🎤 Publishing audio track...');
          // Ensure track is unmuted before publishing
          await audioTrack.unmute();
          
          const publication = await room.localParticipant.publishTrack(audioTrack, { 
            name: 'microphone'
          });
          
          console.log('✅ Audio track published successfully:', publication.trackSid);
          
          // Mute after publishing if disabled
          if (!isAudioEnabled) {
            await audioTrack.mute();
            console.log('🔇 Audio muted after publishing');
          }
        } catch (error) {
          console.error('❌ Failed to publish audio track:', error);
        }
      } else {
        console.log('⚠️ No audio track to publish');
      }

      livekitRoomRef.current = room;
      
      // Debug: Verify published tracks
      setTimeout(() => {
        console.log('🔍 Final published tracks count:', room.localParticipant.trackPublications.size);
        room.localParticipant.trackPublications.forEach((publication, key) => {
          console.log('📡 Published track:', {
            trackSid: publication.trackSid,
            trackName: publication.trackName,
            kind: publication.kind,
            isMuted: publication.isMuted
          });
        });
      }, 1000);
      
    } catch (error) {
      console.error('❌ LiveKit connection failed:', error.message);
      setError(`LiveKit connection failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  // Start streaming
  const startStreaming = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    let currentCameraTrack = cameraTrack;
    let currentAudioTrack = audioTrack;
    
    if (!currentCameraTrack || !currentAudioTrack) {
      console.log('⚠️ Missing tracks, initializing camera...');
      const { videoTrack, audioTrack: newAudioTrack } = await initializeCamera();
      
      // Check if initialization was successful
      if (!videoTrack || !newAudioTrack) {
        setError('Failed to initialize camera/audio');
        setIsConnecting(false);
        return;
      }
      
      currentCameraTrack = videoTrack;
      currentAudioTrack = newAudioTrack;
      console.log('✅ Camera initialized, proceeding with stream...');
    }

    setIsConnecting(true);
    setError(null);

    // Store current tracks for socket handler
    window.currentTracks = { videoTrack: currentCameraTrack, audioTrack: currentAudioTrack };
    
    socketRef.current.emit('stream:start', {
      roomName: roomName.trim(),
      streamerName
    });
  };

  // Stop streaming
  const stopStreaming = () => {
    try {
      // Disconnect LiveKit
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }

      // Emit stop event
      if (socketRef.current?.connected) {
        socketRef.current.emit('stream:stop', { roomName });
      }

      setIsStreaming(false);
      setIsConnecting(false);
      toast.success('Streaming stopped');
      
    } catch (error) {
      console.error('❌ Error stopping stream:', error.message);
      setError(error.message);
    }
  };

  // Toggle camera
  const toggleCamera = async () => {
    if (!cameraTrack) return;

    try {
      const enabled = !isCameraEnabled;
      
      // If streaming, just toggle mute (track is already published)
      if (isStreaming && livekitRoomRef.current) {
        if (enabled) {
          await cameraTrack.unmute();
        } else {
          await cameraTrack.mute();
        }
      } else {
        // Not streaming yet, just update state for preview
        if (enabled) {
          await cameraTrack.unmute();
        } else {
          await cameraTrack.mute();
        }
      }
      
      setIsCameraEnabled(enabled);
      console.log('📹 Camera:', enabled ? 'enabled' : 'disabled');
      
    } catch (error) {
      console.error('❌ Error toggling camera:', error.message);
      setError(error.message);
    }
  };

  // Toggle audio
  const toggleAudio = async () => {
    if (!audioTrack) return;

    try {
      const enabled = !isAudioEnabled;
      
      // If streaming, just toggle mute (track is already published)
      if (isStreaming && livekitRoomRef.current) {
        if (enabled) {
          await audioTrack.unmute();
        } else {
          await audioTrack.mute();
        }
      } else {
        // Not streaming yet, just update state for preview
        if (enabled) {
          await audioTrack.unmute();
        } else {
          await audioTrack.mute();
        }
      }
      
      setIsAudioEnabled(enabled);
      console.log('🎤 Audio:', enabled ? 'enabled' : 'disabled');
      
    } catch (error) {
      console.error('❌ Error toggling audio:', error.message);
      setError(error.message);
    }
  };

  // Initialize camera on mount
  useEffect(() => {
    initializeCamera();
    
    return () => {
      // Cleanup
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
      }
      if (cameraTrack) {
        cameraTrack.stop();
      }
      if (audioTrack) {
        audioTrack.stop();
      }
    };
  }, [initializeCamera]);

  return (
    <div className="streaming-admin">
      <div className="admin-container">
        <div className="admin-header">
          <h1>🎥 Professional Streaming</h1>
          <p>Ultra-low latency streaming with LiveKit VPS</p>
        </div>

        {/* Video Preview */}
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="preview-video"
            style={{
              transform: 'scaleX(-1)', // Mirror effect
              WebkitTransform: 'scaleX(-1)' // Safari compatibility
            }}
          />
          
          {hasCamera === null && (
            <div className="video-status">
              <div className="loading">Initializing camera...</div>
            </div>
          )}
          
          {hasCamera === false && (
            <div className="video-status error">
              <div className="error-message">
                📹 Camera access denied or failed
                <button onClick={initializeCamera} className="retry-btn">
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="controls">
          <div className="room-input">
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Enter room name"
              disabled={isStreaming || isConnecting}
              className="room-name-input"
            />
          </div>

          <div className="media-controls">
            <button
              onClick={toggleCamera}
              className={`control-btn ${isCameraEnabled ? 'active' : 'inactive'}`}
              disabled={!cameraTrack}
            >
              📹 {isCameraEnabled ? 'Camera On' : 'Camera Off'}
            </button>
            
            <button
              onClick={toggleAudio}
              className={`control-btn ${isAudioEnabled ? 'active' : 'inactive'}`}
              disabled={!audioTrack}
            >
              🎤 {isAudioEnabled ? 'Audio On' : 'Audio Off'}
            </button>
          </div>

          <div className="stream-controls">
            {!isStreaming ? (
              <button
                onClick={startStreaming}
                disabled={isConnecting || !hasCamera || !roomName.trim()}
                className="start-btn"
              >
                {isConnecting ? 'Starting...' : '🚀 Start Streaming'}
              </button>
            ) : (
              <button
                onClick={stopStreaming}
                className="stop-btn"
              >
                🛑 Stop Streaming
              </button>
            )}
          </div>

          {/* Status */}
          <div className="status">
            {isStreaming && (
              <div className="streaming-status">
                <div className="live-badge">🔴 LIVE</div>
                🏠 <strong>Room:</strong> {roomName}
                <br />
                👥 <strong>Viewers:</strong> {participantCount}
                <br />
                🎯 <strong>Streamer:</strong> {streamerName}
                <br />
                📹 <strong>Camera:</strong> {isCameraEnabled ? 'ON' : 'OFF'} | 
                🎤 <strong>Audio:</strong> {isAudioEnabled ? 'ON' : 'OFF'}
              </div>
            )}
            
            {error && (
              <div className="error-status">
                {API_URL}
                ❌ <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .streaming-admin {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .admin-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .admin-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }

        .admin-header h1 {
          margin: 0 0 8px 0;
          font-size: 2rem;
          font-weight: 700;
        }

        .admin-header p {
          margin: 0;
          opacity: 0.9;
        }

        .video-container {
          position: relative;
          background: #000;
          width: 100%;
          height: 400px; /* Fixed height for desktop */
          border-radius: 12px;
          overflow: hidden;
        }

        .preview-video {
          width: 100%;
          height: 100%;
          object-fit: contain; /* Show complete camera capture */
          object-position: center;
          background: #000; /* Fill empty space with black */
        }

        @media (max-width: 768px) {
          .streaming-admin {
            padding: 5px;
            max-width: 100%;
          }

          .admin-container {
            border-radius: 0; /* Full screen like TikTok */
            box-shadow: none;
          }

          .admin-header {
            padding: 15px;
          }

          .admin-header h1 {
            font-size: 1.3rem;
          }

          .controls {
            padding: 15px;
          }

          .media-controls {
            flex-direction: row;
            gap: 10px;
          }

          .control-btn {
            flex: 1;
            padding: 12px 8px;
            font-size: 0.9rem;
          }

          /* TikTok-style full height video */
          .video-container {
            height: calc(100vh - 250px); /* More height minus controls */
            min-height: 600px;
            border-radius: 8px;
            margin: 0 -5px; /* Extend to edges */
          }

          .preview-video {
            object-fit: contain; /* Show complete camera */
            object-position: center;
          }
        }

        @media (max-width: 480px) {
          .streaming-admin {
            padding: 2px;
          }

          .admin-header {
            padding: 10px;
          }

          .controls {
            padding: 10px;
          }

          /* Ultra immersive like TikTok mobile */
          .video-container {
            height: calc(100vh - 200px);
            min-height: 550px;
            border-radius: 4px;
            margin: 0 -2px;
          }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          /* Tablet - Instagram style */
          .video-container {
            height: 450px;
            border-radius: 12px;
          }
        }

        @media (min-width: 1025px) {
          /* Desktop - Facebook style */
          .video-container {
            height: 500px;
            max-width: 800px;
            margin: 0 auto;
          }
        }

        .video-status {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          font-size: 1.1rem;
        }

        .loading {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        .error-message {
          text-align: center;
        }

        .retry-btn {
          display: block;
          margin: 12px auto 0;
          padding: 8px 16px;
          background: #ff4757;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .controls {
          padding: 30px;
          space-y: 20px;
        }

        .room-input {
          margin-bottom: 24px;
        }

        .room-name-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .room-name-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .media-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .control-btn {
          flex: 1;
          padding: 12px 20px;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .control-btn.active {
          background: #00d2d3;
          border-color: #00d2d3;
          color: white;
        }

        .control-btn.inactive {
          background: #ff4757;
          border-color: #ff4757;
          color: white;
        }

        .control-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stream-controls {
          margin-bottom: 24px;
        }

        .start-btn, .stop-btn {
          width: 100%;
          padding: 16px 24px;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .start-btn {
          background: linear-gradient(135deg, #00d2d3 0%, #00b894 100%);
          color: white;
        }

        .start-btn:disabled {
          background: #ddd;
          cursor: not-allowed;
        }

        .stop-btn {
          background: linear-gradient(135deg, #ff7675 0%, #d63031 100%);
          color: white;
        }

        .status {
          text-align: center;
          font-size: 0.95rem;
        }

        .streaming-status {
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
          color: #155724;
          padding: 20px;
          border-radius: 12px;
          border: 2px solid #00b894;
          position: relative;
          box-shadow: 0 4px 15px rgba(0, 184, 148, 0.2);
        }

        .live-badge {
          position: absolute;
          top: -10px;
          right: 20px;
          background: linear-gradient(135deg, #ff4757 0%, #d63031 100%);
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          animation: pulse 2s infinite;
          box-shadow: 0 2px 10px rgba(255, 71, 87, 0.4);
        }

        .error-status {
          background: #f8d7da;
          color: #721c24;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};

export default StreamingAdmin;