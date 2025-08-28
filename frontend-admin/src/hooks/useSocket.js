// Socket.IO Hook for real-time communication - Admin
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

  // LiveKit admin functions
  const createRoom = (roomName, participantName, callback) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('livekit:createRoom', { 
      roomName, 
      participantName, 
      isPublisher: true 
    });
    socket.on('livekit:tokenGenerated', callback);

    return () => socket.off('livekit:tokenGenerated', callback);
  };

  const getRooms = (callback) => {
    const socket = socketRef.current;
    if (!socket) {
      console.log('❌ getRooms: Socket no disponible');
      return;
    }

    console.log('📡 Admin getRooms: Emitiendo livekit:getRooms');
    socket.emit('livekit:getRooms');
    socket.on('livekit:rooms', callback);

    return () => socket.off('livekit:rooms', callback);
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
    createRoom,
    getRooms,
    onRoomsUpdated,
    onViewersCount
  };
};

export default useSocket;