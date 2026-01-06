import React, { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, ToyBrick, UserCheck, Shield, Zap, Power, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

// Simple random generator to avoid needing the 'uuid' library
const generateSimpleId = () => Math.random().toString(36).substring(2, 10);

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
            createLink(customName.trim().toLowerCase() || generateSimpleId());
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
            setError('Please enter your name/display name');
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
            setError('Handshake failed. Backend might be down.');
        }
    };

    const bypassHandshake = () => {
        setToys({ 'DEBUG': { name: 'Simulated Device', type: 'Vibrate' } });
        setStatus('connected');
        createLink(customName.trim().toLowerCase() || 'dev_user');
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
            <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    {isSocketConnected ? 'Live' : 'Offline'}
                </span>
            </div>

            <header className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                    Veroe <span className="text-purple-500">Sync</span>
                </h1>
                <p className="text-white/40 font-medium lowercase tracking-widest">Remote Toy Control • Stable v1.1</p>
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in">
                    <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-bold px-1">Host Identity</label>
                        <input
                            type="text"
                            placeholder="YOUR NAME (E.G. ESCO)..."
                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-2xl font-bold focus:border-purple-500 outline-none uppercase"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startSession}
                        className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black"
                    >
                        INITIALIZE SESSION
                    </button>

                    <button
                        onClick={bypassHandshake}
                        className="w-full text-white/20 text-[10px] font-bold tracking-[0.2em] uppercase hover:text-white/40 transition-all"
                    >
                        Skip Connection (Dev Test)
                    </button>
                </div>
            )}

            {status === 'qr' && (
                <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8">
                    <div className="p-4 bg-white rounded-3xl">
                        <img src={qrCode} alt="Lovense" className="w-[280px] h-[280px] object-contain" />
                    </div>

                    <div className="text-center space-y-6 w-full">
                        <div className="inline-block px-10 py-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-black mb-1">Pairing Code</p>
                            <p className="text-4xl font-mono font-black text-white">{pairingCode}</p>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-white/60">Scan with **Lovense Remote App**</p>
                            <button
                                onClick={() => window.open(`lovense://app/game?code=${pairingCode}`)}
                                className="w-full py-4 bg-purple-500/10 rounded-xl text-xs font-black tracking-widest text-purple-400 flex items-center justify-center gap-2"
                            >
                                <Smartphone size={16} /> OPEN APP DIRECTLY
                            </button>
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
                                <h3 className="font-black text-2xl text-white">READY FOR CONTROL</h3>
                                <p className="text-green-500 text-xs font-black tracking-widest uppercase">
                                    {Object.keys(toys).length} Toy(s) linked
                                </p>
                            </div>
                        </div>

                        {slug && (
                            <div className="space-y-4">
                                <label className="text-[10px] uppercase font-black text-purple-400 tracking-widest px-1">Share this with your TYPIST</label>
                                <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between">
                                    <code className="text-lg font-mono text-white/80">{window.location.host}/t/{slug}</code>
                                    <button
                                        className="p-4 bg-purple-500 text-white rounded-2xl shadow-lg"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                            alert('Typist Link Copied!');
                                        }}
                                    >
                                        <Share2 size={24} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {typists.length > 0 && (
                        <div className="glass p-8 rounded-[2.5rem] animate-bounce">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h4 className="font-black text-white uppercase italic">Typist wants to join</h4>
                                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Approve their connection</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => approveTypist(typists[0].slug, true)} className="bg-green-500 px-6 py-3 rounded-xl font-black text-[10px] text-black">ALLOW</button>
                                    <button onClick={() => approveTypist(typists[0].slug, false)} className="bg-white/5 px-6 py-3 rounded-xl font-black text-[10px] text-white/40">DENY</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="glass p-8 rounded-3xl border-red-500 text-center">
                    <p className="text-red-500 font-bold">{error}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 text-xs font-bold uppercase tracking-widest">Reset</button>
                </div>
            )}
        </div>
    );
}
