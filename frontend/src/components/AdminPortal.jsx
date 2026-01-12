import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Users, Activity, Globe, Database, Shield, Zap,
    ChevronRight, ExternalLink, Calendar, Search,
    Filter, RefreshCw, BarChart3, Clock, Eye, Target, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getApiBase = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin;
};

const API_BASE = getApiBase();

export default function AdminPortal() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    const [summary, setSummary] = useState(null);
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedConn, setSelectedConn] = useState(null);
    const [recentLogs, setRecentLogs] = useState([]);
    const [detailedAnalytics, setDetailedAnalytics] = useState([]);
    const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Check if already authenticated from session
    useEffect(() => {
        const saved = sessionStorage.getItem('admin_authenticated');
        if (saved === 'true') setIsAuthenticated(true);
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        // Hash check - password is 'tntadmin2026'
        if (passwordInput === 'tntadmin2026') {
            setIsAuthenticated(true);
            sessionStorage.setItem('admin_authenticated', 'true');
            setAuthError('');
        } else {
            setAuthError('ACCESS DENIED: Invalid credentials');
            setPasswordInput('');
        }
    };

    const deleteConnection = async (slug) => {
        if (!window.confirm(`Warning: You are about to purge session ${slug}. This will terminate all active links. Proceed?`)) return;
        try {
            await axios.delete(`${API_BASE}/api/admin/connections/${slug}`, {
                headers: { 'x-admin-password': 'tntadmin2026' }
            });
            setConnections(prev => prev.filter(c => c.slug !== slug));
        } catch (err) {
            console.error('Delete connection error:', err);
            alert('Failed to purge connection');
        }
    };

    useEffect(() => {
        if (isAuthenticated) fetchData();
    }, [isAuthenticated]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [ovRes, connRes] = await Promise.all([
                axios.get(`${API_BASE}/api/admin/overwatch`, {
                    headers: { 'x-admin-password': 'tntadmin2026' }
                }),
                axios.get(`${API_BASE}/api/admin/connections`, {
                    headers: { 'x-admin-password': 'tntadmin2026' }
                })
            ]);
            setSummary(ovRes.data.summary);
            setRecentLogs(ovRes.data.recentLogs);
            setConnections(connRes.data);
        } catch (err) {
            console.error('Fetch admin data error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchConnAnalytics = async (conn) => {
        setSelectedConn(conn);
        setIsFetchingAnalytics(true);
        try {
            const res = await axios.get(`${API_BASE}/api/analytics/${conn.slug}`);
            setDetailedAnalytics(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Fetch analytics error:', err);
            setDetailedAnalytics([]);
        } finally {
            setIsFetchingAnalytics(false);
        }
    };

    const getFlagEmoji = (countryCode) => {
        if (!countryCode || typeof countryCode !== 'string') return '🌐';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt());
        return String.fromCodePoint(...codePoints);
    };

    const formatDateTime = (date) => {
        return new Date(date).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const filteredConnections = connections.filter(c =>
        c.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.host?.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Login gate
    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8">
                <div className="text-center space-y-2">
                    <Shield className="w-16 h-16 text-red-500 mx-auto animate-pulse" />
                    <h1 className="text-3xl font-black text-white tracking-widest">ADMIN ACCESS</h1>
                    <p className="text-white/40 text-xs tracking-widest uppercase">Authentication Required</p>
                </div>
                <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
                    <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Enter access code..."
                        className="w-full bg-black/50 border border-red-500/30 rounded-xl px-4 py-3 text-white 
                                   placeholder:text-white/20 focus:outline-none focus:border-red-500 
                                   font-mono text-center tracking-widest"
                        autoFocus
                    />
                    {authError && (
                        <p className="text-red-500 text-xs text-center font-black tracking-widest animate-pulse">
                            {authError}
                        </p>
                    )}
                    <button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl 
                                   uppercase tracking-widest text-sm transition-all"
                    >
                        Authenticate
                    </button>
                </form>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                <p className="text-white/40 font-black uppercase tracking-[0.3em] text-[10px]">Accessing Admin Core...</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in zoom-in-95 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5 relative">
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-500/10 blur-[100px] rounded-full" />
                <div className="space-y-2 relative z-10">
                    <div className="flex items-center gap-2 glass-pill px-4 py-1.5 w-max border-purple-500/20">
                        <Shield className="text-purple-400" size={12} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Admin Control Center</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white uppercase">
                        SYSTEM <span className="text-gradient">OVERWATCH <span className="text-white/20">v2.5</span></span>
                    </h1>
                </div>

                <div className="flex items-center gap-4 relative z-10">
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('admin_authenticated');
                            window.location.reload();
                        }}
                        className="px-4 py-2 border border-red-500/20 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        De-Authenticate
                    </button>
                    <button
                        onClick={fetchData}
                        className="p-4 glass rounded-2xl text-white/40 hover:text-purple-400 hover:border-purple-500/30 transition-all flex items-center gap-2 group"
                    >
                        <RefreshCw size={18} className="group-active:rotate-180 transition-transform text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline text-white">Refresh Uplink</span>
                    </button>
                </div>
            </header>

            {/* Top KPIs Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Network Node Status', value: summary?.activeNow || 0, unit: 'ACTIVE CLIENTS', icon: Activity, color: 'text-green-500', isLive: true },
                    { label: 'Visitor Matrix (24H)', value: summary?.uniqueIps || 0, unit: 'UNIQUE IPs', icon: Users, color: 'text-blue-400' },
                    { label: 'Packet Throughput', value: summary?.totalVisits || 0, unit: 'TOTAL PACKETS', icon: Zap, color: 'text-yellow-400' },
                    { label: 'System Uptime', value: '99.9', unit: '% RELIABILITY', icon: Shield, color: 'text-green-400' }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass p-6 rounded-3xl border-white/5 relative overflow-hidden flex flex-col justify-between h-32"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{stat.label}</p>
                            {stat.isLive && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full">
                                    <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                    <span className="text-[8px] font-black text-green-500 uppercase">Live</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-baseline gap-2 mt-auto">
                            <span className="text-4xl font-black text-white italic tracking-tighter">{stat.value}</span>
                            <span className="text-xs font-bold text-white/10 uppercase tracking-widest">{stat.unit}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Visualizers */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                    {/* Traffic Chart */}
                    <div className="glass rounded-[2rem] border-white/5 p-8 h-80 relative overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Traffic (Network Throughput)</h3>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                    <span className="text-[10px] uppercase font-black text-white/20">Visits/Hour</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-end justify-between flex-1 gap-1 relative z-10 max-h-48">
                            {summary?.traffic24h?.map((count, i) => {
                                const max = Math.max(...summary.traffic24h, 1);
                                const height = (count / max) * 100;
                                return (
                                    <div key={i} className="flex-1 group relative h-full flex flex-col justify-end">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${height}%` }}
                                            className="w-full bg-gradient-to-t from-purple-600/20 to-purple-400 rounded-t-sm"
                                        />
                                        <div className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-[8px] text-white/10 font-black">
                                            {i}h
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Heatmap Visualizer */}
                    <div className="glass rounded-[2rem] border-white/5 p-8 relative overflow-hidden min-h-[400px]">
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Global Node Distribution</h3>
                                <p className="text-[10px] text-purple-400 font-bold uppercase mt-1">Real-time Traffic Heatmap</p>
                            </div>
                            <Globe size={16} className="text-purple-400 animate-spin-slow" />
                        </div>

                        <div className="relative w-full aspect-[2/1] bg-black/20 rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
                            {/* Stylized Dot Matrix World Map (Simplified) */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none"
                                style={{
                                    backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                                    backgroundSize: '12px 12px'
                                }}
                            />

                            {/* Interactive Map Overlay */}
                            <div className="relative w-full h-full p-4 overflow-hidden">
                                {/* Simplified SVG Map Mask (Invisible but for layout) */}
                                <svg viewBox="0 0 1000 500" className="w-full h-full opacity-5">
                                    <path d="M150,150 Q200,100 300,150 T450,150 T600,150 T850,200 T900,350 T700,450 T400,450 T150,350 Z" fill="white" />
                                </svg>

                                {/* Dynamic Pings based on Country Data */}
                                {Object.entries(summary?.countries || {}).map(([code, count], i) => {
                                    // Map common country codes to rough SVG coordinates (0-100%)
                                    const coords = {
                                        'US': { x: 20, y: 35 }, 'CA': { x: 18, y: 25 }, 'MX': { x: 15, y: 45 },
                                        'GB': { x: 48, y: 30 }, 'FR': { x: 50, y: 35 }, 'DE': { x: 52, y: 30 },
                                        'RU': { x: 70, y: 25 }, 'CN': { x: 80, y: 40 }, 'JP': { x: 90, y: 40 },
                                        'AU': { x: 85, y: 80 }, 'BR': { x: 30, y: 70 }, 'IN': { x: 72, y: 50 },
                                        'DE': { x: 52, y: 30 }, 'IT': { x: 52, y: 40 }, 'ES': { x: 48, y: 40 },
                                        'ZA': { x: 55, y: 80 }, 'EG': { x: 58, y: 50 }, 'SA': { x: 62, y: 50 }
                                    };

                                    const pos = coords[code] || { x: 50 + (Math.random() * 40 - 20), y: 50 + (Math.random() * 40 - 20) };
                                    const intensity = Math.min(count * 10, 100);

                                    return (
                                        <motion.div
                                            key={code}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="absolute"
                                            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                                        >
                                            {/* Pulse Ring */}
                                            <div
                                                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping bg-purple-500/40"
                                                style={{ width: `${20 + (intensity / 2)}px`, height: `${20 + (intensity / 2)}px` }}
                                            />
                                            {/* Core Dot */}
                                            <div
                                                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-10"
                                                style={{ width: '6px', height: '6px' }}
                                            >
                                                <div className="absolute top-8 left-1/2 -translate-x-1/2 glass px-2 py-1 rounded text-[8px] font-black whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {code}: {count}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {/* Legend / Overlay Text */}
                            <div className="absolute bottom-6 left-6 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Active Uplink Clusters</span>
                                </div>
                            </div>
                        </div>

                        {/* Top Nodes List (Slim Version) */}
                        <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {Object.entries(summary?.countries || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, count], i) => (
                                <div key={i} className="flex flex-col gap-1 border-l-2 border-purple-500/20 pl-3 py-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px]">{getFlagEmoji(code)}</span>
                                        <span className="text-[10px] font-black text-white/60 tracking-tighter">{code}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-black text-white italic">{count}</span>
                                        <span className="text-[8px] font-bold text-white/20 uppercase">Hits</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    {/* Browser Dist */}
                    <div className="glass rounded-[2rem] border-white/5 p-8">
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-8">Uplink Protocols</h3>
                        <div className="space-y-6">
                            {Object.entries(summary?.browsers || {}).map(([name, count], i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-white/60">{name}</span>
                                        <span className="text-white">{Math.round((count / (summary.totalVisits || 1)) * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full bg-gradient-to-r ${i === 0 ? 'from-blue-500 to-cyan-400' : 'from-purple-500 to-pink-500'}`}
                                            style={{ width: `${(count / (summary.totalVisits || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* OS Dist */}
                    <div className="glass rounded-[2rem] border-white/5 p-8">
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-8">OS Distribution</h3>
                        <div className="space-y-6">
                            {Object.entries(summary?.os || {}).map(([name, count], i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-white/60">{name}</span>
                                        <span className="text-white">{Math.round((count / (summary.totalVisits || 1)) * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full bg-gradient-to-r ${i === 0 ? 'from-green-500 to-emerald-400' : 'from-yellow-500 to-orange-500'}`}
                                            style={{ width: `${(count / (summary.totalVisits || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Hits Table */}
            <div className="glass rounded-[2.5rem] border-white/5 overflow-hidden">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <Activity className="text-purple-400" size={18} />
                        <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white italic">Recent Network Activity</h3>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 text-[9px] font-black uppercase text-white/30 tracking-widest bg-black/20">
                                <th className="px-8 py-4">Timestamp</th>
                                <th className="px-8 py-4">Origin IP</th>
                                <th className="px-8 py-4">Path</th>
                                <th className="px-8 py-4">Target Matrix</th>
                                <th className="px-8 py-4">Terminal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {recentLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-8 py-4 flex items-center gap-2 text-[11px] font-mono text-white/40 group-hover:text-white/60">
                                        <Clock size={12} className="text-purple-500/40" />
                                        {formatDateTime(log.createdAt)}
                                    </td>
                                    <td className="px-8 py-4 text-[11px] font-mono text-purple-400/80">{log.ip}</td>
                                    <td className="px-8 py-4 text-[11px] font-black uppercase italic text-white/60 tracking-widest">{log.path || '/'}</td>
                                    <td className="px-8 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{getFlagEmoji(log.countryCode)}</span>
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{log.city}, {log.country}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4 text-[10px] font-black text-blue-400 group-hover:text-blue-300 uppercase tracking-widest">
                                        {log.os} / {log.browser}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Active Uplinks Registry */}
            <div className="space-y-6 pt-12 border-t border-white/5">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black italic uppercase text-white tracking-widest flex items-center gap-3 text-gradient">
                        <Database size={24} className="text-purple-400" /> Active Session Registry
                    </h3>
                    <div className="flex-1 max-w-md mx-8">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                            <input
                                type="text"
                                placeholder="Scan Uplinks..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-all font-black uppercase tracking-widest"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filteredConnections.map((conn) => (
                            <motion.div
                                key={conn.slug}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="glass p-6 rounded-3xl border-white/5 space-y-4 hover:border-purple-500/30 transition-all group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 font-black italic">
                                            {conn.slug.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Session Slug</p>
                                            <p className="text-sm font-black text-white italic tracking-widest group-hover:text-purple-400 transition-colors font-mono">{conn.slug}</p>
                                        </div>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${conn.approved ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                                        {conn.approved ? 'Authorized' : 'Pending'}
                                    </div>
                                </div>

                                <div className="space-y-2 py-2">
                                    <div className="flex justify-between text-[9px] uppercase font-black tracking-widest text-white/40">
                                        <span>Captures</span>
                                        <span className="text-white">{conn._count?.history || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-[9px] uppercase font-black tracking-widest text-white/40">
                                        <span>Traffic Hits</span>
                                        <span className="text-white">{conn._count?.visitorLogs || 0}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => fetchConnAnalytics(conn)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-purple-500/20 rounded-xl text-[9px] font-black uppercase transition-all tracking-widest text-white/60 border border-white/5 hover:border-purple-500/30 shadow-lg"
                                    >
                                        <BarChart3 size={14} /> Oversight
                                    </button>
                                    <button
                                        onClick={() => deleteConnection(conn.slug)}
                                        className="py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 rounded-xl transition-all border border-red-500/10 hover:border-red-500/30"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal Overlay */}
            <AnimatePresence>
                {selectedConn && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedConn(null)}
                            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[120]"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
                            className="fixed top-0 right-0 h-full w-full max-w-3xl bg-[#0d0d0f] border-l border-white/10 shadow-2xl z-[121] overflow-hidden flex flex-col"
                        >
                            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="bg-purple-500 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded text-white">
                                            SLUG: {selectedConn.slug}
                                        </span>
                                        <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">
                                            Host: {selectedConn.host?.username}
                                        </span>
                                    </div>
                                    <h2 className="text-3xl font-black text-gradient italic uppercase tracking-tighter">Detailed Analytics</h2>
                                </div>
                                <button
                                    onClick={() => setSelectedConn(null)}
                                    className="p-3 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white border border-white/5"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-12">
                                {isFetchingAnalytics ? (
                                    <div className="flex flex-col items-center justify-center py-20 space-y-4 h-full">
                                        <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                                        <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Compiling Data Streams...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-12">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Total Visits', value: (detailedAnalytics || []).length, icon: Eye, color: 'text-blue-400' },
                                                { label: 'Unique IPs', value: new Set((detailedAnalytics || []).map(a => a?.ip).filter(Boolean)).size, icon: Shield, color: 'text-green-400' },
                                                { label: 'Countries', value: new Set((detailedAnalytics || []).map(a => a?.countryCode).filter(Boolean)).size, icon: Activity, color: 'text-purple-400' },
                                                { label: 'Cities', value: new Set((detailedAnalytics || []).map(a => a?.city).filter(Boolean)).size, icon: Target, color: 'text-pink-400' }
                                            ].map((stat, i) => (
                                                <div key={i} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <stat.icon size={16} className={stat.color} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{stat.label}</span>
                                                    </div>
                                                    <p className="text-2xl font-black text-white tracking-tighter">{stat.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="space-y-6">
                                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/20 border-b border-white/5 pb-4">Activity Records</h3>
                                            <div className="space-y-3">
                                                {(detailedAnalytics || []).map((visit, i) => (
                                                    <div key={i} className="p-5 bg-white/[0.01] border border-white/5 rounded-2xl flex items-center justify-between group hover:border-purple-500/30 transition-all">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-2xl opacity-80">{getFlagEmoji(visit?.countryCode)}</span>
                                                            <div>
                                                                <p className="text-sm font-black text-white uppercase italic">{visit?.city || 'Unknown'}</p>
                                                                <p className="text-[9px] text-white/20 uppercase font-black bg-white/5 px-1.5 py-0.5 rounded w-max mt-1">IP: {visit?.ip}</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-2">
                                                            <Clock size={10} /> {formatDateTime(visit?.createdAt)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
