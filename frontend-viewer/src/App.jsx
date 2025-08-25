import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import io from 'socket.io-client';
import WebRTCViewer from './components/WebRTCViewer';
import LoadingScreen from './components/LoadingScreen';
import { API_URL, WS_URL, API_ENDPOINTS, UI_CONFIG } from './config/constants';

function App() {
  const [streamData, setStreamData] = useState({
    isLive: false,
    hlsUrl: null,
    streamKey: null
  });
  const [viewers, setViewers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    initializeConnection();
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const initializeConnection = async () => {
    try {
      // Check initial stream status
      await checkStreamStatus();
      
      // Connect WebSocket
      const newSocket = io(API_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
      });
      setSocket(newSocket);

      // Socket event listeners
      newSocket.on('connect', () => {
        console.log('🔗 Connected to server');
        toast.success('🔗 Conectado al servidor');
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        toast.error('❌ Desconectado del servidor');
      });

      newSocket.on('stream:started', (data) => {
        console.log('🔴 Stream started:', data);
        
        // Use ONLY real-time MediaMTX URLs - no static file fallbacks
        let hlsUrl;
        if (data.hlsUrl) {
          // Direct MediaMTX URL from backend (real-time)
          hlsUrl = data.hlsUrl;
        } else {
          // Direct MediaMTX construction for real-time streaming
          hlsUrl = `http://localhost:8004/${data.streamKey || 'browser_stream'}/index.m3u8`;
        }
        
        console.log('🎬 Using REAL-TIME HLS URL:', hlsUrl);
        
        setStreamData({
          isLive: true,
          hlsUrl,
          streamKey: data.streamKey
        });
        toast.success('🔴 Stream iniciado - TIEMPO REAL');
      });

      newSocket.on('stream:stopped', () => {
        console.log('⏹️ Stream stopped');
        setStreamData({
          isLive: false,
          hlsUrl: null,
          streamKey: null
        });
        toast.success('⏹️ Stream detenido');
      });

      newSocket.on('viewers:update', (data) => {
        setViewers(data.viewers);
      });

      setLoading(false);

    } catch (error) {
      console.error('Error initializing connection:', error);
      setLoading(false);
      toast.error('Error al conectar con el servidor');
    }
  };

  const checkStreamStatus = async () => {
    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.STREAM_STATUS}`);
      const data = await response.json();
      
      if (data.isLive && data.streamKey) {
        // Use ONLY real-time MediaMTX URLs - no static file fallbacks
        let hlsUrl;
        if (data.hlsUrl) {
          // Direct MediaMTX URL from backend (real-time)
          hlsUrl = data.hlsUrl;
        } else {
          // Direct MediaMTX construction for real-time streaming
          hlsUrl = `http://localhost:8004/${data.streamKey || 'browser_stream'}/index.m3u8`;
        }
        
        console.log('🔄 Existing REAL-TIME stream detected:', { hlsUrl, streamKey: data.streamKey });
        console.log('🎬 Using REAL-TIME HLS URL:', hlsUrl);
        
        setStreamData({
          isLive: true,
          hlsUrl,
          streamKey: data.streamKey
        });
        setViewers(data.viewers || 0);
      }
    } catch (error) {
      console.error('Error checking stream status:', error);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="viewer-app">
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: UI_CONFIG.TOAST_DURATION,
          style: {
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            borderRadius: '8px',
            backdropFilter: 'blur(10px)'
          }
        }}
      />
      
      {/* Header */}
      <header className="viewer-header">
        <div className="header-content">
          <div className="logo">
            <h1>⚡ Ultra Viewer</h1>
          </div>
          <div className="viewer-stats">
            <div className="stat-item">
              <div className="label">👥 Viewers</div>
              <div className="value">{viewers}</div>
            </div>
            <div className="stat-item">
              <div className="label">📡 Status</div>
              <div className={`status-indicator ${streamData.isLive ? 'live' : 'offline'}`}>
                {streamData.isLive ? '🔴 LIVE' : '⚫ OFFLINE'}
              </div>
            </div>
            {latency && (
              <div className="stat-item">
                <div className="label">⚡ Latency</div>
                <div className="value">{latency}ms</div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Ultra-Low Latency WebRTC Section */}
      <section className="webrtc-section">
        <div className="section-header">
          <h2>⚡ Ultra-Low Latency WebRTC Viewer</h2>
          <p>Experience sub-500ms latency - Same as TikTok Live</p>
        </div>
        <WebRTCViewer />
      </section>

    </div>
  );
}

export default App;