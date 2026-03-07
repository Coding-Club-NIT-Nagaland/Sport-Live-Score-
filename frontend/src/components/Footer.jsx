import React from 'react';
import { Trophy, Heart, Github, Instagram, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-[#05080f] border-t border-slate-800/80 pt-16 pb-8 relative overflow-hidden font-sans mt-auto">
      {/* Subtle top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-linear-to-r from-transparent via-[#5E9BFF]/40 to-transparent"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          
          {/* Brand Col */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Trophy className="h-8 w-8 text-[#5E9BFF]" />
              <span className="text-2xl font-black text-white tracking-tight uppercase">NITN Sports</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs font-medium">
              The official sports broadcasting and management platform for National Institute of Technology Nagaland. Tracking excellence, one match at a time.
            </p>
          </div>
          
          {/* Quick Links Col */}
          <div>
            <h3 className="text-white font-black uppercase tracking-[0.2em] text-xs mb-6">Quick Links</h3>
            <ul className="space-y-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              <li>
                <Link to="/" state={{ tab: 'live' }} className="hover:text-[#5E9BFF] transition-colors flex items-center gap-2">
                  Live Dashboard
                </Link>
              </li>
              <li>
                <Link to="/" state={{ tab: 'leaderboard' }} className="hover:text-[#5E9BFF] transition-colors flex items-center gap-2">
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link to="/" state={{ tab: 'points table' }} className="hover:text-[#5E9BFF] transition-colors flex items-center gap-2">
                  House Standings
                </Link>
              </li>
              <li>
                <Link to="/admin-login" className="hover:text-[#FF9B54] transition-colors flex items-center gap-2 mt-2">
                  Council Login <ExternalLink size={12}/>
                </Link>
              </li>
            </ul>
          </div>

          {/* Socials Col */}
          <div>
            <h3 className="text-white font-black uppercase tracking-[0.2em] text-xs mb-6">Connect</h3>
            <div className="flex space-x-4">
              <a href="#" className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-slate-400 hover:text-white hover:border-[#5E9BFF] hover:bg-[#5E9BFF]/20 transition-all shadow-lg">
                <Instagram size={18}/>
              </a>
              <a href="#" className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-slate-400 hover:text-white hover:border-[#5E9BFF] hover:bg-[#5E9BFF]/20 transition-all shadow-lg">
                <Github size={18}/>
              </a>
            </div>
          </div>
        </div>
        
        {/* Copyright Bar */}
        <div className="border-t border-slate-800/80 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
            &copy; {new Date().getFullYear()} NIT Nagaland Sports Council. All rights reserved.
          </p>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
            Built with <Heart size={12} className="text-rose-500 fill-rose-500 animate-pulse" /> by Coding Club NITN
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;