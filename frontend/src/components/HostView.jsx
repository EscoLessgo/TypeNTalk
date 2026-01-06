import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import socket from '../socket';
import { Share2, ToyBrick, UserCheck, Shield, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid'; // Import uuidv4

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function HostView() {
    const [status, setStatus] = useState('idle'); // idle, qr, connected
    const [qrCode, setQrCode] = useState(''); // Renamed from qrData
    const [username, setUsername] = useState('');
    const [typists, setTypists] = useState([]);
    const [toys, setToys] = useState({});
    const [incomingPulses, setIncomingPulses] = useState([]); // Array of {id}
    const [typistLink, setTypistLink] = useState(''); // Renamed from slug
    const [error, setError] = useState(null); // Kept as null for consistency with original error handling
    const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);

    useEffect(() => {
        const id = uuidv4();
        setUsername(id);

        const onConnect = () => {
            setIsSocketConnected(true);
            socket.emit('join-host', id);
        };

        const onDisconnect = () => setIsSocketConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        // If already connected
        if (socket.connected) onConnect();

        fetchQR(id);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []); // Empty dependency array to run once on mount

    const fetchQR = async (uid) => { // Renamed from getQR
        try {
            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${uid}`);
            setQrCode(res.data.qr); // Use qrCode state
            setStatus('qr');
            // socket.emit('join-host', uid); // Moved to onConnect
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Backend unreachable. Make sure port 3001 is running.');
        }
    };

    useEffect(() => {
        socket.on('lovense:linked', ({ toys }) => {
            setToys(toys);
            setStatus('connected');
            createLink();
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
            socket.off('lovense:linked');
            socket.off('approval-request');
            socket.off('incoming-pulse');
        };
    }, [username]);

    const createLink = async () => {
        const res = await axios.post(`${API_BASE}/api/connections/create`, { uid: username });
        setSlug(res.data.slug);
    };

    const approveTypist = (slug, approved) => {
        socket.emit('approve-typist', { slug, approved });
        setTypists(prev => prev.filter(t => t.slug !== slug));
    };

    return (
        <div className="max-w-xl mx-auto space-y-8">
            <header className="text-center space-y-2">
                <h1 className="text-4xl font-bold tracking-tight text-white">
                    Host <span className="text-gradient">Dashboard</span>
                </h1>
                <p className="text-white/60">Pair your toy and invite a typist.</p>
            </header>

            {status === 'qr' && qrData && (
                <div className="glass p-10 rounded-3xl flex flex-col items-center space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="p-4 bg-white rounded-2xl shadow-2xl shadow-purple-500/20">
                        <QRCodeSVG value={qrData.qr} size={256} />
                    </div>
                    <div className="text-center space-y-3">
                        <div className="flex items-center justify-center gap-2 text-purple-400">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                            </span>
                            <p className="font-semibold text-lg tracking-wide uppercase">Waiting for Lovense App</p>
                        </div>
                        <p className="text-sm text-white/40 max-w-xs mx-auto">
                            Scan this with the <strong>Lovense Remote App</strong> (Standard Solution).
                            The link for your typist will appear here as soon as you scan.
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="glass p-8 rounded-3xl border-red-500/20 text-center space-y-4">
                    <p className="text-red-400 font-semibold">{error}</p>
                    <button
                        className="px-6 py-2 bg-white/5 rounded-xl text-sm hover:bg-white/10 transition-all"
                        onClick={() => window.location.reload()}
                    >
                        Try Again
                    </button>
                </div>
            )}

            {status === 'connected' && (
                <div className="space-y-6">
                    <div className="glass p-8 rounded-3xl border-green-500/20">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-green-500/10 rounded-2xl">
                                <Shield className="text-green-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-xl">Toy Connected</h3>
                                <p className="text-white/50">{Object.keys(toys).length} toy(s) active</p>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-4 gap-4">
                            <AnimatePresence>
                                {incomingPulses.map(p => (
                                    <motion.div
                                        key={p.id}
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1.2, opacity: 1 }}
                                        exit={{ scale: 1.5, opacity: 0 }}
                                        className="h-2 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                                    />
                                ))}
                            </AnimatePresence>
                        </div>

                        {slug && (
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                                <code className="text-purple-400">{window.location.origin}/t/{slug}</code>
                                <button
                                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                                    onClick={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`);
                                        alert('Link copied!');
                                    }}
                                >
                                    <Share2 size={20} />
                                </button>
                            </div>
                        )}
                    </div>

                    {typists.length > 0 && (
                        <div className="glass p-8 rounded-3xl border-purple-500/20">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <UserCheck className="text-purple-400" /> Pairing Requests
                            </h3>
                            <div className="space-y-4">
                                {typists.map(t => (
                                    <div key={t.slug} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                        <span>New Typist Connection</span>
                                        <div className="flex gap-2">
                                            <button
                                                className="px-4 py-2 bg-green-600 rounded-xl text-sm"
                                                onClick={() => approveTypist(t.slug, true)}
                                            >
                                                Approve
                                            </button>
                                            <button
                                                className="px-4 py-2 bg-red-600 rounded-xl text-sm"
                                                onClick={() => approveTypist(t.slug, false)}
                                            >
                                                Deny
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
