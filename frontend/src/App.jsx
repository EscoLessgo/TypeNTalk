import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Component } from 'react';
import HostView from './components/HostView';
import TypistView from './components/TypistView';
import AdminPortal from './components/AdminPortal';
import { Heart, Command, Shield } from 'lucide-react';

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) {
    console.error('[CRASH] Caught in ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-10 text-center space-y-6">
          <div className="p-10 glass border border-red-500/20 rounded-[3rem] max-w-lg">
            <h1 className="text-4xl font-black text-red-500 uppercase italic tracking-tighter">SCREEN CRASHED</h1>
            <p className="text-white/40 text-[10px] mt-4 uppercase tracking-[0.2em] leading-relaxed">
              A fatal rendering error occurred. This is usually caused by corrupted session data.
            </p>
            <div className="mt-6 p-4 bg-red-500/5 rounded-2xl border border-red-500/10 font-mono text-[10px] text-red-400 break-all max-h-40 overflow-y-auto">
              <p className="font-bold mb-2">{this.state.error?.message}</p>
              <pre className="whitespace-pre-wrap opacity-50">
                {this.state.error?.stack}
              </pre>
            </div>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/'; }}
              className="mt-8 w-full button-premium py-5 rounded-2xl font-black uppercase tracking-[0.3em]"
            >
              FORCE RESET & START FRESH
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen p-4 md:p-8">
          <nav className="max-w-7xl mx-auto flex justify-between items-center mb-12">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/20 group-hover:rotate-12 transition-transform">
                <Command className="text-white" size={24} />
              </div>
              <span className="text-xl font-bold tracking-tighter text-white">
                VEROE.<span className="text-gradient">SYNC</span>
              </span>
            </Link>
            <div className="flex gap-6 text-sm font-medium text-white/50">
              <Link to="/admin" className="hover:text-purple-400 transition-colors uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                <Shield size={14} /> Admin
              </Link>
              <button
                onClick={() => { localStorage.clear(); window.location.reload(); }}
                className="hover:text-red-400 transition-colors uppercase text-[10px] font-black tracking-widest"
              >
                Force Reset
              </button>
            </div>
          </nav>

          <main className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<HostView />} />
              <Route path="/t/:slug" element={<TypistView />} />
              <Route path="/admin" element={<AdminPortal />} />
              {/* Catch-all for invalid URLs - shows a message with a manual link */}
              <Route path="*" element={
                <div className="text-center p-20 space-y-6">
                  <div className="text-white/20 uppercase tracking-[0.5em] text-[10px]">Route Not Found</div>
                  <h2 className="text-2xl font-bold text-white italic">LOST IN SPACE</h2>
                  <Link to="/" className="button-premium inline-block">Return to Home</Link>
                </div>
              } />
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
    </ErrorBoundary>
  );
}

export default App;
