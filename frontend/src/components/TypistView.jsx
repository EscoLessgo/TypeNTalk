import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { useParams } from 'react-router-dom';
import { Mic, MicOff, Keyboard, Zap, Heart, History, Play, Shield, Info, Check, HelpCircle, X, Lock, Eye, ThumbsUp, ThumbsDown, Activity } from 'lucide-react';
import TypistAvatar from './ui/TypistAvatar';
import PulseParticles from './ui/PulseParticles';
import { motion, AnimatePresence } from 'framer-motion';

const getApiBase = () => {
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
    const [isClimaxRequested, setIsClimaxRequested] = useState(false);
    const [notifications, setNotifications] = useState([]); // Array of {id, type, message, time}
    const [messages, setMessages] = useState([]);
    const [isOverdrive, setIsOverdrive] = useState(false);
    const [typistName, setTypistName] = useState(localStorage.getItem('typist_name') || '');
    const [latency, setLatency] = useState(0);

    // Refs for audio processing
    const audioContextRef = useRef(null);
    const analyzerRef = useRef(null);
    const streamRef = useRef(null);
    const lastPulseRef = useRef(0);
    const isMicOnRef = useRef(false);

    useEffect(() => {
        const onConnect = () => {
            console.log('[SOCKET] Connected');
            setIsSocketConnected(true);
            if (slug) {
                console.log(`[SOCKET] Re-joining typist room: ${slug}`);
                socket.emit('join-typist', slug);
            }
        };
        const onDisconnect = () => setIsSocketConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        if (socket.connected) onConnect();

        checkSlug();

        socket.on('approval-status', (data = {}) => {
            const { approved } = data;
            console.log(`[SOCKET] Approval status received: ${approved}, current status: ${status}`);
            if (approved === true) {
                setStatus('connected');
            } else if (approved === false) {
                // Only reset to entry if NOT already connected
                // This prevents race conditions from resetting an approved session
                setStatus(prev => {
                    if (prev === 'connected') {
                        console.log('[SOCKET] Ignoring false approval - already connected');
                        return prev; // Don't reset if already connected
                    }
                    return 'entry';
                });
            }
        });

        socket.on('host-feedback', (data = {}) => {
            console.log('[SOCKET] Host feedback:', data);
            const id = Date.now();
            const type = data.type; // 'good', 'bad'
            const msg = type === 'good' ? "SHE LOVES IT! KEEP GOING" : "TOO INTENSE / PAUSE REQUESTED";
            setNotifications(prev => [{ id, type, msg, icon: type === 'good' ? 'thumbsup' : 'thumbsdown' }, ...prev].slice(0, 3));
            setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 6000);
        });

        socket.on('preset-update', (data = {}) => {
            setActivePreset(data.preset);
        });

        socket.on('climax-requested', () => {
            console.log('[SOCKET] Host is reaching climax!');
            setIsClimaxRequested(true);
            const id = Date.now();
            setNotifications(prev => [{ id, type: 'climax', msg: "🔥 SHE'S REACHING CLIMAX! FINISH HER! 🔥", icon: 'zap' }, ...prev].slice(0, 3));
            setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 10000);
        });

        socket.on('host-message', (data = {}) => {
            console.log('[SOCKET] Host message:', data);
            const { text, from } = data;
            if (!text) return;

            setMessages(prev => [{ id: Date.now(), text, timestamp: new Date(), from: from || 'Host' }, ...prev]);

            // Also trigger a notification
            const nid = Date.now();
            setNotifications(prev => [{ id: nid, type: 'surge', msg: `MESSAGE FROM HOST: ${text}`, icon: 'zap' }, ...prev].slice(0, 3));
            setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== nid)), 5000);
        });

        socket.on('overdrive-status', (data = {}) => {
            setIsOverdrive(data.active);
            if (data.active) setIsClimaxRequested(false);
        });

        socket.on('session-terminated', (data = {}) => {
            console.log('[SOCKET] Session terminated by host');
            setError(data.message || 'Session ended by host.');
            setStatus('invalid');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('approval-status');
            socket.off('host-feedback');
            socket.off('preset-update');
            socket.off('climax-requested');
            socket.off('overdrive-status');
            socket.off('session-terminated');
            socket.off('host-message');
            stopMic();
        };
    }, [slug]);

    useEffect(() => {
        if (!isSocketConnected) return;
        const interval = setInterval(() => {
            const start = Date.now();
            socket.emit('latency-ping', start, (startTime) => {
                const diff = Date.now() - startTime;
                setLatency(diff);
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [isSocketConnected]);

    // Ensure typist is always in the socket room when connected
    useEffect(() => {
        if (isSocketConnected && slug && status === 'connected') {
            console.log(`[SOCKET] Ensuring typist room membership for: ${slug}`);
            socket.emit('join-typist', slug);
        }
    }, [isSocketConnected, slug, status]);

    const trackAnalytics = async () => {
        try {
            const path = window.location.pathname;
            const tracked = sessionStorage.getItem(`tracked_${slug || 'home'}`);
            if (tracked) return;

            // Simple OS/Browser detection
            const ua = navigator.userAgent;
            let browser = "Unknown";
            let os = "Unknown";
            let device = "Desktop";

            if (ua.includes("Firefox")) browser = "Firefox";
            else if (ua.includes("Chrome")) browser = "Chrome";
            else if (ua.includes("Safari")) browser = "Safari";
            else if (ua.includes("Edge")) browser = "Edge";

            if (ua.includes("Windows")) os = "Windows";
            else if (ua.includes("Mac")) os = "MacOS";
            else if (ua.includes("Linux")) os = "Linux";
            else if (ua.includes("Android")) { os = "Android"; device = "Mobile"; }
            else if (ua.includes("iPhone")) { os = "iOS"; device = "Mobile"; }

            const baseLog = {
                path,
                browser,
                os,
                device,
                userAgent: ua
            };

            // Attempt location from ipapi.co (optional, may be blocked by adblockers)
            let geoData = {};
            try {
                const geoRes = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
                if (geoRes.data && !geoRes.data.error) {
                    const data = geoRes.data;
                    geoData = {
                        query: data.ip,
                        city: data.city,
                        region: data.region,
                        regionName: data.region,
                        country: data.country_name,
                        countryCode: data.country_code,
                        isp: data.org,
                        org: data.org,
                        as: data.asn,
                        zip: data.postal,
                        lat: data.latitude,
                        lon: data.longitude,
                        timezone: data.timezone
                    };
                }
            } catch (geoErr) {
                console.warn('[ANALYTICS] Geo-lookup failed (likely adblocker):', geoErr.message);
            }

            await axios.post(`${API_BASE}/api/analytics/track`, {
                slug: slug || 'home',
                locationData: { ...baseLog, ...geoData }
            });
            sessionStorage.setItem(`tracked_${slug || 'home'}`, 'true');
        } catch (err) {
            console.warn('[ANALYTICS] Failed to track visit:', err.message);
        }
    };

    const checkSlug = async () => {
        const cleanSlug = (slug || '').trim();
        if (!cleanSlug) {
            console.error('[TYPIST] No slug provided');
            setStatus('invalid');
            return;
        }

        // Track analytics immediately upon landing
        trackAnalytics();

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
                console.log('[TYPIST] Status: entry');
                setStatus('entry');
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
            console.log(`[TYPIST] Emitting typing-pulse: slug=${slug}, intensity=9`);
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

        // Local message history
        setMessages(prev => [{ id: Date.now(), text, timestamp: new Date() }, ...prev]);

        // Local notification
        const id = Date.now();
        setNotifications(prev => [{ id, type: 'surge', msg: "🌊 FINAL SURGE TRIGGERED!", icon: 'zap' }, ...prev].slice(0, 3));
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);

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
                // SECURITY: Verify status is connected before sending any pulses
                if (status === 'connected') {
                    socket.emit('voice-pulse', { slug, intensity: normalized });
                }
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
            <div className="pt-4">
                <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">Identifying as: {typistName}</span>
            </div>
        </div>
    );

    if (status === 'entry') return (
        <div className="max-w-md mx-auto">
            <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in zoom-in-95">
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase">CONTROLLER ENTRY</h2>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">
                        Identify yourself before connecting to {hostName}'s session.
                    </p>
                </div>

                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="YOUR DISCRIMINATOR / NAME..."
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-xl font-black focus:border-pink-500 outline-none uppercase transition-all placeholder:text-white/5"
                        value={typistName}
                        onChange={(e) => setTypistName(e.target.value)}
                    />
                </div>

                <button
                    onClick={() => {
                        const trimmedName = typistName.trim();
                        if (!trimmedName) return;
                        console.log(`[TYPIST] Requesting approval as: ${trimmedName} for slug: ${slug}`);
                        localStorage.setItem('typist_name', trimmedName);
                        setStatus('waiting-approval');
                        socket.emit('request-approval', { slug, name: trimmedName });
                    }}
                    disabled={!typistName.trim()}
                    className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black shadow-2xl shadow-pink-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    REQUEST CONTROL <Zap size={24} />
                </button>
            </div>
        </div>
    );

    if (status !== 'connected') {
        return <div className="text-center p-20 animate-pulse text-white/20 font-black uppercase tracking-widest">Awaiting Control Approval...</div>;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 relative px-4 sm:px-0">
            {/* Notification System Overlay */}
            <div className="hidden">
                {/* Consolidating notifications to the header system only to avoid duplicates */}
            </div>

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

            <AnimatePresence>
                {isClimaxRequested && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed inset-x-4 bottom-28 z-50 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[500px]"
                    >
                        <div className="glass-premium p-8 rounded-[2.5rem] border-red-500/50 bg-red-500/10 shadow-[0_0_50px_rgba(239,68,68,0.3)] text-center space-y-6 kinky-glow-red animate-pulse">
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-4 bg-red-500/20 rounded-full text-red-500">
                                    <Zap size={40} className="animate-bounce" />
                                </div>
                                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                                    {hostName.toUpperCase()} IS REACHING CLIMAX!
                                </h2>
                                <p className="text-red-400 font-bold uppercase tracking-widest text-sm animate-pulse">
                                    🔥🔥 FINISH THEM NOW 🔥🔥
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <button
                                    onClick={() => {
                                        const pattern = [{ intensity: 20, duration: 10 }];
                                        socket.emit('trigger-climax', { slug, pattern });
                                        setIsClimaxRequested(false);
                                        setIntensity(100);
                                        setTimeout(() => setIntensity(0), 10000);
                                    }}
                                    className="w-full py-6 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-2xl text-xl font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 group overflow-hidden relative"
                                >
                                    🔥 CONSTANT SURGE (10s)
                                </button>

                                <button
                                    onClick={() => {
                                        const pattern = [];
                                        for (let i = 0; i < 10; i++) {
                                            pattern.push({ intensity: 20, duration: 0.5 });
                                            pattern.push({ intensity: 0, duration: 0.5 });
                                        }
                                        socket.emit('trigger-climax', { slug, pattern });
                                        setIsClimaxRequested(false);
                                        setIntensity(100);
                                        setTimeout(() => setIntensity(0), 10000);
                                    }}
                                    className="w-full py-4 bg-white/5 border border-red-500/30 hover:bg-red-500/10 text-red-500 rounded-2xl text-sm font-black uppercase tracking-widest transition-all"
                                >
                                    ⚡ RAPID STACCATO
                                </button>

                                <button
                                    onClick={() => {
                                        // Ramping pattern: increases frequency and intensity
                                        const pattern = [];
                                        for (let i = 1; i <= 10; i++) {
                                            pattern.push({ intensity: Math.floor(i * 2), duration: 1 - (i * 0.05) });
                                        }
                                        pattern.push({ intensity: 20, duration: 5 });
                                        socket.emit('trigger-climax', { slug, pattern });
                                        setIsClimaxRequested(false);
                                        setIntensity(100);
                                        setTimeout(() => setIntensity(0), 10000);
                                    }}
                                    className="w-full py-4 bg-white/5 border border-purple-500/30 hover:bg-purple-500/10 text-purple-400 rounded-2xl text-sm font-black uppercase tracking-widest transition-all"
                                >
                                    🌊 RAMPING OVERDRIVE
                                </button>
                            </div>

                            <button
                                onClick={() => setIsClimaxRequested(false)}
                                className="text-white/20 hover:text-white/40 text-[10px] uppercase font-black tracking-widest transition-colors pt-4"
                            >
                                Not yet... keep teasing
                            </button>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row items-center justify-between glass px-6 sm:px-8 py-4 rounded-3xl relative border-purple-500/20 shadow-lg shadow-purple-500/5 gap-4 sm:gap-0">
                {/* Status Indicator */}
                <div className="absolute -top-12 right-0 flex items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${latency > 150 ? 'text-red-400' : latency > 80 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {latency}ms
                        </span>
                        <Activity size={10} className={latency > 150 ? 'text-red-400' : 'text-green-400'} />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                        <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                            {isSocketConnected ? 'TUNNEL ACTIVE' : 'TUNNEL DOWN'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-pink-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                    <span className="font-black text-xs uppercase tracking-widest text-white/80 italic">Controlling <span className="text-pink-500">{hostName}</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <AnimatePresence>
                        {notifications.length > 0 && (
                            <div className="fixed top-24 right-8 z-[60] flex flex-col gap-3 w-72 pointer-events-none">
                                {(notifications || []).map((n, idx) => (
                                    <motion.div
                                        key={n?.id || `notif-${idx}`}
                                        initial={{ x: 100, opacity: 0, scale: 0.8 }}
                                        animate={{ x: 0, opacity: 1, scale: 1 }}
                                        exit={{ x: 100, opacity: 0, scale: 0.8 }}
                                        className={`p-4 rounded-2xl glass border-2 flex items-start gap-3 shadow-2xl ${n?.type === 'climax' ? 'border-red-500 bg-red-500/10' :
                                            n?.type === 'good' ? 'border-green-500 bg-green-500/10' :
                                                n?.type === 'bad' ? 'border-red-500 bg-red-500/10' :
                                                    'border-purple-500 bg-purple-500/10'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-xl ${n?.type === 'climax' ? 'bg-red-500/20 text-red-400' :
                                            n?.type === 'good' ? 'bg-green-500/20 text-green-400' :
                                                n?.type === 'bad' ? 'bg-red-500/20 text-red-400' :
                                                    'bg-purple-500/20 text-purple-400'
                                            }`}>
                                            {n?.icon === 'zap' && <Zap size={18} fill="currentColor" />}
                                            {n?.icon === 'thumbsup' && <ThumbsUp size={18} />}
                                            {n?.icon === 'thumbsdown' && <ThumbsDown size={18} />}
                                            {n?.icon === 'shield' && <Shield size={18} />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] italic mb-1 opacity-50">Signal from Host</p>
                                            <p className="text-xs font-black uppercase tracking-tight text-white leading-tight">{n?.msg || 'Feedback'}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={toggleMic}
                        className={`p-2.5 sm:p-3 rounded-2xl transition-all border ${isMicOn ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 kinky-glow' : 'bg-white/5 text-white/40 border-white/5'}`}
                    >
                        {isMicOn ? <Mic size={20} className="sm:w-6 sm:h-6" /> : <MicOff size={20} className="sm:w-6 sm:h-6" />}
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

            <div className={`glass p-8 rounded-[2.5rem] relative overflow-hidden min-h-[400px] flex flex-col transition-all duration-500 ${isOverdrive ? 'border-red-600 bg-red-600/10 shadow-[0_0_50px_rgba(220,38,38,0.2)]' : (micLevel > 5 || intensity > 30 ? 'border-pink-500/40 bg-pink-500/[0.03]' : 'border-white/10')}`}>
                {/* Dynamic Background Glow */}
                <PulseParticles intensity={isOverdrive ? 100 : (intensity || micLevel * 5)} />

                <motion.div
                    className={`absolute inset-0 bg-gradient-to-br ${isOverdrive ? 'from-red-600/20 to-pink-600/20' : 'from-purple-500/10 to-pink-500/10'}`}
                    animate={{
                        opacity: (isOverdrive || micLevel > 0 || intensity > 0) ? 0.4 : 0.1,
                        scale: (isOverdrive || micLevel > 5 || intensity > 50) ? 1.05 : 1
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
                                {isOverdrive && (
                                    <span className="flex items-center gap-2 text-red-500 animate-pulse font-black">
                                        <Zap size={12} className="fill-current" /> CONSTANT OVERDRIVE 100%
                                    </span>
                                )}
                                {activePreset !== 'none' && !isOverdrive && (
                                    <span className="flex items-center gap-2 text-pink-500 animate-pulse">
                                        <Activity size={12} /> PRESET: {activePreset.toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    const newState = !isOverdrive;
                                    socket.emit('toggle-overdrive', { slug, active: newState });
                                    setIsOverdrive(newState);
                                }}
                                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${isOverdrive ? 'bg-red-600 border-red-400 text-white animate-pulse kinky-glow-red' : 'bg-red-600/5 border-red-500/20 text-red-500 hover:bg-red-600/10'}`}
                            >
                                <Zap size={14} className={isOverdrive ? 'fill-current' : ''} /> {isOverdrive ? 'ENGAGED' : 'OVERDRIVE'}
                            </button>
                            <button
                                onClick={() => setShowGuide(true)}
                                className="p-3 text-white/20 hover:text-white transition-colors hidden sm:block"
                            >
                                <HelpCircle size={18} />
                            </button>
                            <button
                                className="button-premium flex items-center gap-3 group px-6 sm:px-12 text-xs sm:text-base"
                                onClick={sendSurge}
                            >
                                FINAL SURGE <Zap size={18} className="group-hover:fill-current group-hover:animate-bounce" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Message History */}
            <div className="glass p-8 sm:p-10 rounded-[2.5rem] space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h2 className="text-xl font-black italic uppercase text-white tracking-widest">Whisper History</h2>
                    <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">{messages.length} Exchanges</span>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {messages.length === 0 ? (
                        <div className="text-center py-10 text-white/10 uppercase text-[10px] font-black tracking-widest border border-dashed border-white/10 rounded-2xl">
                            The space between you is silent...
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-5 rounded-2xl border transition-all ${msg.from ? 'bg-pink-500/10 border-pink-500/20 ml-8 md:ml-20' : 'bg-white/5 border-white/5 mr-8 md:mr-20'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${msg.from ? 'text-pink-400' : 'text-purple-400'}`}>
                                        {msg.from ? 'SIGNAL FROM PARTNER' : 'YOU SENT'}
                                    </span>
                                    <span className="text-[8px] text-white/20 font-mono">
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className={`text-sm sm:text-lg font-medium ${msg.from ? 'text-white' : 'text-white/70'}`}>
                                    {msg.text}
                                </p>
                            </motion.div>
                        ))
                    )}
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
