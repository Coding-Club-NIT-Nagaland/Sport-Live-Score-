import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy, Activity, ShieldCheck } from 'lucide-react';

const Navbar = () => {
  const location = useLocation();
  // Check if we are anywhere in the admin section
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <nav className="bg-[#0a0f1c]/80 backdrop-blur-xl border-b border-slate-800/80 sticky top-0 z-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          
          {/* LOGO SECTION */}
          <Link to="/" className="flex items-center space-x-4 group">
            <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_25px_rgba(59,130,246,0.3)] transition-all">
              <Trophy className="h-6 w-6 text-[#5E9BFF]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight leading-none uppercase">
                Annual Sports Meet
              </h1>
              <p className="text-[10px] font-black text-[#FF9B54] tracking-[0.2em] uppercase mt-1">
                NIT Nagaland
              </p>
            </div>
          </Link>
          
          {/* NAVIGATION LINKS */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link 
              to="/" 
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${
                !isAdmin 
                  ? 'bg-[#5E9BFF] text-slate-900 shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:bg-blue-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Live Board</span>
            </Link>
            
            <Link 
              to="/admin" 
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${
                isAdmin 
                  ? 'bg-slate-100 text-slate-900 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Council Access</span>
            </Link>
          </div>
          
        </div>
      </div>
    </nav>
  );
};

export default Navbar;