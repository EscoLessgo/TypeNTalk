import React, { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Share2, Shield, Power, Smartphone, Copy, Check, Info, StepForward, ArrowRight } from 'lucide-react';
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

        socket.on('approval-request', ({ slug: typistSlug }) => {
            setTypists(prev => {
                if (prev.find(t => t.slug === typistSlug)) return prev;
                return [...prev, { slug: typistSlug }];
            });
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
            setError('Please enter a name for the session');
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
            setError('System error. Make sure you entered a name.');
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
        setToys({ 'SIM': { name: 'Direct Mode', type: 'Vibrate' } });
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
                <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                    {isSocketConnected ? 'SERVER LIVE' : 'OFFLINE'}
                </span>
            </div>

            <header className="text-center space-y-2">
                <h1 className="text-6xl font-black tracking-tight text-white uppercase italic leading-none">
                    Veroe <span className="text-purple-500">Sync</span>
                </h1>
                <p className="text-white/30 font-bold uppercase tracking-[0.4em] text-[10px]">Cloud Toy Control Engine</p>
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
                        />
                    </div>

                    <button
                        onClick={startSession}
                        className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black shadow-2xl shadow-purple-500/20"
                    >
                        START PAIRING <ArrowRight size={24} />
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

                        <div className="flex items-center gap-5 mb-10 p-6 bg-white/5 rounded-3xl border border-white/5">
                            <div className="w-16 h-16 bg-green-500/10 rounded-[1.5rem] flex items-center justify-center border border-green-500/10">
                                <Shield className="text-green-500" size={32} />
                            </div>
                            <div>
                                <h3 className="font-black text-2xl text-white tracking-tight">LINK SECURED</h3>
                                <p className="text-green-500 text-[10px] font-black tracking-[0.2em] uppercase">
                                    {Object.keys(toys).length} Device(s) listening
                                </p>
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
                </div>
            )}
        </div>
    );
}
