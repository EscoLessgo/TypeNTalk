import { io } from 'socket.io-client';

const getApiBase = () => {
    // For staging deployments, always use the current origin to ensure
    // we connect to the correct backend (not production)
    const isStaging = window.location.hostname.includes('staging');

    if (isStaging) {
        console.log('[SOCKET] Staging detected, using current origin:', window.location.origin);
        return window.location.origin;
    }

    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
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
