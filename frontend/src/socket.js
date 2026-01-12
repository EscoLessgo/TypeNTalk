import { io } from 'socket.io-client';

const getApiBase = () => {
    // For localhost development, use the local backend
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }

    // For ALL deployed environments (staging AND production),
    // always use the current origin to ensure socket connects to the correct backend
    console.log('[SOCKET] Using current origin:', window.location.origin);
    return window.location.origin;
};

const socket = io(getApiBase(), {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
});

export default socket;
