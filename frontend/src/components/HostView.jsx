import React, { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, ToyBrick, UserCheck, Shield, Zap, Power, Smartphone, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

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

    useEffect(() => {
        const onConnect = () => setIsSocketConnected(true);
        const onDisconnect = () => setIsSocketConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        if (socket.connected) onConnect();

        socket.on('lovense:linked', ({ toys }) => {
            console.log('Toy linked successfully!', toys);
            setToys(toys);
            setStatus('connected');
            createLink(customName.trim().toLowerCase());
        });

        socket.on('approval-request', ({ slug }) => {
            setTypists(prev => [...prev, { slug }]);
        });

        socket.on('incoming-pulse', () => {
            const id = Date.now();
            setIncomingPulses(prev => [...prev, { id }]);
            setTimeout(() => setIncomingPulses(prev => prev.filter(p => p.id !== id)), 1000);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('lovense:linked');
            socket.off('approval-request');
            socket.off('incoming-pulse');
        };
    }, [customName]);

    const startSession = async () => {
        const id = customName.trim().toLowerCase();
        if (!id) {
            setError('Please enter a session name');
            return;
        }

        try {
            // Join the socket room first
            socket.emit('join-host', id);

            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${id}`);
            if (res.data && res.data.qr) {
                setQrCode(res.data.qr);
                setPairingCode(res.data.code);
                setStatus('qr');
                setError(null);
            } else {
                setError('Lovense failed to provide a pairing code. Check balance/token.');
            }
        } catch (err) {
            console.error(err);
            setError('Connection failed. Backend might be offline.');
        }
    };

    const handleDeepLink = () => {
        if (!pairingCode) return;
        // Try multiple app protocols for Windows/Mobile compatibility
        const link = `lovense://app/game?v=2&code=${pairingCode}`;
        window.location.href = link;
    };

    const bypassHandshake = () => {
        const id = customName.trim().toLowerCase() || 'dev_session';
        socket.emit('join-host', id);
        setToys({ 'DEBUG': { name: 'Simulated Device', type: 'Vibrate' } });
        setStatus('connected');
        createLink(id);
    };

    const createLink = async (uid) => {
        try {
            const res = await axios.post(`${API_BASE}/api/connections/create`, { uid });
            setSlug(res.data.slug);
        } catch (err) {
            console.error('Link creation failed', err);
        }
    };

    const approveTypist = (slug, approved) => {
        socket.emit('approve-typist', { slug, approved });
        setTypists(prev => prev.filter(t => t.slug !== slug));
    };

    return (
        <div className="max-w-xl mx-auto space-y-8">
            {/* Status Indicator */}
            <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    {isSocketConnected ? 'Ready' : 'Offline'}
                </span>
            </div>

            <header className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                    Veroe <span className="text-purple-500">Sync</span>
                </h1>
                <p className="text-white/40 font-medium lowercase tracking-widest">Premium Remote Control</p>
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in slide-in-from-bottom-5">
                    <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-black px-1">Session Name</label>
                        <input
                            type="text"
                            placeholder="TYPE A NAME..."
                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-2xl font-bold focus:border-purple-500 outline-none uppercase transition-all"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startSession}
                        className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black"
                    >
                        INITIALIZE PAIRING <Power size={24} />
                    </button>

                    <button
                        onClick={bypassHandshake}
                        className="w-full text-white/10 text-[10px] font-bold tracking-[0.2em] uppercase hover:text-white/30 transition-all"
                    >
                        Skip to Dashboard (Debug)
                    </button>
                </div>
            )}

            {status === 'qr' && (
                <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8 animate-in zoom-in-95">
                    <div className="p-4 bg-white rounded-3xl shadow-2xl shadow-purple-500/20">
                        <img src={qrCode} alt="Lovense QR" className="w-[280px] h-[280px] object-contain" />
                    </div>

                    <div className="text-center space-y-6 w-full">
                        <div className="inline-block px-10 py-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-black mb-1">Pairing Code</p>
                            <p className="text-4xl font-mono font-black text-white">{pairingCode}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={handleDeepLink}
                                className="w-full py-5 bg-purple-500/10 rounded-2xl text-xs font-black tracking-widest text-purple-400 flex items-center justify-center gap-2 hover:bg-purple-500/20 transition-all border border-purple-500/20"
                            >
                                <Smartphone size={18} /> OPEN LOVENSE APP
                            </button>
                            <p className="text-[10px] text-white/20 uppercase tracking-[0.2em]">Or scan with the Remote App on your phone</p>
                        </div>
                    </div>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="glass p-10 rounded-[2.5rem] border-green-500/20">
                        <div className="flex items-center gap-5 mb-10">
                            <div className="w-16 h-16 bg-green-500/10 rounded-3xl flex items-center justify-center">
                                <Shield className="text-green-500" size={32} />
                            </div>
                            <div>
                                <h3 className="font-black text-2xl text-white">CONNECTION ACTIVE</h3>
                                <p className="text-green-500 text-xs font-black tracking-widest uppercase">
                                    {Object.keys(toys).length} Device(s) Online
                                </p>
                            </div>
                        </div>

                        {slug && (
                            <div className="space-y-4">
                                <label className="text-[10px] uppercase font-black text-purple-400 tracking-widest px-1">Friend's Controller Link</label>
                                <div className="p-8 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all">
                                    <code className="text-lg font-mono text-white/60">{window.location.host}/t/{slug}</code>
                                    <button
                                        className="p-5 bg-purple-500 text-white rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                            alert('Link Copied! Send this to your friend.');
                                        }}
                                    >
                                        <Share2 size={24} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {typists.length > 0 && (
                        <div className="glass p-8 rounded-[2.5rem] border-purple-500/20">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h4 className="font-black text-white uppercase italic">Controller Access Request</h4>
                                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Someone opened your link</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => approveTypist(typists[0].slug, true)}
                                        className="bg-green-500 px-6 py-3 rounded-xl font-black text-[10px] text-black shadow-lg shadow-green-500/20"
                                    >
                                        APPROVE
                                    </button>
                                    <button
                                        onClick={() => approveTypist(typists[0].slug, false)}
                                        className="bg-white/5 px-6 py-3 rounded-xl font-black text-[10px] text-white/40"
                                    >
                                        DENY
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="glass p-8 rounded-3xl border-red-500/20 text-center">
                    <p className="text-red-500 font-black uppercase text-xs tracking-widest mb-4">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-white/5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em]">Reset Session</button>
                </div>
            )}
        </div>
    );
}
