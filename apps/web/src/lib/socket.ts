import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const isServerlessHost = () =>
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app') &&
  !import.meta.env.VITE_WS_URL;

export const getSocket = (): Socket => {
  if (!socket) {
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    socket = io(wsUrl, {
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
};

export const connectSocket = (): void => {
  if (isServerlessHost()) return;
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
};

export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
  }
};

export default getSocket;
