import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Shield, Smartphone, Copy, Check, Info, ArrowRight, Sparkles, Keyboard, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getApiBase = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin;
};

const API_BASE = getApiBase();

export default function HostView() {
    const [status, setStatus] = useState('setup'); // setup, qr, connected
    const [qrCode, setQrCode] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [customName, setCustomName] = useState('');
    const [typists, setTypists] = useState([]);
    const [toys, setToys] = useState({});
    const [slug, setSlug] = useState('');
    const [error, setError] = useState(null);
    const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
    const [copied, setCopied] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [intensity, setIntensity] = useState(0); // 0-100 for visual meter
    const [lastAction, setLastAction] = useState(null); // 'typing' or 'voice'
    const [typingDraft, setTypingDraft] = useState('');
    const [apiFeedback, setApiFeedback] = useState(null);


    const customNameRef = useRef(customName);
    useEffect(() => {
        customNameRef.current = customName;
    }, [customName]);

    useEffect(() => {
        socket.on('connect', () => {
            console.log('[SOCKET] Connected');
            setIsSocketConnected(true);
        });
        socket.on('disconnect', () => {
            console.log('[SOCKET] Disconnected');
            setIsSocketConnected(false);
        });
        if (socket.connected) setIsSocketConnected(true);

        socket.on('lovense:linked', (data = {}) => {
            console.log('[SOCKET] Lovense linked received:', data);
            const { toys } = data;
            if (!toys) return;
            setToys(toys);
            setStatus('connected');
            createLink(customNameRef.current.trim().toLowerCase());
        });

        socket.on('approval-request', (data = {}) => {
            console.log('[SOCKET] Approval request:', data);
            const { slug: typistSlug } = data;
            if (!typistSlug) return;
            setTypists(prev => {
                if (prev.find(t => t.slug === typistSlug)) return prev;
                return [...prev, { slug: typistSlug }];
            });
        });

        socket.on('incoming-pulse', (data = {}) => {
            const { source, level } = data;
            setIntensity(Math.min((level || 5) * 5, 100));
            setLastAction(source || 'active');

            setTimeout(() => setIntensity(prev => Math.max(0, prev - 20)), 150);
        });

        socket.on('new-message', (data = {}) => {
            const { text } = data;
            if (!text) return;
            setMessages(prev => [{ id: Date.now(), text, timestamp: new Date() }, ...prev]);
            setTypingDraft(''); // Clear draft when sent
            setIntensity(100);
            setTimeout(() => setIntensity(0), 1000);
        });

        socket.on('typing-draft', (data = {}) => {
            setTypingDraft(data.text || '');
        });

        socket.on('api-feedback', (data = {}) => {
            console.log('[SOCKET] API Feedback:', data);
            setApiFeedback(data);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('lovense:linked');
            socket.off('approval-request');
            socket.off('incoming-pulse');
            socket.off('new-message');
            socket.off('typing-draft');
            socket.off('api-feedback');
        };
    }, []); // Empty dependency array to prevent effect re-runs on name change

    const startSession = async () => {
        const baseId = customName.trim().toLowerCase();
        if (!baseId) {
            setError('Please enter your Lovense username');
            return;
        }

        // Generate a slightly more unique ID to prevent collisions on the Lovense network
        const uniqueId = `${baseId}_${Math.random().toString(36).substring(2, 6)}`;

        setIsLoading(true);
        setError(null);
        try {
            socket.emit('join-host', uniqueId);
            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${uniqueId}`);
            if (res.data && res.data.qr) {
                setQrCode(res.data.qr);
                setPairingCode(res.data.code);
                setStatus('qr');
                // Store the unique ID for later
                setCustomName(uniqueId);
                localStorage.setItem('lovense_uid', uniqueId);
            } else {
                setError('Unexpected response from server');
            }
        } catch (err) {
            console.error('Start session error:', err);
            const errorData = err.response?.data;
            if (errorData && errorData.error) {
                setError({
                    message: errorData.error,
                    details: errorData.details
                });
            } else {
                setError(err.message || 'System error. Check your connection.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const resetSession = () => {
        localStorage.removeItem('lovense_uid');
        window.location.reload();
    };

    const copyPairingCode = () => {
        navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const bypassHandshake = async () => {
        const id = customName.trim().toLowerCase() || 'dev';
        setIsLoading(true);
        setError(null);
        try {
            socket.emit('join-host', id);
            // We set mock toys for simulation
            setToys({ 'SIM': { name: 'SIMULATED DEVICE', type: 'Vibrate' } });
            await createLink(id);
            setStatus('connected');
        } catch (err) {
            setError('Failed to enter test mode');
        } finally {
            setIsLoading(false);
        }
    };

    const createLink = async (uid) => {
        try {
            const res = await axios.post(`${API_BASE}/api/connections/create`, { uid });
            setSlug(res.data.slug);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="max-w-xl mx-auto space-y-8 pb-20">
            {/* Status Indicator */}
            <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                    {isSocketConnected ? 'SERVER LIVE' : 'OFFLINE'}
                </span>
            </div>

            <header className="text-center space-y-4 pt-10">
                <div className="flex items-center justify-center gap-3 glass-pill px-6 py-2 w-max mx-auto border-pink-500/20 kinky-glow">
                    <Heart className="text-pink-500 animate-pulse" size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-400">Secure LDR Connection</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white uppercase italic leading-none group">
                    <span className="text-gradient">TNT</span> <span className="text-white hover:text-pink-500 transition-colors duration-500">SYNC</span>
                </h1>

                <p className="text-sm text-balance text-white/40 font-medium tracking-wide max-w-sm mx-auto uppercase py-2">
                    Premium Real-Time Toy Control for Intimacy without Boundaries.
                </p>

                {apiFeedback && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className={`text-[10px] font-black uppercase tracking-[0.2em] px-6 py-3 rounded-full mx-auto w-max border-2 ${apiFeedback.success ? 'bg-green-600/20 text-green-400 border-green-500/20' : 'bg-red-600/20 text-red-400 border-red-500/20'}`}
                    >
                        {apiFeedback.success ? `✓ ${apiFeedback.message}` : `✗ ERROR: ${apiFeedback.message}`}
                    </motion.div>
                )}
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in">
                    <div className="text-center space-y-2">
                        <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase">I HAVE A TOY (HOST SETUP)</h2>
                        <p className="text-xs text-white/40 uppercase tracking-widest leading-relaxed">
                            Step 1: Enter your name, then you will scan a QR code with the **Lovense Connect** app.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="YOUR NAME (E.G. ESCO)..."
                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-2xl font-black focus:border-purple-500 outline-none uppercase transition-all placeholder:text-white/5"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            disabled={isLoading}
                        />

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs font-bold uppercase tracking-wider text-center space-y-2"
                            >
                                <p>{typeof error === 'string' ? error : error.message || 'Error occurred'}</p>
                                {error.details && (
                                    <p className="text-[10px] opacity-50 lowercase font-mono">
                                        {typeof error.details === 'object' ? JSON.stringify(error.details) : error.details}
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </div>

                    <button
                        onClick={startSession}
                        disabled={isLoading}
                        className={`w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black shadow-2xl shadow-purple-500/20 transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                CONNECTING...
                            </div>
                        ) : (
                            <>START PAIRING <ArrowRight size={24} /></>
                        )}
                    </button>
                </div>
            )}

            {status === 'qr' && (
                <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8 animate-in zoom-in-95">
                    <div className="text-center space-y-2 w-full">
                        <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase">Step 2: Link Your Toy</h2>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest py-2">
                            Open the **LOVENSE CONNECT** app on your phone and SCAN this code
                        </p>
                        <p className="text-[8px] text-purple-400/60 uppercase tracking-tighter bg-purple-500/5 py-1 px-3 rounded-full inline-block">
                            Osci 3 Compatible • Ensure toy is Bluetooth connected in the app
                        </p>
                    </div>

                    <div className="p-4 bg-white rounded-3xl shadow-2xl shadow-purple-500/10">
                        <img src={qrCode} alt="Lovense QR" className="w-[280px] h-[280px] object-contain" />
                    </div>

                    <div className="text-center space-y-6 w-full">
                        <div
                            onClick={copyPairingCode}
                            className="relative cursor-pointer group w-full p-6 bg-purple-500/5 border-2 border-purple-500/20 rounded-3xl hover:bg-purple-500/10 transition-all text-center"
                        >
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-black mb-1">Pairing Code</p>
                            <p className="text-5xl font-mono font-black text-white tracking-widest flex items-center justify-center gap-4">
                                {pairingCode}
                                {copied ? <Check className="text-green-500" size={32} /> : <Copy className="text-white/10 group-hover:text-white/30" size={32} />}
                            </p>
                            {copied && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-green-500 text-[10px] font-black uppercase tracking-widest">Code Copied!</span>}
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <a
                                href={`lovense://app/game?v=2&code=${pairingCode}`}
                                target="_self"
                                className="w-full py-5 bg-purple-600 text-white rounded-2xl text-xs font-black tracking-[0.3em] uppercase flex items-center justify-center gap-3 hover:bg-purple-500 transition-all"
                            >
                                <Smartphone size={20} /> Open Lovense App
                            </a>
                            <button
                                onClick={bypassHandshake}
                                className="w-full py-4 bg-red-600/20 hover:bg-red-600/40 text-red-500 rounded-2xl text-[10px] font-black tracking-[0.2em] uppercase transition-all border border-red-500/30"
                            >
                                ⚠️ FORCE SKIP TO LINK (IF APP HANGS)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6 animate-in fade-in zoom-in-95">
                    <div className="glass p-10 rounded-[2.5rem] border-green-500/20 bg-green-500/[0.02]">
                        <div className="text-center space-y-2 w-full mb-10">
                            <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase text-green-500">Step 3: Invite Typist</h2>
                            <p className="text-[10px] text-white/40 uppercase tracking-widest py-2">
                                Give this link to the person who will control you.
                            </p>
                        </div>

                        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-left mb-8">
                            <p className="text-[9px] text-purple-300 font-bold uppercase tracking-widest leading-relaxed">
                                <Sparkles size={10} className="inline mr-1" /> Pro Tip: For Osci 3, ensure the toy is in "Game Mode" or "Remote Mode" inside the Lovense App for cloud sync to work.
                            </p>
                        </div>

                        <div className="flex items-center gap-5 mb-10 p-6 bg-white/5 rounded-3xl border border-white/5 relative overflow-hidden">
                            <motion.div
                                className="absolute inset-0 bg-green-500/5"
                                animate={{
                                    opacity: [0.05, 0.15, 0.05],
                                    scale: [1, 1.05, 1]
                                }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />

                            <div className="w-16 h-16 bg-green-500/10 rounded-[1.5rem] flex items-center justify-center border border-green-500/10 z-10">
                                <Shield className="text-green-500" size={32} />
                            </div>
                            <div className="z-10 text-left">
                                <h3 className="font-black text-2xl text-white tracking-tight text-gradient">SESSION ACTIVE</h3>
                                <p className="text-green-500 text-[10px] font-black tracking-[0.2em] uppercase">
                                    {Object.keys(toys).length} Device(s) Linked
                                </p>
                            </div>
                        </div>

                        {/* Energy Meter */}
                        <div className="mb-10 space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Pulse Intensity</span>
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${intensity > 0 ? 'text-pink-400' : 'text-white/10'}`}>
                                    {intensity > 0 ? (lastAction === 'voice' ? 'Voice Reactive' : 'Keystore Pulse') : 'Listening...'}
                                </span>
                            </div>
                            <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full"
                                    animate={{
                                        width: `${intensity}%`,
                                        opacity: intensity > 0 ? 1 : 0.3
                                    }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            </div>
                        </div>

                        {slug && (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <div className="p-8 rounded-[2rem] bg-white/5 border-2 border-white/5 flex flex-col items-center gap-6 group hover:border-purple-500/30 transition-all">
                                        <code className="text-lg font-mono text-purple-400 font-bold select-all break-all text-center leading-relaxed">
                                            {window.location.host}/t/{slug}
                                        </code>
                                        <button
                                            className="w-full button-premium"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }}
                                        >
                                            {copied ? 'COPIED!' : 'COPY SECRET LINK'}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-5 rounded-2xl bg-purple-500/5 text-center">
                                    <p className="text-[9px] text-white/40 uppercase font-bold tracking-[0.2em] leading-relaxed">
                                        Send this link to your partner. If you close this page, the connection will die. Keep it open in the background!
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Live Typist Feed */}
                    <AnimatePresence>
                        {typingDraft && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="glass p-8 rounded-[2.5rem] border-purple-500/30 bg-purple-500/[0.03] space-y-4"
                            >
                                <div className="flex items-center justify-between border-b border-purple-500/10 pb-4">
                                    <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Keyboard size={14} className="animate-pulse" /> Live Typist Feed
                                    </h3>
                                    <div className="flex gap-1">
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" />
                                    </div>
                                </div>
                                <p className="text-2xl font-medium text-white/90 leading-relaxed italic">
                                    {typingDraft}
                                    <span className="w-2 h-6 bg-purple-500 inline-block ml-1 animate-pulse" />
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Live Message Stream */}
                    <AnimatePresence>
                        {messages.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass p-8 rounded-[2.5rem] space-y-6"
                            >
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Sparkles size={16} className="text-purple-500" /> Recent Whispers
                                    </h3>
                                    <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold">HISTORY</span>
                                </div>

                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {messages.map((msg) => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-purple-500/20 transition-all text-left"
                                        >
                                            <p className="text-lg text-white font-medium leading-relaxed">{msg.text}</p>
                                            <p className="text-[10px] text-white/20 mt-2 uppercase font-bold tracking-wider">
                                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Privacy & Reassurance Section */}
            <section className="glass p-10 rounded-[2.5rem] border-purple-500/10 space-y-6">
                <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <div className="p-3 bg-purple-500/10 rounded-2xl">
                        <Shield className="text-purple-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase italic tracking-wider">Privacy First Protocol</h3>
                        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Your Safety is Non-Negotiable</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center gap-2 text-pink-400">
                            <Check size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">End-to-End Encryption</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed">
                            Each connection is strictly secured via TLS/SSL. Handshake codes are unique per session and destroyed upon disconnect.
                        </p>
                    </div>

                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center gap-2 text-pink-400">
                            <Check size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">TOS Compliance</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed">
                            TNT Sync operates in full compliance with Lovense Developer Terms. We never store personal biometric data or voice recordings.
                        </p>
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-purple-500/5 border border-purple-500/10 flex items-start gap-4">
                    <Info className="text-purple-400 shrink-0" size={18} />
                    <p className="text-[11px] text-white/50 leading-relaxed uppercase tracking-tight">
                        Our servers act as a stateless bridge. History is stored locally on your device or safely in a temporary session database to ensure you remain in control of your data at all times.
                    </p>
                </div>

                {status !== 'setup' && (
                    <button
                        onClick={resetSession}
                        className="w-full py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-red-400 transition-colors"
                    >
                        Destroy Session & Start Fresh
                    </button>
                )}
            </section>
        </div>
    );
}
