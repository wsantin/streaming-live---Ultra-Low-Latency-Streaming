// Socket.IO Hook for real-time communication
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config/constants';

const useSocket = () => {
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(API_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🔗 Socket connected:', socket.id);
      console.log('📍 Socket URL:', API_URL);
      
      // Auto-solicitar salas al conectarse con delay para asegurar conexión estable
      setTimeout(() => {
        console.log('🔄 Auto-solicitando salas al conectarse...');
        socket.emit('livekit:getRooms');
        
        // Listener temporal para debug
        socket.once('livekit:rooms', (data) => {
          console.log('✅ Respuesta recibida en connect:', data);
        });
      }, 500);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // LiveKit room management functions with debug
  const getRooms = (callback) => {
    const socket = socketRef.current;
    if (!socket) {
      console.log('❌ getRooms: Socket no disponible');
      return;
    }

    console.log('📡 useSocket.getRooms: Emitiendo livekit:getRooms');
    console.log('🔗 Socket conectado:', socket.connected);
    console.log('🆔 Socket ID:', socket.id);
    
    socket.emit('livekit:getRooms');
    socket.on('livekit:rooms', callback);

    return () => socket.off('livekit:rooms', callback);
  };

  const joinRoom = (roomName, participantName, callback) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('livekit:joinRoom', { roomName, participantName });
    socket.on('livekit:joinReady', callback);

    return () => socket.off('livekit:joinReady', callback);
  };

  const onRoomsUpdated = (callback) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('livekit:roomsUpdated', callback);
    return () => socket.off('livekit:roomsUpdated', callback);
  };

  const onViewersCount = (callback) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('viewers:count', callback);
    return () => socket.off('viewers:count', callback);
  };

  return {
    socket: socketRef.current,
    getRooms,
    joinRoom,
    onRoomsUpdated,
    onViewersCount
  };
};

export default useSocket;