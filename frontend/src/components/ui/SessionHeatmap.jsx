import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const SessionHeatmap = ({ events, startTime }) => {
    // events: [{ timestamp, intensity }]
    // startTime: initial timestamp

    const duration = useMemo(() => {
        if (events.length === 0) return 60000; // 1 min default
        const lastEventTime = events[events.length - 1].timestamp;
        return Math.max(60000, lastEventTime - startTime);
    }, [events, startTime]);

    const bins = useMemo(() => {
        const numBins = 60; // 60 bins for 1 minute or proportional
        const binSize = duration / numBins;
        const result = Array(numBins).fill(0);

        events.forEach(event => {
            const binIdx = Math.floor((event.timestamp - startTime) / binSize);
            if (binIdx >= 0 && binIdx < numBins) {
                result[binIdx] = Math.max(result[binIdx], event.intensity);
            }
        });

        return result;
    }, [events, startTime, duration]);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] italic">Session Timeline Heatmap</h3>
                <span className="text-[10px] text-white/20 font-mono">{(duration / 1000).toFixed(1)}s</span>
            </div>

            <div className="h-12 flex items-end gap-[2px] bg-white/[0.02] rounded-xl p-2 border border-white/5 relative overflow-hidden">
                {bins.map((val, i) => (
                    <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(10, val * 4)}%` }}
                        className={`flex-1 rounded-t-sm transition-colors duration-500 ${val > 15 ? 'bg-pink-500' :
                                val > 10 ? 'bg-purple-500' :
                                    val > 5 ? 'bg-purple-900/50' : 'bg-white/5'
                            }`}
                        style={{
                            opacity: val > 0 ? 0.8 : 0.3
                        }}
                    />
                ))}

                {/* Playback Cursor (if we had playback logic) */}
                <motion.div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10"
                    animate={{
                        left: '100%'
                    }}
                    transition={{
                        duration: duration / 1000,
                        ease: "linear",
                        repeat: Infinity
                    }}
                />
            </div>

            <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest px-1">
                <span>Start</span>
                <span>End</span>
            </div>
        </div>
    );
};

export default SessionHeatmap;
