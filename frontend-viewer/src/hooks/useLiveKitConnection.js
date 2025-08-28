import { useEffect, useState } from 'react';
import { Room, RoomEvent, VideoPresets } from 'livekit-client';

export const useLiveKitConnection = (url, token) => {
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url || !token) return;

    const newRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user',
      },
      publishDefaults: {
        videoCodec: 'h264'
      },
      // Configuración mejorada con TURN
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // TURN server local
          {
            urls: 'turn:localhost:3478?transport=udp',
            username: 'livekit',
            credential: 'turnserver2025'
          },
          {
            urls: 'turn:localhost:3478?transport=tcp',
            username: 'livekit',
            credential: 'turnserver2025'
          }
        ],
        iceTransportPolicy: 'all' // Permite both direct and relay
      }
    });

    newRoom.on(RoomEvent.Connected, () => {
      console.log('✅ Conectado a sala LiveKit');
      setConnectionState('connected');
      setError(null);
    });

    newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('👤 Participante conectado:', participant.identity);
      updateParticipants(newRoom);
    });

    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('👋 Participante desconectado:', participant.identity);
      updateParticipants(newRoom);
    });

    newRoom.on(RoomEvent.Disconnected, (reason) => {
      console.log('🔌 Desconectado de sala:', reason);
      setConnectionState('disconnected');
    });

    newRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log(`📊 Calidad de conexión: ${quality} para ${participant?.identity}`);
    });

    const updateParticipants = (room) => {
      const allParticipants = Array.from(room.remoteParticipants.values());
      if (room.localParticipant) {
        allParticipants.unshift(room.localParticipant);
      }
      setParticipants(allParticipants);
    };

    // Conectar a la sala
    newRoom.connect(url, token)
      .then(() => {
        setRoom(newRoom);
        updateParticipants(newRoom);
      })
      .catch((err) => {
        console.error('❌ Error conectando a LiveKit:', err);
        setError(err.message);
        setConnectionState('error');
      });

    return () => {
      newRoom.disconnect();
    };
  }, [url, token]);

  return {
    room,
    participants,
    connectionState,
    error
  };
};