import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HostView from './components/HostView';
import TypistView from './components/TypistView';
import { Heart, Command } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen p-4 md:p-8">
        <nav className="max-w-4xl mx-auto flex justify-between items-center mb-12">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/20 group-hover:rotate-12 transition-transform">
              <Command className="text-white" size={24} />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">
              VEROE.<span className="text-gradient">SYNC</span>
            </span>
          </Link>
          <div className="flex gap-6 text-sm font-medium text-white/50">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors underline decoration-purple-500/50 underline-offset-4">Premium</a>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto">
          <Routes>
            <Route path="/" element={<HostView />} />
            <Route path="/t/:slug" element={<TypistView />} />
            {/* Catch-all for invalid URLs - redirects to home */}
            <Route path="*" element={<div className="text-center p-20 animate-pulse text-white/20 uppercase tracking-[0.5em] text-[10px]">Invalid Route. Redirecting...{setTimeout(() => window.location.href = '/', 2000)}</div>} />
          </Routes>
        </main>

        <footer className="max-w-4xl mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-white/30 text-xs">
          <p>© 2026 Veroe Space. Developed by Antigravity for Secure LDR Intimacy.</p>
          <div className="flex items-center gap-2">
            Made with <Heart size={12} className="text-pink-500 fill-pink-500" /> for the community
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
