import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { useParams } from 'react-router-dom';
import { Mic, MicOff, Keyboard, Zap, Heart, History, Play, Shield, Info, Check, HelpCircle, X, Lock, Eye, ThumbsUp, ThumbsDown, Activity } from 'lucide-react';
import TypistAvatar from './ui/TypistAvatar';
import PulseParticles from './ui/PulseParticles';
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
    const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
    const [showGuide, setShowGuide] = useState(false);
    const [intensity, setIntensity] = useState(0);
    const [hostFeedback, setHostFeedback] = useState(null);
    const [activePreset, setActivePreset] = useState('none');

    // Refs for audio processing
    const audioContextRef = useRef(null);
    const analyzerRef = useRef(null);
    const streamRef = useRef(null);
    const lastPulseRef = useRef(0);

    useEffect(() => {
        const onConnect = () => setIsSocketConnected(true);
        const onDisconnect = () => setIsSocketConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        if (socket.connected) onConnect();

        checkSlug();
        socket.emit('join-typist', slug);

        socket.on('approval-status', (data = {}) => {
            const { approved } = data;
            console.log(`[SOCKET] Approval status received: ${approved}`);
            setStatus(approved ? 'connected' : 'denied');
        });

        socket.on('host-feedback', (data = {}) => {
            setHostFeedback(data.type);
            setTimeout(() => setHostFeedback(null), 5000);
        });

        socket.on('preset-update', (data = {}) => {
            setActivePreset(data.preset);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('approval-status');
            socket.off('host-feedback');
            socket.off('preset-update');
            stopMic();
        };
    }, [slug]);

    const checkSlug = async () => {
        const cleanSlug = (slug || '').trim();
        if (!cleanSlug) {
            console.error('[TYPIST] No slug provided');
            setStatus('invalid');
            return;
        }

        console.log(`[TYPIST] Checking slug: ${cleanSlug}`);
        try {
            const res = await axios.get(`${API_BASE}/api/connections/${cleanSlug}`, { timeout: 8000 });
            console.log(`[TYPIST] Connection data received:`, res.data);

            if (!res.data || !res.data.host) {
                throw new Error('Malformed server response');
            }

            setHostName(res.data.host.username);
            const favs = res.data.history?.filter(h => h.isFavorite) || [];
            setFavorites(favs);

            if (res.data.approved) {
                console.log('[TYPIST] Status: connected');
                setStatus('connected');
            } else {
                console.log('[TYPIST] Status: waiting-approval');
                setStatus('waiting-approval');
                socket.emit('request-approval', { slug: cleanSlug });
            }
        } catch (err) {
            console.error('[TYPIST] Check link error:', err);
            const errorMsg = err.response?.data?.error || err.message || 'Link invalid or server unreachable';
            setError(errorMsg);
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
            socket.emit('typing-pulse', { slug, intensity: 9 });
            setIntensity(60);
            setTimeout(() => setIntensity(0), 100);
            lastPulseRef.current = now;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendSurge();
        }
    };

    const sendSurge = () => {
        if (!text.trim()) return;
        const pulses = [{ time: 0, intensity: 20, duration: 3 }];
        socket.emit('final-surge', { slug, text, pulses });
        setIntensity(100);
        setTimeout(() => setIntensity(0), 3000);
        setText('');
    };

    const replayFavorite = (fav) => {
        if (isReplaying) return;
        setIsReplaying(true);
        socket.emit('final-surge', { slug, text: fav.text });
        setTimeout(() => setIsReplaying(false), 3500);
    };

    const toggleMic = async () => {
        if (isMicOn) {
            stopMic();
        } else {
            startMic();
        }
    };

    const isMicOnRef = useRef(false);

    const startMic = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) throw new Error('Web Audio API not supported');

            audioContextRef.current = new AudioContext();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyzer = audioContextRef.current.createAnalyser();
            analyzer.fftSize = 512;
            source.connect(analyzer);
            analyzerRef.current = analyzer;

            isMicOnRef.current = true;
            setIsMicOn(true);
            requestAnimationFrame(processAudio);
        } catch (err) {
            console.error('Mic access denied', err);
            setError(`Mic Error: ${err.message}`);
        }
    };

    const stopMic = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        isMicOnRef.current = false;
        setIsMicOn(false);
        setMicLevel(0);
    };

    const processAudio = () => {
        if (!analyzerRef.current || !isMicOnRef.current) return;

        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        const binCount = 40; // Use slightly more spectrum for better speech capture
        for (let i = 0; i < binCount; i++) {
            sum += dataArray[i];
        }

        const average = sum / binCount;

        // Punchier Curve: average/3 (more aggressive) 
        // Gate: if average < 10, don't trigger (eliminates background hum)
        let normalized = 0;
        if (average > 10) {
            normalized = Math.min(Math.floor(average / 3), 20);
        }

        setMicLevel(normalized);
        setIntensity(normalized * 5); // 20 intensity -> 100 visual

        // Send pulse if level is significant (Gate check)
        if (normalized >= 4) {
            const now = Date.now();
            // Fast Lane: 100ms throttle for 'liquid' feel without flooding
            if (now - lastPulseRef.current > 100) {
                socket.emit('voice-pulse', { slug, intensity: normalized });
                lastPulseRef.current = now;
            }
        }

        if (isMicOnRef.current) requestAnimationFrame(processAudio);
    };

    if (status === 'checking') return <div className="text-center p-20 animate-pulse text-purple-400 font-bold uppercase tracking-widest italic">Establishing Secure LDR Tunnel...</div>;
    if (status === 'invalid') return (
        <div className="max-w-md mx-auto glass p-10 rounded-3xl text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <Shield className="text-red-400" size={40} />
            </div>
            <h2 className="text-2xl font-bold italic text-red-400 uppercase">Tunnel Expired</h2>
            <p className="text-white/60">{error || 'This pairing link is no longer valid.'}</p>
        </div>
    );
    if (status === 'denied') return <div className="text-center p-20 text-red-500 font-black italic uppercase">Access Explicitly Revoked by Host</div>;
    if (status === 'waiting-approval') return (
        <div className="max-w-md mx-auto glass p-10 rounded-3xl text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-pink-500/10 rounded-full flex items-center justify-center animate-intimate border border-pink-500/20 kinky-glow">
                <Heart className="text-pink-500" size={40} />
            </div>
            <h2 className="text-3xl font-black italic text-gradient">WAITING FOR ENTRY</h2>
            <p className="text-white/40 uppercase text-xs tracking-[0.2em] font-medium">Waiting for {hostName} to grant you control...</p>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 pb-20 relative">
            <AnimatePresence>
                {showGuide && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowGuide(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0d0d0f] border-l border-pink-500/20 shadow-2xl z-[101] overflow-y-auto custom-scrollbar p-8"
                        >
                            <div className="flex items-center justify-between mb-10">
                                <h2 className="text-3xl font-black text-gradient italic uppercase tracking-tighter">Controller Guide</h2>
                                <button
                                    onClick={() => setShowGuide(false)}
                                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-12 text-left">
                                <section className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 font-black italic">01</div>
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-white/90">The Connection</h3>
                                    </div>
                                    <p className="text-sm text-white/50 leading-relaxed uppercase tracking-tighter font-medium">
                                        You have been granted access to <span className="text-pink-500">{hostName}'s</span> hardware. Every action you take here translates directly into physical sensation on their end.
                                    </p>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-black italic">02</div>
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-white/90">Ways to Play</h3>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                                            <div className="flex items-center gap-2 text-xs font-black text-purple-400 uppercase tracking-widest">
                                                <Keyboard size={14} /> Keystore Pulse
                                            </div>
                                            <p className="text-[11px] text-white/40 uppercase leading-relaxed font-medium">Every letter you type sends a sharp pulse. A quick flurry of text creates intense, rhythmic sensations.</p>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                                            <div className="flex items-center gap-2 text-xs font-black text-pink-400 uppercase tracking-widest">
                                                <Mic size={14} /> Voice Reactive
                                            </div>
                                            <p className="text-[11px] text-white/40 uppercase leading-relaxed font-medium">Toggle the mic to stream your voice. The vibrations will flow with your pitch and volume—perfect for whispers, breath work, or commands.</p>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                                            <div className="flex items-center gap-2 text-xs font-black text-white uppercase tracking-widest">
                                                <Zap size={14} /> Final Surge
                                            </div>
                                            <p className="text-[11px] text-white/40 uppercase leading-relaxed font-medium">Submitting your text or replaying a favorite triggers a sustained, powerful 3-second vibration at maximum intensity.</p>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4 border-t border-white/5 pt-8">
                                    <div className="flex items-center gap-3">
                                        <Lock className="text-green-500" size={20} />
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-green-500">Secure Protocol</h3>
                                    </div>
                                    <p className="text-sm text-white/40 uppercase tracking-tighter font-black leading-relaxed italic">
                                        Your input is processed in real-time and never archived. We act as a stateless bridge between your control and their Hardware. Pure intimacy, zero footprints.
                                    </p>
                                </section>

                                <button
                                    onClick={() => setShowGuide(false)}
                                    className="w-full button-premium py-6 rounded-2xl text-lg font-black"
                                >
                                    GET STARTED
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Header / Brand */}
            <div className="text-center pt-8 pb-4 relative">
                <button
                    onClick={() => setShowGuide(true)}
                    className="absolute top-8 right-0 p-1.5 glass rounded-full text-white/40 hover:text-pink-500 transition-colors"
                >
                    <HelpCircle size={20} />
                </button>

                <div className="flex items-center justify-center gap-2 glass-pill px-4 py-1.5 w-max mx-auto border-purple-500/20 mb-4">
                    <Zap className="text-purple-400" size={12} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Synchronized Session</span>
                </div>
                <h1 className="text-5xl font-black tracking-tighter italic text-white uppercase leading-none">
                    <span className="text-gradient">TNT</span> SYNC
                </h1>
            </div>

            <div className="flex items-center justify-between glass px-8 py-4 rounded-3xl relative border-purple-500/20 shadow-lg shadow-purple-500/5">
                {/* Status Indicator */}
                <div className="absolute -top-12 right-0 flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                    <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                        {isSocketConnected ? 'TUNNEL ACTIVE' : 'TUNNEL DOWN'}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-pink-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                    <span className="font-black text-xs uppercase tracking-widest text-white/80 italic">Controlling <span className="text-pink-500">{hostName}</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <AnimatePresence>
                        {hostFeedback && (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 ${hostFeedback === 'good' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}
                            >
                                {hostFeedback === 'good' ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">{hostFeedback === 'good' ? 'SHE LOVES IT' : 'TOO MUCH / PAUSE'}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={toggleMic}
                        className={`p-3 rounded-2xl transition-all border ${isMicOn ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 kinky-glow' : 'bg-white/5 text-white/40 border-white/5'}`}
                    >
                        {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                    </button>
                    {isMicOn && (
                        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                            <motion.div
                                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                                style={{ width: `${(micLevel / 20) * 100}%` }}
                                animate={{ opacity: micLevel > 0 ? 1 : 0.5 }}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className={`glass p-8 rounded-[2.5rem] relative overflow-hidden min-h-[400px] flex flex-col transition-all duration-500 ${micLevel > 5 || intensity > 30 ? 'border-pink-500/40 bg-pink-500/[0.03]' : 'border-white/10'}`}>
                {/* Dynamic Background Glow */}
                <PulseParticles intensity={intensity || micLevel * 5} />

                <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10"
                    animate={{
                        opacity: (micLevel > 0 || intensity > 0) ? 0.4 : 0.1,
                        scale: (micLevel > 5 || intensity > 50) ? 1.05 : 1
                    }}
                />

                <div className="relative z-10 flex flex-col h-full flex-grow">
                    {/* Active Overlay: Avatar */}
                    <div className="absolute top-0 right-0 p-4 opacity-50 scale-50 origin-top-right">
                        <TypistAvatar intensity={intensity || micLevel * 5} lastAction={isMicOn ? 'voice' : 'typing'} />
                    </div>

                    <textarea
                        className="w-full flex-grow bg-transparent text-2xl font-bold placeholder:text-white/5 resize-none focus:outline-none leading-relaxed z-10 text-white shadow-none border-none outline-none appearance-none pt-10"
                        placeholder="TYPE HERE TO SYNC VIBRATIONS..."
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            socket.emit('typing-update', { slug, text: e.target.value });
                        }}
                        onKeyDown={handleKeyDown}
                    />

                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5 z-10">
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-4 text-white/40 text-[10px] uppercase font-black tracking-[0.2em] italic">
                                <span className="flex items-center gap-2">
                                    <Keyboard size={12} className={intensity > 0 ? 'text-purple-400' : 'text-white/10'} />
                                    PULSE: {intensity > 0 ? 'ACTIVE' : 'IDLE'}
                                </span>
                                {activePreset !== 'none' && (
                                    <span className="flex items-center gap-2 text-pink-500 animate-pulse">
                                        <Activity size={12} /> PRESET: {activePreset.toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowGuide(true)}
                                className="p-3 text-white/20 hover:text-white transition-colors"
                            >
                                <HelpCircle size={18} />
                            </button>
                            <button
                                className="button-premium flex items-center gap-3 group px-12"
                                onClick={sendSurge}
                            >
                                FINAL SURGE <Zap size={18} className="group-hover:fill-current group-hover:animate-bounce" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {favorites.length > 0 && (
                <div className="glass p-10 rounded-[2.5rem] space-y-6">
                    <h3 className="flex items-center gap-2 font-black text-white/40 uppercase text-xs tracking-widest italic border-b border-white/5 pb-4">
                        <History size={16} className="text-purple-500" /> Loop Favorite Commands
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {favorites.map(fav => (
                            <button
                                key={fav.id}
                                onClick={() => replayFavorite(fav)}
                                disabled={isReplaying}
                                className="text-left p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-pink-500/50 hover:bg-pink-500/[0.03] transition-all group relative overflow-hidden"
                            >
                                <p className="text-sm font-bold text-white leading-relaxed line-clamp-2 italic">"{fav.text}"</p>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play size={16} className="text-pink-500 fill-current" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Privacy & Reassurance Section */}
            <section className="glass p-10 rounded-[2.5rem] border-purple-500/10 space-y-6">
                <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <div className="p-3 bg-purple-500/10 rounded-2xl">
                        <Shield className="text-purple-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase italic tracking-wider">Secure Controller Link</h3>
                        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Encrypted Interaction Tunnel</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center gap-2 text-pink-400">
                            <Check size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Privacy Absolute</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed font-medium">
                            Your text and voice input are processed in real-time and never archived. No logs, no tracks, pure sync.
                        </p>
                    </div>

                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center gap-2 text-pink-400">
                            <Check size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Authorized Access Only</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed font-medium">
                            Only the host can grant you access to their tunnel. Every session is unique and non-transferable.
                        </p>
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-purple-500/5 border border-purple-500/10 flex items-start gap-4">
                    <Info className="text-purple-400 shrink-0" size={18} />
                    <p className="text-[11px] text-white/50 leading-relaxed uppercase tracking-tight font-medium">
                        TNTSYNC uses direct socket streaming to reduce latency below 100ms. This connection is inline with Lovense TOS for remote cloud control.
                    </p>
                </div>
            </section>
        </div>
    );
}
