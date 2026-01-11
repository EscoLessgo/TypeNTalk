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
    const [summary, setSummary] = useState(null);
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedConn, setSelectedConn] = useState(null);
    const [analytics, setAnalytics] = useState([]);
    const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

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
            setAnalytics(res.data);
        } catch (err) {
            console.error('Fetch analytics error:', err);
        } finally {
            setIsFetchingAnalytics(false);
        }
    };

    const getFlagEmoji = (countryCode) => {
        if (!countryCode) return '🌐';
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
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 glass-pill px-4 py-1.5 w-max border-purple-500/20">
                        <Shield className="text-purple-400" size={12} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Admin Control Center</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
                        SYSTEM <span className="text-gradient">OVERWATCH</span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={fetchData}
                        className="p-4 glass rounded-2xl text-white/40 hover:text-purple-400 hover:border-purple-500/30 transition-all flex items-center gap-2 group"
                    >
                        <RefreshCw size={18} className="group-active:rotate-180 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Refresh Data</span>
                    </button>
                </div>
            </header>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {[
                    { label: 'Active Hosts', value: summary?.hostCount, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/5' },
                    { label: 'Total Channels', value: summary?.connCount, icon: Zap, color: 'text-purple-400', bg: 'bg-purple-400/5' },
                    { label: 'Tracking Events', value: summary?.logCount, icon: Globe, color: 'text-pink-400', bg: 'bg-pink-400/5' }
                ].map((stat, i) => (
                    <div key={i} className={`glass p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border-white/5 space-y-3 sm:space-y-4 ${stat.bg}`}>
                        <div className="flex items-center justify-between">
                            <stat.icon className={stat.color} size={20} />
                            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/20">{stat.label}</span>
                        </div>
                        <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Connection List */}
                <div className="lg:col-span-12 glass rounded-[2rem] sm:rounded-[3rem] border-white/5 overflow-hidden flex flex-col min-h-[500px] sm:min-h-[600px]">
                    <div className="p-6 sm:p-8 border-b border-white/5 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <h2 className="text-lg sm:text-xl font-black italic uppercase text-white">Connection Registry</h2>
                            <p className="text-[9px] sm:text-[10px] text-white/40 uppercase tracking-[0.2em]">Listing {filteredConnections.length} sessions</p>
                        </div>

                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input
                                type="text"
                                placeholder="Search by Slug or Host..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold placeholder:text-white/5 focus:border-purple-500/50 outline-none transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/30 bg-white/[0.01]">
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5">Session Slug</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5">Host Identity</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 text-center">Logs</th>
                                    <th className="px-4 py-6 border-b border-white/5 text-center">Status</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 hidden sm:table-cell">Created At</th>
                                    <th className="px-6 sm:px-8 py-6 border-b border-white/5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredConnections.map((conn) => (
                                    <tr key={conn.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-6">
                                            <code className="text-purple-400 font-mono font-bold text-sm bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
                                                {conn.slug}
                                            </code>
                                        </td>
                                        <td className="px-8 py-6 text-sm font-black text-white italic uppercase">
                                            {conn.host?.username || 'System Root'}
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className="text-xs font-black text-white/60 bg-white/5 px-2 py-1 rounded-full border border-white/5">
                                                {conn._count?.visitorLogs || 0}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center justify-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${conn.approved ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                                                    {conn.approved ? 'Authorized' : 'Pending'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 sm:px-8 py-6 text-[9px] sm:text-[10px] font-bold text-white/40 uppercase tracking-tight hidden sm:table-cell">
                                            {formatDateTime(conn.createdAt)}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => fetchConnAnalytics(conn)}
                                                className="p-3 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 text-white/40 hover:text-purple-400 rounded-xl transition-all inline-flex items-center gap-2 group/btn"
                                            >
                                                <BarChart3 size={16} className="group-hover/btn:scale-110 transition-transform" />
                                                <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Analytics</span>
                                            </button>
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
                                                { label: 'Total Visits', value: analytics.length, icon: Eye, color: 'text-blue-400' },
                                                { label: 'Unique IPs', value: new Set(analytics.map(a => a.ip)).size, icon: Shield, color: 'text-green-400' },
                                                { label: 'Countries', value: new Set(analytics.map(a => a.countryCode)).size, icon: Activity, color: 'text-purple-400' },
                                                { label: 'Cities', value: new Set(analytics.map(a => a.city)).size, icon: Target, color: 'text-pink-400' }
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
                                                {Object.entries(analytics.reduce((acc, curr) => {
                                                    const key = `${curr.countryCode}|${curr.city}`;
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
                                                {analytics.map((visit, i) => (
                                                    <div key={i} className="p-4 sm:p-5 bg-white/[0.01] border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between group hover:border-purple-500/30 transition-all gap-4 sm:gap-0">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-xl sm:text-2xl opacity-80">{getFlagEmoji(visit.countryCode)}</span>
                                                            <div className="space-y-1">
                                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                                    <p className="text-xs sm:text-sm font-black text-white uppercase italic">{visit.city || 'Unknown'}, {visit.regionName || 'UNK'}</p>
                                                                    <span className="text-[7px] sm:text-[8px] text-white/40 uppercase font-black bg-white/5 px-1.5 py-0.5 rounded w-max">IP: {visit.ip?.replace(/\d+$/, 'xxx')}</span>
                                                                </div>
                                                                <p className="text-[8px] sm:text-[9px] text-white/30 uppercase font-bold tracking-tight max-w-[200px] sm:max-w-[300px] truncate">
                                                                    {visit.isp || 'Provider Unknown'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-left sm:text-right space-y-1 border-t sm:border-0 border-white/5 pt-3 sm:pt-0">
                                                            <p className="text-[9px] sm:text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center sm:justify-end gap-2">
                                                                <Clock size={10} /> {formatDateTime(visit.createdAt)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                                {analytics.length === 0 && (
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
