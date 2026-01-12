import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { Shield, Smartphone, Copy, Check, Info, ArrowRight, Sparkles, Keyboard, Heart, HelpCircle, X, Zap, Lock, Eye, Sliders, Volume2, VolumeX, RefreshCw, ThumbsUp, ThumbsDown, Activity, Target } from 'lucide-react';
import TypistAvatar from './ui/TypistAvatar';
import PulseParticles from './ui/PulseParticles';
import SessionHeatmap from './ui/SessionHeatmap';
import { GoogleLogin } from '@react-oauth/google';
import { motion, AnimatePresence } from 'framer-motion';

const getApiBase = () => {
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
    const [customName, setCustomName] = useState(localStorage.getItem('host_custom_name') || '');
    const [typists, setTypists] = useState([]);
    const [toys, setToys] = useState({});
    const [slug, setSlug] = useState('');
    const [error, setError] = useState(null);
    const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
    const [copied, setCopied] = useState(false);
    const [messages, setMessages] = useState([]);
    const [hostMessage, setHostMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [intensity, setIntensity] = useState(0); // 0-100 for visual meter
    const [lastAction, setLastAction] = useState(null); // 'typing' or 'voice'
    const [typingDraft, setTypingDraft] = useState('');
    const [apiFeedback, setApiFeedback] = useState(null);
    const [showGuide, setShowGuide] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [baseIntensity, setBaseIntensity] = useState(0);
    const [sessionStartTime] = useState(Date.now());
    const [sessionEvents, setSessionEvents] = useState([]);
    const [activePreset, setActivePreset] = useState('none');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [shouldShake, setShouldShake] = useState(false);
    const [latency, setLatency] = useState(0);
    const [isOverdrive, setIsOverdrive] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('sync_user') || 'null'));
    const [hostProfile, setHostProfile] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ username: '', avatar: '', vanitySlug: '' });
    const audioRef = useRef(null);
    const slugRef = useRef('');


    const customNameRef = useRef(customName);
    useEffect(() => {
        customNameRef.current = customName;
        if (customName) {
            localStorage.setItem('host_custom_name', customName);
        }
    }, [customName]);

    useEffect(() => {
        socket.on('connect', () => {
            console.log('[SOCKET] Connected');
            setIsSocketConnected(true);
            const id = (customNameRef.current || '').trim().toLowerCase();
            if (id) {
                console.log(`[SOCKET] Re-joining host room: ${id}`);
                socket.emit('join-host', id);
            }
        });
        socket.on('disconnect', () => {
            console.log('[SOCKET] Disconnected');
            setIsSocketConnected(false);
        });
        if (socket.connected) setIsSocketConnected(true);

        trackAnalytics();

        socket.on('lovense:linked', (data = {}) => {
            console.log('[SOCKET] Lovense linked received:', data);
            const { toys } = data;
            if (!toys) return;
            setToys(toys);

            setStatus(prev => {
                // Prevent booting the user back to verification if they are already in the dashboard
                if (prev === 'connected') {
                    console.log('[SOCKET] lovense:linked received but user is already connected. Ignoring state reset.');
                    return prev;
                }
                return 'verified';
            });

            // Link is already created/reset in startSession, but we refresh it here to be safe
            createLink((customNameRef.current || '').trim().toLowerCase());
        });

        socket.on('approval-request', (data = {}) => {
            console.log('[SOCKET] Approval request:', data);
            const { slug: typistSlug, name } = data;
            if (!typistSlug) return;
            setTypists(prev => {
                if (prev.find(t => t.slug === typistSlug)) return prev;
                return [...prev, { slug: typistSlug, name: name || 'Anonymous' }];
            });
        });

        socket.on('incoming-pulse', (data = {}) => {
            console.log('[SOCKET] Incoming pulse:', data);
            const { source, level } = data;
            const finalLevel = isMuted ? 0 : Math.min((level || 5) * 5, 100);
            setIntensity(finalLevel);
            setLastAction(source || 'active');

            if (source === 'surge' || source === 'climax') {
                const id = Date.now();
                const msg = source === 'surge' ? "🌊 FINAL SURGE INCOMING!" : "🔥 CLIMAX TRIGGERED!";
                setNotifications(prev => [{ id, type: source, msg, icon: 'zap' }, ...prev].slice(0, 3));
                setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
            }

            // Record event for heatmap
            setSessionEvents(prev => [...prev, { timestamp: Date.now(), intensity: (level || 5) }]);

            if (finalLevel > 80) {
                setShouldShake(true);
                setTimeout(() => setShouldShake(false), 300);
            }

            if (finalLevel > 40 && !isMuted) {
                playSubtleSound();
            }

            setTimeout(() => setIntensity(prev => Math.max(0, prev - 20)), 150);
        });

        socket.on('overdrive-status', (data = {}) => {
            console.log('[SOCKET] Overdrive status:', data);
            setIsOverdrive(data.active);
            const id = Date.now();
            const msg = data.active ? "⚠️ OVERDRIVE ENGAGED: 100% POWER!" : "Overdrive Disengaged.";
            setNotifications(prev => [{ id, type: 'overdrive', msg, icon: 'zap' }, ...prev].slice(0, 3));
            setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
        });

        socket.on('session-terminated', (data = {}) => {
            console.log('[SOCKET] Session terminated by system');
            const id = Date.now();
            setNotifications(prev => [{ id, type: 'alert', msg: data.message || "Session terminated by administrator.", icon: 'shield' }, ...prev].slice(0, 3));
            setStatus('setup');
            setSlug('');
            setQrCode('');
            setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 8000);
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
            socket.off('overdrive-status');
            socket.off('partner-joined');
        };
    }, []);

    const [partnerPresent, setPartnerPresent] = useState(false);
    useEffect(() => {
        socket.on('partner-joined', () => {
            console.log('[SOCKET] Partner joined session');
            setPartnerPresent(true);
        });
    }, [isSocketConnected]);

    const trackAnalytics = async () => {
        try {
            const path = window.location.pathname;
            const tracked = sessionStorage.getItem(`tracked_${path}`);
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
                console.warn('[ANALYTICS] Geo-lookup failed:', geoErr.message);
            }

            await axios.post(`${API_BASE}/api/analytics/track`, {
                slug: 'system',
                locationData: { ...baseLog, ...geoData }
            });
            sessionStorage.setItem(`tracked_${path}`, 'true');
        } catch (err) {
            console.warn('[ANALYTICS] Failed to track visit:', err.message);
        }
    };

    useEffect(() => {
        if (!isSocketConnected) return;
        const interval = setInterval(() => {
            const start = Date.now();
            socket.emit('latency-ping', start, (startTime) => {
                setLatency(Date.now() - startTime);
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [isSocketConnected]);

    const joinHostRoom = () => {
        const id = (customNameRef.current || '').trim().toLowerCase();
        if (id) {
            console.log(`[SOCKET] Joining host room: ${id}`);
            socket.emit('join-host', id);
        }
    };

    const restorationAttempted = useRef(false);
    useEffect(() => {
        if (!isSocketConnected) return;

        const savedUid = currentUser?.uid || localStorage.getItem('lovense_uid');
        if (savedUid && status === 'setup' && !restorationAttempted.current) {
            console.log('[SESSION] Restoring host session:', savedUid);
            restorationAttempted.current = true;
            setCustomName(savedUid);
            socket.emit('join-host', savedUid);

            const restore = async () => {
                setIsLoading(true);
                try {
                    await createLink(savedUid);
                } catch (err) {
                    console.error('[RESTORE] Fatal error during sync:', err);
                } finally {
                    setIsLoading(false);
                }
            };
            restore();
        }
    }, [isSocketConnected, status, currentUser]);

    useEffect(() => {
        // Only auto-skip to connected if we have a slug AND toys are linked
        // This prevents bypassing the QR verification flow
        if (slug && status === 'setup' && !isLoading && Object.keys(toys).length > 0) {
            console.log('[SESSION] Auto-restoring to connected state (slug + toys present)');
            setStatus('connected');
        }
    }, [slug, status, isLoading, toys]);

    useEffect(() => {
        slugRef.current = slug;
    }, [slug]);

    const startSession = async () => {
        const baseId = customName.trim().toLowerCase();
        if (!baseId) {
            setError('Please enter your Lovense username');
            return;
        }

        // Reuse existing UID if it belongs to the same base name, otherwise generate new
        const savedUid = localStorage.getItem('lovense_uid');
        let uniqueId = savedUid;

        if (!savedUid || !savedUid.startsWith(baseId) || status === 'setup') {
            // If they are rotating, OR if no ID exists, create a fresh unique hash
            const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
            uniqueId = `${baseId}_${hash}`;
        }

        setIsLoading(true);
        setError(null);
        setCustomName(uniqueId);
        localStorage.setItem('lovense_uid', uniqueId);

        try {
            socket.emit('join-host', uniqueId);
            // RESET APPROVAL IMMEDIATELY: Ensure any existing link for this UID is locked
            await createLink(uniqueId);

            const res = await axios.get(`${API_BASE}/api/lovense/qr?username=${uniqueId}`, { timeout: 8000 });
            if (res.data && res.data.qr) {
                setQrCode(res.data.qr);
                setPairingCode(res.data.code);
                setStatus('qr');
            } else {
                setError('Unexpected response from server');
            }
        } catch (err) {
            console.error('Start session error:', err);
            const errorData = err.response?.data;
            const isRateLimit = errorData?.error?.includes('RATE LIMIT') || err.message?.includes('429');

            setError({
                message: isRateLimit ? 'LOVENSE RATE LIMIT: Please wait 5 minutes before trying again.' : (errorData?.error || err.message || 'System error'),
                details: errorData?.details || 'Lovense servers are temporarily rejecting new QR requests.',
                showBypass: true
            });
        } finally {
            setIsLoading(false);
        }
    };

    const resetSession = async () => {
        const currentUid = localStorage.getItem('lovense_uid');
        const targetSlug = slug || slugRef.current;

        if (targetSlug) {
            socket.emit('terminate-session', { slug: targetSlug });
        }

        if (currentUid) {
            socket.emit('clear-qr-cache', { username: currentUid });
        }
        localStorage.removeItem('lovense_uid');
        localStorage.removeItem('host_custom_name');
        window.location.assign(window.location.pathname);
    };

    const terminateSession = () => {
        const targetSlug = slug || slugRef.current;
        if (targetSlug) {
            socket.emit('terminate-session', { slug: targetSlug });
            setSlug('');
            slugRef.current = '';
            setStatus('setup');
            setApiFeedback({ success: true, message: "SESSION TERMINATED. LINK DESTROYED." });
            setTimeout(() => setApiFeedback(null), 3000);
        }
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
            if (slugRef.current) {
                setStatus('verified'); // Move to verification screen even on bypass
            } else {
                throw new Error('Could not establish connection link. Backend might be down.');
            }
        } catch (err) {
            console.error('Bypass handshake error:', err);
            setError(err.message || 'Failed to enter test mode');
        } finally {
            setIsLoading(false);
            // If we successfully reached 'connected' status, clear the block error
            if (slugRef.current) setError(null);
        }
    };


    const createLink = async (uid) => {
        if (!uid) return;
        try {
            const res = await axios.post(`${API_BASE}/api/connections/create`, { uid }, { timeout: 8000 });
            if (res.data && res.data.slug) {
                setSlug(res.data.slug);
                slugRef.current = res.data.slug;

                // If it's a vanity slug, update currentUser just in case
                if (currentUser && res.data.isVanity) {
                    const updated = { ...currentUser, vanitySlug: res.data.slug };
                    setCurrentUser(updated);
                    localStorage.setItem('sync_user', JSON.stringify(updated));
                }

                setError(null);
            } else if (res.data && res.data.error) {
                throw new Error(res.data.error);
            }
        } catch (err) {
            console.error('[API] createLink error:', err);
            const msg = err.response?.data?.error || err.message;
            setError(`Link Creation Failed: ${msg}. Try force-resetting.`);
        }
    };

    const handleGoogleSuccess = async (response) => {
        setIsLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/auth/google`, {
                credential: response.credential,
                lovenseUid: customName.trim().toLowerCase()
            });

            if (res.data.success) {
                const h = res.data.host;
                setCurrentUser(h);
                localStorage.setItem('sync_user', JSON.stringify(h));

                if (h.uid && !h.uid.startsWith('anon_')) {
                    setCustomName(h.uid);
                    localStorage.setItem('lovense_uid', h.uid);
                }

                setApiFeedback({ success: true, message: `Welcome back, ${h.username}!` });
                setTimeout(() => setApiFeedback(null), 3000);
            }
        } catch (err) {
            console.error('[AUTH] Login failed:', err);
            setError('Google login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('sync_user');
        setApiFeedback({ success: true, message: 'Logged out successfully.' });
        setTimeout(() => setApiFeedback(null), 2000);
    };

    useEffect(() => {
        if (currentUser) {
            setProfileForm({
                username: currentUser.username || '',
                avatar: currentUser.avatar || '',
                vanitySlug: currentUser.vanitySlug || ''
            });
        }
    }, [currentUser]);

    const updateHostProfile = async (updates) => {
        if (!currentUser) return;
        setIsLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/host/settings`, {
                hostId: currentUser.id,
                ...updates
            });
            if (res.data.success) {
                const updated = { ...currentUser, ...res.data.host };
                setCurrentUser(updated);
                localStorage.setItem('sync_user', JSON.stringify(updated));

                // Sync vanity slug to active session if applicable
                if (res.data.host.vanitySlug) {
                    setSlug(res.data.host.vanitySlug);
                }

                setApiFeedback({ success: true, message: 'Settings Updated!' });
                setTimeout(() => setApiFeedback(null), 3000);
            }
        } catch (err) {
            console.error('[SETTINGS] Update failed:', err);
            setError(err.response?.data?.error || 'Failed to update settings');
        } finally {
            setIsLoading(false);
        }
    };

    const testVibration = () => {
        setApiFeedback({ success: true, message: "REQUESTING TEST VIBRATION..." });
        socket.emit('test-toy', { uid: customName });
        setTimeout(() => setApiFeedback(null), 2000);
    };

    const sendFeedback = (type) => {
        const targetSlug = slug || slugRef.current;
        console.log(`[HOST] Sending feedback: ${type} to slug: ${targetSlug}`);

        if (!targetSlug) {
            console.error('[HOST] Cannot send feedback: No slug available.');
            setApiFeedback({ success: false, message: 'SIGNAL ERROR: No active connection link found.' });
            return;
        }

        console.log('[HOST] Socket state:', {
            connected: socket.connected,
            id: socket.id,
            disconnected: socket.disconnected
        });

        if (!socket.connected) {
            console.error('[HOST] Socket not connected!');
            setApiFeedback({ success: false, message: 'SIGNAL ERROR: Socket disconnected.' });
            return;
        }

        const payload = { uid: customName, type, slug: targetSlug };
        console.log('[HOST] Emitting host-feedback with payload:', payload);

        try {
            socket.emit('host-feedback', payload, (ack) => {
                console.log('[HOST] Feedback acknowledgement received:', ack);
            });
            console.log('[HOST] Emit call completed (no error thrown)');
        } catch (err) {
            console.error('[HOST] Emit threw error:', err);
        }

        // Visual feedback locally
        setApiFeedback({ success: true, message: `Feedback Sent: ${type.toUpperCase()}` });
        setTimeout(() => setApiFeedback(null), 3000);
    };

    const sendHostMessage = (e) => {
        if (e) e.preventDefault();
        const targetSlug = slug || slugRef.current;
        if (!hostMessage.trim() || !targetSlug) return;

        socket.emit('host-message', {
            uid: customName,
            text: hostMessage,
            slug: targetSlug
        });

        // Add to local history
        setMessages(prev => [{
            id: Date.now(),
            text: `Host: ${hostMessage}`,
            timestamp: new Date(),
            isHost: true
        }, ...prev]);

        setHostMessage('');
    };

    const setPreset = (preset) => {
        setActivePreset(preset);
        socket.emit('set-preset', { uid: customName, preset });
    };

    const playSubtleSound = () => {
        // Just a subtle click or hum
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            if (!audioRef.current) {
                audioRef.current = new AudioContextClass();
            }

            const audioCtx = audioRef.current;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        } catch (e) {
            console.error('Audio playback failed:', e);
        }
    };

    return (
        <div className={`w-full mx-auto space-y-8 pb-20 relative transition-transform duration-75 ${shouldShake ? 'shake' : ''}`}>
            {/* Notification System */}
            <AnimatePresence>
                {notifications.length > 0 && (
                    <div className="fixed top-24 right-8 z-[60] flex flex-col gap-3 w-72 pointer-events-none">
                        {(notifications || []).map((n, idx) => (
                            <motion.div
                                key={n?.id || `notif-${idx}`}
                                initial={{ opacity: 0, x: 20, scale: 0.9 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -20, scale: 0.9 }}
                                className={`p-4 rounded-2xl glass border-2 flex items-start gap-3 shadow-2xl ${n?.type === 'climax' || n?.type === 'overdrive' ? 'border-red-500 bg-red-500/10' :
                                    n?.type === 'alert' ? 'border-yellow-500 bg-yellow-500/10' :
                                        'border-purple-500 bg-purple-500/10'
                                    }`}
                            >
                                <div className={`p-2 rounded-xl flex-shrink-0 ${n?.type === 'climax' || n?.type === 'overdrive' ? 'bg-red-500/20 text-red-500' : 'bg-purple-500/20 text-purple-400'}`}>
                                    <Zap size={18} fill={n?.type === 'overdrive' ? "currentColor" : "none"} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] italic mb-1 opacity-50">System Notice</p>
                                    <p className="text-xs font-black text-white leading-tight uppercase tracking-tight">
                                        {n?.msg || 'Update received'}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </AnimatePresence>
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
                            className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0d0d0f] border-l border-purple-500/20 shadow-2xl z-[101] overflow-y-auto custom-scrollbar p-8"
                        >
                            <div className="flex items-center justify-between mb-10">
                                <h2 className="text-3xl font-black text-gradient italic uppercase tracking-tighter">Usage Guide</h2>
                                <button
                                    onClick={() => setShowGuide(false)}
                                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-12">
                                <section className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-black italic">01</div>
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-white/90">The Handshake</h3>
                                    </div>
                                    <p className="text-sm text-white/50 leading-relaxed uppercase tracking-tighter font-medium">
                                        Enter your display name. This isn't just a label—it's the anchor for your tunnel. You'll then scan the QR code with your <span className="text-pink-500">Lovense Connect App</span>. This creates a secure bridge between your hardware and our synchronization engine.
                                    </p>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 font-black italic">02</div>
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-white/90">Relinquish Control</h3>
                                    </div>
                                    <p className="text-sm text-white/50 leading-relaxed uppercase tracking-tighter font-medium">
                                        Once your toy is linked, a unique <span className="text-purple-400">Secret Controller Link</span> will be generated. Copy this link and send it to your partner. They will become your Typist, gaining the power to influence your hardware with every keystroke and whisper.
                                    </p>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-black italic">03</div>
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-white/90">Pure Synchronization</h3>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2 text-xs font-black text-purple-400 uppercase tracking-widest">
                                            <Zap size={14} /> Keystore Pulse
                                        </div>
                                        <p className="text-[11px] text-white/40 uppercase leading-relaxed">Every character they type sends a surge of vibration. The faster they type, the more intense the sensation.</p>

                                        <div className="flex items-center gap-2 text-xs font-black text-pink-400 uppercase tracking-widest pt-2">
                                            <Heart size={14} /> Voice Reactive
                                        </div>
                                        <p className="text-[11px] text-white/40 uppercase leading-relaxed">Their whispers and moans translate directly into liquid vibrations, reacting to the frequency of their voice in real-time.</p>
                                    </div>
                                </section>

                                <section className="space-y-4 border-t border-white/5 pt-8">
                                    <div className="flex items-center gap-3">
                                        <Shield className="text-green-500" size={20} />
                                        <h3 className="text-lg font-black uppercase italic tracking-widest text-green-500">Safety & Solitude</h3>
                                    </div>
                                    <ul className="space-y-3">
                                        <li className="flex gap-3 text-[10px] text-white/40 uppercase font-black tracking-widest leading-relaxed italic">
                                            <Lock size={12} className="shrink-0 text-white/20" /> No logs. No recordings. Pure ephemeral sync.
                                        </li>
                                        <li className="flex gap-3 text-[10px] text-white/40 uppercase font-black tracking-widest leading-relaxed italic">
                                            <Eye size={12} className="shrink-0 text-white/20" /> Only you can see your live feedback and chat stream.
                                        </li>
                                        <li className="flex gap-3 text-[10px] text-white/40 uppercase font-black tracking-widest leading-relaxed italic">
                                            <X size={12} className="shrink-0 text-white/20" /> Destroying the session wipes all temporary trace data.
                                        </li>
                                    </ul>
                                </section>

                                <button
                                    onClick={() => setShowGuide(false)}
                                    className="w-full button-premium py-6 rounded-2xl text-lg font-black"
                                >
                                    UNDERSTOOD
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showProfile && currentUser && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowProfile(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md glass p-10 rounded-[2.5rem] border border-purple-500/20 shadow-2xl z-[101] overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setShowProfile(false)} className="text-white/20 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-8">
                                <div className="text-center space-y-4">
                                    <div className="relative group w-24 h-24 mx-auto">
                                        <img src={profileForm.avatar || currentUser.avatar} alt="" className="w-full h-full rounded-full border-4 border-purple-500/20 p-1 object-cover" />
                                        <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <Sparkles size={16} className="text-purple-400" />
                                        </div>
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            value={profileForm.username}
                                            onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                                            onBlur={(e) => updateHostProfile({ username: e.target.value })}
                                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                            className="bg-transparent border-none text-2xl font-black text-white italic uppercase text-center focus:outline-none focus:ring-1 focus:ring-purple-500/50 rounded-lg px-2 w-full"
                                        />
                                        <p className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mt-1">Host Account Verified</p>
                                    </div>
                                </div>

                                <div className="space-y-6 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Personal Vanity URL</label>
                                        <div className="relative group">
                                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 font-black italic">h/</div>
                                            <input
                                                type="text"
                                                placeholder="vanity-slug"
                                                value={profileForm.vanitySlug}
                                                onChange={(e) => setProfileForm({ ...profileForm, vanitySlug: e.target.value })}
                                                onBlur={(e) => updateHostProfile({ vanitySlug: e.target.value })}
                                                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl py-5 pl-12 pr-6 text-lg font-black text-white focus:border-purple-500 outline-none uppercase transition-all"
                                            />
                                        </div>
                                        <p className="text-[9px] text-white/20 italic ml-2 leading-relaxed">Share your permanent link: <span className="text-purple-500 lowercase">{window.location.host}/h/{profileForm.vanitySlug || '...'}</span></p>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Avatar URL</label>
                                        <input
                                            type="text"
                                            placeholder="https://..."
                                            value={profileForm.avatar}
                                            onChange={(e) => setProfileForm({ ...profileForm, avatar: e.target.value })}
                                            onBlur={(e) => updateHostProfile({ avatar: e.target.value })}
                                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                            className="w-full bg-white/5 border-2 border-white/10 rounded-2xl py-4 px-6 text-[10px] font-medium text-white/50 focus:border-purple-500 outline-none transition-all truncate"
                                        />
                                    </div>

                                    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Persistence Status</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                                <span className="text-[10px] font-black text-green-400 uppercase tracking-widest italic">ACTIVE</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Peak Intensity</span>
                                            <span className="text-sm font-black text-pink-500">{intensity} / 100</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={logout}
                                    className="w-full py-4 rounded-xl border border-red-500/20 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all font-black uppercase text-[10px] tracking-widest mt-4"
                                >
                                    LOG OUT FROM GOOGLE
                                </button>
                                {isLoading && (
                                    <div className="text-center animate-pulse pt-2">
                                        <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/20 italic">Updating Cloud Profile...</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Status Indicator */}
            <div className="absolute top-8 right-8 flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                    <span className={`text-[9px] font-black uppercase tracking-widest ${latency > 150 ? 'text-red-400' : latency > 80 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {latency}ms
                    </span>
                    <Activity size={10} className={latency > 150 ? 'text-red-400' : 'text-green-400'} />
                </div>
                <button
                    onClick={() => setShowGuide(true)}
                    className="p-1.5 glass rounded-full text-white/40 hover:text-purple-400 transition-colors"
                    title="Quick Start Guide"
                >
                    <HelpCircle size={20} />
                </button>
                {currentUser && (
                    <button
                        onClick={() => setShowProfile(true)}
                        className="flex items-center gap-2 p-1 glass rounded-full pr-4 hover:bg-white/10 transition-all border border-purple-500/10 hover:border-purple-500/30 group"
                    >
                        <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full border border-purple-500/30 group-hover:border-purple-500 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">Profile</span>
                    </button>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full">
                    <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                        {isSocketConnected ? 'SERVER LIVE' : 'OFFLINE'}
                    </span>
                </div>
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

            {
                status === 'setup' && (
                    <div className="max-w-xl mx-auto">
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
                                        className="bg-red-500/10 border border-red-500/20 p-5 rounded-2xl text-red-400 text-xs font-bold uppercase tracking-wider text-center space-y-4"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-center gap-2 mb-2">
                                                <Info className="text-red-500" size={16} />
                                                <span className="font-black">LOVENSE IP BLOCK DETECTED</span>
                                            </div>
                                            <p className="leading-snug">
                                                {typeof error === 'string' ? error : error.message || 'Error occurred'}
                                            </p>
                                            <p className="text-[10px] opacity-70 font-medium bg-red-500/10 p-2 rounded-lg mt-2 italic">
                                                "IP {typeof error.details === 'string' && error.details.includes('162.') ? '162.x.x.x' : 'restricted'} for frequent access"
                                                is a block on the Railway server, not your internet.
                                            </p>
                                        </div>

                                        {error.showBypass && (
                                            <div className="pt-2 border-t border-red-500/10 space-y-3">
                                                <p className="text-[9px] text-white/40 leading-tight">
                                                    TRY ROTATING YOUR ID OR USE BYPASS IF LINKED PREVIOUSLY:
                                                </p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={resetSession}
                                                        className="py-3 bg-white/5 hover:bg-white/10 text-white/40 rounded-xl text-[9px] font-black tracking-widest uppercase transition-all border border-white/10"
                                                    >
                                                        Rotate ID
                                                    </button>
                                                    <button
                                                        onClick={bypassHandshake}
                                                        className="py-3 bg-red-500/20 hover:bg-red-600/40 text-red-400 rounded-xl text-[9px] font-black tracking-widest uppercase transition-all border border-red-500/30"
                                                    >
                                                        Bypass QR
                                                    </button>
                                                </div>
                                            </div>
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

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                                <div className="relative flex justify-center text-[9px] uppercase font-black tracking-[0.3em] text-white/10">
                                    <span className="bg-[#0d0d0f] px-4">OR USE ACCOUNT</span>
                                </div>
                            </div>

                            {currentUser ? (
                                <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <img src={currentUser.avatar} alt="Avatar" className="w-10 h-10 rounded-full border border-purple-500/30" />
                                        <div>
                                            <p className="text-xs font-black text-white uppercase italic">{currentUser.username}</p>
                                            <p className="text-[9px] font-medium text-white/30 uppercase tracking-tighter">Account Synced</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={logout}
                                        className="text-[9px] font-black uppercase tracking-widest text-red-500/40 hover:text-red-500 transition-colors"
                                    >
                                        Log Out
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-center">
                                    <GoogleLogin
                                        onSuccess={handleGoogleSuccess}
                                        onError={() => setError('Google Authentication Failed')}
                                        theme="filled_black"
                                        shape="circle"
                                        text="continue_with"
                                    />
                                </div>
                            )}

                            {isLoading && (
                                <button
                                    onClick={resetSession}
                                    className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-red-500/50 hover:text-red-500 transition-colors"
                                >
                                    Stuck? Cancel & Force Reset
                                </button>
                            )}

                            <button
                                onClick={() => setShowGuide(true)}
                                className="w-full py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-purple-400 transition-colors flex items-center justify-center gap-2"
                            >
                                <HelpCircle size={12} /> View Detailed Usage Instructions
                            </button>
                        </div>
                    </div>
                )
            }

            {
                status === 'qr' && (
                    <div className="max-w-xl mx-auto">
                        <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center space-y-8 animate-in zoom-in-95">
                            <div className="text-center space-y-2 w-full">
                                <h2 className="text-xl font-bold italic border-b border-white/5 pb-4 uppercase">Step 2: Link Your Toy</h2>
                                <p className="text-[10px] text-white/40 uppercase tracking-widest py-2">
                                    Open the **LOVENSE CONNECT** app on your phone and SCAN this code
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
                                        disabled={isLoading}
                                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/40 rounded-2xl text-[10px] font-black tracking-[0.2em] uppercase transition-all border border-white/10 disabled:opacity-50"
                                    >
                                        {isLoading ? 'BYPASSING...' : 'FORCE SKIP TO LINK (IF APP HANGS)'}
                                    </button>
                                    <button
                                        onClick={resetSession}
                                        className="w-full py-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/10 hover:text-white transition-colors"
                                    >
                                        Wait, take me back to Step 1
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                status === 'verified' && (
                    <div className="max-w-xl mx-auto">
                        <div className="glass p-12 rounded-[3rem] flex flex-col items-center space-y-10 animate-in zoom-in-95 border-green-500/20 shadow-2xl shadow-green-500/5">
                            <div className="text-center space-y-3 w-full">
                                <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 mb-4">
                                    <Shield className="text-green-500" size={40} />
                                </div>
                                <h2 className="text-3xl font-black italic text-gradient uppercase">Hardware Linked</h2>
                                <p className="text-[10px] text-white/40 uppercase tracking-widest">
                                    Your session is ready. Please test connectivity before starting.
                                </p>
                            </div>

                            <div className="w-full space-y-4">
                                <button
                                    onClick={testVibration}
                                    className="w-full py-8 bg-white/5 border-2 border-white/10 text-white rounded-3xl text-xl font-black tracking-[0.2em] uppercase flex items-center justify-center gap-4 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all group"
                                >
                                    <Zap size={32} className="text-yellow-400 group-hover:scale-125 transition-transform" /> TEST VIBRATION
                                </button>

                                <p className="text-[9px] text-center text-white/20 uppercase font-black italic">
                                    Click the button above. If your toy vibrates, you are 100% connected.
                                </p>
                            </div>

                            <div className="w-full pt-6 border-t border-white/5 relative z-50">
                                {partnerPresent && (
                                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center animate-pulse">
                                        <span className="text-[10px] text-green-400 font-extrabold uppercase tracking-widest">Partner is waiting for control!</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        console.log('[HOST] Transitioning to connected dashboard');
                                        setStatus('connected');
                                    }}
                                    className="w-full button-premium py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black shadow-2xl shadow-purple-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    OPEN DASHBOARD <ArrowRight size={24} />
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                status === 'connected' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 animate-in fade-in zoom-in-95 items-start">
                        {/* COLUMN 1: Visuals & Core Status (Left) */}
                        <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-8 order-2 lg:order-1">
                            <div className={`glass p-6 rounded-[2rem] border-green-500/20 relative overflow-hidden transition-all duration-500 ${isOverdrive ? 'border-red-500 bg-red-500/10 shadow-[0_0_50px_rgba(239,68,68,0.2)]' : 'bg-green-500/[0.02]'}`}>
                                <PulseParticles intensity={isOverdrive ? 100 : intensity} />
                                <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                                    <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center border border-green-500/20">
                                        <Shield className="text-green-500" size={32} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-2xl text-white tracking-tight text-gradient">ACTIVE</h3>
                                        <p className="text-green-500 text-[8px] font-black tracking-[0.2em] uppercase mt-1">
                                            {Object.keys(toys).length} Device(s) Linked
                                        </p>
                                    </div>

                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => sendFeedback('good')}
                                            className="flex-1 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 transition-all active:scale-95 flex items-center justify-center"
                                        >
                                            <ThumbsUp size={18} />
                                        </button>
                                        <button
                                            onClick={() => sendFeedback('bad')}
                                            className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 transition-all active:scale-95 flex items-center justify-center"
                                        >
                                            <ThumbsDown size={18} />
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => {
                                            const targetSlug = slug || slugRef.current;
                                            console.log(`[HOST] Sending CLIMAX signal to: ${targetSlug}`);
                                            socket.emit('host-climax', { uid: customName, slug: targetSlug });
                                            setApiFeedback({ success: true, message: "CLIMAX ALERT SENT TO PARTNER! 🔥" });
                                            setTimeout(() => setApiFeedback(null), 3000);
                                        }}
                                        className="w-full py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-2xl text-white text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 active:scale-95 transition-all mt-4 border border-red-400/30 kinky-glow-red"
                                    >
                                        🔥 I'M GONNA CUM! 🔥
                                    </button>
                                </div>
                            </div>

                            {/* Avatar Visualization */}
                            <div className="glass p-6 rounded-[2rem] flex flex-col items-center overflow-hidden">
                                <div className="scale-75 origin-center -my-4">
                                    <TypistAvatar intensity={intensity} lastAction={lastAction} />
                                </div>

                                <div className="w-full space-y-2 mt-2">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Pulse</span>
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${intensity > 0 ? 'text-pink-400' : 'text-white/10'}`}>
                                            {intensity > 0 ? lastAction : 'idle'}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5 relative">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full"
                                            animate={{ width: `${intensity}%`, opacity: intensity > 0 ? 1 : 0.3 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="glass p-4 rounded-3xl">
                                <SessionHeatmap events={sessionEvents} startTime={sessionStartTime} />
                            </div>
                        </div>

                        {/* COLUMN 2: Live Feeds (Center) */}
                        <div className="lg:col-span-6 space-y-6 order-1 lg:order-2">
                            {/* Pending Approvals */}
                            <AnimatePresence>
                                {typists.length > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="glass p-6 rounded-[2rem] border-pink-500/40 bg-pink-500/[0.05] space-y-4 shadow-xl shadow-pink-500/10">
                                            <div className="flex items-center gap-2 text-pink-400 text-xs font-black uppercase tracking-widest">
                                                <Zap size={14} className="animate-pulse" /> PENDING CONTROLLERS
                                            </div>
                                            <div className="space-y-3">
                                                {(typists || []).map(t => (
                                                    <div key={t?.slug || Math.random()} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-pink-500/20">
                                                        <div>
                                                            <p className="text-sm font-black text-white uppercase italic tracking-tight">{t?.name || 'Anonymous'}</p>
                                                            <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest">Wants Control</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    if (!t?.slug) return;
                                                                    console.log(`[HOST] Approving typist: ${t.slug} (${t.name})`);
                                                                    socket.emit('approve-typist', { slug: t.slug, approved: true });
                                                                    // Give visual feedback before removing
                                                                    const btn = document.getElementById(`allow-btn-${t.slug}`);
                                                                    if (btn) btn.innerText = "ALLOWED";
                                                                    setTimeout(() => {
                                                                        setTypists(prev => prev.filter(item => item?.slug !== t.slug));
                                                                    }, 500);
                                                                }}
                                                                id={`allow-btn-${t?.slug}`}
                                                                className="px-6 py-2 bg-green-500 text-black text-[10px] font-black uppercase rounded-xl hover:bg-green-400 transition-colors"
                                                            >
                                                                ALLOW
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (!t?.slug) return;
                                                                    console.log(`[HOST] Denying typist: ${t.slug}`);
                                                                    socket.emit('approve-typist', { slug: t.slug, approved: false });
                                                                    setTypists(prev => prev.filter(item => item?.slug !== t.slug));
                                                                }}
                                                                className="px-4 py-2 bg-red-500/20 text-red-500 text-[10px] font-black uppercase rounded-xl hover:bg-red-500/40 transition-colors border border-red-500/20"
                                                            >
                                                                DENY
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Live Typist Feed */}
                            <AnimatePresence mode="wait">
                                {typingDraft ? (
                                    <motion.div
                                        key="draft-active"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="glass p-10 rounded-[3rem] border-purple-500/40 bg-purple-500/[0.04] shadow-2xl shadow-purple-500/10 min-h-[220px] flex flex-col justify-center relative overflow-hidden group"
                                    >
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />

                                        <div className="flex items-center justify-between border-b border-purple-500/10 pb-6 mb-6">
                                            <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.3em] flex items-center gap-3">
                                                <Keyboard size={18} className="animate-pulse" /> Typist Thinking...
                                            </h3>
                                            <div className="flex gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
                                            </div>
                                        </div>
                                        <p className="text-4xl font-medium text-white leading-tight italic tracking-tight break-words">
                                            {typingDraft}
                                            <motion.span
                                                animate={{ opacity: [1, 0] }}
                                                transition={{ duration: 0.8, repeat: Infinity }}
                                                className="w-1.5 h-10 bg-purple-500 inline-block ml-2 align-middle"
                                            />
                                        </p>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="draft-empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="glass p-10 rounded-[3rem] border-white/5 bg-white/[0.01] min-h-[220px] flex flex-col items-center justify-center text-center space-y-4"
                                    >
                                        <div className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center text-white/10">
                                            <Keyboard size={24} />
                                        </div>
                                        <p className="text-white/20 font-black uppercase tracking-[0.3em] text-[10px]">
                                            Waiting for partner to type...
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Recent Whispers */}
                            <div className="glass p-8 rounded-[2.5rem] space-y-6">
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Sparkles size={16} className="text-purple-500" /> Recent Whispers
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">{messages.length} Messages</span>
                                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">HISTORY</span>
                                    </div>
                                </div>

                                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    {messages.length === 0 ? (
                                        <div className="text-center py-20 text-white/5 uppercase text-[10px] font-black tracking-widest border-2 border-dashed border-white/5 rounded-3xl">
                                            Silence is waiting to be broken...
                                        </div>
                                    ) : (
                                        (messages || []).map((msg) => (
                                            <motion.div
                                                key={msg?.id || Math.random()}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`p-6 rounded-3xl border transition-all text-left group ${msg.isHost ? 'bg-purple-500/10 border-purple-500/20' : 'bg-white/[0.03] border-white/5 hover:border-purple-500/20'}`}
                                            >
                                                <p className={`text-xl font-medium leading-relaxed transition-colors ${msg.isHost ? 'text-purple-300' : 'text-white/90 group-hover:text-white'}`}>
                                                    {msg?.text || ''}
                                                </p>
                                                <div className="flex items-center gap-3 mt-4">
                                                    <div className="h-[1px] flex-1 bg-white/5" />
                                                    <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">
                                                        {msg?.timestamp instanceof Date
                                                            ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : 'just now'}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </div>

                                {/* Host Message Input */}
                                <form onSubmit={sendHostMessage} className="relative mt-6 pt-6 border-t border-white/5">
                                    <input
                                        type="text"
                                        value={hostMessage}
                                        onChange={(e) => setHostMessage(e.target.value)}
                                        placeholder="Whisper back to your partner..."
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-16 text-sm font-bold placeholder:text-white/10 focus:border-purple-500/50 outline-none transition-all"
                                    />
                                    <button
                                        type="submit"
                                        className="absolute right-2 top-[calc(1.5rem+6px)] p-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all shadow-lg"
                                    >
                                        <ArrowRight size={18} />
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* COLUMN 3: Link & Controls (Right) */}
                        <div className="lg:col-span-3 space-y-6 order-3">
                            {/* Secret Link Section */}
                            <div className="glass p-6 rounded-2xl border-purple-500/20 bg-purple-500/[0.02]">
                                <div className="space-y-4">
                                    <div className="text-center lg:text-left">
                                        <h2 className="text-xs font-black text-white italic uppercase tracking-widest">Partner Link</h2>
                                        <p className="text-[8px] text-white/40 uppercase tracking-[0.2em] mt-1">Share this to start</p>
                                    </div>
                                    <code className="block text-[8px] sm:text-[10px] font-mono text-purple-400 font-bold select-all bg-black/40 p-3 rounded-xl border border-white/5 break-all text-center">
                                        {window.location.host}/{currentUser?.vanitySlug === slug ? 'h' : 't'}/{slug}
                                    </code>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            className="w-full button-premium py-3 rounded-xl text-[10px]"
                                            onClick={() => {
                                                const path = currentUser?.vanitySlug === slug ? 'h' : 't';
                                                navigator.clipboard.writeText(`${window.location.origin}/${path}/${slug}`);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }}
                                        >
                                            {copied ? 'COPIED!' : 'COPY LINK'}
                                        </button>
                                        <button
                                            onClick={testVibration}
                                            className="w-full py-2 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/5 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Zap size={12} /> SYNC TEST
                                        </button>
                                    </div>
                                </div>
                            </div>


                            {/* Overrides */}
                            <div className="glass p-5 rounded-2xl space-y-4">
                                <div className="flex items-center gap-2 text-white/40 text-[9px] font-black uppercase tracking-widest leading-none">
                                    <Sliders size={12} className="text-pink-400" /> Overrides
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Master Mute</span>
                                        <button
                                            onClick={() => setIsMuted(!isMuted)}
                                            className={`p-1.5 rounded-lg transition-all ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/20'}`}
                                        >
                                            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Base Floor</span>
                                            <span className="text-[8px] font-mono text-purple-400">{baseIntensity}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0" max="100"
                                            value={baseIntensity}
                                            onChange={(e) => {
                                                setBaseIntensity(e.target.value);
                                                socket.emit('set-base-floor', { uid: customName, level: e.target.value });
                                            }}
                                            className="w-full accent-purple-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Session Management */}
                            <div className="glass p-5 rounded-2xl space-y-4">
                                <div className="flex items-center gap-2 text-white/40 text-[9px] font-black uppercase tracking-widest leading-none">
                                    <Shield size={12} className="text-red-400" /> Session Control
                                </div>
                                <button
                                    onClick={terminateSession}
                                    className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    DESTROY SESSION & LINK
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

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
        </div >
    );
}
