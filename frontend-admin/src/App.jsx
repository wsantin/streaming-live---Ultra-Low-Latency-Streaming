import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Toaster, toast } from 'react-hot-toast';

import WebRTCStreamer from './components/WebRTCStreamer';
import { API_URL, WS_URL, API_ENDPOINTS, UI_CONFIG } from './config/constants';
import './App.css';

function App() {
  const [streamStatus, setStreamStatus] = useState({
    isLive: false,
    streamKey: null,
    viewers: 0,
    streamId: null,
    hlsUrl: null,
    rtmpUrl: null,
    isBrowserStream: false
  });
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [streamingMode, setStreamingMode] = useState('enterprise'); // Default to enterprise mode

  useEffect(() => {
    // Conectar WebSocket
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });
    setSocket(newSocket);

    // Listeners de WebSocket
    newSocket.on('connect', () => {
      console.log('Connected to server');
      toast.success('Conectado al servidor');
    });

    newSocket.on('stream:status', (status) => {
      setStreamStatus(status);
    });

    newSocket.on('stream:started', (data) => {
      setStreamStatus(data);
      toast.success('Stream iniciado');
    });

    newSocket.on('stream:stopped', () => {
      setStreamStatus({
        isLive: false,
        streamKey: null,
        viewers: 0,
        streamId: null,
        hlsUrl: null,
        rtmpUrl: null
      });
      toast.success('Stream detenido');
    });

    newSocket.on('viewers:update', (data) => {
      setStreamStatus(prev => ({ ...prev, viewers: data.viewers }));
    });

    // Verificar estado inicial
    checkStreamStatus();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const checkStreamStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.STREAM_STATUS}`);
      setStreamStatus(response.data);
    } catch (error) {
      console.error('Error checking stream status:', error);
      toast.error('Error al verificar estado del stream');
    }
  };

  const startStream = async (streamKey) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.STREAM_START}`, {
        streamKey: streamKey || 'stream'
      });

      if (response.data.success) {
        setStreamStatus({
          isLive: true,
          streamKey: streamKey,
          streamId: response.data.streamId,
          hlsUrl: response.data.hlsUrl,
          rtmpUrl: response.data.rtmpUrl,
          viewers: 0
        });
        toast.success('Stream iniciado correctamente');
      }
    } catch (error) {
      console.error('Error starting stream:', error);
      toast.error(error.response?.data?.error || 'Error al iniciar stream');
    } finally {
      setLoading(false);
    }
  };

  const stopStream = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.STREAM_STOP}`);
      
      if (response.data.success) {
        setStreamStatus({
          isLive: false,
          streamKey: null,
          viewers: 0,
          streamId: null,
          hlsUrl: null,
          rtmpUrl: null,
          isBrowserStream: false
        });
        toast.success('Stream detenido correctamente');
      }
    } catch (error) {
      console.error('Error stopping stream:', error);
      toast.error(error.response?.data?.error || 'Error al detener stream');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserStreamStart = async (streamData) => {
    // Update local state
    setStreamStatus({
      isLive: true,
      streamKey: 'browser_stream',
      streamId: streamData.streamId,
      hlsUrl: streamData.hlsUrl,
      rtmpUrl: streamData.rtmpBridgeUrl,
      viewers: 0,
      isBrowserStream: true
    });
    
    // Also call the API to sync backend state
    try {
      await axios.post(`${API_URL}${API_ENDPOINTS.STREAM_START}`, {
        streamKey: 'browser_stream'
      });
    } catch (error) {
      console.error('Error syncing stream state with backend:', error);
    }
    
    toast.success('Stream desde navegador iniciado');
  };

  const handleBrowserStreamStop = async () => {
    // Update local state
    setStreamStatus({
      isLive: false,
      streamKey: null,
      viewers: 0,
      streamId: null,
      hlsUrl: null,
      rtmpUrl: null,
      isBrowserStream: false
    });
    
    // Also call the API to sync backend state
    try {
      await axios.post(`${API_URL}${API_ENDPOINTS.STREAM_STOP}`);
    } catch (error) {
      console.error('Error syncing stream state with backend:', error);
    }
    
    toast.success('Stream desde navegador detenido');
  };

  return (
    <div className="App">
      <Toaster position="top-right" />
      
      <header className="App-header">
        <h1>🎥 Sistema de Streaming</h1>
      </header>

      <main className="App-main">
        <div className="container">
          <div className="stream-section">
            <div className="webrtc-section">
              <WebRTCStreamer />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;