import React from 'react';
import { BarChart3, TrendingUp, Cpu, Globe, Zap, ShieldCheck, Gamepad2, Layers } from 'lucide-react';
import { motion } from 'framer-motion';

const MarketCard = ({ icon: Icon, title, value, target, cagr, description, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`glass p-8 rounded-[2.5rem] border ${color}/20 bg-${color}/5 relative overflow-hidden group`}
    >
        <div className={`absolute -right-10 -top-10 w-40 h-40 bg-${color}/10 rounded-full blur-3xl group-hover:bg-${color}/20 transition-all duration-700`} />

        <div className="relative z-10 space-y-6">
            <div className={`w-14 h-14 rounded-2xl bg-${color}/10 flex items-center justify-center border border-${color}/20 text-${color}`}>
                <Icon size={28} />
            </div>

            <div className="space-y-1">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 italic">{title}</h3>
                <div className="flex items-end gap-3">
                    <span className="text-4xl font-black text-white italic tracking-tighter">{value}</span>
                    <TrendingUp size={24} className={`text-${color} mb-2`} />
                    <span className="text-5xl font-black text-white italic tracking-tighter">{target}</span>
                </div>
                <p className={`text-[10px] font-black uppercase tracking-widest text-${color}`}>ESTIMATED CAGR {cagr}</p>
            </div>

            <p className="text-sm font-medium text-white/50 leading-relaxed uppercase tracking-tighter">
                {description}
            </p>

            <div className="pt-4 border-t border-white/5 flex gap-4">
                <div className="space-y-1">
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Efficiency Edge</p>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className={`h-1 w-4 rounded-full ${i <= 4 ? `bg-${color}` : 'bg-white/10'}`} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </motion.div>
);

const MarketView = () => {
    return (
        <div className="space-y-16 pb-20">
            <header className="text-center space-y-4 max-w-3xl mx-auto pt-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Globe size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Global Market Projections 2026-2035</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white uppercase italic leading-none">
                    STRATEGIC <span className="text-gradient">DOMINANCE</span>
                </h1>
                <p className="text-sm text-white/40 font-medium tracking-wide uppercase">
                    Leveraging AWS/Cloudflare/Docker edge infrastructure to capture high-velocity growth sectors.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <MarketCard
                    icon={Cpu}
                    title="CRM Automation Surge"
                    value="$18B"
                    target="$26B"
                    cagr="4%"
                    color="blue"
                    description="Fueled by cloud AI for health checks, marketing, and auth—delivering the optimized uptime clients crave."
                />

                <MarketCard
                    icon={Zap}
                    title="No-Code Tool Expansion"
                    value="$26B"
                    target="$264B"
                    cagr="32%"
                    color="purple"
                    description="Indie dev explosion scaling exponentially through 2032. Rapid deployment and modular architecture dominance."
                />

                <MarketCard
                    icon={TrendingUp}
                    title="Crypto Economy"
                    value="$60B"
                    target="$700B"
                    cagr="28%"
                    color="pink"
                    description="Skyrocketing institutional and retail adoption. Secure tunnel protocols and decentralized synchronization."
                />
            </div>

            <section className="glass p-10 md:p-16 rounded-[4rem] border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-purple-500/10 to-transparent pointer-none" />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">
                                DEV<span className="text-gradient">HAVEN</span> UNLOCKED
                            </h2>
                            <p className="text-lg text-white/60 font-medium uppercase tracking-tight leading-tight">
                                Capturing $1.5B indie game tools + $24B freelance web design markets.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-2">
                                <div className="text-purple-400"><Gamepad2 size={24} /></div>
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Indie Scaling</p>
                                <p className="text-2xl font-black text-white italic">$2K+ <span className="text-sm opacity-50 font-medium">MRR</span></p>
                            </div>
                            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-2">
                                <div className="text-blue-400"><Layers size={24} /></div>
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Edge Assets</p>
                                <p className="text-2xl font-black text-white italic">100% <span className="text-sm opacity-50 font-medium">UPTIME</span></p>
                            </div>
                        </div>

                        <ul className="space-y-4">
                            {[
                                { icon: ShieldCheck, text: "High-security marketing & auth flows" },
                                { icon: Cpu, text: "Optimized AWS/Cloudflare/Docker edge" },
                                { icon: BarChart3, text: "Data-driven client health checks" }
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-white/40">
                                    <item.icon size={16} className="text-purple-500" />
                                    {item.text}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="relative">
                        <div className="aspect-square rounded-[3rem] bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 p-8 flex flex-col justify-between">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Strategic Roadmap</h4>
                                <div className="h-0.5 w-12 bg-purple-500" />
                            </div>

                            <div className="space-y-6">
                                {[2026, 2030, 2035].map((year, i) => (
                                    <div key={year} className="flex items-center gap-6">
                                        <span className="text-2xl font-black text-white/20 italic">{year}</span>
                                        <div className="flex-1 h-[1px] bg-white/5" />
                                        <div className={`h-3 w-3 rounded-full ${i === 2 ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-white/10'}`} />
                                    </div>
                                ))}
                            </div>

                            <p className="text-[9px] text-white/20 uppercase font-bold italic text-center">
                                Optimizing for liquidity and massive market absorption.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default MarketView;
