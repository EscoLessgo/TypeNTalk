import React, { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, ToyBrick, UserCheck, Shield, Zap, Power, Smartphone } from 'lucide-react';
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
            setToys(toys);
            setStatus('connected');
            createLink(customName || 'host');
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
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('lovense:linked');
            socket.off('approval-request');
            socket.off('incoming-pulse');
        };
    }, [customName]);

    const startSession = async () => {
        if (!customName.trim()) {
            setError('Please enter a session name (e.g., your username)');
            return;
        }

        try {
            const id = customName.trim().toLowerCase();
            socket.emit('join-host', id);

            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${id}`);
            if (res.data && res.data.qr) {
                setQrCode(res.data.qr);
                setPairingCode(res.data.code);
                setStatus('qr');
                setError(null);
            }
        } catch (err) {
            setError('Failed to start session. Check backend status.');
        }
    };

    const bypassHandshake = () => {
        // Developer Bypass: Directly go to connected state for testing
        setToys({ 'DEBUG_TOY': { name: 'Simulated Toy', type: 'Vibrate' } });
        setStatus('connected');
        createLink(customName.trim().toLowerCase() || 'dev_session');
    };

    const createLink = async (uid) => {
        try {
            const res = await axios.post(`${API_BASE}/api/connections/create`, { uid });
            setSlug(res.data.slug);
        } catch (err) {
            console.error('Failed to create typist link', err);
        }
    };

    const approveTypist = (slug, approved) => {
        socket.emit('approve-typist', { slug, approved });
        setTypists(prev => prev.filter(t => t.slug !== slug));
    };

    return (
        <div className="max-w-xl mx-auto space-y-8">
            <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest text-white/40">
                    {isSocketConnected ? 'Ready' : 'Offline'}
                </span>
            </div>

            <header className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                    Veroe <span className="text-purple-500">Sync</span>
                </h1>
                <p className="text-white/40 font-medium lowercase tracking-widest">Premium LDR Vibe Control</p>
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in slide-in-from-bottom-5">
                    <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-bold px-1">Session Identity</label>
                        <input
                            type="text"
                            placeholder="ENTER YOUR NAME..."
                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-2xl font-bold focus:border-purple-500/50 outline-none transition-all uppercase"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startSession}
                        className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl"
                    >
                        START SESSION <Power size={24} />
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0a0a0a] px-4 text-white/20 tracking-widest">Or Troubleshooting</span></div>
                    </div>

                    <button
                        onClick={bypassHandshake}
                        className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 text-xs font-bold tracking-widest transition-all uppercase"
                    >
                        Bypass Handshake (No Toy Mode)
                    </button>
                </div>
            )}

            {status === 'qr' && (
                <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8 animate-in zoom-in-95 duration-500">
                    <div className="p-4 bg-white rounded-3xl shadow-2xl shadow-purple-500/30">
                        <img src={qrCode} alt="Lovense" className="w-[280px] h-[280px] object-contain" />
                    </div>

                    <div className="text-center space-y-6 w-full">
                        <div className="inline-block px-10 py-3 bg-purple-500/10 border-2 border-purple-500/20 rounded-2xl">
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-black mb-1">Pairing Code</p>
                            <p className="text-4xl font-mono font-black text-white tracking-widest">{pairingCode}</p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm text-white/60 font-medium">Use the <span className="text-purple-400 font-bold">Lovense Remote App</span></p>
                            <p className="text-[10px] text-white/20 uppercase tracking-widest">Scanning this links your toy to this dashboard</p>
                        </div>

                        <div className="pt-4 grid grid-cols-2 gap-4">
                            <button
                                onClick={bypassHandshake}
                                className="py-4 bg-white/5 rounded-xl text-[10px] font-bold tracking-widest text-white/30 hover:bg-white/10"
                            >
                                SKIP PAIRING
                            </button>
                            <button
                                onClick={() => window.open(`lovense://app/game?code=${pairingCode}`)}
                                className="py-4 bg-purple-500/10 rounded-xl text-[10px] font-bold tracking-widest text-purple-400 hover:bg-purple-500/20 flex items-center justify-center gap-2"
                            >
                                <Smartphone size={14} /> OPEN APP
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6 animate-in fade-in zoom-in-95">
                    <div className="glass p-8 rounded-[2.5rem] border-green-500/10 bg-gradient-to-b from-green-500/[0.02] to-transparent">
                        <div className="flex items-center gap-5 mb-8">
                            <div className="w-16 h-16 bg-green-500/10 rounded-3xl flex items-center justify-center border border-green-500/20">
                                <Shield className="text-green-500" size={32} />
                            </div>
                            <div>
                                <h3 className="font-black text-2xl tracking-tight">SYSTEM ACTIVE</h3>
                                <p className="text-green-500/60 text-xs font-bold uppercase tracking-widest">
                                    {Object.keys(toys).length > 0 ? `${Object.keys(toys).length} Device(s) Linked` : 'Simulated Session'}
                                </p>
                            </div>
                        </div>

                        {slug && (
                            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-black mb-2">Private Typist Link</p>
                                    <div className="flex items-center justify-between gap-4">
                                        <code className="text-lg font-mono text-white/80 break-all">{window.location.origin}/t/{slug}</code>
                                        <button
                                            className="p-4 bg-white/10 hover:bg-purple-500 text-white rounded-2xl transition-all flex-shrink-0"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                                alert('Secret Link Copied!');
                                            }}
                                        >
                                            <Share2 size={24} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-white/20 uppercase tracking-widest">Share this with your partner to begin control</p>
                            </div>
                        )}
                    </div>

                    {typists.length > 0 && (
                        <div className="glass p-8 rounded-[2.5rem] border-purple-500/20">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 uppercase tracking-widest text-white/60">
                                <UserCheck className="text-purple-400" /> Incoming Request
                            </h3>
                            <div className="space-y-4">
                                {typists.map(t => (
                                    <div key={t.slug} className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/10">
                                        <span className="font-bold text-sm">TYPIST_CONNECTION</span>
                                        <div className="flex gap-2">
                                            <button
                                                className="px-6 py-3 bg-green-500 text-black font-black rounded-xl text-[10px] tracking-widest"
                                                onClick={() => approveTypist(t.slug, true)}
                                            >
                                                APPROVE
                                            </button>
                                            <button
                                                className="px-6 py-3 bg-white/5 text-white/40 font-black rounded-xl text-[10px] tracking-widest"
                                                onClick={() => approveTypist(t.slug, false)}
                                            >
                                                DENY
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
