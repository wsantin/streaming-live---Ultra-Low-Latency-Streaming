/**
 * Professional Streaming Viewer Component
 * Ultra-low latency viewing with LiveKit VPS
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Room, RoomEvent, RemoteParticipant } from 'livekit-client';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { API_URL, LIVEKIT_URL, TURN_CONFIG } from '../config/constants';

const StreamingViewer = () => {
  // Core state
  const [roomName, setRoomName] = useState('');
  const [viewerName] = useState(() => {
    let saved = localStorage.getItem('viewerName');
    if (!saved) {
      saved = `viewer-${Date.now().toString(36)}`;
      localStorage.setItem('viewerName', saved);
    }
    return saved;
  });

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [error, setError] = useState(null);

  // Stream state
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [streamStats, setStreamStats] = useState(null);

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
      socket.emit('rooms:list');
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
      setError(`Connection error: ${err.message}`);
    });

    socket.on('rooms:updated', (rooms) => {
      setAvailableRooms(rooms);
      console.log('📝 Rooms updated:', rooms.length);
    });

    socket.on('room:joined', (data) => {
      if (data.success) {
        console.log('✅ Room joined successfully');
        connectToLiveKit(data.viewerToken, data.roomName);
      } else {
        console.error('❌ Room join failed:', data.error);
        setError(data.error);
        setIsConnecting(false);
      }
    });

    socket.on('room:error', (data) => {
      console.error('❌ Room error:', data.error);
      setError(data.error);
      setIsConnecting(false);
      setIsConnected(false);
    });

    socket.on('stats:update', (stats) => {
      setStreamStats(stats);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [API_URL]);

  // WebRTC configuration for VPS
  // Helper function to wait for video ref and attach
  const attachVideoTrack = (track) => {
    const attemptAttach = (attempts = 0) => {
      if (videoRef.current) {
        try {
          track.attach(videoRef.current);
          setHasVideo(true);
          console.log('✅ Video track attached successfully (attempt', attempts + 1, ')');
          
          // Force video element to play
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.play().catch(e => console.log('Video autoplay blocked:', e));
            }
          }, 100);
        } catch (error) {
          console.error('❌ Failed to attach video track:', error);
        }
      } else if (attempts < 10) {
        console.log('⏳ Waiting for video ref, attempt', attempts + 1);
        setTimeout(() => attemptAttach(attempts + 1), 100);
      } else {
        console.error('❌ Video ref not available after 10 attempts');
      }
    };
    
    attemptAttach();
  };

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

  // Connect to LiveKit room
  const connectToLiveKit = async (token, roomName) => {
    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        autoSubscribe: true,
        rtcConfig: getRTCConfig()
      });

      // Room events
      room.on(RoomEvent.Connected, () => {
        console.log('✅ Connected to LiveKit VPS');
        setIsConnected(true);
        setIsConnecting(false);
        toast.success('Connected to stream!');
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('🔌 Disconnected from LiveKit:', reason);
        setIsConnected(false);
        setHasVideo(false);
        setHasAudio(false);
        
        // Handle disconnection reasons properly (LiveKit uses numeric codes)
        if (reason !== 'CLIENT_INITIATED' && reason !== 1) {
          // reason 1 = normal disconnection
          if (reason === 0 || reason === 2 || reason === 3) {
            // Connection issues
            setError(`Connection lost (${reason})`);
          } else if (reason === 'ROOM_DELETED' || reason === 'SERVER_SHUTDOWN') {
            toast.info('Stream ended by host');
            setTimeout(() => {
              leaveRoom();
            }, 2000);
          }
          // For reason 1 or other normal disconnections, don't show error
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('📺 Track subscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === 'video') {
          console.log('🎥 Video ref exists (TrackSubscribed):', !!videoRef.current);
          attachVideoTrack(track);
        } else if (track.kind === 'audio') {
          try {
            track.attach();
            setHasAudio(true);
            console.log('✅ Audio track attached');
          } catch (error) {
            console.error('❌ Failed to attach audio track:', error);
          }
        }
      });
      
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        console.log('📡 Track published:', publication.trackName, 'by', participant.identity);
      });

      room.on(RoomEvent.TrackMuted, (publication, participant) => {
        console.log('🔇 Track muted:', publication.trackName, 'by', participant.identity);
        if (publication.kind === 'video') {
          setHasVideo(false);
        } else if (publication.kind === 'audio') {
          setHasAudio(false);
        }
      });

      room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        console.log('🔊 Track unmuted:', publication.trackName, 'by', participant.identity);
        if (publication.kind === 'video') {
          setHasVideo(true);
        } else if (publication.kind === 'audio') {
          setHasAudio(true);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('📺 Track unsubscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === 'video') {
          track.detach();
          setHasVideo(false);
        } else if (track.kind === 'audio') {
          track.detach();
          setHasAudio(false);
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Participant joined:', participant.identity);
        console.log('📡 Participant tracks:', participant.trackPublications.size);
        
        // Subscribe to existing tracks
        participant.trackPublications.forEach((publication) => {
          console.log('📡 New participant publication:', {
            trackName: publication.trackName,
            kind: publication.kind,
            isSubscribed: publication.isSubscribed,
            hasTrack: !!publication.track
          });
          
          // Try to subscribe
          if (!publication.isSubscribed && publication.kind !== 'unknown') {
            console.log('🔄 Subscribing to new participant track:', publication.trackName);
            publication.setSubscribed(true);
          }
          
          if (publication.track) {
            console.log('🔄 Auto-attaching new participant track:', publication.trackName);
            if (publication.track.kind === 'video') {
              attachVideoTrack(publication.track);
            } else if (publication.track.kind === 'audio') {
              publication.track.attach();
              setHasAudio(true);
            }
          }
        });
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('👤 Participant left:', participant.identity);
        setHasVideo(false);
        setHasAudio(false);
        
        // If streamer left, show ended message and return to room list
        if (room.remoteParticipants.size === 0) {
          toast.success('Stream ended');
          setTimeout(() => {
            leaveRoom();
          }, 2000);
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
      livekitRoomRef.current = room;
      
      // Check for existing participants and their tracks
      console.log('🔍 Checking existing participants:', room.remoteParticipants.size);
      room.remoteParticipants.forEach((participant) => {
        console.log('👤 Found existing participant:', participant.identity);
        console.log('📊 Track publications:', participant.trackPublications.size);
        
        participant.trackPublications.forEach((publication) => {
          console.log('📡 Publication:', {
            trackName: publication.trackName,
            kind: publication.kind,
            isSubscribed: publication.isSubscribed,
            hasTrack: !!publication.track,
            isMuted: publication.isMuted
          });
          
          // Set initial state based on mute status
          if (publication.kind === 'video') {
            setHasVideo(!publication.isMuted && publication.isSubscribed);
          } else if (publication.kind === 'audio') {
            setHasAudio(!publication.isMuted && publication.isSubscribed);
          }
          
          // Try to subscribe if not already subscribed
          if (!publication.isSubscribed && publication.kind !== 'unknown') {
            console.log('🔄 Attempting to subscribe to:', publication.trackName);
            publication.setSubscribed(true);
          }
          
          // Attach if track exists and is subscribed
          if (publication.track && publication.isSubscribed) {
            console.log('📺 Attaching existing track:', publication.trackName, publication.track.kind);
            if (publication.track.kind === 'video') {
              console.log('🎥 Video ref exists:', !!videoRef.current);
              attachVideoTrack(publication.track);
            } else if (publication.track.kind === 'audio') {
              try {
                publication.track.attach();
                setHasAudio(true);
                console.log('✅ Audio track attached successfully');
              } catch (error) {
                console.error('❌ Failed to attach audio track:', error);
              }
            }
          }
        });
      });
      
    } catch (error) {
      console.error('❌ LiveKit connection failed:', error.message);
      setError(`Connection failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  // Join room
  const joinRoom = async (selectedRoomName) => {
    if (!selectedRoomName) {
      setError('Please select or enter a room name');
      return;
    }

    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    setIsConnecting(true);
    setError(null);
    setRoomName(selectedRoomName); // Set the room name for display

    socketRef.current.emit('room:join', {
      roomName: selectedRoomName,
      viewerName
    });
  };

  // Leave room
  const leaveRoom = () => {
    try {
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }

      setIsConnected(false);
      setHasVideo(false);
      setHasAudio(false);
      toast.success('Left room');
      
      // Clear room name after a short delay to show "Left room" message
      setTimeout(() => {
        setRoomName('');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error leaving room:', error.message);
      setError(error.message);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="streaming-viewer">
      <div className="viewer-container">
        <div className="viewer-header">
          <h1>👁️ Professional Viewer</h1>
          <p>Ultra-low latency viewing with LiveKit VPS</p>
          
          {streamStats && (
            <div className="stats">
              📊 {streamStats.activeStreams} streams, {streamStats.connectedViewers} viewers
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="room-selection">
            <div className="available-rooms">
              <h3>📺 Available Streams</h3>
              
              {availableRooms.length === 0 ? (
                <div className="no-rooms">
                  <p>No active streams found</p>
                  <p>Streams will appear here automatically</p>
                </div>
              ) : (
                <div className="rooms-list">
                  {availableRooms.map((room) => (
                    <div
                      key={room.roomName}
                      className="room-card"
                      onClick={() => joinRoom(room.roomName)}
                    >
                      <div className="room-info">
                        <div className="room-name">🏠 {room.roomName}</div>
                        <div className="room-meta">
                          <span>👤 {room.streamerName}</span>
                          <span className="live-indicator">🔴 LIVE</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="manual-join">
              <h3>🎯 Join Specific Room</h3>
              <div className="join-controls">
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Enter room name"
                  disabled={isConnecting}
                  className="room-input"
                />
                <button
                  onClick={() => joinRoom(roomName)}
                  disabled={isConnecting || !roomName.trim()}
                  className="join-btn"
                >
                  {isConnecting ? 'Joining...' : '🚀 Join Room'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="stream-view">
            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="stream-video"
                style={{
                  transform: 'scaleX(-1)', // Mirror effect
                  WebkitTransform: 'scaleX(-1)' // Safari compatibility
                }}
              />
              
              {/* Room info overlay - top left */}
              {roomName && (
                <div className="video-overlay top-left">
                  <div className="room-info">
                    <span className="room-name">🏠 {roomName}</span>
                    <span className="live-badge">🔴 LIVE</span>
                  </div>
                </div>
              )}
              
              {!hasVideo && (
                <div className="no-video">
                  <div className="status-message">
                    {!isConnected 
                      ? '🔄 Connecting...' 
                      : hasAudio 
                        ? '🎤 Audio only' 
                        : '⏳ Waiting for video stream...'
                    }
                  </div>
                  {isConnected && !hasVideo && !hasAudio && (
                    <div className="sub-message">
                      Host may not have started streaming yet
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="stream-controls">
              <div className="stream-info">
                <div className="info-row">
                  <span>👤 <strong>Viewer:</strong> {viewerName}</span>
                  <span className="connection-quality">
                    {isConnected ? '✅ Connected' : '⚠️ Connecting...'}
                  </span>
                </div>
                <div className="media-status">
                  <div className="media-indicator">
                    <span className={hasVideo ? 'status-active' : 'status-inactive'}>
                      {hasVideo ? '📹 Video: ON' : '🙈 Video: OFF'}
                    </span>
                    <div className={`signal ${hasVideo ? 'active' : 'inactive'}`}></div>
                  </div>
                  <div className="media-indicator">
                    <span className={hasAudio ? 'status-active' : 'status-inactive'}>
                      {hasAudio ? '🎤 Audio: ON' : '🔇 Audio: OFF'}
                    </span>
                    <div className={`signal ${hasAudio ? 'active' : 'inactive'}`}></div>
                  </div>
                </div>
              </div>

              <button
                onClick={leaveRoom}
                className="leave-btn"
              >
                🚪 Leave Room
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            ❌ <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} className="close-error">×</button>
          </div>
        )}
      </div>

      <style jsx>{`
        .streaming-viewer {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .viewer-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .viewer-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }

        .viewer-header h1 {
          margin: 0 0 8px 0;
          font-size: 2rem;
          font-weight: 700;
        }

        .viewer-header p {
          margin: 0 0 12px 0;
          opacity: 0.9;
        }

        .stats {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 8px 16px;
          display: inline-block;
          font-size: 0.9rem;
        }

        .room-selection {
          padding: 30px;
        }

        .available-rooms {
          margin-bottom: 40px;
        }

        .available-rooms h3 {
          margin: 0 0 20px 0;
          font-size: 1.3rem;
          color: #2d3748;
        }

        .no-rooms {
          text-align: center;
          padding: 40px 20px;
          color: #718096;
        }

        .rooms-list {
          display: grid;
          gap: 12px;
        }

        .room-card {
          background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .room-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transition: left 0.5s;
        }

        .room-card:hover {
          border-color: #667eea;
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);
        }

        .room-card:hover::before {
          left: 100%;
        }

        .room-card:active {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
        }

        .room-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .room-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: #2d3748;
        }

        .room-meta {
          display: flex;
          gap: 12px;
          align-items: center;
          font-size: 0.9rem;
          color: #718096;
        }

        .live-indicator {
          background: linear-gradient(135deg, #ff4757 0%, #d63031 100%);
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          animation: pulse-live 2s infinite;
          box-shadow: 0 2px 10px rgba(255, 71, 87, 0.4);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        @keyframes pulse-live {
          0%, 100% { 
            opacity: 0.8;
            transform: scale(1);
            box-shadow: 0 2px 10px rgba(255, 71, 87, 0.4);
          }
          50% { 
            opacity: 1;
            transform: scale(1.05);
            box-shadow: 0 4px 20px rgba(255, 71, 87, 0.6);
          }
        }

        .manual-join h3 {
          margin: 0 0 16px 0;
          font-size: 1.3rem;
          color: #2d3748;
        }

        .join-controls {
          display: flex;
          gap: 12px;
        }

        .room-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .room-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .join-btn {
          padding: 14px 28px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          position: relative;
          overflow: hidden;
        }

        .join-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .join-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        .join-btn:hover::before {
          left: 100%;
        }

        .join-btn:active {
          transform: translateY(-1px);
        }

        .join-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .join-btn:disabled::before {
          display: none;
        }

        .stream-view {
          display: flex;
          flex-direction: column;
        }

        .video-container {
          position: relative;
          background: #000;
          aspect-ratio: 16/9;
        }

        .stream-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .no-video {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          font-size: 1.2rem;
        }

        .status-message {
          animation: pulse 2s infinite;
        }

        .video-overlay {
          position: absolute;
          z-index: 10;
          pointer-events: none;
        }

        .video-overlay.top-left {
          top: 15px;
          left: 15px;
        }

        .room-info {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(0, 0, 0, 0.7);
          padding: 8px 12px;
          border-radius: 8px;
          backdrop-filter: blur(10px);
        }

        .room-name {
          color: white;
          font-weight: bold;
          font-size: 0.9rem;
        }

        .live-badge {
          color: #ff4444;
          font-weight: bold;
          font-size: 0.85rem;
          animation: pulse 2s infinite;
        }

        .stream-controls {
          padding: 30px;
          background: black;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stream-info {
          flex: 1;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .media-status {
          display: flex;
          gap: 20px;
          margin-top: 16px;
          font-size: 0.9rem;
        }

        .media-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .signal {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .signal.active {
          background: #00b894;
          box-shadow: 0 0 10px rgba(0, 184, 148, 0.6);
          animation: signal-pulse 2s infinite;
        }

        .signal.inactive {
          background: #636e72;
          opacity: 0.5;
        }

        @keyframes signal-pulse {
          0%, 100% { 
            transform: scale(1);
            opacity: 1;
          }
          50% { 
            transform: scale(1.2);
            opacity: 0.8;
          }
        }

        .connection-quality {
          font-size: 0.8rem;
          color: #00b894;
          font-weight: 600;
        }

        .status-active {
          color: #00b894;
          font-weight: 700;
          text-shadow: 0 1px 2px rgba(0, 184, 148, 0.3);
          animation: glow-green 3s infinite;
        }

        .status-inactive {
          color: #636e72;
          opacity: 0.7;
          animation: fade-pulse 2s infinite;
        }

        @keyframes glow-green {
          0%, 100% { 
            text-shadow: 0 1px 2px rgba(0, 184, 148, 0.3);
          }
          50% { 
            text-shadow: 0 1px 8px rgba(0, 184, 148, 0.6);
          }
        }

        @keyframes fade-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.4; }
        }

        .leave-btn {
          padding: 14px 28px;
          background: linear-gradient(135deg, #ff7675 0%, #d63031 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(255, 118, 117, 0.3);
          animation: pulse-leave 4s infinite;
        }

        .leave-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 118, 117, 0.4);
          animation: none;
        }

        @keyframes pulse-leave {
          0%, 100% { 
            box-shadow: 0 4px 15px rgba(255, 118, 117, 0.3);
          }
          50% { 
            box-shadow: 0 4px 15px rgba(255, 118, 117, 0.5);
          }
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 16px 20px;
          margin: 20px;
          border-radius: 8px;
          border: 1px solid #feb2b2;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-error {
          background: none;
          border: none;
          color: #c53030;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        @media (max-width: 768px) {
          .stream-controls {
            flex-direction: column;
            gap: 20px;
            align-items: stretch;
          }

          .info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .media-status {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
};

export default StreamingViewer;