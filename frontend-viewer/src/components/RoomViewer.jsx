import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { API_URL } from '../config/constants';

const RoomViewer = () => {
  const [liveRooms, setLiveRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  // Debug logs state
  const [debugLogs, setDebugLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);
  const maxLogs = 50;
  
  // Check if debug mode is enabled via URL parameter
  const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  
  // Estado para IP local dinámica
  const [localIP, setLocalIP] = useState(null);
  
  // Debug logging function
  const addDebugLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp,
      message,
      type
    };
    
    setDebugLogs(prevLogs => {
      const newLogs = [logEntry, ...prevLogs];
      return newLogs.slice(0, maxLogs);
    });
    
    // También mostrar en consola del navegador
    console.log(`[${timestamp}] ${message}`);
  };
  
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
    addDebugLog('🚀 Inicializando RoomViewer...', 'info');
    addDebugLog(`📱 User Agent: ${navigator.userAgent}`, 'info');
    addDebugLog(`🌐 API URL: ${API_URL}`, 'info');
    addDebugLog(`🔒 HTTPS: ${window.location.protocol === 'https:'}`, 'info');
    addDebugLog(`📺 MediaDevices support: ${!!navigator.mediaDevices}`, 'info');
    
    // Generate or restore session ID
    const savedSessionId = localStorage.getItem('viewer-session-id');
    const newSessionId = savedSessionId || `viewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    localStorage.setItem('viewer-session-id', newSessionId);
    addDebugLog(`🆔 Session ID: ${newSessionId}`, 'info');

    // Obtener IP local del backend primero
    addDebugLog('🌐 Solicitando IP local del backend...', 'info');
    fetch(`${API_URL}/api/network/local-ip`)
      .then(res => res.json())
      .then(data => {
        addDebugLog(`✅ IP local recibida: ${data.localIP}`, 'success');
        setLocalIP(data.localIP);
      })
      .catch(err => addDebugLog(`⚠️ Error obteniendo IP local: ${err.message}`, 'warn'));

    // Connect to signaling server
    addDebugLog('🔗 Conectando al servidor de señalización...', 'info');
    socketRef.current = io(API_URL, {
      transports: ['polling', 'websocket'],
      forceNew: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current.on('connect', () => {
      addDebugLog('✅ Conectado al servidor WebRTC!', 'success');
      
      // Try to restore session
      if (savedSessionId) {
        addDebugLog(`🔄 Intentando restaurar sesión: ${savedSessionId}`, 'info');
        socketRef.current.emit('restore-session', { sessionId: savedSessionId });
      }
      
      // Get live rooms
      addDebugLog('📡 Solicitando salas en vivo...', 'info');
      socketRef.current.emit('get-live-rooms');
    });

    socketRef.current.on('disconnect', () => {
      addDebugLog('🔌 Desconectado del servidor', 'warn');
    });

    socketRef.current.on('connect_error', (error) => {
      addDebugLog(`❌ Error de conexión: ${error.message}`, 'error');
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      addDebugLog(`🔄 Reconectado después de ${attemptNumber} intentos`, 'success');
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      addDebugLog(`🔄 Intento de reconexión #${attemptNumber}`, 'info');
    });

    socketRef.current.on('reconnect_error', (error) => {
      addDebugLog(`❌ Error de reconexión: ${error.message}`, 'error');
    });

    // Session events
    socketRef.current.on('session-restored', (data) => {
      addDebugLog(`🔄 Sesión restaurada: ${JSON.stringify(data)}`, 'success');
      setCurrentRoom(data.roomName);
      setViewerCount(data.viewerCount);
      setIsConnected(true);
      
      // Re-establish WebRTC connection
      startWebRTCConnection(data.roomName);
    });

    socketRef.current.on('session-not-found', () => {
      addDebugLog('❌ Sesión no encontrada, empezando nuevo', 'warn');
      localStorage.removeItem('viewer-session-id');
    });

    // Room events
    socketRef.current.on('live-rooms', (rooms) => {
      addDebugLog(`📋 Salas recibidas: ${rooms.length} salas`, 'success');
      rooms.forEach(room => {
        addDebugLog(`   - ${room.name}: ${room.viewerCount} viewers`, 'info');
      });
      setLiveRooms(rooms);
    });

    socketRef.current.on('rooms-updated', (rooms) => {
      addDebugLog(`🔄 Salas actualizadas: ${rooms.length} salas`, 'info');
      setLiveRooms(rooms);
    });

    socketRef.current.on('room-joined', (data) => {
      addDebugLog(`🏠 Se unió a sala: ${data.roomName} (${data.viewerCount} viewers)`, 'success');
      addDebugLog(`📊 Datos recibidos: ${JSON.stringify(data)}`, 'info');
      
      setCurrentRoom(data.roomName);
      setViewerCount(data.viewerCount);
      setIsConnected(true);
      setIsConnecting(false);
      
      addDebugLog(`🔄 Estado actualizado - iniciando WebRTC para: ${data.roomName}`, 'info');
      
      // Start WebRTC connection
      startWebRTCConnection(data.roomName);
    });

    socketRef.current.on('room-error', (data) => {
      addDebugLog(`❌ Error de sala: ${data.error}`, 'error');
      setError(data.error);
      setIsConnecting(false);
    });

    socketRef.current.on('room-closed', () => {
      addDebugLog('🚪 Sala cerrada por el broadcaster', 'warn');
      setError('Room was closed by broadcaster');
      disconnectFromRoom();
    });

    socketRef.current.on('broadcaster-offline', () => {
      addDebugLog('📴 Broadcaster offline temporalmente', 'warn');
      setError('Broadcaster is temporarily offline');
      // Keep session but close video connection
      if (peerConnectionRef.current) {
        addDebugLog('🔌 Cerrando conexión WebRTC...', 'info');
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (videoRef.current) {
        addDebugLog('📺 Limpiando video...', 'info');
        videoRef.current.srcObject = null;
      }
    });

    socketRef.current.on('broadcaster-stopped', (data) => {
      addDebugLog(`📺 Broadcaster detuvo streaming: ${JSON.stringify(data)}`, 'warn');
      setError('Stream ended - broadcaster disconnected');
      
      // Disconnect from room and return to room list
      setTimeout(() => {
        disconnectFromRoom();
        setError(null); // Clear error after returning to list
      }, 2000);
    });

    // WebRTC events
    socketRef.current.on('webrtc-answer', (data) => {
      addDebugLog(`📥 Respuesta WebRTC recibida: ${JSON.stringify(data)}`, 'info');
      handleAnswer(data);
    });
    
    socketRef.current.on('webrtc-ice-candidate', (data) => {
      addDebugLog(`🧊 ICE candidate recibido: ${data.candidate?.type || 'unknown'}`, 'info');
      handleIceCandidate(data);
    });

    return () => {
      addDebugLog('🔄 Limpiando componente RoomViewer...', 'warn');
      if (socketRef.current) {
        addDebugLog('🔌 Desconectando socket...', 'info');
        socketRef.current.disconnect();
      }
      if (peerConnectionRef.current) {
        addDebugLog('🔌 Cerrando peer connection...', 'info');
        peerConnectionRef.current.close();
      }
    };
  }, []);

  const startWebRTCConnection = async (roomName) => {
    try {
      // Reset tracking
      trackingRef.current = { receivedAnswer: false, remoteCandidatesReceived: 0 };
      
      addDebugLog(`🚀 Iniciando conexión WebRTC para sala: ${roomName}`, 'info');
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      addDebugLog(`📱 Diagnóstico móvil:`, 'info');
      addDebugLog(`   - Es móvil: ${isMobile}`, 'info');
      addDebugLog(`   - Plataforma: ${navigator.platform}`, 'info');
      addDebugLog(`   - Conexión: ${navigator.connection?.effectiveType || 'unknown'}`, 'info');
      addDebugLog(`   - Viewport: ${window.innerWidth}x${window.innerHeight}`, 'info');
      addDebugLog(`   - Touch support: ${navigator.maxTouchPoints > 0}`, 'info');
      
      const rtcConfig = getRTCConfig();
      addDebugLog(`🔗 Configuración WebRTC: ${JSON.stringify(rtcConfig)}`, 'info');
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = peerConnection;

      // Mobile connection timeout (aggressive for mobile networks)
      const timeoutDuration = isMobile ? 15000 : 30000;
      addDebugLog(`⏰ Configurando timeout: ${timeoutDuration/1000}s`, 'info');
      const connectionTimeout = setTimeout(() => {
        if (peerConnection.connectionState !== 'connected') {
          addDebugLog('⏰ Timeout de conexión móvil - reintentando...', 'warn');
          setError('Connection timeout - retrying...');
          peerConnection.close();
          // Retry connection after a short delay
          setTimeout(() => startWebRTCConnection(roomName), 2000);
        }
      }, timeoutDuration);

      // Clear timeout on successful connection
      peerConnection.addEventListener('connectionstatechange', () => {
        if (peerConnection.connectionState === 'connected') {
          clearTimeout(connectionTimeout);
        }
      });

      // Add transceivers to receive audio and video with mobile-optimized settings
      peerConnection.addTransceiver('audio', { 
        direction: 'recvonly',
        streams: []
      });
      peerConnection.addTransceiver('video', { 
        direction: 'recvonly',
        streams: []
      });
      
      // Handle remote stream
      peerConnection.ontrack = (event) => {
        addDebugLog(`📺 Track remoto recibido: ${event.track.kind} - ${event.track.label}`, 'success');
        addDebugLog(`🎬 Total streams: ${event.streams.length}`, 'info');
        
        if (videoRef.current && event.streams[0]) {
          const stream = event.streams[0];
          addDebugLog(`📹 Configurando video con ${stream.getTracks().length} tracks`, 'info');
          
          // Detallar cada track
          stream.getTracks().forEach((track, index) => {
            addDebugLog(`   Track ${index}: ${track.kind} - enabled: ${track.enabled} - ready: ${track.readyState}`, 'info');
          });
          
          videoRef.current.srcObject = stream;
          
          // Agregar event listeners al video
          videoRef.current.onloadeddata = () => {
            addDebugLog('✅ Video data cargada!', 'success');
          };
          
          videoRef.current.oncanplay = () => {
            addDebugLog('✅ Video listo para reproducir!', 'success');
          };
          
          videoRef.current.onplaying = () => {
            addDebugLog('▶️ Video reproduciéndose!', 'success');
          };
          
          videoRef.current.onerror = (e) => {
            addDebugLog(`❌ Error de video: ${JSON.stringify(e)}`, 'error');
          };
          
          videoRef.current.onstalled = () => {
            addDebugLog('⚠️ Video detenido (stalled)', 'warn');
          };
          
          videoRef.current.onwaiting = () => {
            addDebugLog('⏳ Video esperando datos', 'warn');
          };
          
          videoRef.current.play().catch(e => {
            addDebugLog(`⚠️ Reproducción automática falló: ${e.message}`, 'warn');
            addDebugLog('💡 Toca la pantalla para reproducir manualmente', 'info');
          });
        } else {
          addDebugLog('❌ No hay elemento video o stream disponible', 'error');
          if (!videoRef.current) addDebugLog('   - videoRef.current es null', 'error');
          if (!event.streams[0]) addDebugLog('   - event.streams[0] es null', 'error');
        }
      };
      
      // ICE candidate handling moved above with enhanced logging
      
      // Handle connection state with detailed mobile debugging
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        addDebugLog(`🔗 CAMBIO ESTADO CONEXIÓN: ${state}`, state === 'connected' ? 'success' : state === 'failed' ? 'error' : 'info');
        
        addDebugLog('📊 Estados completos:', 'info');
        addDebugLog(`   - Connection: ${peerConnection.connectionState}`, 'info');
        addDebugLog(`   - ICE Connection: ${peerConnection.iceConnectionState}`, 'info');
        addDebugLog(`   - ICE Gathering: ${peerConnection.iceGatheringState}`, 'info');
        addDebugLog(`   - Signaling: ${peerConnection.signalingState}`, 'info');
        
        if (state === 'connected') {
          addDebugLog('🎉 ¡CONEXIÓN WebRTC ESTABLECIDA!', 'success');
          addDebugLog('📺 Esperando stream de video...', 'info');
          setError(null);
        } else if (state === 'connecting') {
          addDebugLog('🔄 Conectando... ICE negotiation en progreso', 'info');
        } else if (state === 'disconnected') {
          addDebugLog('⚠️ Conexión WebRTC desconectada', 'warn');
          setError('Connection lost. Trying to reconnect...');
        } else if (state === 'failed') {
          addDebugLog('❌ CONEXIÓN WebRTC FALLÓ', 'error');
          addDebugLog('🔍 Análisis de falla:', 'error');
          addDebugLog(`   - Local desc: ${peerConnection.localDescription?.type || 'none'}`, 'error');
          addDebugLog(`   - Remote desc: ${peerConnection.remoteDescription?.type || 'none'}`, 'error');
          
          const transceivers = peerConnection.getTransceivers();
          addDebugLog(`   - Transceivers: ${transceivers.length}`, 'error');
          transceivers.forEach((t, i) => {
            addDebugLog(`     T${i}: ${t.direction} -> ${t.currentDirection}`, 'error');
          });
          
          setError('Connection failed. Check network and try again.');
        }
      };

      // Enhanced ICE debugging for mobile
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        addDebugLog(`🧊 ICE CONNECTION: ${iceState}`, 
          iceState === 'connected' || iceState === 'completed' ? 'success' : 
          iceState === 'failed' ? 'error' : 'info');
        
        if (iceState === 'checking') {
          addDebugLog('🔍 ICE candidates siendo verificados...', 'info');
        } else if (iceState === 'connected') {
          addDebugLog('✅ ICE conectado! P2P establecido', 'success');
        } else if (iceState === 'completed') {
          addDebugLog('🎯 ICE completado! Conexión optimizada', 'success');
        } else if (iceState === 'failed') {
          addDebugLog('❌ ICE CONNECTION FALLÓ!', 'error');
          addDebugLog('🚨 Posibles problemas:', 'error');
          addDebugLog('   - Firewall bloqueando conexión P2P', 'error');
          addDebugLog('   - NAT muy restrictivo', 'error');
          addDebugLog('   - Necesita servidor TURN', 'error');
          addDebugLog('   - Red móvil bloquea WebRTC', 'error');
        } else if (iceState === 'disconnected') {
          addDebugLog('⚠️ ICE desconectado temporalmente', 'warn');
        }
      };

      // Track ICE gathering
      peerConnection.onicegatheringstatechange = () => {
        const gatheringState = peerConnection.iceGatheringState;
        addDebugLog(`🧊 ICE GATHERING: ${gatheringState}`, 'info');
        
        if (gatheringState === 'gathering') {
          addDebugLog('🔄 Recopilando candidates ICE locales...', 'info');
        } else if (gatheringState === 'complete') {
          addDebugLog('✅ ICE gathering completado!', 'success');
          addDebugLog('📤 Todos los ICE candidates enviados', 'info');
        }
      };

      // Track ICE candidates specifically
      let candidateCount = 0;
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          const candidate = event.candidate;
          addDebugLog(`🧊 ICE LOCAL #${candidateCount}: ${candidate.type}`, 'success');
          addDebugLog(`   - ${candidate.protocol} ${candidate.address}:${candidate.port}`, 'info');
          addDebugLog(`   - Priority: ${candidate.priority}`, 'info');
          
          // Determinar tipo de candidate
          if (candidate.type === 'host') {
            addDebugLog('   📍 Candidate LOCAL (misma red)', 'info');
          } else if (candidate.type === 'srflx') {
            addDebugLog('   🌐 Candidate PÚBLICO (via STUN)', 'success');
          } else if (candidate.type === 'relay') {
            addDebugLog('   🔄 Candidate RELAY (via TURN)', 'info');
          }
          
          addDebugLog(`📤 Enviando ICE candidate #${candidateCount} al broadcaster...`, 'info');
          const currentSessionId = sessionId || localStorage.getItem('viewer-session-id');
          socketRef.current.emit('webrtc-ice-candidate', {
            candidate: event.candidate,
            roomName: roomName,
            viewerId: currentSessionId
          });
        } else {
          addDebugLog('🧊 ICE gathering complete - no more candidates', 'success');
          addDebugLog(`📊 Total candidates locales enviados: ${candidateCount}`, 'info');
        }
      };
      
      // Create offer with mobile-optimized parameters
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      };
      
      const offer = await peerConnection.createOffer(offerOptions);
      await peerConnection.setLocalDescription(offer);
      
      console.log('📡 Created offer:', {
        type: offer.type,
        sdpLength: offer.sdp.length,
        hasAudio: offer.sdp.includes('m=audio'),
        hasVideo: offer.sdp.includes('m=video')
      });
      
      // Send offer to broadcaster with room context
      addDebugLog(`📤 Enviando oferta al broadcaster en sala: ${roomName}`, 'info');
      addDebugLog(`   - Current room state: ${currentRoom}`, 'info');
      // Obtener sessionId actualizado
      const currentSessionId = sessionId || localStorage.getItem('viewer-session-id');
      addDebugLog(`   - Viewer ID: ${currentSessionId}`, 'info');
      addDebugLog(`   - State sessionId: ${sessionId}`, 'info');
      addDebugLog(`   - SDP tiene audio: ${offer.sdp.includes('m=audio')}`, 'info');
      addDebugLog(`   - SDP tiene video: ${offer.sdp.includes('m=video')}`, 'info');
      
      socketRef.current.emit('webrtc-offer', {
        offer,
        roomName: roomName, // Usar el parámetro directamente
        viewerId: currentSessionId // Usar el sessionId actualizado
      });
      
      addDebugLog('⏳ Esperando respuesta del broadcaster...', 'info');
      
      // Variables para tracking
      let receivedAnswer = false;
      let remoteCandidatesReceived = 0;
      
      // Timeout para detectar si no llega respuesta
      setTimeout(() => {
        if (peerConnection.signalingState === 'have-local-offer') {
          addDebugLog('⚠️ No se recibió respuesta del broadcaster en 10s', 'warn');
          addDebugLog('💡 Posibles causas:', 'info');
          addDebugLog('   - Broadcaster no está conectado', 'info');
          addDebugLog('   - Sala no existe o está cerrada', 'info');
          addDebugLog('   - Problema en el servidor signaling', 'info');
        }
      }, 10000);
      
      // Timeout para verificar ICE candidates remotos
      setTimeout(() => {
        const { receivedAnswer, remoteCandidatesReceived } = trackingRef.current;
        if (remoteCandidatesReceived === 0 && receivedAnswer) {
          addDebugLog('⚠️ No se recibieron ICE candidates remotos en 15s', 'warn');
          addDebugLog('🚨 PROBLEMA: El broadcaster no está enviando candidates', 'error');
          addDebugLog('   - El broadcaster puede estar offline', 'error');
          addDebugLog('   - Problema en el servidor relay', 'error');
          addDebugLog('   - El broadcaster cerró el stream', 'error');
        } else if (remoteCandidatesReceived > 0) {
          addDebugLog(`✅ Todo OK: ${remoteCandidatesReceived} candidates remotos recibidos`, 'success');
        }
      }, 15000);
      
    } catch (error) {
      addDebugLog(`❌ Error iniciando conexión WebRTC: ${error.message}`, 'error');
      setError('Failed to start video connection');
    }
  };

  const joinRoom = async (roomName) => {
    setIsConnecting(true);
    setError(null);
    
    socketRef.current.emit('join-room', {
      roomName,
      sessionId
    });
  };

  const disconnectFromRoom = () => {
    // Close WebRTC connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Leave room
    if (socketRef.current && currentRoom) {
      socketRef.current.emit('leave-room');
    }
    
    setIsConnected(false);
    setCurrentRoom(null);
    setViewerCount(0);
    setError(null);
    
    // Clear session
    localStorage.removeItem('viewer-session-id');
    
    // Refresh rooms list
    socketRef.current.emit('get-live-rooms');
    
    console.log('🚪 Disconnected from room');
  };

  // Variables para tracking global
  const trackingRef = useRef({ receivedAnswer: false, remoteCandidatesReceived: 0 });

  const handleAnswer = async ({ answer }) => {
    if (peerConnectionRef.current) {
      try {
        addDebugLog('🎉 ¡RESPUESTA RECIBIDA DEL BROADCASTER!', 'success');
        addDebugLog(`   - Tipo: ${answer.type}`, 'info');
        addDebugLog(`   - SDP length: ${answer.sdp?.length || 0}`, 'info');
        addDebugLog(`   - SDP tiene audio: ${answer.sdp?.includes('m=audio')}`, 'info');
        addDebugLog(`   - SDP tiene video: ${answer.sdp?.includes('m=video')}`, 'info');
        
        await peerConnectionRef.current.setRemoteDescription(answer);
        trackingRef.current.receivedAnswer = true;
        
        addDebugLog('✅ Respuesta procesada exitosamente!', 'success');
        addDebugLog('🔗 Conexión WebRTC en progreso...', 'info');
        addDebugLog('⏳ Ahora esperando ICE candidates remotos...', 'info');
        
        // Log del estado actual
        const state = peerConnectionRef.current;
        addDebugLog(`📊 Estados después de answer:`, 'info');
        addDebugLog(`   - Signaling: ${state.signalingState}`, 'info');
        addDebugLog(`   - ICE Connection: ${state.iceConnectionState}`, 'info');
        addDebugLog(`   - Connection: ${state.connectionState}`, 'info');
        
      } catch (error) {
        addDebugLog(`❌ Error procesando respuesta: ${error.message}`, 'error');
      }
    } else {
      addDebugLog('❌ No hay peer connection para procesar respuesta', 'error');
    }
  };

  const handleIceCandidate = async ({ candidate }) => {
    if (peerConnectionRef.current && candidate) {
      try {
        trackingRef.current.remoteCandidatesReceived++;
        const count = trackingRef.current.remoteCandidatesReceived;
        
        addDebugLog(`🧊 ICE REMOTO #${count}: ${candidate.type}`, 'success');
        addDebugLog(`   - ${candidate.protocol} ${candidate.address}:${candidate.port}`, 'info');
        addDebugLog(`   - Priority: ${candidate.priority}`, 'info');
        
        // Explicar tipo de candidate remoto
        if (candidate.type === 'host') {
          addDebugLog('   📍 Broadcaster en red local', 'info');
        } else if (candidate.type === 'srflx') {
          addDebugLog('   🌐 Broadcaster IP pública', 'success');
        } else if (candidate.type === 'relay') {
          addDebugLog('   🔄 Broadcaster via TURN relay', 'info');
        }
        
        await peerConnectionRef.current.addIceCandidate(candidate);
        addDebugLog(`✅ ICE candidate remoto #${count} agregado!`, 'success');
        
        // Log estado ICE después de agregar candidate
        addDebugLog(`🔗 Estado ICE: ${peerConnectionRef.current.iceConnectionState}`, 'info');
        
      } catch (error) {
        addDebugLog(`❌ Error agregando ICE candidate: ${error.message}`, 'error');
        addDebugLog(`   - Candidate data: ${JSON.stringify(candidate)}`, 'error');
      }
    } else {
      if (!peerConnectionRef.current) {
        addDebugLog('⚠️ No hay peer connection para ICE candidate', 'warn');
      }
      if (!candidate) {
        addDebugLog('⚠️ ICE candidate remoto es null - fin de candidates remotos', 'info');
        const total = trackingRef.current.remoteCandidatesReceived;
        addDebugLog(`📊 Total ICE candidates remotos recibidos: ${total}`, 'info');
      }
    }
  };

  const copyAllLogs = async () => {
    try {
      const logsText = debugLogs.map(log => 
        `[${log.timestamp}] ${log.message}`
      ).join('\n');
      
      await navigator.clipboard.writeText(logsText);
      addDebugLog('📋 Logs copiados al portapapeles!', 'success');
    } catch (err) {
      addDebugLog('❌ Error copiando logs: ' + err.message, 'error');
      // Fallback para navegadores que no soportan clipboard
      const textArea = document.createElement('textarea');
      textArea.value = debugLogs.map(log => 
        `[${log.timestamp}] ${log.message}`
      ).join('\n');
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      addDebugLog('📋 Logs copiados (fallback)!', 'success');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="room-viewer">
      <div className="header">
        <h1>📺 WebRTC Live Streams - Viewer</h1>
        {currentRoom && (
          <div className="current-room">
            <h2>🎥 Watching: {currentRoom}</h2>
            <div className="stats">
              <span className="stat">👥 Viewers: {viewerCount}</span>
              <span className="status live">🔴 LIVE</span>
            </div>
          </div>
        )}
      </div>

      {!isConnected ? (
        <div className="rooms-section">
          <h2>🔴 Live Streams</h2>
          {liveRooms.length === 0 ? (
            <div className="no-streams">
              <p>😴 No live streams available</p>
              <p>Wait for someone to start streaming...</p>
            </div>
          ) : (
            <div className="rooms-grid">
              {liveRooms.map((room) => (
                <div key={room.name} className="room-card">
                  <div className="room-info">
                    <h3 className="room-name">{room.name}</h3>
                    <div className="room-stats">
                      <span className="viewers">👥 {room.viewerCount}</span>
                      <span className="created">📅 {formatDate(room.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => joinRoom(room.name)}
                    disabled={isConnecting}
                    className="join-button"
                  >
                    {isConnecting ? '🔄 Connecting...' : '📺 Watch Stream'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="video-section">
          <div className="video-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="remote-video"
            />
            <div className="video-overlay">
              <div className="live-indicator">🔴 LIVE</div>
            </div>
          </div>
          
          <div className="controls">
            <button onClick={disconnectFromRoom} className="disconnect-button">
              🚪 Leave Stream
            </button>
          </div>
        </div>
      )}

      {/* Debug Logs Panel - Only show if debug=true in URL */}
      {isDebugMode && (
        <div className="debug-panel">
          <div className="debug-header">
            <h3>🔍 Debug Logs (Diagnóstico móvil)</h3>
            <div className="debug-controls">
              <button 
                onClick={() => setShowLogs(!showLogs)} 
                className="toggle-logs-btn"
              >
                {showLogs ? '🙈 Ocultar' : '👁️ Mostrar'}
              </button>
              <button 
                onClick={() => setDebugLogs([])} 
                className="clear-logs-btn"
              >
                🗑️ Limpiar
              </button>
              <button 
                onClick={copyAllLogs} 
                className="copy-logs-btn"
                disabled={debugLogs.length === 0}
              >
                📋 Copiar
              </button>
            </div>
          </div>
          
          {showLogs && (
            <div className="debug-logs">
              {debugLogs.length === 0 ? (
                <div className="no-logs">📝 Sin logs aún...</div>
              ) : (
                debugLogs.map(log => (
                  <div key={log.id} className={`debug-log debug-log-${log.type}`}>
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}


      <style jsx>{`
        .room-viewer {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
        }

        .header h1 {
          color: #333;
          margin-bottom: 10px;
        }

        .current-room h2 {
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

        .status.live {
          font-size: 18px;
          font-weight: bold;
          color: #fff;
          background: #ff4444;
          padding: 4px 8px;
          border-radius: 4px;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .rooms-section h2 {
          text-align: center;
          color: #333;
          margin-bottom: 20px;
        }

        .no-streams {
          text-align: center;
          padding: 60px 20px;
          color: #666;
          background: #f8f9fa;
          border-radius: 12px;
        }

        .no-streams p:first-child {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .rooms-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }

        .room-card {
          background: #fff;
          border: 2px solid #e1e8ed;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
        }

        .room-card:hover {
          border-color: #667eea;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        .room-name {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          margin: 0 0 10px 0;
        }

        .room-stats {
          display: flex;
          justify-content: space-between;
          margin: 10px 0 15px 0;
          font-size: 14px;
          color: #666;
        }

        .join-button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .join-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .join-button:disabled {
          background: #ccc;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .video-container {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          margin: 20px 0;
        }

        .remote-video {
          width: 100%;
          height: auto;
          max-height: 600px;
          display: block;
          transform: scaleX(-1);
        }

        .video-overlay {
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

        .disconnect-button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .disconnect-button:hover {
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

        .debug-panel {
          background: #1a1a1a;
          color: #ffffff;
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          max-width: 100%;
        }

        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .debug-header h3 {
          margin: 0;
          color: #00bcd4;
          flex: 1;
        }

        .debug-controls {
          display: flex;
          gap: 8px;
        }

        .toggle-logs-btn, .clear-logs-btn, .copy-logs-btn {
          padding: 6px 12px;
          font-size: 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: bold;
        }

        .toggle-logs-btn {
          background: #4caf50;
          color: white;
        }

        .clear-logs-btn {
          background: #ff5722;
          color: white;
        }

        .copy-logs-btn {
          background: #2196f3;
          color: white;
        }

        .copy-logs-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
          opacity: 0.5;
        }

        .toggle-logs-btn:hover, .clear-logs-btn:hover, .copy-logs-btn:hover:not(:disabled) {
          opacity: 0.8;
          transform: translateY(-1px);
        }

        .debug-logs {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 10px;
          background: #0a0a0a;
        }

        .no-logs {
          text-align: center;
          color: #666;
          padding: 20px;
          font-style: italic;
        }

        .debug-log {
          margin: 4px 0;
          padding: 6px 8px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          border-left: 3px solid;
          word-wrap: break-word;
        }

        .debug-log-info {
          background: rgba(33, 150, 243, 0.1);
          border-left-color: #2196f3;
          color: #e3f2fd;
        }

        .debug-log-success {
          background: rgba(76, 175, 80, 0.1);
          border-left-color: #4caf50;
          color: #e8f5e8;
        }

        .debug-log-warn {
          background: rgba(255, 152, 0, 0.1);
          border-left-color: #ff9800;
          color: #fff3e0;
        }

        .debug-log-error {
          background: rgba(244, 67, 54, 0.1);
          border-left-color: #f44336;
          color: #ffebee;
        }

        .log-time {
          color: #888;
          margin-right: 8px;
          font-size: 10px;
        }

        .log-message {
          color: inherit;
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

        @media (max-width: 768px) {
          .room-viewer {
            padding: 10px;
          }
          
          .debug-panel {
            margin: 10px 0;
            padding: 15px;
          }
          
          .debug-header {
            flex-direction: column;
            align-items: stretch;
            gap: 15px;
          }
          
          .debug-header h3 {
            text-align: center;
            margin-bottom: 5px;
          }
          
          .debug-controls {
            justify-content: center;
            gap: 12px;
          }
          
          .toggle-logs-btn, .clear-logs-btn, .copy-logs-btn {
            flex: 1;
            padding: 8px 12px;
            font-size: 13px;
          }
          
          .debug-logs {
            max-height: 250px;
            font-size: 11px;
          }
          
          .debug-log {
            font-size: 11px;
            padding: 4px 6px;
          }
          
          .log-time {
            font-size: 9px;
          }
          
          .rooms-grid {
            grid-template-columns: 1fr;
          }
          
          .stats {
            flex-direction: column;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default RoomViewer;