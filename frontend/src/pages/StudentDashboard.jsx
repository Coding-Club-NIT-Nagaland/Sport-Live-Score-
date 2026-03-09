import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Trophy, Activity, Calendar, ListOrdered, ExternalLink, CheckCircle, Flame, Medal, Search, Info, CircleDot, UserPlus, Zap, MapPin, ChevronDown } from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const socket = io(API_URL, {
  transports: [ 'websocket','polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

const HOUSES = ['Wolves', 'Panthers', 'Red Ravens', 'Stallions', 'Orca'];

// FIXED: Brought over the complete dictionary from AdminDashboard so the frontend knows which sports use sets!
const SPORTS_CONFIG = {
  Football: { scoreUI: "goals", hasTimer: true },
  Futsal: { scoreUI: "goals", hasTimer: true },
  Cricket: { scoreUI: "none", hasTimer: false },
  Basketball: { scoreUI: "basketball", hasTimer: true },
  Volleyball: { scoreUI: "points_and_sets", hasTimer: false },
  Badminton: { scoreUI: "points_and_sets", hasTimer: false, hasServe: true },
  Carrom: { scoreUI: "points", hasTimer: false },
  Chess: { scoreUI: "points", hasTimer: false },
  "Table Tennis": { scoreUI: "points_and_sets", hasTimer: false, hasServe: true },
  "Tug of War": { scoreUI: "points", hasTimer: true },
  "Kho-Kho": { scoreUI: "points", hasTimer: true },
  Marathon: { scoreUI: "none", hasTimer: false },
  "High Jump": { scoreUI: "none", hasTimer: false },
  "Long Jump": { scoreUI: "none", hasTimer: false },
  Skipping: { scoreUI: "none", hasTimer: false },
  Shotput: { scoreUI: "none", hasTimer: false },
};

const SPORTS_LIST = ['Football', 'Futsal', 'Cricket', 'Basketball', 'Volleyball', 'Badminton', 'Table Tennis', 'Chess', 'Carrom', 'Tug of War', 'Kho-Kho', 'Athletics'];

const calculateStandings = (matchesData) => {
  const standings = {};
  matchesData.forEach(m => {
     if(m.status !== 'Completed' || !m.teamB || m.sport === 'Cricket') return;
     if(!standings[m.sport]) standings[m.sport] = {};
     const group = m.group || 'Group Stage';
     if(!standings[m.sport][group]) standings[m.sport][group] = {};
     
     const initTeam = (n) => { if(!standings[m.sport][group][n]) standings[m.sport][group][n] = { team: n, p:0, w:0, l:0, d:0, pts:0 }; };
     initTeam(m.teamA); initTeam(m.teamB);
     const tA = standings[m.sport][group][m.teamA]; const tB = standings[m.sport][group][m.teamB];
     tA.p++; tB.p++;

     const isSetBased = ['Volleyball', 'Badminton', 'Table Tennis'].includes(m.sport);
     let scoreA = 0; let scoreB = 0;

     if (isSetBased) {
         scoreA = m.scoreA?.sets || 0;
         scoreB = m.scoreB?.sets || 0;
     } else {
         const type = (m.sport === 'Football' || m.sport === 'Futsal') ? 'goals' : 'points';
         scoreA = m.scoreA?.[type] || 0;
         scoreB = m.scoreB?.[type] || 0;
     }

     if (m.winner === m.teamA || (scoreA > scoreB && !m.winner)) { tA.w++; tB.l++; tA.pts+=3; }
     else if (m.winner === m.teamB || (scoreB > scoreA && !m.winner)) { tB.w++; tA.l++; tB.pts+=3; }
     else { tA.d++; tB.d++; tA.pts++; tB.pts++; }
  });

  const formatted = {};
  Object.keys(standings).forEach(sport => {
    formatted[sport] = {};
    Object.keys(standings[sport]).forEach(group => {
       formatted[sport][group] = Object.values(standings[sport][group]).sort((a,b) => b.pts - a.pts || b.w - a.w);
    });
  });
  return formatted;
};

const calculateCurrentTime = (match) => {
  if (!match.isTimerRunning) return match.timerElapsed || 0;
  const now = new Date().getTime();
  const updated = new Date(match.timerUpdatedAt || Date.now()).getTime();
  return (match.timerElapsed || 0) + Math.floor((now - updated) / 1000);
};

const LiveClock = ({ match }) => {
  const [time, setTime] = useState(calculateCurrentTime(match));
  useEffect(() => {
    setTime(calculateCurrentTime(match));
    if (match.isTimerRunning && match.status === 'Live') {
      const interval = setInterval(() => setTime(calculateCurrentTime(match)), 1000);
      return () => clearInterval(interval);
    }
  }, [match.isTimerRunning, match.timerElapsed, match.timerUpdatedAt, match.status]);
  const mins = Math.floor(time / 60).toString().padStart(2, '0');
  const secs = (time % 60).toString().padStart(2, '0');
  return <span className="font-mono tracking-widest">{mins}:{secs}</span>;
};

const StudentDashboard = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'live');
  const [matches, setMatches] = useState([]);
  const [pointsTable, setPointsTable] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedSport, setSelectedSport] = useState('Football');
  const [filterSport, setFilterSport] = useState('All'); 
  const { width, height } = useWindowSize();

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' }); 
    }
  }, [location.state]);

  const fetchData = async () => {
    try {
      const [resM, resH] = await Promise.all([ fetch(`${API_URL}/api/matches`), fetch(`${API_URL}/api/houses`) ]);
      const matchesData = await resM.json();
      setMatches(matchesData);
      
      const hData = await resH.json();
      const defaultHouses = HOUSES.map(name => ({ name, points: 0 }));
      setLeaderboard(hData.length > 0 ? hData : defaultHouses);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (matches.length > 0) {
      setPointsTable(calculateStandings(matches));
    }
  }, [matches]);

  useEffect(() => {
    fetchData();
    socket.on('matchUpdated', (updatedMatch) => {
      setMatches(prev => prev.map(m => m._id === updatedMatch._id ? updatedMatch : m));
    });
    socket.on('matchesUpdated', fetchData); 
    socket.on('leaderboardUpdated', fetchData);
    return () => { socket.off('matchUpdated'); socket.off('matchesUpdated'); socket.off('leaderboardUpdated'); };
  }, []);

  const recentCompleted = matches.filter(m => m.status === 'Completed').slice(-3).map(m => m.winner ? `🏆 ${m.winner} wins ${m.sport}` : `🏆 ${m.sport} completed`);
  const upcomingMatches = matches.filter(m => m.status === 'Upcoming').slice(0, 3).map(m => `⏰ UPCOMING: ${m.sport} @ ${m.time}`);
  const tickerItems = [...recentCompleted, ...upcomingMatches].join(" ✦ ");

  const filteredMatches = matches.filter(m => m.status === (activeTab === 'live' ? 'Live' : activeTab === 'upcoming' ? 'Upcoming' : 'Completed') && (filterSport === 'All' || m.sport === filterSport));
  const displayMatches = activeTab === 'finished' ? [...filteredMatches].reverse() : filteredMatches;

  return (
    <div className="bg-[#0a0f1c] min-h-full w-full overflow-x-hidden text-slate-200 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-800 via-[#0a0f1c] to-black font-sans pb-20">
      
      <div className="bg-[#5E9BFF]/10 border-b border-[#5E9BFF]/20 text-[#5E9BFF] py-2 overflow-hidden flex items-center relative z-30 w-full">
        <style>{`@keyframes marquee { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } } .animate-marquee { display: inline-block; white-space: nowrap; animation: marquee 25s linear infinite; }`}</style>
        <div className="animate-marquee font-black uppercase text-[9px] md:text-[10px] tracking-[0.2em]">
           {tickerItems || "WELCOME TO ANNUAL SPORTS MEET 2026 ✦ CELEBRATING ATHLETIC EXCELLENCE"}
        </div>
      </div>

      {activeTab === 'leaderboard' && <Confetti width={width} height={height} recycle={false} numberOfPieces={600} gravity={0.15} colors={['#5E9BFF', '#FF9B54', '#ffffff']} />}

      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12 px-3 md:px-4 mt-6">
        
        <div className="text-center space-y-3 md:space-y-4 py-8 md:py-10 relative">
          <Trophy size={100} className="absolute left-4 top-4 md:left-10 md:top-10 text-slate-800/30 -rotate-12 blur-[1px] md:blur-[2px] hidden sm:block" />
          <Medal size={100} className="absolute right-4 top-4 md:right-10 md:top-10 text-slate-800/30 rotate-12 blur-[1px] md:blur-[2px] hidden sm:block" />
          
          <h1 className="text-4xl sm:text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none text-[#5E9BFF] drop-shadow-[0_0_20px_rgba(94,155,255,0.3)]">
            NIT Nagaland
          </h1>
          <h1 className="text-4xl sm:text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none text-[#FF9B54] drop-shadow-[0_0_20px_rgba(255,155,84,0.3)]">
            Sports Arena
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-[#5E9BFF] mt-2 md:mt-4">Where Passion Meets Performance <span className="text-slate-500 hidden md:inline">|</span></p>
          <p className="text-slate-400 font-medium max-w-2xl mx-auto text-xs sm:text-sm md:text-lg mt-1 md:mt-2 px-2">Celebrating athletic excellence and the spirit of competition at NIT Nagaland.</p>
          
          <div className="flex flex-wrap justify-center gap-3 md:gap-4 mt-6 md:mt-8 pt-4 md:pt-6 px-4">
            <button onClick={() => setActiveTab('points table')} className="bg-[#5E9BFF] text-slate-900 px-6 py-3 md:px-8 md:py-4 rounded-xl font-black flex items-center gap-2 shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:bg-blue-400 transition text-xs md:text-sm"><Zap size={16}/> Explore</button>
            <button onClick={() => setActiveTab('upcoming')} className="bg-transparent border-2 border-[#FF9B54] text-[#FF9B54] px-6 py-3 md:px-8 md:py-4 rounded-xl font-black flex items-center gap-2 hover:bg-[#FF9B54]/10 transition text-xs md:text-sm"><Calendar size={16}/> Schedule</button>
          </div>
        </div>

        <div className="flex justify-start lg:justify-center overflow-x-auto gap-2 border-b border-slate-800 pb-px hide-scrollbar w-full px-2">
          {[
            { id: 'live', label: 'Live', icon: <Activity size={16}/> },
            { id: 'upcoming', label: 'Schedule', icon: <Calendar size={16}/> },
            { id: 'finished', label: 'Results', icon: <CheckCircle size={16}/> },
            { id: 'points table', label: 'Standings', icon: <ListOrdered size={16}/> },
            { id: 'leaderboard', label: 'Champion', icon: <Trophy size={16}/> }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3.5 md:px-8 md:py-5 font-black text-[10px] md:text-xs uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-[#5E9BFF] text-[#5E9BFF]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              {tab.icon} <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 md:mt-8">
          {(activeTab === 'live' || activeTab === 'upcoming' || activeTab === 'finished') && (
            <>
              <div className="flex justify-center mb-6 md:mb-8 px-4 w-full max-w-sm mx-auto">
                <div className="relative w-full">
                  <select 
                    value={filterSport} 
                    onChange={(e) => setFilterSport(e.target.value)} 
                    className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-[#5E9BFF] p-3.5 md:p-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] outline-none focus:border-[#5E9BFF] transition-all cursor-pointer appearance-none shadow-lg text-center"
                  >
                    <option value="All">All Sports</option>
                    {SPORTS_LIST.map(sport => (
                      <option key={sport} value={sport}>{sport}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5E9BFF] pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                {displayMatches.length > 0 ? (
                  displayMatches.map(match => (
                    <StudentMatchCard key={match._id} match={match} />
                  ))
                ) : (
                  <div className="col-span-full py-16 md:py-20 text-center bg-slate-900/50 rounded-[2rem] md:rounded-[3rem] border border-slate-800 backdrop-blur-md mx-2">
                    <Search size={40} className="mx-auto text-slate-700 mb-3 md:mb-4" />
                    <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] md:text-xs">No {filterSport !== 'All' ? filterSport : activeTab} matches found</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'points table' && (
            <div className="space-y-6 md:space-y-8 w-full px-1">
              <div className="flex justify-center mb-6 px-4 w-full max-w-sm mx-auto">
                <div className="relative w-full">
                  <select 
                    value={selectedSport} 
                    onChange={(e) => setSelectedSport(e.target.value)} 
                    className="w-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-[#5E9BFF] p-3.5 md:p-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] outline-none focus:border-[#5E9BFF] transition-all cursor-pointer appearance-none shadow-lg text-center"
                  >
                    {SPORTS_LIST.map(sport => (
                      <option key={sport} value={sport}>{sport}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5E9BFF] pointer-events-none" />
                </div>
              </div>

              {selectedSport === 'Cricket' ? (
                <div className="bg-slate-900/50 p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] border border-slate-800 text-center space-y-4 md:space-y-6 max-w-2xl mx-auto backdrop-blur-md">
                  <div className="bg-[#5E9BFF]/20 w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto rotate-12 border border-[#5E9BFF]/30 shadow-[0_0_30px_rgba(94,155,255,0.2)]"><Trophy size={32} className="text-[#5E9BFF] md:w-10 md:h-10"/></div>
                  <div><h2 className="text-xl md:text-3xl font-black text-white uppercase italic tracking-tight">Cricket Standings</h2><p className="text-slate-400 font-medium mt-2 md:mt-3 px-2 md:px-6 leading-relaxed text-xs md:text-base">Detailed team statistics, net run rates, and group standings for Cricket are managed exclusively on the CricHeroes platform.</p></div>
                  <a href="https://cricheroes.in/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 md:gap-3 bg-[#FF9B54] text-slate-900 px-6 py-3 md:px-10 md:py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-400 transition shadow-[0_0_20px_rgba(255,155,84,0.4)]">Open CricHeroes <ExternalLink size={16}/></a>
                </div>
              ) : selectedSport === 'Athletics' ? (
                <div className="bg-slate-900/50 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-800 overflow-hidden backdrop-blur-md w-full">
                  <div className="bg-slate-800/80 text-white px-5 py-4 md:px-8 md:py-5 font-black uppercase text-[9px] md:text-[10px] tracking-[0.3em] border-b border-slate-700">Athletics Winners History</div>
                  {matches.filter(m => ['Marathon', 'High Jump', 'Long Jump', 'Skipping', 'Shotput'].includes(m.sport) && m.status === 'Completed').length > 0 ? (
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-[500px]">
                        <thead className="bg-slate-900/50 font-black text-[9px] md:text-[10px] uppercase text-slate-500"><tr><th className="px-5 md:px-8 py-4 md:py-5">Event</th><th className="px-5 md:px-8 py-4 md:py-5 text-center">Gold (Winner)</th><th className="px-5 md:px-8 text-center">Result Summary</th></tr></thead>
                        <tbody className="divide-y divide-slate-800">
                          {matches.filter(m => ['Marathon', 'High Jump', 'Long Jump', 'Skipping', 'Shotput'].includes(m.sport) && m.status === 'Completed').map((m, i) => (
                            <tr key={i} className="hover:bg-slate-800/50 transition"><td className="px-5 md:px-8 py-4 md:py-5 font-black text-white">{m.teamA}</td><td className="px-5 md:px-8 py-4 md:py-5 text-center font-black text-yellow-400 bg-yellow-500/10 tracking-tight">{m.winner || 'TBA'}</td><td className="px-5 md:px-8 py-4 md:py-5 text-center font-bold text-slate-400">{m.resultSummary || 'N/A'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="py-16 md:py-20 text-center text-slate-500 font-black uppercase tracking-widest text-[9px] md:text-[10px]">No Athletics results recorded yet</div>}
                </div>
              ) : pointsTable[selectedSport] && Object.keys(pointsTable[selectedSport]).length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 w-full">
                  {Object.entries(pointsTable[selectedSport]).map(([group, teams]) => (
                    <div key={group} className="bg-slate-900/50 rounded-[1.5rem] md:rounded-[2rem] border border-slate-800 overflow-hidden backdrop-blur-md w-full">
                      <div className="bg-slate-800/80 text-[#5E9BFF] px-5 py-3 md:px-8 md:py-4 font-black uppercase text-[9px] md:text-[10px] tracking-[0.3em] border-b border-slate-700">{group}</div>
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-xs md:text-sm whitespace-nowrap min-w-[450px]">
                          <thead className="bg-slate-900/50 font-black text-[9px] md:text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="px-4 md:px-8 py-3 md:py-5">Team</th>
                              <th className="px-2 md:px-3 text-center" title="Played">P</th>
                              <th className="px-2 md:px-3 text-center text-emerald-400" title="Won">W</th>
                              <th className="px-2 md:px-3 text-center text-rose-400" title="Lost">L</th>
                              <th className="px-2 md:px-3 text-center text-slate-400" title="Draw">D</th>
                              <th className="px-4 md:px-8 text-center text-[#5E9BFF]" title="Points">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teams.map((t, i) => (
                              <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/50 transition">
                                <td className="px-4 md:px-8 py-4 md:py-5 font-black text-white whitespace-normal break-words max-w-[200px] leading-tight">{t.team}</td>
                                <td className="px-2 md:px-3 py-4 md:py-5 text-center font-bold text-slate-400">{t.p}</td>
                                <td className="px-2 md:px-3 py-4 md:py-5 text-center text-emerald-400 font-black">{t.w}</td>
                                <td className="px-2 md:px-3 py-4 md:py-5 text-center text-rose-400 font-black">{t.l}</td>
                                <td className="px-2 md:px-3 py-4 md:py-5 text-center text-slate-400 font-bold">{t.d}</td>
                                <td className="px-4 md:px-8 py-4 md:py-5 text-center font-black bg-blue-900/20 text-[#5E9BFF]">{t.pts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-16 md:py-20 text-center bg-slate-900/50 rounded-[2rem] md:rounded-[3rem] border border-slate-800 backdrop-blur-md w-full"><Search size={32} className="mx-auto text-slate-700 mb-3 md:mb-4 md:w-10 md:h-10" /><p className="text-slate-500 font-black uppercase tracking-widest text-[9px] md:text-[10px]">No Standings for {selectedSport}</p></div>}
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-500 w-full px-1">
              
              <div className="bg-slate-900/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] p-4 md:p-8 border border-slate-800 shadow-2xl w-full">
                 <h3 className="font-black text-slate-400 uppercase tracking-widest text-[10px] md:text-xs mb-4 md:mb-6 text-center">Championship Graph</h3>
                 <div className="w-full overflow-x-auto hide-scrollbar">
                   <div className="min-w-[400px]">
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[...leaderboard].sort((a,b) => b.points - a.points)} margin={{ top: 30, right: 10, left: 10, bottom: 5 }}>
                          <YAxis hide />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 900}} 
                            interval={0} 
                            tickFormatter={(value) => value ? value.split(' ')[0] : ''} 
                          />
                          <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{borderRadius: '1rem', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontWeight: 900}} />
                          <Bar dataKey="points" radius={[12, 12, 12, 12]} maxBarSize={60} label={{ position: 'top', fill: '#f8fafc', fontSize: 14, fontWeight: 900 }}>
                             {[...leaderboard].sort((a,b) => b.points - a.points).map((entry, index) => {
                                const barColor = entry?.name?.includes('Red') ? '#ef4444' : entry?.name?.includes('Blue') ? '#5E9BFF' : entry?.name?.includes('Black') ? '#334155' : entry?.name?.includes('Yellow') ? '#FF9B54' : entry?.name?.includes('Grey') ? '#94a3b8' : '#cbd5e1';
                                return <Cell key={`cell-${index}`} fill={barColor} />;
                             })}
                          </Bar>
                        </BarChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] border border-slate-800 overflow-hidden shadow-2xl w-full">
                <div className="bg-slate-800/50 text-[#5E9BFF] px-6 md:px-10 py-4 md:py-6 font-black uppercase text-[10px] md:text-xs tracking-[0.4em] text-center border-b border-slate-700">Final Rankings</div>
                <ul className="divide-y divide-slate-800">
                  {leaderboard.length > 0 && [...leaderboard].sort((a,b) => b.points - a.points).map((house, index) => (
                    <li key={house._id || index} className="p-5 md:p-8 flex flex-row justify-between items-center hover:bg-slate-800/50 transition gap-3">
                      <div className="flex items-center gap-3 md:gap-8 flex-1">
                        <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex shrink-0 items-center justify-center font-black text-sm md:text-lg shadow-sm border ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : index === 1 ? 'bg-slate-300/20 text-slate-300 border-slate-300/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                          {index < 3 ? <Medal size={20} className="md:w-6 md:h-6"/> : `#${index+1}`}
                        </div>
                        <p className="text-sm md:text-2xl font-black text-white uppercase tracking-tight leading-tight">{house?.name?.replace('House', '')}</p>
                      </div>
                      <div className={`bg-blue-600/20 border border-blue-500/30 px-4 md:px-10 py-2.5 md:py-4 rounded-xl md:rounded-3xl text-center shadow-[0_0_20px_rgba(94,155,255,0.2)] shrink-0`}>
                        <p className="text-xl md:text-3xl font-black text-[#5E9BFF]">{house.points || 0}</p>
                        <p className="text-[7px] md:text-[8px] uppercase font-bold text-[#5E9BFF]/70 tracking-widest md:mt-1">Pts</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StudentMatchCard = ({ match }) => {
  const isFinished = match.status === 'Completed';
  const isCricket = match.sport === 'Cricket';
  const scoreType = (match.sport === 'Football' || match.sport === 'Futsal') ? 'goals' : 'points';
  const hasTimer = SPORTS_CONFIG[match.sport]?.hasTimer;
  const hasServe = SPORTS_CONFIG[match.sport]?.hasServe;

  return (
    <div className={`bg-slate-900/60 backdrop-blur-md rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-800 p-5 md:p-8 flex flex-col justify-between hover:border-slate-600 transition-all duration-300 w-full ${isFinished ? 'opacity-75 grayscale-20' : ''}`}>
      <div className="flex justify-between border-b border-slate-800 pb-3 md:pb-4 mb-4 md:mb-6 items-center">
        <span className={`text-[8px] md:text-[10px] font-black text-[#5E9BFF] uppercase tracking-[0.2em] bg-[#5E9BFF]/10 border border-[#5E9BFF]/20 px-2 md:px-3 py-1 rounded-md md:rounded-lg truncate max-w-[55%] md:max-w-[60%]`}>
          {match.sport} • {match.category}
        </span>
        {isFinished ? (
          <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase flex items-center gap-1 md:gap-1.5 whitespace-nowrap"><CheckCircle size={10} className="md:w-3 md:h-3"/> FINISHED</span>
        ) : match.status === 'Live' ? (
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="text-rose-500 font-black animate-pulse text-[8px] md:text-[10px] uppercase flex items-center drop-shadow-[0_0_8px_rgba(244,63,94,0.8)] whitespace-nowrap">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-rose-500 rounded-full mr-1 md:mr-1.5"/> LIVE
            </span>
            {hasTimer && (
              <div className="bg-slate-800 text-white px-1.5 md:px-2 py-0.5 rounded flex items-center shadow-inner border border-slate-700 whitespace-nowrap text-[10px] md:text-base">
                <LiveClock match={match} />
                {match.extraTime > 0 && <span className="text-[7px] md:text-[9px] font-black ml-1 md:ml-1.5 text-[#FF9B54]">+{match.extraTime}' ET</span>}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{match.group}</span>
        )}
      </div>
      
      <div className="text-center w-full overflow-hidden flex-1 flex flex-col justify-center">
        {isCricket ? (
          <div className="space-y-4 md:space-y-6">
            <div className="flex justify-center items-center gap-2 md:gap-6 font-black text-sm md:text-xl text-white uppercase tracking-tighter w-full">
              <span className={`w-[45%] text-right break-words leading-tight ${isFinished && match.winner === match.teamA ? 'text-[#5E9BFF]' : ''}`}>{match.teamA}</span>
              <span className="text-slate-600 text-[10px] md:text-xs font-normal italic w-[10%]">vs</span>
              <span className={`w-[45%] text-left break-words leading-tight ${isFinished && match.winner === match.teamB ? 'text-[#5E9BFF]' : ''}`}>{match.teamB}</span>
            </div>
            
            {isFinished ? (
              <div className="bg-slate-800/50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-700">
                <p className={`text-[#5E9BFF] font-black text-sm md:text-lg uppercase tracking-tight break-words px-2`}>{match.winner} WON</p>
                <p className="text-slate-400 text-[8px] md:text-[10px] font-bold uppercase tracking-widest mt-1 truncate">{match.resultSummary || 'Match Completed'}</p>
                <a href={match.cricHeroesLink} target="_blank" rel="noreferrer" className="text-[8px] md:text-[9px] font-black text-slate-400 hover:text-[#5E9BFF] uppercase mt-3 md:mt-4 flex items-center justify-center gap-1 transition">Full Scorecard <ExternalLink size={10}/></a>
              </div>
            ) : (
              <a href={match.cricHeroesLink} target="_blank" rel="noreferrer" className="bg-[#FF9B54]/10 text-[#FF9B54] border border-[#FF9B54]/30 w-full py-3 md:py-4 rounded-xl md:rounded-2xl flex justify-center items-center gap-1.5 md:gap-2 font-black text-[10px] md:text-xs uppercase tracking-widest hover:bg-[#FF9B54]/20 transition">CricHeroes Live <ExternalLink size={14} className="md:w-4 md:h-4"/></a>
            )}
          </div>
        ) : match.teamB ? (
          <div className="flex flex-col w-full h-full justify-between">
            <div className="flex justify-between items-start text-center w-full">
              
              <div className="w-[45%] md:w-5/12 flex flex-col items-center relative">
                {hasServe && match.servingTeam === 'A' && <CircleDot size={12} className="text-[#FF9B54] absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 animate-bounce drop-shadow-[0_0_8px_rgba(255,155,84,0.8)] md:w-[14px] md:h-[14px]" />}
                <h3 className={`font-black text-[9px] md:text-[11px] uppercase tracking-tight break-words leading-tight ${isFinished && match.winner === match.teamA ? 'text-[#5E9BFF]' : 'text-white'}`}>
                  {match.teamA}
                </h3>
                
                {match.status !== 'Upcoming' && (
                  <div className="text-3xl md:text-5xl font-black text-white tracking-tighter drop-shadow-md">
                    {/* NOW THIS WILL CORRECTLY FIND 'points_and_sets' and SHOW THE SET COUNT INSTEAD OF 0 */}
                    {SPORTS_CONFIG[match.sport]?.scoreUI === 'points_and_sets' && isFinished 
                      ? (match.scoreA?.sets || 0) 
                      : (match.scoreA?.[scoreType] || 0)}
                  </div>
                )}
                
                {SPORTS_CONFIG[match.sport]?.scoreUI === 'points_and_sets' && isFinished ? (
                   <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Sets Won</span>
                ) : (
                   match.scoreA?.sets > 0 && <span className={`text-[8px] md:text-[10px] font-bold text-[#5E9BFF] uppercase mt-1`}>Sets: {match.scoreA.sets}</span>
                )}
              </div>

              <div className="w-[10%] md:w-2/12 text-[8px] md:text-[10px] font-black text-slate-600 uppercase italic mt-2 md:mt-3">VS</div>
              
              <div className="w-[45%] md:w-5/12 flex flex-col items-center relative">
                {hasServe && match.servingTeam === 'B' && <CircleDot size={12} className="text-[#FF9B54] absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 animate-bounce drop-shadow-[0_0_8px_rgba(255,155,84,0.8)] md:w-[14px] md:h-[14px]" />}
                <h3 className={`font-black text-[9px] md:text-[11px] uppercase tracking-tight break-words leading-tight ${isFinished && match.winner === match.teamB ? 'text-[#5E9BFF]' : 'text-white'}`}>
                  {match.teamB}
                </h3>
                
                {match.status !== 'Upcoming' && (
                  <div className="text-3xl md:text-5xl font-black text-white tracking-tighter drop-shadow-md">
                    {/* NOW THIS WILL CORRECTLY FIND 'points_and_sets' and SHOW THE SET COUNT INSTEAD OF 0 */}
                    {SPORTS_CONFIG[match.sport]?.scoreUI === 'points_and_sets' && isFinished 
                      ? (match.scoreB?.sets || 0) 
                      : (match.scoreB?.[scoreType] || 0)}
                  </div>
                )}
                
                {SPORTS_CONFIG[match.sport]?.scoreUI === 'points_and_sets' && isFinished ? (
                   <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Sets Won</span>
                ) : (
                   match.scoreB?.sets > 0 && <span className={`text-[8px] md:text-[10px] font-bold text-[#5E9BFF] uppercase mt-1`}>Sets: {match.scoreB.sets}</span>
                )}
              </div>
            </div>

            {match.setHistory && match.setHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800/50 flex flex-col items-center w-full">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Recorded Sets</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {match.setHistory.map((set, idx) => (
                    <div key={idx} className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs font-black shadow-inner">
                      <span className={set.scoreA > set.scoreB ? 'text-[#5E9BFF]' : 'text-slate-400'}>{set.scoreA}</span>
                      <span className="text-slate-600">v</span>
                      <span className={set.scoreB > set.scoreA ? 'text-[#5E9BFF]' : 'text-slate-400'}>{set.scoreB}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {isFinished && (match.winner || match.resultSummary) && (
              <div className="mt-4 pt-3 md:pt-4 border-t border-slate-800 text-center w-full">
                 <p className="text-[#5E9BFF] font-black text-[10px] md:text-xs uppercase tracking-tight break-words px-2">
                    {match.winner ? `${match.winner} WON` : 'MATCH DRAW / FINISHED'}
                 </p>
                 {match.resultSummary && <p className="text-slate-400 text-[8px] md:text-[10px] font-bold uppercase tracking-widest mt-1">{match.resultSummary}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 md:py-6 bg-slate-800/50 rounded-xl md:rounded-2xl border border-slate-700 w-full">
             <p className="text-base md:text-xl font-black text-white uppercase tracking-tighter break-words leading-tight px-2">{match.teamA}</p>
             {isFinished && match.winner ? (
               <div className="mt-3 md:mt-4 flex flex-col items-center gap-1.5 md:gap-2">
                 <div className="bg-yellow-500/20 p-1.5 md:p-2 rounded-full border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)]"><Trophy size={16} className="text-yellow-400 md:w-5 md:h-5"/></div>
                 <p className={`text-[10px] md:text-xs font-black text-[#5E9BFF] uppercase tracking-widest mt-1 break-words max-w-full px-2 leading-tight`}>{match.winner} (Gold)</p>
               </div>
             ) : (
               <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 md:mt-2">Individual Event</p>
             )}
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-800 w-full flex justify-center">
         <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex flex-col sm:flex-row items-center gap-1 sm:gap-2">
           <span className="flex items-center gap-1.5"><Calendar size={12} /> {match.date} @ {match.time}</span>
           <span className="hidden sm:inline text-slate-700">•</span>
           <span className="flex items-center gap-1.5 text-[#FF9B54]"><MapPin size={12}/> {match.venue || 'Main Ground'}</span>
         </span>
      </div>
    </div>
  );
};

export default StudentDashboard;