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
    const [analytics, setAnalytics] = useState([]);
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
            await axios.delete(`${API_BASE}/api/admin/connections/${slug}`);
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
            const [sumRes, connRes] = await Promise.all([
                axios.get(`${API_BASE}/api/admin/summary`),
                axios.get(`${API_BASE}/api/admin/connections`)
            ]);
            setSummary(sumRes.data);
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
            setAnalytics(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Fetch analytics error:', err);
            setAnalytics([]);
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
        <div className="space-y-12 animate-in fade-in zoom-in-95">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5 relative">
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-500/10 blur-[100px] rounded-full" />
                <div className="space-y-2 relative z-10">
                    <div className="flex items-center gap-2 glass-pill px-4 py-1.5 w-max border-purple-500/20">
                        <Shield className="text-purple-400" size={12} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Admin Control Center</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
                        SYSTEM <span className="text-gradient">OVERWATCH <span className="text-white/20">v2.0</span></span>
                    </h1>
                </div>

                <div className="flex items-center gap-4 relative z-10">
                    <button
                        onClick={fetchData}
                        className="p-4 glass rounded-2xl text-white/40 hover:text-purple-400 hover:border-purple-500/30 transition-all flex items-center gap-2 group"
                    >
                        <RefreshCw size={18} className="group-active:rotate-180 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Synchronize Streams</span>
                    </button>
                </div>
            </header>

            {/* Dashboard KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Network Throughput', value: (summary?.totalVisits || 0) * 8.4, unit: 'KB/s', icon: Activity, color: 'text-blue-400', progress: 65 },
                    { label: 'Active Channels', value: connections.length, unit: 'SLOTS', icon: Zap, color: 'text-yellow-400', progress: 40 },
                    { label: 'Global Reach', value: summary?.activeRegions || 0, unit: 'NODES', icon: Globe, color: 'text-purple-400', progress: 85 },
                    { label: 'System Uptime', value: '99.9', unit: '% REL', icon: Shield, color: 'text-green-400', progress: 99 }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass p-8 rounded-[2.5rem] border-white/5 relative overflow-hidden group hover:border-white/10 transition-all shadow-xl"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full -mr-16 -mt-16 group-hover:bg-white/[0.04] transition-all" />
                        <div className="space-y-4 relative z-10">
                            <div className="flex items-center justify-between">
                                <div className={`p-3 rounded-2xl bg-white/5 ${stat.color}`}>
                                    <stat.icon size={20} />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">{stat.label}</p>
                                    <div className="flex items-baseline gap-1 justify-end">
                                        <span className="text-3xl font-black text-white italic tracking-tighter">{stat.value}</span>
                                        <span className="text-[10px] font-bold text-white/40">{stat.unit}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stat.progress}%` }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                    className={`h-full bg-gradient-to-r ${i === 0 ? 'from-blue-500 to-cyan-400' : i === 1 ? 'from-yellow-500 to-orange-400' : i === 2 ? 'from-purple-500 to-pink-400' : 'from-green-500 to-emerald-400'}`}
                                />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* System Visualizer Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Traffic Heatmap (Simulated) */}
                <div className="lg:col-span-8 glass rounded-[3rem] border-white/5 p-10 relative overflow-hidden group min-h-[400px]">
                    <div className="absolute inset-0 bg-black/40" />
                    {/* Simulated Map Dots */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="absolute top-[30%] left-[20%] w-2 h-2 bg-purple-500 rounded-full animate-ping" />
                        <div className="absolute top-[45%] left-[65%] w-2 h-2 bg-pink-500 rounded-full animate-ping [animation-delay:0.5s]" />
                        <div className="absolute top-[25%] left-[80%] w-2 h-2 bg-blue-500 rounded-full animate-ping [animation-delay:1.2s]" />
                        <div className="absolute top-[60%] left-[40%] w-2 h-2 bg-purple-500 rounded-full animate-ping [animation-delay:2s]" />
                        <div className="absolute top-[15%] left-[50%] w-2 h-2 bg-pink-500 rounded-full animate-ping [animation-delay:0.8s]" />
                        <div className="absolute top-[40%] left-[15%] w-2 h-2 bg-blue-400 rounded-full animate-ping [animation-delay:1.5s]" />
                        <div className="absolute top-[75%] left-[70%] w-2 h-2 bg-green-400 rounded-full animate-ping [animation-delay:0.3s]" />

                        <svg className="w-full h-full text-white/[0.03]" viewBox="0 0 800 400">
                            <path d="M150,150 Q400,100 650,150" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" />
                            <path d="M200,250 Q400,300 600,250" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" />
                            <path d="M400,50 Q400,200 400,350" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" />
                        </svg>
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div className="flex items-center justify-between mb-8">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black italic uppercase text-white tracking-widest flex items-center gap-3">
                                    <Globe size={24} className="text-purple-400" /> Global Traffic Nodes
                                </h3>
                                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">Real-time spatial distribution</p>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-green-500 tracking-widest">Live Uplink</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                            {[
                                { city: 'North America', status: 'ACTIVE', load: 'HIGH' },
                                { city: 'Europe', status: 'ACTIVE', load: 'STABLE' },
                                { city: 'Asia Pacific', status: 'IDLE', load: 'LOW' },
                                { city: 'Latin America', status: 'ACTIVE', load: 'MINIMAL' }
                            ].map((region, i) => (
                                <div key={i} className="space-y-2">
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{region.city}</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1 h-3 rounded-full ${region.load === 'HIGH' ? 'bg-red-500' : 'bg-green-500'}`} />
                                        <span className="text-xs font-black text-white italic">{region.load}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Data Stream (Terminal Style) */}
                <div className="lg:col-span-4 glass rounded-[3rem] border-white/5 p-8 flex flex-col min-h-[400px]">
                    <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                            <Activity size={18} className="text-blue-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white italic">Direct Stream</span>
                        </div>
                        <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Encrypted V4</span>
                    </div>

                    <div className="flex-1 space-y-4 font-mono text-[9px] text-white/40 overflow-hidden relative">
                        {[
                            { time: '15:29:44', event: 'AUTH_GRANTED', data: 'session_82af' },
                            { time: '15:29:45', event: 'UPLINK_ESTABLISHED', data: 'node_west_1' },
                            { time: '15:30:02', event: 'PULSE_SENT', data: 'strength_9' },
                            { time: '15:30:12', event: 'HEARTBEAT_ACK', data: 'ms_42' },
                            { time: '15:31:01', event: 'ANALYTICS_CAPTURED', data: 'ip_masked' },
                            { time: '15:31:54', event: 'OVERSIGHT_ACCESSED', data: 'root_admin' }
                        ].map((log, i) => (
                            <div key={i} className="flex gap-4 group">
                                <span className="text-blue-500">[{log.time}]</span>
                                <span className="text-white/60 font-bold">{log.event}</span>
                                <span className="text-white/20 group-hover:text-purple-400/40 transition-colors">{'>>'} {log.data}</span>
                            </div>
                        ))}
                        {/* Recursive Fake Logs */}
                        <div className="flex gap-4 animate-pulse opacity-50">
                            <span className="text-blue-500">[{new Date().toLocaleTimeString()}]</span>
                            <span className="text-white/60 font-bold">STREAMING...</span>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent pointer-events-none" />
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-blue-500/20 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-blue-500/20 rounded-full" />
                        </div>
                        <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">System Operational</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Connection List */}
                <div className="lg:col-span-12 glass rounded-[2rem] sm:rounded-[3rem] border-white/5 overflow-hidden flex flex-col min-h-[500px] sm:min-h-[600px] relative shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-b from-purple-500/[0.03] to-transparent pointer-events-none" />

                    <div className="p-6 sm:p-8 border-b border-white/5 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                        <div className="space-y-1">
                            <h2 className="text-lg sm:text-xl font-black italic uppercase text-white flex items-center gap-3">
                                <Database size={20} className="text-purple-500" /> Active Registry
                            </h2>
                            <p className="text-[9px] sm:text-[10px] text-white/40 uppercase tracking-[0.2em]">Live Session Monitoring</p>
                        </div>

                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input
                                type="text"
                                placeholder="Scan Slug or Host Identity..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold placeholder:text-white/5 focus:border-purple-500/50 outline-none transition-all focus:bg-white/[0.08]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto relative z-10">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/30 bg-white/[0.01]">
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5">Session</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5">Identity</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 text-center">Traffic</th>
                                    <th className="px-4 py-6 border-b border-white/5 text-center">Status</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 hidden sm:table-cell text-right">Created</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 text-right">Access</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {(filteredConnections || []).map((conn, idx) => (
                                    <tr key={conn?.id || `conn-${idx}`} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 sm:px-8 py-6">
                                            <code className="text-purple-400 font-mono font-bold text-xs sm:text-sm bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20 group-hover:border-purple-500/50 transition-all">
                                                {conn?.slug || '????'}
                                            </code>
                                        </td>
                                        <td className="px-6 sm:px-8 py-6 text-sm font-black text-white italic uppercase tracking-tight">
                                            {conn?.host?.username || 'System Root'}
                                        </td>
                                        <td className="px-6 sm:px-8 py-6 text-center">
                                            <span className="text-xs font-black text-white/60 bg-white/5 px-2.5 py-1 rounded-full border border-white/5 flex items-center gap-1.5 w-max mx-auto">
                                                <Eye size={10} className="text-purple-500" /> {conn?._count?.visitorLogs || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 sm:px-8 py-6">
                                            <div className="flex items-center justify-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${conn?.approved ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)] animate-pulse'}`}>
                                                    {conn?.approved ? 'Authorized' : 'Pending'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 sm:px-8 py-6 text-[9px] sm:text-[10px] font-bold text-white/40 uppercase tracking-tight hidden sm:table-cell text-right">
                                            {formatDateTime(conn?.createdAt)}
                                        </td>
                                        <td className="px-6 sm:px-8 py-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => conn?.slug && fetchConnAnalytics(conn)}
                                                    className="p-3 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 text-white/40 hover:text-purple-400 rounded-xl transition-all inline-flex items-center gap-2 group/btn shadow-lg"
                                                >
                                                    <BarChart3 size={16} className="group-hover/btn:scale-110 group-hover/btn:rotate-12 transition-transform" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Oversight</span>
                                                </button>
                                                <button
                                                    onClick={() => conn?.slug && deleteConnection(conn.slug)}
                                                    className="p-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/20 hover:text-red-400 rounded-xl transition-all group/purge"
                                                    title="Purge Connection"
                                                >
                                                    <X size={16} className="group-hover/purge:rotate-90 transition-transform" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredConnections.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-8 py-20 text-center">
                                            <p className="text-white/10 font-black uppercase tracking-[0.5em] italic">No connections found matching your search</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Analytics Oversight Modal */}
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
                                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                        <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                                        <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Compiling Data Streams...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Specific Stats */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Total Visits', value: (analytics || []).length, icon: Eye, color: 'text-blue-400' },
                                                { label: 'Unique IPs', value: new Set((analytics || []).map(a => a?.ip).filter(Boolean)).size, icon: Shield, color: 'text-green-400' },
                                                { label: 'Countries', value: new Set((analytics || []).map(a => a?.countryCode).filter(Boolean)).size, icon: Activity, color: 'text-purple-400' },
                                                { label: 'Cities', value: new Set((analytics || []).map(a => a?.city).filter(Boolean)).size, icon: Target, color: 'text-pink-400' }
                                            ].map((stat, i) => (
                                                <div key={i} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <stat.icon size={16} className={stat.color} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{stat.label}</span>
                                                    </div>
                                                    <p className="text-3xl font-black text-white tracking-tighter">{stat.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Geographical Breakdown */}
                                        <div className="space-y-6">
                                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/20 border-b border-white/5 pb-4">Geographical Insights</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {Object.entries((analytics || []).reduce((acc, curr) => {
                                                    const key = `${curr?.countryCode || '??'}|${curr?.city || 'Unknown'}`;
                                                    acc[key] = (acc[key] || 0) + 1;
                                                    return acc;
                                                }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count], i) => {
                                                    const [code, city] = key.split('|');
                                                    return (
                                                        <div key={i} className="glass p-5 rounded-2xl border-white/5 flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-2xl">{getFlagEmoji(code)}</span>
                                                                <div>
                                                                    <p className="text-sm font-black text-white italic uppercase tracking-tight">{city || 'Unknown'}</p>
                                                                    <p className="text-[9px] text-white/20 uppercase font-bold">{code}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xl font-black text-purple-400">{count}</p>
                                                                <p className="text-[8px] text-white/20 uppercase tracking-widest">Views</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Technical Logs */}
                                        <div className="space-y-6">
                                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/20 border-b border-white/5 pb-4">Network Activity Log</h3>
                                            <div className="space-y-3">
                                                {(analytics || []).map((visit, i) => (
                                                    <div key={i} className="p-4 sm:p-5 bg-white/[0.01] border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between group hover:border-purple-500/30 transition-all gap-4 sm:gap-0">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-xl sm:text-2xl opacity-80">{getFlagEmoji(visit?.countryCode)}</span>
                                                            <div className="space-y-1">
                                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                                    <p className="text-xs sm:text-sm font-black text-white uppercase italic">{visit?.city || 'Unknown'}, {visit?.regionName || 'UNK'}</p>
                                                                    <span className="text-[7px] sm:text-[8px] text-white/40 uppercase font-black bg-white/5 px-1.5 py-0.5 rounded w-max">IP: {visit?.ip?.replace(/\d+$/, 'xxx')}</span>
                                                                </div>
                                                                <p className="text-[8px] sm:text-[9px] text-white/30 uppercase font-bold tracking-tight max-w-[200px] sm:max-w-[300px] truncate">
                                                                    {visit?.isp || 'Provider Unknown'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-left sm:text-right space-y-1 border-t sm:border-0 border-white/5 pt-3 sm:pt-0">
                                                            <p className="text-[9px] sm:text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center sm:justify-end gap-2">
                                                                <Clock size={10} /> {formatDateTime(visit?.createdAt)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(analytics || []).length === 0 && (
                                                    <div className="text-center py-20 glass rounded-[2rem] border-dashed border-white/10">
                                                        <Globe className="mx-auto text-white/5 mb-4" size={40} />
                                                        <p className="text-white/10 font-black uppercase tracking-widest">No tracking packets captured yet</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
