import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TypistAvatar = ({ intensity, lastAction }) => {
    // intensity is 0-100
    const scale = 1 + (intensity / 200);
    const blur = Math.min(intensity / 10, 5);

    return (
        <div className="relative w-48 h-48 mx-auto mb-8">
            {/* Background Glow */}
            <motion.div
                className="absolute inset-0 rounded-full bg-pink-500/20 blur-3xl"
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* Avatar Container */}
            <motion.div
                className="relative w-full h-full rounded-full border-4 border-white/10 overflow-hidden glass shadow-2xl"
                animate={{
                    scale: scale,
                    rotate: intensity > 20 ? [0, -1, 1, -1, 0] : 0,
                }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20
                }}
            >
                {/* Simple Abstract Morphing Shape as Avatar */}
                <svg viewBox="0 0 100 100" className="w-full h-full">
                    <defs>
                        <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#7c3aed" />
                            <stop offset="100%" stopColor="#db2777" />
                        </linearGradient>
                        <filter id="gooey">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                        </filter>
                    </defs>

                    <motion.path
                        d="M50 10 C 25 10, 10 25, 10 50 C 10 75, 25 90, 50 90 C 75 90, 90 75, 90 50 C 90 25, 75 10, 50 10"
                        fill="url(#avatarGrad)"
                        filter="url(#gooey)"
                        animate={{
                            d: intensity > 30
                                ? [
                                    "M50 15 C 30 15, 15 30, 15 50 C 15 70, 30 85, 50 85 C 70 85, 85 70, 85 50 C 85 30, 70 15, 50 15",
                                    "M50 10 C 20 10, 5 30, 10 50 C 15 75, 30 95, 50 90 C 70 85, 95 70, 90 50 C 85 30, 80 10, 50 10",
                                    "M50 15 C 30 15, 15 30, 15 50 C 15 70, 30 85, 50 85 C 70 85, 85 70, 85 50 C 85 30, 70 15, 50 15"
                                ]
                                : "M50 10 C 25 10, 10 25, 10 50 C 10 75, 25 90, 50 90 C 75 90, 90 75, 90 50 C 90 25, 75 10, 50 10"
                        }}
                        transition={{
                            duration: 0.5,
                            repeat: intensity > 30 ? Infinity : 0,
                            ease: "easeInOut"
                        }}
                    />

                    {/* Eyes/Expression */}
                    <motion.g
                        animate={{
                            y: intensity > 50 ? -2 : 0,
                            scaleY: intensity > 70 ? 0.2 : 1
                        }}
                    >
                        <circle cx="35" cy="45" r="4" fill="white" fillOpacity="0.8" />
                        <circle cx="65" cy="45" r="4" fill="white" fillOpacity="0.8" />

                        {/* Blushing */}
                        <motion.circle
                            cx="30" cy="55" r="6"
                            fill="#db2777"
                            animate={{ opacity: intensity / 100 }}
                        />
                        <motion.circle
                            cx="70" cy="55" r="6"
                            fill="#db2777"
                            animate={{ opacity: intensity / 100 }}
                        />
                    </motion.g>

                    {/* Mouth */}
                    <motion.path
                        d={intensity > 40 ? "M40 65 Q 50 75, 60 65" : "M42 65 Q 50 67, 58 65"}
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        fill="none"
                        animate={{
                            d: intensity > 60
                                ? "M35 70 Q 50 85, 65 70"
                                : intensity > 30
                                    ? "M40 65 Q 50 75, 60 65"
                                    : "M42 68 Q 50 70, 58 68"
                        }}
                    />
                </svg>
            </motion.div>

            {/* Intensity Rings */}
            <AnimatePresence>
                {intensity > 50 && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 border-2 border-pink-500/50 rounded-full pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Last Action Label */}
            <motion.div
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 glass-pill px-4 py-1 text-[10px] font-black uppercase tracking-widest text-pink-400 whitespace-nowrap"
                animate={{
                    y: intensity > 10 ? [0, -4, 0] : 0,
                    opacity: intensity > 0 ? 1 : 0
                }}
            >
                {lastAction === 'voice' ? 'Liquid Sync' : 'Keystroke Pulse'}
            </motion.div>
        </div>
    );
};

export default TypistAvatar;
