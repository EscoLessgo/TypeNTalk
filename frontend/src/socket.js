import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL || window.location.origin);

export default socket;
