import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, Shield, Power, Smartphone, Copy, Check, Info, StepForward, ArrowRight, Sparkles, Keyboard } from 'lucide-react';
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
    const [incomingPulses, setIncomingPulses] = useState([]);
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
            const id = Date.now();
            setIncomingPulses(prev => [...prev.slice(-5), { id, level: level || 5 }]);
            setIntensity(Math.min((level || 5) * 5, 100));
            setLastAction(source || 'active');

            setTimeout(() => setIntensity(prev => Math.max(0, prev - 20)), 150);
            setTimeout(() => setIncomingPulses(prev => prev.filter(p => p.id !== id)), 1000);
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

    const testVibration = () => {
        const uid = localStorage.getItem('lovense_uid') || customName;
        setApiFeedback({ success: true, message: `LOCATING TOY FOR ${uid}...` });
        socket.emit('test-toy', { uid: uid });
    };

    const pingServer = () => {
        setApiFeedback({ success: true, message: 'WAITING FOR SERVER RESPONSE...' });
        socket.emit('ping-server');
    };

    const runDiagnostics = () => {
        const uid = localStorage.getItem('lovense_uid') || customName;
        setApiFeedback({ success: true, message: 'RUNNING DIAGNOSTICS...' });
        socket.emit('run-diagnostics', { uid: uid });
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

    const approveTypist = (id, approved) => {
        socket.emit('approve-typist', { slug: id, approved });
        setTypists(prev => prev.filter(t => t.slug !== id));
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
                <div className="bg-red-600 text-white text-[10px] font-black py-2 px-6 rounded-full inline-block mb-4 animate-bounce uppercase tracking-[0.2em]">DEBUG V2 ACTIVATED</div>
                <h1 className="text-6xl font-black tracking-tight text-white uppercase italic leading-none">
                    Veroe <span className="text-purple-500 font-black">Sync V2</span>
                </h1>

                <div className="flex flex-col items-center gap-6 py-8 glass border-red-500/50 bg-red-500/10 rounded-[3rem]">
                    <h2 className="text-white font-black text-xs uppercase tracking-widest">Connection Debug Tools</h2>
                    <div className="flex flex-wrap justify-center gap-4 px-6">
                        <button
                            onClick={pingServer}
                            className="bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest px-8 py-4 rounded-2xl shadow-2xl shadow-red-600/20 active:scale-95 transition-all"
                        >
                            1. CLICK TO PING SERVER
                        </button>

                        <button
                            onClick={testVibration}
                            className="bg-white hover:bg-white/90 text-black text-xs font-black uppercase tracking-widest px-8 py-4 rounded-2xl shadow-2xl active:scale-95 transition-all"
                        >
                            2. CLICK TO SHOTGUN VIBRATE
                        </button>

                        <button
                            onClick={runDiagnostics}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-widest px-8 py-4 rounded-2xl shadow-2xl active:scale-95 transition-all"
                        >
                            3. RUN TOY DIAGNOSTICS
                        </button>

                        <button
                            onClick={resetSession}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest px-8 py-3 rounded-xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all mt-6"
                        >
                            Reset Session & Start Fresh
                        </button>
                    </div>

                    {apiFeedback && (
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`text-sm font-black uppercase tracking-[0.2em] px-8 py-6 rounded-3xl shadow-2xl border-2 ${apiFeedback.success ? 'bg-green-600 text-white border-green-400' : 'bg-red-600 text-white border-red-400'}`}
                        >
                            {apiFeedback.success ? `✓ SUCCESS: ${apiFeedback.message}` : `✗ ERROR: ${apiFeedback.message}`}
                        </motion.div>
                    )}
                </div>
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in">
                    <div className="text-center space-y-2">
                        <h2 className="text-xl font-bold italic border-b border-white/5 pb-4">DEVICE OWNER SETUP</h2>
                        <p className="text-xs text-white/40 uppercase tracking-widest leading-relaxed">
                            Step 1: Enter your name to identify your toy on the network.
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
                        <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase">Step 2: Connect Toy</h2>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest py-2">
                            Scan with Lovense Remote OR Copy Code to Lovense Connect
                        </p>
                        <p className="text-[8px] text-purple-400/60 uppercase tracking-tighter bg-purple-500/5 py-1 px-3 rounded-full inline-block">
                            Osci 3 Compatible • Ensure toy is Bluetooth paired to app
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
                                onClick={testVibration}
                                className="w-full py-4 border-2 border-white/10 hover:border-white/30 text-white/60 rounded-2xl text-[10px] font-black tracking-[0.2em] uppercase transition-all"
                            >
                                Test Vibration (Check for 404 Fix)
                            </button>
                            <button
                                onClick={bypassHandshake}
                                className="text-[9px] font-black text-white/10 uppercase tracking-[0.3em] hover:text-white/30 pt-4"
                            >
                                Skip To Link (Manual/Test Only)
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
                            {/* Animated background energy for the status card */}
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
                                <h3 className="font-black text-2xl text-white tracking-tight">LINK SECURED</h3>
                                <p className="text-green-500 text-[10px] font-black tracking-[0.2em] uppercase">
                                    {Object.keys(toys).length} Device(s) listening
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={testVibration}
                                        className="mt-2 text-[9px] bg-white/10 hover:bg-white/20 text-white/60 px-2 py-1 rounded-md transition-all uppercase font-bold tracking-tighter"
                                    >
                                        Test Vibration (Max)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Energy Meter */}
                        <div className="mb-10 space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Live Pulse Intensity</span>
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${intensity > 0 ? 'text-purple-400' : 'text-white/10'}`}>
                                    {intensity > 0 ? (lastAction === 'voice' ? 'Whisper Syncing' : 'Typing Syncing') : 'Idle'}
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
                                            className="w-full py-5 bg-purple-500 text-white rounded-2xl font-black text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-purple-500/20"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                                alert('Secret Controller Link Copied!');
                                            }}
                                        >
                                            COPY SECRET LINK
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

                    {/* Visual Pulse Overlays */}
                    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
                        <AnimatePresence>
                            {incomingPulses.map(pulse => (
                                <motion.div
                                    key={pulse.id}
                                    initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                                    animate={{
                                        opacity: [0, 0.4, 0],
                                        scale: [0.5, 1.5],
                                        rotate: [0, 10]
                                    }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 border-[40px] border-purple-500/20 rounded-[4rem]"
                                />
                            ))}
                        </AnimatePresence>

                        {/* Global Flash */}
                        <motion.div
                            className="absolute inset-0 bg-purple-500/10"
                            animate={{ opacity: intensity > 20 ? 0.2 : 0 }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
