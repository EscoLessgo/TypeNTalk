import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { useParams } from 'react-router-dom';
import { Send, Mic, MicOff, Keyboard, Zap, Heart, History, Play, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getApiBase = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin;
};

const API_BASE = getApiBase();

export default function TypistView() {
    const { slug } = useParams();
    const [status, setStatus] = useState('checking'); // checking, waiting-approval, connected, denied
    const [text, setText] = useState('');
    const [isMicOn, setIsMicOn] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const [hostName, setHostName] = useState('');
    const [favorites, setFavorites] = useState([]);
    const [isReplaying, setIsReplaying] = useState(false);
    const [ripples, setRipples] = useState([]); // Array of {id, x, y}
    const [error, setError] = useState(null);

    // Refs for audio processing
    const audioContextRef = useRef(null);
    const analyzerRef = useRef(null);
    const streamRef = useRef(null);
    const lastPulseRef = useRef(0);

    useEffect(() => {
        checkSlug();
        socket.emit('join-typist', slug);

        socket.on('approval-status', ({ approved }) => {
            setStatus(approved ? 'connected' : 'denied');
        });

        return () => {
            socket.off('approval-status');
            stopMic();
        };
    }, [slug]);

    const checkSlug = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/connections/${slug}`);
            setHostName(res.data.host.username);
            const favs = res.data.history?.filter(h => h.isFavorite) || [];
            setFavorites(favs);

            if (res.data.approved) {
                setStatus('connected');
            } else {
                setStatus('waiting-approval');
                socket.emit('request-approval', { slug });
            }
        } catch (err) {
            console.error('Check link error:', err);
            setError(err.response?.data?.error || 'Link invalid or server unreachable');
            setStatus('invalid');
        }
    };

    const handleKeyDown = (e) => {
        if (status !== 'connected') return;

        // Visual ripple effect
        const id = Date.now();
        setRipples(prev => [...prev, { id, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 }]);
        setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 1000);

        // Visual feedback and pulse
        const now = Date.now();
        if (now - lastPulseRef.current > 100) { // Throttling
            socket.emit('typing-pulse', { slug, intensity: 3 });
            lastPulseRef.current = now;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendSurge();
        }
    };

    const sendSurge = () => {
        if (!text.trim()) return;
        const pulses = [{ time: 0, intensity: 15, duration: text.length * 0.1 }];
        socket.emit('final-surge', { slug, text, pulses });
        setText('');
    };

    const replayFavorite = (fav) => {
        if (isReplaying) return;
        setIsReplaying(true);
        socket.emit('final-surge', { slug, text: fav.text });
        setTimeout(() => setIsReplaying(false), 2000);
    };

    const toggleMic = async () => {
        if (isMicOn) {
            stopMic();
        } else {
            startMic();
        }
    };

    const startMic = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyzer = audioContextRef.current.createAnalyser();
            analyzer.fftSize = 512;
            source.connect(analyzer);
            analyzerRef.current = analyzer;

            setIsMicOn(true);
            requestAnimationFrame(processAudio);
        } catch (err) {
            console.error('Mic access denied', err);
            alert('Enable mic access to use voice sync');
        }
    };

    const stopMic = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        setIsMicOn(false);
        setMicLevel(0);
    };

    const processAudio = () => {
        if (!analyzerRef.current || !isMicOn) return;

        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);

        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalized = Math.min(Math.floor(average / 10), 20); // Scale to 0-20

        setMicLevel(normalized);

        // Send pulse if level is significant
        if (normalized > 3) {
            const now = Date.now();
            if (now - lastPulseRef.current > 150) {
                socket.emit('voice-pulse', { slug, intensity: normalized });
                lastPulseRef.current = now;
            }
        }

        if (isMicOn) requestAnimationFrame(processAudio);
    };

    if (status === 'checking') return <div className="text-center p-20 animate-pulse text-purple-400 font-bold uppercase tracking-widest">Initializing Secure Link...</div>;
    if (status === 'invalid') return (
        <div className="max-w-md mx-auto glass p-10 rounded-3xl text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <Shield className="text-red-400" size={40} />
            </div>
            <h2 className="text-2xl font-bold italic text-red-400 uppercase">Link Invalid</h2>
            <p className="text-white/60">{error || 'This link has expired or never existed.'}</p>
            <button
                onClick={() => window.location.href = '/'}
                className="button-premium w-full"
            >
                Return to Home
            </button>
        </div>
    );
    if (status === 'denied') return <div className="text-center p-20 text-red-500">Access Denied</div>;
    if (status === 'waiting-approval') return (
        <div className="max-w-md mx-auto glass p-10 rounded-3xl text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center animate-bounce">
                <Heart className="text-purple-400" size={40} />
            </div>
            <h2 className="text-2xl font-bold italic">Connection Pending</h2>
            <p className="text-white/60">Waiting for {hostName} to approve your pairing request...</p>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between glass px-8 py-4 rounded-3xl">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                    <span className="font-semibold text-white/80">Synchronized with <span className="text-purple-400">{hostName}</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleMic}
                        className={`p-3 rounded-2xl transition-all ${isMicOn ? 'bg-pink-500/20 text-pink-400' : 'bg-white/5 text-white/40'}`}
                    >
                        {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                    </button>
                    {isMicOn && (
                        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-pink-500"
                                style={{ width: `${(micLevel / 20) * 100}%` }}
                                animate={{ opacity: micLevel > 0 ? 1 : 0.5 }}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className={`glass p-8 rounded-[2.5rem] relative overflow-hidden min-h-[400px] flex flex-col transition-all duration-300 ${micLevel > 5 ? 'border-pink-500/30' : 'border-white/10'}`}>
                {/* Dynamic Background Glow */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5"
                    animate={{
                        opacity: micLevel > 0 ? 0.3 : 0.1,
                        scale: micLevel > 5 ? 1.05 : 1
                    }}
                />

                <AnimatePresence>
                    {ripples.map(r => (
                        <motion.div
                            key={r.id}
                            initial={{ scale: 0, opacity: 0.5 }}
                            animate={{ scale: 4, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            className="absolute rounded-full bg-purple-500/20 pointer-events-none"
                            style={{
                                left: `${r.x}%`,
                                top: `${r.y}%`,
                                width: '100px',
                                height: '100px',
                                marginLeft: '-50px',
                                marginTop: '-50px'
                            }}
                        />
                    ))}
                    {micLevel > 10 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.2 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-pink-500/20 pointer-events-none"
                        />
                    )}
                </AnimatePresence>

                <textarea
                    className="w-full flex-grow bg-transparent text-2xl font-light placeholder:text-white/10 resize-none focus:outline-none leading-relaxed z-10"
                    placeholder="Whisper what you want..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                />

                <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5 z-10">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-4 text-white/40 text-[10px] uppercase font-bold tracking-widest">
                            <span className="flex items-center gap-2"><Keyboard size={12} className="text-purple-400" /> Keys sync pulses</span>
                            <span className="flex items-center gap-2"><Mic size={12} className="text-pink-400" /> Mic syncs air/vibe</span>
                        </div>
                        {isMicOn && (
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] text-pink-400 font-black animate-pulse">VOICE LIVE</span>
                                <div className="flex gap-0.5 items-end h-3">
                                    {[...Array(5)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-1 bg-pink-500/50 rounded-full"
                                            animate={{ height: micLevel > (i * 2) ? '100%' : '20%' }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        className="button-premium flex items-center gap-2 group py-4 px-10 rounded-2xl"
                        onClick={sendSurge}
                    >
                        SUBMIT SURGE <Zap size={18} className="group-hover:fill-current group-hover:animate-pulse" />
                    </button>
                </div>
            </div>

            {favorites.length > 0 && (
                <div className="glass p-8 rounded-3xl space-y-4">
                    <h3 className="flex items-center gap-2 font-bold text-white/60 uppercase text-sm tracking-wider">
                        <History size={16} /> Favorite Responses (Auto-Loop)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {favorites.map(fav => (
                            <button
                                key={fav.id}
                                onClick={() => replayFavorite(fav)}
                                disabled={isReplaying}
                                className="text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group relative overflow-hidden"
                            >
                                <p className="text-sm line-clamp-1">{fav.text}</p>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play size={16} className="text-purple-400" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="text-center text-white/20 text-xs tracking-widest uppercase">
                Veroe Sync Engine v1.0 • Secure LDR Protocol
            </div>
        </div>
    );
}
