import React, { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, Shield, Power, Smartphone, Copy, Check, Info } from 'lucide-react';
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
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const onConnect = () => setIsSocketConnected(true);
        const onDisconnect = () => setIsSocketConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        if (socket.connected) onConnect();

        socket.on('lovense:linked', ({ toys }) => {
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
            socket.emit('join-host', id);
            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${id}`);
            if (res.data && res.data.qr) {
                setQrCode(res.data.qr);
                setPairingCode(res.data.code);
                setStatus('qr');
                setError(null);
            }
        } catch (err) {
            setError('Handshake failed. Check your token/balance.');
        }
    };

    const copyPairingCode = () => {
        navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const bypassHandshake = () => {
        const id = customName.trim().toLowerCase() || 'dev';
        socket.emit('join-host', id);
        setToys({ 'SIM': { name: 'Simulated Device', type: 'Vibrate' } });
        setStatus('connected');
        createLink(id);
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
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    {isSocketConnected ? 'Ready' : 'Offline'}
                </span>
            </div>

            <header className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                    Veroe <span className="text-purple-500">Sync</span>
                </h1>
                <p className="text-white/40 font-medium lowercase tracking-widest">Stable Remote Control v1.2</p>
            </header>

            {status === 'setup' && (
                <div className="glass p-10 rounded-[2.5rem] space-y-8 animate-in fade-in">
                    <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-black px-1">Session Owner</label>
                        <input
                            type="text"
                            placeholder="TYPE YOUR NAME..."
                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-2xl font-bold focus:border-purple-500 outline-none uppercase transition-all"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={startSession}
                        className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-extrabold"
                    >
                        PREPARE TOY PAIRING <Power size={24} />
                    </button>

                    <button
                        onClick={bypassHandshake}
                        className="w-full text-white/10 text-[10px] font-bold tracking-[0.2em] uppercase hover:text-white/30"
                    >
                        Skip Pairing (Test Mode)
                    </button>
                </div>
            )}

            {status === 'qr' && (
                <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8">
                    <div className="p-4 bg-white rounded-3xl">
                        <img src={qrCode} alt="Lovense QR" className="w-[280px] h-[280px] object-contain" />
                    </div>

                    <div className="text-center space-y-6 w-full">
                        <div
                            onClick={copyPairingCode}
                            className="relative cursor-pointer group inline-block px-12 py-4 bg-purple-500/10 border-2 border-purple-500/20 rounded-2xl hover:bg-purple-500/20 transition-all"
                        >
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-black mb-1">Pairing Code (Click to Copy)</p>
                            <p className="text-5xl font-mono font-black text-white tracking-widest flex items-center gap-3">
                                {pairingCode}
                                {copied ? <Check className="text-green-500" size={24} /> : <Copy className="text-white/20 group-hover:text-white/40" size={24} />}
                            </p>
                            {copied && <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[10px] font-bold px-3 py-1 rounded-full px-4 py-2">COPIED TO CLIPBOARD!</span>}
                        </div>

                        <div className="space-y-4">
                            <a
                                href={`lovense://app/game?v=2&code=${pairingCode}`}
                                target="_self"
                                className="w-full py-5 bg-purple-500 text-white rounded-2xl text-xs font-black tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-purple-500/20"
                            >
                                <Smartphone size={20} /> LAUNCH LOVENSE APP
                            </a>

                            <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 text-left">
                                <Info size={16} className="text-white/20 flex-shrink-0 mt-0.5" />
                                <p className="text-[10px] leading-relaxed text-white/40 uppercase tracking-wider">
                                    If the button doesn't open the app: Copy the code above, open Lovense Connect/Remote manually, and paste it into the "Game/Add" section.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6 animate-in fade-in">
                    {/* ... (Kept the rest of the file identical for stability) */}
                    <div className="glass p-10 rounded-[2.5rem] border-green-500/20">
                        <div className="flex items-center gap-5 mb-10">
                            <div className="w-16 h-16 bg-green-500/10 rounded-3xl flex items-center justify-center border border-green-500/20">
                                <Shield className="text-green-500" size={32} />
                            </div>
                            <div>
                                <h3 className="font-black text-2xl text-white">READY FOR CONTROL</h3>
                                <p className="text-green-500 text-xs font-black tracking-widest uppercase">
                                    {Object.keys(toys).length} Device(s) active
                                </p>
                            </div>
                        </div>

                        {slug && (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] uppercase font-black text-purple-400 tracking-widest px-1">Your Private Controller Link</label>
                                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between group">
                                        <code className="text-lg font-mono text-white/80 select-all">{window.location.host}/t/{slug}</code>
                                        <button
                                            className="p-5 bg-purple-500 text-white rounded-2xl shadow-lg hover:scale-105 transition-all"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                                alert('Copied! Send this link to your partner.');
                                            }}
                                        >
                                            <Share2 size={24} />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                                    <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest text-center">Send this to your friend states away. They will use this to control you.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
