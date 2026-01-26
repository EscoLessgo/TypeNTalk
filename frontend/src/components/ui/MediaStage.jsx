import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X, Play, Volume2, Shield } from 'lucide-react';

export default function MediaStage({ mediaUrl, type = 'image', isNSFW = true, onClose }) {
    if (!mediaUrl) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full relative group"
        >
            <div className="glass-premium rounded-[2.5rem] overflow-hidden relative shadow-2xl border-rose-gold/20">
                {/* NSFW Blur Overlay (Optional toggle) */}
                <div className="relative aspect-video bg-black flex items-center justify-center">
                    {type === 'image' ? (
                        <img
                            src={mediaUrl}
                            alt="Session Media"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <video
                            src={mediaUrl}
                            controls={false}
                            autoPlay
                            loop
                            muted
                            className="w-full h-full object-cover"
                        />
                    )}

                    {/* Controls Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8">
                        <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-rose-gold text-[10px] font-black uppercase tracking-widest">
                                    <Shield size={12} /> Encrypted Media Stream
                                </div>
                                <h3 className="text-white font-bold text-lg uppercase tracking-tight italic">Active Impression</h3>
                            </div>
                            <div className="flex gap-2">
                                <button className="p-3 bg-white/10 hover:bg-rose-gold/20 rounded-2xl transition-all text-white hover:text-rose-gold backdrop-blur-md">
                                    <Maximize2 size={20} />
                                </button>
                                {onClose && (
                                    <button
                                        onClick={onClose}
                                        className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-2xl transition-all text-red-400 backdrop-blur-md"
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="bg-black/40 backdrop-blur-xl px-8 py-3 flex justify-between items-center border-t border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-rose-gold rounded-full animate-pulse shadow-[0_0_8px_#e0a696]" />
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Live Feed Active</span>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-black text-rose-gold/50 uppercase tracking-widest">
                        <span>HD Stream</span>
                        <span>128-Bit SSL</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
