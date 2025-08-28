import React, { useState, useRef, useEffect } from 'react';
import { Room } from 'livekit-client';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { API_URL } from '../config/constants';

const StreamingViewer = () => {
  // Estado principal - SIMPLIFICADO
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [viewerName] = useState(() => {
    // Generar identity único por sesión (no persistir)
    return `viewer-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
  });
  
  // Estados de conexión
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [streamerName, setStreamerName] = useState('');
  const [error, setError] = useState(null);
  
  // Estados de controles
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  
  // Estadísticas del viewer
  const [viewerStats, setViewerStats] = useState({
    quality: 'unknown',
    resolution: '0x0',
    fps: 0,
    latency: 0
  });
  
  // Estado para aspect ratio automático (como TikTok)
  const [videoAspectRatio, setVideoAspectRatio] = useState('auto');
  
  // Referencias
  const videoRef = useRef(null);
  const livekitRoomRef = useRef(null);
  const socketRef = useRef(null);
  const audioTrackRef = useRef(null);
  
  // Queue para tracks que llegan antes del DOM
  const pendingVideoTrackRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  
  // Función para auto-detectar aspect ratio (como TikTok/Instagram)
  const updateVideoAspectRatio = (width, height) => {
    if (width <= 0 || height <= 0) {
      setVideoAspectRatio('auto');
      return;
    }
    
    const aspectRatio = width / height;
    console.log(`📐 Aspect ratio detectado: ${aspectRatio.toFixed(2)} (${width}x${height})`);
    
    // Definir umbrales como TikTok/Instagram
    if (aspectRatio > 1.5) {
      // Landscape (16:9, 16:10, etc.)
      setVideoAspectRatio('landscape');
      console.log('📺 Modo: Landscape (como YouTube)');
    } else if (aspectRatio < 0.75) {
      // Portrait (9:16, 4:5, etc.)
      setVideoAspectRatio('portrait');
      console.log('📱 Modo: Portrait (como TikTok)');
    } else {
      // Square o casi square (1:1, 4:3, etc.)
      setVideoAspectRatio('square');
      console.log('⏹️ Modo: Square (como Instagram)');
    }
  };
  
  // Función para procesar video track (reutilizable)
  const processVideoTrack = (track) => {
    if (!videoRef.current) {
      console.log('⏳ videoRef aún no está listo para procesar track');
      return false;
    }
    
    console.log('📺 Adjuntando video al elemento DOM...');
    try {
      // MÉTODO 1: Attach directo (LiveKit)
      track.attach(videoRef.current);
      console.log('✅ Video adjuntado al DOM');
      
      // MÉTODO 2: Manual srcObject assignment (fallback)
      if (track.mediaStreamTrack) {
        const stream = new MediaStream([track.mediaStreamTrack]);
        videoRef.current.srcObject = stream;
        console.log('🔄 Manual srcObject assignment aplicado');
        
        // Agregar listener para cuando el video tenga metadatos
        videoRef.current.addEventListener('loadedmetadata', () => {
          const width = videoRef.current.videoWidth;
          const height = videoRef.current.videoHeight;
          console.log('📊 Video metadata loaded, dimensiones:', { width, height });
          
          // Auto-detectar aspect ratio y aplicar clase CSS (como TikTok)
          updateVideoAspectRatio(width, height);
          setVideoLoaded(true);
        }, { once: true });
        
        // Marcar video como cargado cuando hay srcObject (backup)
        setVideoLoaded(true);
      }
      
      // MÉTODO 3: Forzar atributos para reproducción
      videoRef.current.muted = isMuted; // Usar estado actual de mute
      videoRef.current.volume = isMuted ? 0 : 1;
      videoRef.current.autoplay = true;
      videoRef.current.playsInline = true;
      
      // MÉTODO 4: Forzar reproducción múltiple
      const playVideo = async () => {
        try {
          await videoRef.current.play();
          console.log('✅ Video play() exitoso');
        } catch (playError) {
          console.warn('⚠️ Play failed, reintentando...', playError.message);
          
          // Fallback: Mutar temporalmente para permitir autoplay
          videoRef.current.muted = true;
          await videoRef.current.play();
          setTimeout(() => {
            videoRef.current.muted = false;
            console.log('🔊 Audio habilitado después de autoplay');
          }, 1000);
        }
      };
      
      // Ejecutar play después de un delay
      setTimeout(playVideo, 500);
      
      // Verificar el elemento después de attach
      setTimeout(() => {
        console.log('🔍 Estado post-attach:', {
          videoElement: videoRef.current,
          srcObject: videoRef.current?.srcObject,
          videoTracks: videoRef.current?.srcObject?.getVideoTracks?.()?.length || 0,
          readyState: videoRef.current?.readyState,
          videoWidth: videoRef.current?.videoWidth,
          videoHeight: videoRef.current?.videoHeight,
          paused: videoRef.current?.paused,
          currentTime: videoRef.current?.currentTime,
          duration: videoRef.current?.duration,
          muted: videoRef.current?.muted,
          autoplay: videoRef.current?.autoplay
        });
        
        // Debug adicional del MediaStream
        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject;
          const videoTracks = stream.getVideoTracks();
          console.log('🎥 MediaStream video tracks:', videoTracks.map(t => ({
            id: t.id,
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            settings: t.getSettings()
          })));
          
          // Si videoWidth es 0, hay un problema
          if (videoRef.current.videoWidth === 0) {
            console.error('❌ Video width = 0, posible problema de codec/formato');
            toast.error('Problema de formato de video detectado');
          }
        }
      }, 2000); // Aumentar delay para dar más tiempo
      
      return true; // Éxito
      
    } catch (attachError) {
      console.error('❌ Error al adjuntar video:', attachError);
      return false; // Error
    }
  };
  
  // 📊 ESTADÍSTICAS DEL VIEWER - CON DATOS REALES
  const startViewerStatsMonitoring = (room) => {
    console.log('📊 Iniciando stats de viewer...');
    
    const statsInterval = setInterval(async () => {
      if (room && isWatching && videoRef.current) {
        try {
          console.log('📊 Actualizando viewer stats con datos reales...');
          
          // 1. Datos del elemento video HTML - verificar que esté listo
          const videoElement = videoRef.current;
          
          // Esperar a que el video tenga metadatos válidos
          if (videoElement.readyState < 1) { // HAVE_METADATA = 1
            console.log('📊 Video no tiene metadatos aún, esperando...');
            return;
          }
          
          const actualResolution = `${videoElement.videoWidth || 0}x${videoElement.videoHeight || 0}`;
          
          console.log('📊 Video element data:', {
            width: videoElement.videoWidth,
            height: videoElement.videoHeight,
            readyState: videoElement.readyState,
            networkState: videoElement.networkState
          });
          
          // Si las dimensiones siguen siendo 0, salir y esperar
          if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
            console.log('📊 Dimensiones del video aún no válidas, esperando...');
            return;
          }
          
          // 2. Datos de LiveKit room
          const connectionState = room.connectionState;
          const remoteParticipants = Array.from(room.remoteParticipants.values());
          
          console.log('📊 LiveKit viewer state:', {
            connectionState,
            remoteParticipantsCount: remoteParticipants.length,
            roomState: room.state
          });
          
          // 3. Obtener datos del track de video remoto
          let trackData = {
            fps: 0,
            quality: 'unknown'
          };
          
          try {
            if (remoteParticipants.length > 0) {
              const streamerParticipant = remoteParticipants[0];
              const videoTracks = Array.from(streamerParticipant.videoTracks.values());
              
              if (videoTracks.length > 0) {
                const videoTrack = videoTracks[0];
                console.log('📊 Remote video track found:', {
                  kind: videoTrack.kind,
                  enabled: videoTrack.isEnabled,
                  subscribed: videoTrack.isSubscribed
                });
                
                // Intentar obtener settings del track
                if (videoTrack.track?.mediaStreamTrack) {
                  const settings = videoTrack.track.mediaStreamTrack.getSettings();
                  trackData.fps = Math.round(settings.frameRate || 30);
                  console.log('📊 Remote track settings:', settings);
                }
                
                // Determinar calidad basada en resolución
                if (videoElement.videoWidth > 0) {
                  if (videoElement.videoWidth >= 1920) trackData.quality = 'FHD';
                  else if (videoElement.videoWidth >= 1280) trackData.quality = 'HD';
                  else if (videoElement.videoWidth >= 854) trackData.quality = 'SD';
                  else trackData.quality = 'LQ';
                } else if (connectionState === 'connected') {
                  trackData.quality = 'HD'; // Default for connected state
                }
              }
            }
          } catch (trackError) {
            console.log('📊 Track data no disponible, usando defaults');
            if (connectionState === 'connected') {
              trackData.fps = 30;
              trackData.quality = 'HD';
            }
          }
          
          // 4. Actualizar estadísticas con datos reales (solo si son válidas)
          const newStats = {
            quality: trackData.quality,
            resolution: actualResolution, // Ya verificamos que no es 0x0
            fps: trackData.fps,
            latency: 0 // Los viewers no necesitan latency típicamente
          };
          
          console.log('📊 Viewer stats finales:', newStats);
          setViewerStats(newStats);
          
        } catch (error) {
          console.warn('⚠️ Error getting viewer stats:', error);
        }
      }
    }, 4000); // Cada 4 segundos (menos frecuente que admin)
    
    return () => clearInterval(statsInterval);
  };
  
  // 🔌 CONEXIÓN SOCKET.IO
  useEffect(() => {
    console.log('🔌 Conectando Socket.IO...');
    const socket = io(API_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('✅ Socket conectado:', socket.id);
      toast.success('Conectado al servidor');
      
      // Solicitar lista de salas
      socket.emit('rooms:list');
    });
    
    socket.on('disconnect', () => {
      console.log('🔌 Socket desconectado');
      toast.error('Desconectado del servidor');
    });
    
    // EVENTOS DE SALAS
    socket.on('rooms:update', (data) => {
      console.log('📋 Lista de salas actualizada:', data);
      setRooms(data.rooms || []);
    });
    
    // RESPUESTAS DE ROOM
    socket.on('room:joined', (data) => {
      console.log('✅ Unido a sala exitosamente:', data);
      handleRoomJoined(data);
    });
    
    socket.on('room:left', (data) => {
      console.log('🚪 Salió de sala:', data);
      handleRoomLeft();
    });
    
    socket.on('room:error', (data) => {
      console.error('❌ Error de sala:', data);
      setError(data.error);
      setIsConnecting(false);
      toast.error(data.error);
    });
    
    // EVENTOS DE VIEWERS
    socket.on('room:viewer-joined', (data) => {
      console.log('👁️ Nuevo viewer en sala:', data);
      setParticipantCount(data.totalViewers);
    });
    
    socket.on('room:viewer-left', (data) => {
      console.log('👋 Viewer salió de sala:', data);
      setParticipantCount(data.totalViewers);
    });
    
    return () => {
      socket.disconnect();
    };
  }, []); // Sin dependencias para evitar recreaciones
  
  // 📋 SOLICITAR SALAS PERIÓDICAMENTE (solo cuando no esté viendo)
  useEffect(() => {
    let interval;
    if (!isWatching) {
      interval = setInterval(() => {
        if (socketRef.current) {
          console.log('⏰ Solicitando actualización de salas...');
          socketRef.current.emit('rooms:list');
        }
      }, 5000); // Cada 5 segundos (reducido la frecuencia)
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWatching]);
  
  // 🔄 PROCESAR VIDEO TRACK PENDIENTE cuando DOM esté listo
  useEffect(() => {
    if (isWatching && videoRef.current && pendingVideoTrackRef.current) {
      console.log('🔄 DOM listo, procesando video track pendiente...');
      const success = processVideoTrack(pendingVideoTrackRef.current);
      if (success) {
        console.log('✅ Video track pendiente procesado exitosamente');
        pendingVideoTrackRef.current = null; // Limpiar queue
        toast.success('Video conectado (procesado desde queue)');
      } else {
        console.error('❌ Error procesando video track pendiente');
        toast.error('Error procesando video pendiente');
      }
    }
  }, [isWatching, videoRef.current]); // Se ejecuta cuando cambian estos valores
  
  // 👁️ UNIRSE A SALA
  const joinRoom = (roomName) => {
    if (!socketRef.current) {
      toast.error('No hay conexión al servidor');
      return;
    }
    
    setIsConnecting(true);
    setError(null);
    
    console.log('👁️ Uniéndose a sala:', { roomName, viewerName });
    
    // Enviar evento al backend
    socketRef.current.emit('room:join', {
      roomName,
      viewerName
    });
  };
  
  // 🔄 MANEJAR UNIÓN A SALA
  const handleRoomJoined = async (data) => {
    try {
      console.log('🔄 Conectando a LiveKit...', data);
      console.log('📡 URL LiveKit:', data.livekitUrl);
      console.log('🎫 Token recibido:', data.livekitToken ? 'Sí' : 'No');
      
      // Crear room de LiveKit - Configuración SIMPLIFICADA para túneles problemáticos
      const room = new Room({
        adaptiveStream: false, // Desactivar adaptive stream
        dynacast: false, // Desactivar dynacast
        // Configuración para viewer - SOLO RECIBIR (no publicar)
        autoSubscribe: true,
        // NO publicar nada (viewer solo ve)
        publishDefaults: {
          audioEnabled: false,
          videoEnabled: false,
          dtx: false
        },
        // Configuración HÍBRIDA - Compatible con admin trabajando
        rtcConfig: {
          iceServers: [
            // STUN servers primero (como el admin que funciona)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // TURN servers como fallback
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ],
          iceTransportPolicy: 'all', // PERMITIR todas las conexiones (como admin)
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        },
        // Reconexión automática mejorada
        reconnectPolicy: {
          nextRetryDelayInMs: (context) => {
            // Espera exponencial con tope de 10 segundos
            return Math.min(Math.pow(2, context.retryCount) * 1000, 10000);
          },
          maxRetryCount: 5
        },
        // Timeouts más tolerantes para túneles
        connectionTimeout: 30000,  // 30 segundos para conectar
        peerConnectionTimeout: 30000
      });
      
      livekitRoomRef.current = room;
      
      // Event listeners
      room.on('connected', () => {
        console.log('✅ Conectado a LiveKit como viewer');
        
        // Verificar participantes de forma segura
        if (room.participants) {
          console.log('📺 Participantes en la sala:', room.participants.size);
          
          // Listar todos los participantes y sus tracks
          room.participants.forEach((participant, identity) => {
            console.log('👥 Participante:', identity, {
              tracks: participant.tracks ? participant.tracks.size : 0,
              videoTracks: participant.videoTracks ? participant.videoTracks.size : 0,
              audioTracks: participant.audioTracks ? participant.audioTracks.size : 0
            });
            
            // Si el participante ya tiene tracks publicados, suscribirse
            if (participant.videoTracks && participant.videoTracks.size > 0) {
              participant.videoTracks.forEach((publication, trackSid) => {
                console.log('📹 Track de video ya disponible, forzando suscripción:', trackSid);
                publication.setSubscribed(true);
              });
            }
            
            if (participant.audioTracks && participant.audioTracks.size > 0) {
              participant.audioTracks.forEach((publication, trackSid) => {
                console.log('🎤 Track de audio ya disponible, forzando suscripción:', trackSid);
                publication.setSubscribed(true);
              });
            }
          });
        } else {
          console.log('⚠️ room.participants no está disponible aún');
        }
        
        setIsWatching(true);
        setIsConnecting(false);
        setCurrentRoom(data.roomName);
        setStreamerName(data.streamerName);
        toast.success('¡Conectado al stream!');
        
        // Iniciar monitoreo de estadísticas del viewer
        startViewerStatsMonitoring(room);
      });
      
      room.on('disconnected', () => {
        console.log('🔌 Desconectado de LiveKit');
        setIsWatching(false);
        setCurrentRoom(null);
      });
      
      room.on('trackSubscribed', (track, publication, participant) => {
        console.log('📺 Track recibido:', {
          kind: track.kind,
          participant: participant.identity,
          trackSid: track.sid,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings ? track.getSettings() : 'N/A'
        });
        
        if (track.kind === 'video') {
          console.log('📹 Procesando track de video...');
          console.log('📺 Estado del videoRef:', {
            current: !!videoRef.current,
            element: videoRef.current,
            tagName: videoRef.current?.tagName
          });
          
          console.log('📹 Track de video details:', {
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            mediaStreamTrack: track.mediaStreamTrack,
            settings: track.mediaStreamTrack ? track.mediaStreamTrack.getSettings() : null
          });
          
          // SOLUCIÓN: Si videoRef no está listo, guardar track para procesar después
          if (!videoRef.current) {
            console.log('⏳ videoRef no está listo, guardando track para procesar después...');
            pendingVideoTrackRef.current = track;
            toast('Video track recibido, esperando DOM...', { icon: '⏳' });
            return; // Salir y procesar cuando DOM esté listo
          }
          
          // Procesar video track
          const success = processVideoTrack(track);
          if (success) {
            toast.success('Video conectado');
          } else {
            toast.error('Error conectando video');
          }
        }
        
        if (track.kind === 'audio') {
          console.log('🎤 Track de audio recibido');
          // Guardar referencia al track de audio para control
          audioTrackRef.current = track;
          
          // Auto-attach audio (no se necesita elemento DOM específico)
          track.attach();
          
          // Aplicar estado actual de mute al track de LiveKit
          if (isMuted) {
            track.setVolume(0);
          }
          
          toast.success('Audio conectado');
        }
      });
      
      room.on('participantConnected', (participant) => {
        console.log('👥 Nuevo participante conectado:', participant.identity);
        console.log('📺 Tracks del participante:', {
          total: participant.tracks.size,
          video: participant.videoTracks.size,
          audio: participant.audioTracks.size
        });
      });
      
      room.on('trackPublished', (publication, participant) => {
        console.log('📡 Track publicado por', participant.identity, ':', {
          kind: publication.kind,
          source: publication.source,
          trackName: publication.trackName,
          subscribed: publication.isSubscribed,
          enabled: publication.isEnabled,
          muted: publication.isMuted
        });
        
        // Forzar suscripción inmediata para todos los tracks
        console.log('🔄 Forzando suscripción al track:', publication.kind);
        publication.setSubscribed(true);
        
        // Debug adicional para tracks de video
        if (publication.kind === 'video') {
          console.log('📹 Track de video publicado, forzando suscripción...');
        }
        
        if (publication.kind === 'audio') {
          console.log('🎤 Track de audio publicado, forzando suscripción...');
        }
      });
      
      room.on('trackUnsubscribed', (track, publication, participant) => {
        console.log('📺 Track desconectado:', track.kind, 'de', participant.identity);
        
        if (track.kind === 'video' && videoRef.current) {
          track.detach(videoRef.current);
        }
        
        if (track.kind === 'audio' && track === audioTrackRef.current) {
          // Limpiar referencia del audio track desconectado
          audioTrackRef.current = null;
          console.log('🎤 Referencia de audio track limpiada');
        }
      });
      
      room.on('participantConnected', (participant) => {
        console.log('👥 Participant conectado:', participant.identity);
      });
      
      room.on('participantDisconnected', (participant) => {
        console.log('👥 Participant desconectado:', participant.identity);
        if (participant.identity === streamerName) {
          toast.error('El streamer terminó la transmisión');
          // Auto-salir cuando el streamer se desconecta
          setTimeout(() => {
            handleRoomLeft();
          }, 2000);
        }
      });
      
      // Verificar URL antes de conectar
      if (!data.livekitUrl || !data.livekitToken) {
        throw new Error('URL o Token de LiveKit faltantes');
      }
      
      // Agregar listeners de diagnóstico antes de conectar
      room.on('connectionStateChanged', (state) => {
        console.log('🔄 Estado de conexión cambiado:', state);
      });
      
      room.on('mediaDevicesError', (error) => {
        console.warn('⚠️ Error de dispositivos media (ignorar, somos viewer):', error);
      });
      
      room.on('signalConnected', () => {
        console.log('✅ Señalización conectada al servidor LiveKit');
      });
      
      room.on('signalReconnecting', () => {
        console.log('🔄 Reconectando señalización...');
      });
      
      // Conectar como VIEWER (sin dispositivos de media)
      console.log('🔄 Conectando como viewer (solo recepción):', data.livekitUrl);
      console.log('📊 Configuración de conexión:', {
        url: data.livekitUrl,
        hasToken: !!data.livekitToken,
        tokenLength: data.livekitToken?.length || 0
      });
      
      try {
        // Conectar SIN intentar acceder a dispositivos (viewer pasivo)
        await room.connect(data.livekitUrl, data.livekitToken);
        console.log('📡 Conectado como viewer exitosamente - SOLO RECEPCIÓN');
      } catch (connectError) {
        console.error('❌ Error detallado de conexión LiveKit:', {
          message: connectError.message,
          code: connectError.code,
          stack: connectError.stack,
          name: connectError.name
        });
        
        // Información adicional de diagnóstico
        if (connectError.message?.includes('pc connection')) {
          console.error('💡 Sugerencia: El error de PC connection puede indicar problemas con WebRTC/ICE negotiation a través del túnel');
        }
        
        throw new Error(`Error de conexión LiveKit: ${connectError.message}`);
      }
      
    } catch (error) {
      console.error('❌ Error conectando LiveKit:', error);
      setError(error.message);
      setIsConnecting(false);
      toast.error('Error conectando: ' + error.message);
    }
  };
  
  // 🚪 SALIR DE SALA
  const leaveRoom = () => {
    if (!socketRef.current || !currentRoom) return;
    
    console.log('🚪 Saliendo de sala...');
    
    // Enviar evento al backend
    socketRef.current.emit('room:leave', {
      roomName: currentRoom
    });
  };
  
  const handleRoomLeft = () => {
    // Desconectar de LiveKit
    if (livekitRoomRef.current) {
      livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    
    // Limpiar referencia de audio track
    audioTrackRef.current = null;
    
    // Limpiar video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Reset estado
    setIsWatching(false);
    setIsConnecting(false);
    setCurrentRoom(null);
    setStreamerName('');
    setParticipantCount(0);
    setError(null);
    setIsMuted(false);
    setIsPaused(false);
    setShowControls(true);
    setVideoLoaded(false);
    setShowStats(false);
    
    toast.success('Desconectado del stream');
    console.log('✅ Desconectado completamente');
    
    // Solicitar lista actualizada
    if (socketRef.current) {
      socketRef.current.emit('rooms:list');
    }
  };
  
  // 🧹 CLEANUP
  useEffect(() => {
    return () => {
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Limpiar referencia de audio track
      audioTrackRef.current = null;
    };
  }, []);
  
  return (
    <div className="streaming-viewer">
      {/* Header */}
      <div className="viewer-header">
        <h1>👁️ Viewer de Streaming |</h1>
        <div className="status">
          <span className={`indicator ${isWatching ? 'watching' : 'idle'}`}>
            {isWatching ? '📺 VIENDO' : '⚫ IDLE'}
          </span>
          {isWatching && (
            <>
              <span className="room-name">🏠 {currentRoom}</span>
              <span className="viewers">👥 {participantCount} viewers</span>
            </>
          )}
        </div>
      </div>
      
      {/* Video o lista de salas */}
      {!isWatching ? (
        <div className="rooms-section" style={{padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: '100vh'}}>
          <h2 style={{color: 'white'}}>🏠 Salas Activas ({rooms.length})</h2>
          
          {/* DEBUG INFO */}
          <div className="debug-info">
            <p>DEBUG: Rooms recibidos: {rooms.length} | Viewer: {viewerName}</p>
          </div>
          
          {rooms.length > 0 ? (
            <div className="rooms-grid">
              {rooms.map((room) => (
                <div key={room.roomName} className="room-card">
                  <div className="room-info">
                    <h3>{room.roomName}</h3>
                    <p>👤 Por: {room.streamerName}</p>
                    <p>👥 {room.viewers} viewers</p>
                    <p>🕐 Desde: {new Date(room.startedAt).toLocaleTimeString()}</p>
                  </div>
                  <button
                    onClick={() => joinRoom(room.roomName)}
                    disabled={isConnecting}
                    className="join-btn"
                  >
                    {isConnecting ? '🔄 Conectando...' : '📺 Ver Stream'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-rooms">
              <p>🔍 Buscando streams activos...</p>
              <p>No hay transmisiones en vivo</p>
            </div>
          )}
        </div>
      ) : (
        <div className="modern-viewer">
          
          {/* Video Container */}
          <div className={`video-container ${videoAspectRatio}`}>
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={isMuted}
              controls={false}
              preload="auto"
              className="video-element"
              onMouseMove={() => {
                setShowControls(true);
                clearTimeout(controlsTimeoutRef.current);
                controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
              }}
              onTouchStart={() => {
                setShowControls(!showControls);
                clearTimeout(controlsTimeoutRef.current);
                if (showControls) {
                  controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
                }
              }}
              onLoadedMetadata={(e) => {
                const width = e.target.videoWidth;
                const height = e.target.videoHeight;
                console.log('📹 Video metadata loaded:', {
                  videoWidth: width,
                  videoHeight: height,
                  duration: e.target.duration
                });
                
                // Auto-detectar aspect ratio (método adicional)
                updateVideoAspectRatio(width, height);
                setVideoLoaded(true);
              }}
              onCanPlay={() => console.log('📹 Video can play')}
              onPlay={() => console.log('📹 Video started playing')}
              onPause={() => console.log('📹 Video paused')}
              onError={(e) => console.error('📹 Video error:', e.target.error)}
              onWaiting={() => console.log('📹 Video waiting for data')}
              onLoadStart={() => console.log('📹 Video load started')}
              onSeeking={() => console.log('📹 Video seeking')}
              onSeeked={() => console.log('📹 Video seeked')}
              onTimeUpdate={() => {
                // Solo log inicial para evitar spam
                if (videoRef.current?.currentTime < 1) {
                  console.log('📹 Video time update:', videoRef.current.currentTime);
                }
              }}
            />
            
            {/* Placeholder para cuando no hay video */}
            {!videoLoaded && (
              <div className="video-placeholder">
                <div className="placeholder-content">
                  <p>📺 Esperando video...</p>
                  <small>Conectando al stream...</small>
                </div>
              </div>
            )}
            
            {/* Controles Modernos Simples */}
            <div className={`modern-controls ${showControls ? 'visible' : ''}`}>
              {/* Top Bar */}
              <div className="top-bar">
                <button onClick={leaveRoom} className="back-button">
                  ← Salir
                </button>
                
                <div className="stream-title">
                  <span className="live-indicator">🔴 EN VIVO</span>
                  <span className="room-name">{currentRoom}</span>
                </div>
                
              </div>
              
              {/* Bottom Controls */}
              <div className="bottom-controls">
                <div className="left-info">
                  <div className="streamer-info">👤 {streamerName}</div>
                  <div className="viewer-count">👥 {participantCount} viewers</div>
                </div>
                
                <div className="media-controls">
                  {/* Mute Button */}
                  <button 
                    className={`control-button mute-btn ${isMuted ? 'active' : ''}`}
                    onClick={() => {
                      console.log('🔊 Botón mute clickeado');
                      const newMuted = !isMuted;
                      setIsMuted(newMuted);
                      
                      // Aplicar al elemento video HTML
                      if (videoRef.current) {
                        videoRef.current.muted = newMuted;
                        videoRef.current.volume = newMuted ? 0 : 1;
                      }
                      
                      // Aplicar al track de audio de LiveKit (LO IMPORTANTE)
                      if (audioTrackRef.current) {
                        audioTrackRef.current.setVolume(newMuted ? 0 : 1);
                        console.log('🎤 Audio track LiveKit:', newMuted ? 'SILENCIADO' : 'ACTIVADO');
                      }
                      
                      console.log('🔊 Nuevo estado mute:', {
                        isMuted: newMuted,
                        elementMuted: videoRef.current?.muted,
                        elementVolume: videoRef.current?.volume,
                        livekitAudioTrack: audioTrackRef.current ? 'Controlado' : 'No disponible'
                      });
                      
                      toast(newMuted ? '🔇 Silenciado' : '🔊 Audio activado');
                    }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>
                  
                  {/* Pause Button */}
                  <button 
                    className={`control-button pause-btn ${isPaused ? 'active' : ''}`}
                    onClick={() => {
                      console.log('⏸️ Botón pause clickeado');
                      const newPaused = !isPaused;
                      setIsPaused(newPaused);
                      
                      if (newPaused) {
                        // PAUSAR: Silenciar audio y pausar video
                        if (videoRef.current) {
                          videoRef.current.pause();
                        }
                        if (audioTrackRef.current) {
                          audioTrackRef.current.setVolume(0);
                          console.log('⏸️ Audio LiveKit PAUSADO (silenciado)');
                        }
                        console.log('⏸️ Stream pausado');
                      } else {
                        // REANUDAR: Restaurar audio y reanudar video
                        if (videoRef.current) {
                          videoRef.current.play();
                        }
                        if (audioTrackRef.current && !isMuted) {
                          audioTrackRef.current.setVolume(1);
                          console.log('▶️ Audio LiveKit REANUDADO');
                        }
                        console.log('▶️ Stream reanudado');
                      }
                      
                      toast(newPaused ? '⏸️ Pausado' : '▶️ Reproduciendo');
                    }}
                  >
                    {isPaused ? '▶️' : '⏸️'}
                  </button>
                </div>
                
                <div className="quality-info">
                  <span className="resolution">{viewerStats.resolution}</span>
                  <span className="quality">{viewerStats.quality}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Info del viewer */}
      <div className="viewer-info">
        <p><strong>Viewer:</strong> {viewerName}</p>
      </div>
      
      {/* Errores */}
      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      )}
      
      <style jsx>{`
        .streaming-viewer {
          width: 100%;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0a0a;
          min-height: 100vh;
          position: relative;
        }
        
        .modern-viewer {
          width: 100%;
          height: 100vh;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .viewer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 15px;
          border-bottom: 3px solid #eee;
        }
        
        .viewer-header h1 {
          margin: 0;
          color: #333;
          font-size: 2rem;
        }
        
        .status {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .indicator {
          font-weight: bold;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
        }
        
        .indicator.watching {
          background: #4CAF50;
          color: white;
        }
        
        .indicator.idle {
          background: #666;
          color: white;
        }
        
        .room-name, .viewers {
          background: #2196F3;
          color: white;
          padding: 4px 12px;
          border-radius: 15px;
          font-size: 12px;
          font-weight: bold;
        }
        
        .debug-info {
          background: #f0f0f0;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
          font-size: 12px;
          color: #666;
        }
        
        .rooms-section h2 {
          color: #333;
          margin-bottom: 20px;
        }
        
        .rooms-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .room-card {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .room-card:hover {
          border-color: #4CAF50;
          transform: translateY(-5px);
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        }
        
        .room-info h3 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 1.3rem;
        }
        
        .room-info p {
          margin: 5px 0;
          color: #666;
          font-size: 14px;
        }
        
        .join-btn {
          width: 100%;
          padding: 12px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.3s;
          margin-top: 15px;
        }
        
        .join-btn:hover:not(:disabled) {
          background: #45a049;
        }
        
        .join-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .no-rooms {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }
        
        .no-rooms p {
          font-size: 18px;
          margin: 10px 0;
        }
        
        .video-section {
          margin-bottom: 30px;
        }
        
        .stream-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 20px;
          border-radius: 15px;
          margin-bottom: 15px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        
        .stream-info .room-title {
          margin: 0;
          font-size: 24px;
          color: #333;
          font-weight: bold;
        }
        
        .stream-info .streamer-name {
          margin: 5px 0 0 0;
          color: #666;
          font-size: 16px;
        }
        
        
        .stat-pill {
          background: rgba(103, 126, 234, 0.1);
          color: #667eea;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid rgba(103, 126, 234, 0.2);
        }
        
        .video-wrapper {
          position: relative;
          width: 100%;
          height: 100vh;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        
        .stream-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
          transform: scaleX(-1); /* 🪞 Modo espejo */
        }
        
        
        
        .stat-card {
          background: rgba(255, 255, 255, 0.05);
          padding: 12px;
          border-radius: 10px;
          text-align: center;
        }
        
        .stat-label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          margin-bottom: 4px;
        }
        
        .stat-value {
          color: white;
          font-size: 16px;
          font-weight: 600;
        }
        
        .video-placeholder {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1;
        }
        
        .placeholder-content {
          text-align: center;
          color: white;
        }
        
        .placeholder-content p {
          margin: 0 0 10px 0;
          font-size: 18px;
        }
        
        .placeholder-content small {
          font-size: 14px;
          opacity: 0.7;
        }
        
        /* Controles Modernos */
        .modern-controls {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 50;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.7) 0%,
            transparent 20%,
            transparent 80%,
            rgba(0,0,0,0.7) 100%
          );
        }
        
        .modern-controls.visible {
          opacity: 1;
        }
        
        .modern-controls > * {
          pointer-events: all;
        }
        
        .top-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .back-button {
          background: rgba(0, 0, 0, 0.6);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 25px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          backdrop-filter: blur(10px);
          transition: all 0.3s;
        }
        
        .back-button:hover {
          background: rgba(0, 0, 0, 0.8);
        }
        
        .stream-title {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
        }
        
        .live-indicator {
          background: #ff3040;
          color: white;
          padding: 6px 12px;
          border-radius: 15px;
          font-size: 12px;
          font-weight: bold;
          animation: pulse 2s infinite;
        }
        
        .room-name {
          color: white;
          font-size: 16px;
          font-weight: 600;
        }
        
        
        .bottom-controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        
        .left-info {
          color: white;
        }
        
        .streamer-info {
          font-size: 16px;
          margin-bottom: 5px;
          font-weight: 500;
        }
        
        .viewer-count {
          font-size: 14px;
          opacity: 0.8;
        }
        
        .media-controls {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        
        .control-button {
          background: rgba(0, 0, 0, 0.6);
          color: white;
          border: none;
          width: 50px;
          height: 50px;
          border-radius: 25px;
          cursor: pointer;
          font-size: 20px;
          backdrop-filter: blur(10px);
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .control-button:hover {
          background: rgba(0, 0, 0, 0.8);
          transform: scale(1.1);
        }
        
        .control-button.active {
          background: #ff3040;
        }
        
        .quality-info {
          color: white;
          text-align: right;
        }
        
        .resolution {
          display: block;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 2px;
        }
        
        .quality {
          display: block;
          font-size: 12px;
          opacity: 0.8;
        }
        
        .back-btn {
          background: rgba(0, 0, 0, 0.5);
          color: white;
          border: none;
          width: 44px;
          height: 44px;
          border-radius: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
        }
        
        .live-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 48, 64, 0.9);
          color: white;
          padding: 6px 12px;
          border-radius: 15px;
          font-size: 12px;
          font-weight: bold;
          backdrop-filter: blur(10px);
        }
        
        .live-dot {
          width: 6px;
          height: 6px;
          background: white;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        .bottom-info {
          position: absolute;
          bottom: 20px;
          left: 20px;
          right: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        
        .stream-details {
          flex: 1;
          color: white;
        }
        
        .room-name {
          margin: 0 0 5px 0;
          font-size: 18px;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        .streamer-info {
          margin: 0 0 10px 0;
          font-size: 14px;
          opacity: 0.9;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        
        .stat {
          background: rgba(0, 0, 0, 0.3);
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          backdrop-filter: blur(5px);
        }
        
        .side-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        
        .control-btn {
          background: rgba(0, 0, 0, 0.5);
          color: white;
          border: none;
          width: 50px;
          height: 50px;
          border-radius: 25px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          transition: all 0.3s;
        }
        
        .control-btn:active {
          transform: scale(0.95);
        }
        
        .control-btn.muted {
          background: rgba(255, 48, 64, 0.7);
        }
        
        .viewers-count {
          text-align: center;
          color: white;
        }
        
        .count-number {
          font-size: 16px;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        .count-label {
          font-size: 11px;
          opacity: 0.8;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
          
          .stream-title {
            display: none;
          }
          
          .top-bar {
            padding: 15px;
          }
          
          .bottom-controls {
            padding: 15px;
            flex-wrap: wrap;
            gap: 15px;
          }
          
          .media-controls {
            order: 3;
            width: 100%;
            justify-content: center;
          }
          
          .quality-info {
            order: 1;
            text-align: left;
          }
          
          .left-info {
            order: 2;
          }
        }
        
        @media (max-width: 480px) {
          .control-button {
            width: 44px;
            height: 44px;
            font-size: 18px;
          }
          
          .back-button {
            padding: 10px 15px;
            font-size: 14px;
          }
          
        }
        
        .viewer-info {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .viewer-info p {
          margin: 0;
          color: #555;
        }
        
        .error-message {
          background: #ffebee;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #f44336;
        }
        
        .error-message p {
          margin: 0;
          color: #c62828;
          font-weight: bold;
        }
        
        @media (max-width: 768px) {
          .viewer-header {
            flex-direction: column;
            gap: 15px;
            text-align: center;
          }
          
          .viewer-header h1 {
            font-size: 1.5rem;
          }
          
          .rooms-grid {
            grid-template-columns: 1fr;
          }
          
          .status {
            flex-wrap: wrap;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default StreamingViewer;