import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, ArrowRight, AlertCircle, Mail } from 'lucide-react';
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_BACKEND_URL;

const socket = io(import.meta.env.VITE_BACKEND_URL, {
  transports: ['polling', 'websocket'], // Polling works better on strict mobile networks
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

// ADDED: Accept setIsAuthenticated as a prop
const AdminLogin = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }) 
      });

      const data = await res.json();

      if (res.ok) {
        // CRITICAL FIX: Ensure these keys match App.jsx exactly
        localStorage.setItem('token', data.token);
        localStorage.setItem('sportAccess', data.sportAccess);
        localStorage.setItem('adminName', data.name);
        
        // ADDED: Tell the global app state that we are logged in
        if (setIsAuthenticated) {
          setIsAuthenticated(true);
        }
        
        navigate('/admin'); 
      } else {
        setError(data.error || 'Invalid email or password. Please try again.');
      }
    } catch (err) {
      console.error("Login Error:", err);
      setError('Cannot connect to the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full grow flex flex-col justify-center items-center px-4 py-12 md:py-20 bg-transparent w-full">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden">
        
        {/* Header Section */}
        <div className="px-6 md:px-8 py-8 md:py-10 text-center relative overflow-hidden border-b border-slate-800">
          <div className="absolute top-0 right-0 opacity-5 translate-x-4 -translate-y-4">
            <Shield size={120} className="text-[#5E9BFF]" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="bg-[#5E9BFF]/10 p-4 rounded-full backdrop-blur-md border border-[#5E9BFF]/20 mb-4 shadow-[0_0_30px_rgba(94,155,255,0.3)]">
              <Lock className="text-[#5E9BFF]" size={32} />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Council Login</h2>
            <p className="text-slate-400 font-medium mt-2 text-xs md:text-sm">Authorized sports board members only</p>
          </div>
        </div>

        {/* Form Section */}
        <div className="p-6 md:p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            
            <div className="space-y-2">
              <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Mail size={14}/> Email Address
              </label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 md:px-5 md:py-4 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#5E9BFF] outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                placeholder="e.g. football@nitn.ac.in"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Lock size={14}/> Password
              </label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 md:px-5 md:py-4 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#5E9BFF] outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
                placeholder="Enter secure password..."
                required
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-3 bg-rose-500/10 text-rose-400 p-3 md:p-4 rounded-xl border border-rose-500/20">
                <AlertCircle size={18} className="shrink-0" />
                <p className="text-[10px] md:text-xs font-bold uppercase tracking-wide">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-3 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm uppercase tracking-widest transition-all shadow-lg ${
                isLoading ? 'bg-[#5E9BFF]/50 cursor-not-allowed text-white/50' : 'bg-[#5E9BFF] hover:bg-blue-400 text-slate-900 shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:-translate-y-0.5'
              }`}
            >
              {isLoading ? <span>Verifying...</span> : <><span>Access Dashboard</span> <ArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;