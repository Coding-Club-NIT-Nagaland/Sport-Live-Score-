import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Calendar, PlusCircle, Medal, LogOut, Flag, Minus, Plus, Trash2, CheckCircle, X, Search, Play, Pause, RotateCcw, CircleDot, Edit3, AlertTriangle, ShieldCheck, UserCircle, MapPin, ChevronDown } from "lucide-react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_BACKEND_URL;
// SAFE SOCKET CONFIGURATION (DO NOT CHANGE)
const socket = io(API_URL, {
  transports: [ 'websocket','polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

const HOUSES = ['Wolves', 'Panthers', 'Red Ravens', 'Stallions', 'Orca'];
const HOUSE_TEAMS = [
  ...HOUSES.flatMap((house) => [`${house} - Team A`, `${house}`, `${house} - Team B`]),
  'Faculty Team'
];

const VENUES = [
  'Football Ground', 'volleyball Court', 'Basketball court', 
  'Badminton Court', 'dzukou hostel', 'Shilloi b Hostel', 
  'BCR 4', 'BCR 5', 'Sports complex(rostrum)'
];

const SPORTS_CONFIG = {
  Football: { categories: ["Men"], type: "HeadToHead", scoreUI: "goals", hasTimer: true },
  Futsal: { categories: ["Women"], type: "HeadToHead", scoreUI: "goals", hasTimer: true },
  Cricket: { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "none", hasTimer: false },
  Basketball: { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "basketball", hasTimer: true },
  Volleyball: { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "points_and_sets", hasTimer: false },
  Badminton: { categories: [ "Men Singles", "Women Singles", "Men Doubles", "Women Doubles" ], type: "HeadToHead", scoreUI: "points_and_sets", hasTimer: false, hasServe: true },
  Carrom: { categories: ["Men Singles", "Women Doubles"], type: "HeadToHead", scoreUI: "points", hasTimer: false },
  Chess: { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "points", hasTimer: false },
  "Table Tennis": { categories: ["Singles", "Doubles"], type: "HeadToHead", scoreUI: "points_and_sets", hasTimer: false, hasServe: true },
  "Tug of War": { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "points", hasTimer: true },
  "Kho-Kho": { categories: ["Men", "Women"], type: "HeadToHead", scoreUI: "points", hasTimer: true },
  Marathon: { categories: ["Unlimited"], type: "Athletics", scoreUI: "none", hasTimer: false },
  "High Jump": { categories: ["Men", "Women"], type: "Athletics", scoreUI: "none", hasTimer: false },
  "Long Jump": { categories: ["Men", "Women"], type: "Athletics", scoreUI: "none", hasTimer: false },
  Skipping: { categories: ["Men", "Women"], type: "Athletics", scoreUI: "none", hasTimer: false },
  Shotput: { categories: ["Men", "Women"], type: "Athletics", scoreUI: "none", hasTimer: false },
};

const calculateCurrentTime = (match) => {
  if (!match.isTimerRunning) return match.timerElapsed || 0;
  const now = new Date().getTime();
  const updated = new Date(match.timerUpdatedAt || Date.now()).getTime();
  const diff = Math.floor((now - updated) / 1000);
  return (match.timerElapsed || 0) + diff;
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
  return <span className="font-mono tabular-nums text-lg">{mins}:{secs}</span>;
};

const AdminDashboard = ({ setIsAuthenticated }) => {
  const [activeTab, setActiveTab] = useState("live");
  const [matches, setMatches] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: "", type: "" });
  const navigate = useNavigate(); 

  const rawAccess = localStorage.getItem('sportAccess') || localStorage.getItem('adminSportAccess');
  const adminSportAccess = (rawAccess && rawAccess !== "undefined") ? rawAccess : 'Restricted';
  const adminName = localStorage.getItem('adminName') || 'Council Member';

  const SPORT_ALIASES = {
    'Indoor Games': ['Carrom', 'Chess', 'Table Tennis'],
    'Fitness': ['Tug of War', 'Kho-Kho', 'Marathon', 'High Jump', 'Long Jump', 'Skipping', 'Shotput']
  };

  const closeResolveModal = () => {
    setResolvingMatch(null);
    setAthleticsResult({ winner: "", runnerUp: "", thirdPlace: "" });
    setHousePointsAllocation(HOUSES.map((name) => ({ name, points: 0 })));
    setResultSummary("");
    setPenalties({ A: 0, B: 0 });
  };

  let allowedSports = [];
  if (adminSportAccess === 'All') {
    allowedSports = Object.keys(SPORTS_CONFIG);
  } else if (SPORT_ALIASES[adminSportAccess]) {
    allowedSports = SPORT_ALIASES[adminSportAccess];
  } else if (SPORTS_CONFIG[adminSportAccess]) {
    allowedSports = [adminSportAccess];
  } else {
    allowedSports = ["Restricted Access"];
  }
  
  const [resolvingMatch, setResolvingMatch] = useState(null);
  const [resultSummary, setResultSummary] = useState("");
  const [penalties, setPenalties] = useState({ A: 0, B: 0 });
  const [athleticsResult, setAthleticsResult] = useState({ winner: "", runnerUp: "", thirdPlace: "" });
  const [housePointsAllocation, setHousePointsAllocation] = useState(HOUSES.map((name) => ({ name, points: 0 })));

  const [editingMatch, setEditingMatch] = useState(null);
  const [editForm, setEditForm] = useState({ scoreA: 0, scoreB: 0, setsA: 0, setsB: 0, winner: '', resultSummary: '' });

  const defaultSport = allowedSports[0] !== "Restricted Access" ? allowedSports[0] : "";
  const [newMatch, setNewMatch] = useState({
    sport: defaultSport, 
    category: SPORTS_CONFIG[defaultSport]?.categories[0] || "", 
    group: "Group A",
    venue: VENUES[0],
    teamA: HOUSE_TEAMS[0], 
    teamB: HOUSE_TEAMS[2], 
    date: "", time: "", cricHeroesLink: "",
  });

  const fetchMatches = async () => {
    try {
      const res = await fetch(`${API_URL}/api/matches`);
      setMatches(await res.json());
    } catch (err) { console.error("Fetch error:", err); }
  };

  useEffect(() => {
    fetchMatches();
    socket.on("matchUpdated", (updatedMatch) => setMatches((prev) => prev.map((m) => (m._id === updatedMatch._id ? updatedMatch : m))));
    socket.on("matchesUpdated", fetchMatches);
    return () => { socket.off("matchUpdated"); socket.off("matchesUpdated"); };
  }, []);

  const showAlert = (msg, type = "success") => {
    setAlert({ show: true, message: msg, type });
    setTimeout(() => setAlert({ show: false, message: "", type: "" }), 3000);
  };

  const apiCall = async (endpoint, method, body) => {
    const token = localStorage.getItem("token") || localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/${endpoint}`, {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body)
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return null;
      }
      return await res.json();
    } catch (err) { return null; }
  };

  const changeScore = async (id, team, field, delta) => {
    const match = matches.find((m) => m._id === id);
    if (!match) return;
    const scoreData = { ...match[team], [field]: Math.max(0, (match[team][field] || 0) + delta) };
    setMatches((prev) => prev.map((m) => (m._id === id ? { ...m, [team]: scoreData } : m)));
    const updated = await apiCall(`matches/${id}`, "PUT", { [team]: scoreData });
    if (updated && !socket.connected) setMatches((prev) => prev.map((m) => (m._id === id ? updated : m)));
  };

  const toggleServe = async (id, team) => {
    const match = matches.find((m) => m._id === id);
    const newServe = match.servingTeam === team ? null : team; 
    setMatches(prev => prev.map(m => m._id === id ? { ...m, servingTeam: newServe } : m));
    await apiCall(`matches/${id}`, "PUT", { servingTeam: newServe });
  };

  const finishSet = async (match) => {
    const scoreA = match.scoreA?.points || 0;
    const scoreB = match.scoreB?.points || 0;
    
    if (scoreA === scoreB) return alert("A set cannot end in a tie!");
    
    const winner = scoreA > scoreB ? 'A' : 'B';
    const currentSetNum = (match.setHistory?.length || 0) + 1;
    
    const newSetHistory = [
      ...(match.setHistory || []), 
      { setNumber: currentSetNum, scoreA, scoreB }
    ];

    const payload = {
      setHistory: newSetHistory,
      scoreA: { ...match.scoreA, points: 0, sets: (match.scoreA?.sets || 0) + (winner === 'A' ? 1 : 0) },
      scoreB: { ...match.scoreB, points: 0, sets: (match.scoreB?.sets || 0) + (winner === 'B' ? 1 : 0) }
    };

    setMatches(prev => prev.map(m => m._id === match._id ? { ...m, ...payload } : m));
    await apiCall(`matches/${match._id}`, "PUT", payload);
    showAlert(`Set ${currentSetNum} Result Saved`);
  };

  const toggleTimer = async (match) => {
    const now = new Date().toISOString();
    let payload = {};
    if (match.isTimerRunning) {
      const elapsedNow = (match.timerElapsed || 0) + Math.floor((new Date() - new Date(match.timerUpdatedAt)) / 1000);
      payload = { isTimerRunning: false, timerElapsed: elapsedNow, timerUpdatedAt: now };
    } else { payload = { isTimerRunning: true, timerUpdatedAt: now }; }
    setMatches(prev => prev.map(m => m._id === match._id ? { ...m, ...payload } : m));
    await apiCall(`matches/${match._id}`, 'PUT', payload);
  };

  const resetTimer = async (match) => {
    if (window.confirm("Reset match clock to 00:00 and clear Extra Time?")) {
      const payload = { isTimerRunning: false, timerElapsed: 0, timerUpdatedAt: new Date().toISOString(), extraTime: 0 };
      setMatches(prev => prev.map(m => m._id === match._id ? { ...m, ...payload } : m));
      await apiCall(`matches/${match._id}`, 'PUT', payload);
    }
  };

  const updateExtraTime = async (match, mins) => {
    const newET = Math.max(0, (match.extraTime || 0) + mins);
    setMatches(prev => prev.map(m => m._id === match._id ? { ...m, extraTime: newET } : m));
    await apiCall(`matches/${match._id}`, 'PUT', { extraTime: newET });
  };

  const handleDeleteMatch = async (id) => {
    if (window.confirm("Permanently delete this match?")) {
      const res = await apiCall(`matches/${id}`, "DELETE");
      if (res) { showAlert("Match Removed", "success"); fetchMatches(); }
    }
  };

  const handleForfeit = async (match, forfeitingTeam) => {
    const winner = match.teamA === forfeitingTeam ? match.teamB : match.teamA;
    if (window.confirm(`${forfeitingTeam} forfeits. Award victory to ${winner}?`)) {
      await apiCall(`matches/${match._id}/forfeit`, "PUT", { winner, isTimerRunning: false });
      fetchMatches(); showAlert("Forfeit Processed");
    }
  };

  const finalizeMatch = async () => {
    let finalSummary = resultSummary;
    if (!resolvingMatch.teamB) {
      finalSummary = `🥇 1st: ${athleticsResult.winner || "N/A"}, 🥈 2nd: ${athleticsResult.runnerUp || "N/A"}, 🥉 3rd: ${athleticsResult.thirdPlace || "N/A"}`;
    }
    const res = await apiCall(`matches/${resolvingMatch._id}/resolve`, "PUT", {
      penaltiesA: penalties.A, penaltiesB: penalties.B, overallHousePoints: housePointsAllocation,
      resultSummary: finalSummary, winnerOverride: athleticsResult.winner, isTimerRunning: false 
    });
    if (res) {
      closeResolveModal();
      fetchMatches(); showAlert("Result Published!");
    }
  };

  const openEditModal = (match) => {
    setEditingMatch(match);
    const scoreType = SPORTS_CONFIG[match.sport]?.scoreUI === 'goals' ? 'goals' : 'points';
    setEditForm({
      scoreA: match.scoreA?.[scoreType] || 0, scoreB: match.scoreB?.[scoreType] || 0,
      setsA: match.scoreA?.sets || 0, setsB: match.scoreB?.sets || 0,
      winner: match.winner || '', resultSummary: match.resultSummary || ''
    });
  };

  const saveEdit = async () => {
    const config = SPORTS_CONFIG[editingMatch.sport];
    const scoreType = config.scoreUI === 'goals' ? 'goals' : 'points';
    const payload = { winner: editForm.winner, resultSummary: editForm.resultSummary };
    if (config.scoreUI !== 'none') {
      payload.scoreA = { ...editingMatch.scoreA, [scoreType]: parseInt(editForm.scoreA), sets: parseInt(editForm.setsA) };
      payload.scoreB = { ...editingMatch.scoreB, [scoreType]: parseInt(editForm.scoreB), sets: parseInt(editForm.setsB) };
    }
    setMatches(prev => prev.map(m => m._id === editingMatch._id ? { ...m, ...payload } : m));
    await apiCall(`matches/${editingMatch._id}`, 'PUT', payload);
    setEditingMatch(null); showAlert("Match corrected successfully!");
  };

  const getStatusFilter = () => {
    if (activeTab === "live") return "Live";
    if (activeTab === "upcoming") return "Upcoming";
    return "Completed";
  };

  const displayMatches = matches.filter(m => m.status === getStatusFilter() && (adminSportAccess === 'All' || allowedSports.includes(m.sport)));

  const handleLogout = () => {
    localStorage.clear();
    if (setIsAuthenticated) setIsAuthenticated(false);
    navigate("/admin-login");
  };

  return (
    <div className="min-h-screen bg-[#0a0f1c] w-full overflow-x-hidden font-sans text-slate-200 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-900 via-[#0a0f1c] to-black pb-12 px-2 md:px-4 relative">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pt-6 md:pt-8 w-full">
        
        {alert.show && (
          <div className={`fixed top-4 md:top-8 right-4 md:right-8 z-50 flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-right-10 duration-300 ${alert.type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"} border border-white/10`}>
            <CheckCircle size={18} md={20} /> <span className="font-bold uppercase tracking-widest text-[10px] md:text-xs">{alert.message}</span>
          </div>
        )}

        <div className="bg-slate-900/60 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] p-4 md:p-8 text-white flex flex-col lg:flex-row justify-between items-center shadow-2xl gap-6 border border-slate-800 w-full">
          <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 w-full lg:w-auto text-center sm:text-left">
            <div className="bg-blue-600/20 p-4 rounded-3xl border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)] hidden sm:block">
              <ShieldCheck size={32} className="text-[#5E9BFF]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-linear-to-r from-[#5E9BFF] to-[#FF9B54] bg-clip-text text-transparent">Council Control</h1>
              <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">Live Match Management</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 w-full lg:w-auto">
            <button onClick={() => setShowScheduleForm(!showScheduleForm)} className="w-full sm:w-auto bg-[#5E9BFF] text-slate-900 px-6 py-3 md:px-8 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-400 transition active:scale-95 shadow-[0_0_20px_rgba(94,155,255,0.4)] text-sm">
              {showScheduleForm ? <X size={18} /> : <PlusCircle size={18} />} {showScheduleForm ? "Cancel" : "Add Match"}
            </button>
            <div className="flex flex-row items-center gap-3 md:gap-4 pl-0 sm:pl-6 sm:border-l border-slate-700/50 w-full sm:w-auto justify-between sm:justify-start bg-slate-800/30 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none">
              <div className="flex items-center gap-3 text-left sm:text-right">
                <div className="bg-slate-800 p-2 md:p-2.5 rounded-full border border-slate-700 order-first sm:order-last">
                  <UserCircle size={20} className="text-[#5E9BFF] md:w-6 md:h-6" />
                </div>
                <div className="order-last sm:order-first">
                  <p className="text-xs md:text-sm font-black text-white truncate max-w-[100px] md:max-w-[120px]">{adminName}</p>
                  <p className="text-[9px] md:text-[10px] font-bold text-[#FF9B54] uppercase tracking-widest truncate max-w-[100px] md:max-w-[120px]">
                    {adminSportAccess === 'All' ? 'Gen. Secretary' : `${adminSportAccess} Sec.`}
                  </p>
                </div>
              </div>
              <button onClick={handleLogout} className="bg-rose-500/10 text-rose-400 p-2 md:p-3 rounded-xl hover:bg-rose-500 hover:text-white transition border border-rose-500/20 shadow-lg group shrink-0" title="Logout">
                <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {showScheduleForm && (
          <div className="bg-slate-900/80 backdrop-blur-xl p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-700 shadow-2xl animate-in zoom-in-95 duration-200 w-full">
            <form onSubmit={async (e) => { e.preventDefault(); const res = await apiCall("matches", "POST", newMatch); if (res) { fetchMatches(); setShowScheduleForm(false); showAlert("Match Scheduled"); } }} className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-8">
              <div className="md:col-span-6 flex items-center gap-2 md:gap-3 border-b border-slate-800 pb-3 md:pb-4"><PlusCircle size={20} className="text-[#5E9BFF]" /><h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Configure New Event</h2></div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Sport</label>
                <select value={newMatch.sport} onChange={(e) => { const s = e.target.value; setNewMatch({ ...newMatch, sport: s, category: SPORTS_CONFIG[s].categories[0], teamA: SPORTS_CONFIG[s].type === "Athletics" ? `${s} Event` : HOUSE_TEAMS[0], teamB: SPORTS_CONFIG[s].type === "Athletics" ? "" : HOUSE_TEAMS[2] }); }} className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white outline-none focus:border-[#5E9BFF] transition text-sm">
                  {allowedSports.map((s) => (<option key={s}>{s}</option>))}
                </select>
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Category</label>
                <select value={newMatch.category} onChange={(e) => setNewMatch({ ...newMatch, category: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-white outline-none focus:border-[#5E9BFF] transition text-sm">
                  {SPORTS_CONFIG[newMatch.sport]?.categories?.map((c) => (<option key={c}>{c}</option>))}
                </select>
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Stage</label>
                <select value={newMatch.group} onChange={(e) => setNewMatch({ ...newMatch, group: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-white outline-none focus:border-[#5E9BFF] transition text-sm">
                  {["Group A", "Group B","Group C", "Knockout", "Semi-Final", "Final"].map((g) => (<option key={g}>{g}</option>))}
                </select>
              </div>
              
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Venue</label>
                <select value={newMatch.venue} onChange={(e) => setNewMatch({ ...newMatch, venue: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-white outline-none focus:border-[#5E9BFF] transition text-sm">
                  {VENUES.map((v) => (<option key={v} value={v}>{v}</option>))}
                </select>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Date</label>
                <input type="date" value={newMatch.date} onChange={(e) => setNewMatch({ ...newMatch, date: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white outline-none focus:border-[#5E9BFF] color-scheme-dark text-sm" required />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Start Time</label>
                <input type="time" value={newMatch.time} onChange={(e) => setNewMatch({ ...newMatch, time: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white outline-none focus:border-[#5E9BFF] color-scheme-dark text-sm" required />
              </div>

              {SPORTS_CONFIG[newMatch.sport]?.type !== "Athletics" ? (
                <><div className="col-span-1 md:col-span-3"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Team A</label><select value={newMatch.teamA} onChange={(e) => setNewMatch({ ...newMatch, teamA: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white text-sm">{HOUSE_TEAMS.map((h) => (<option key={h} value={h}>{h}</option>))}</select></div><div className="col-span-1 md:col-span-3"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Team B</label><select value={newMatch.teamB} onChange={(e) => setNewMatch({ ...newMatch, teamB: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white text-sm">{HOUSE_TEAMS.map((h) => (<option key={h} value={h}>{h}</option>))}</select></div></>
              ) : <div className="col-span-1 md:col-span-6"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">Event Details</label><input placeholder="e.g. Boys 100m Finals" value={newMatch.teamA} onChange={(e) => setNewMatch({ ...newMatch, teamA: e.target.value }) } className="w-full bg-slate-800 border border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl font-black text-white outline-none focus:border-[#5E9BFF] text-sm" required /></div>}
              
              {newMatch.sport === "Cricket" && <div className="col-span-1 md:col-span-6"><label className="text-[9px] md:text-[10px] font-black text-[#5E9BFF] uppercase tracking-[0.2em] mb-1.5 md:mb-2 block">CricHeroes Link</label><input type="url" placeholder="https://cricheroes.in/..." value={newMatch.cricHeroesLink} onChange={(e) => setNewMatch({ ...newMatch, cricHeroesLink: e.target.value }) } className="w-full bg-[#5E9BFF]/10 text-[#5E9BFF] border border-[#5E9BFF]/30 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold outline-none focus:border-[#5E9BFF] text-sm" /></div>}
              
              <button className="col-span-1 md:col-span-6 bg-[#5E9BFF] text-slate-900 font-black py-4 md:py-5 rounded-2xl md:rounded-3xl shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:bg-blue-400 transition active:scale-[0.98] uppercase tracking-[0.3em] text-[10px] md:text-xs">Push to Live Server</button>
            </form>
          </div>
        )}

        <div className="flex justify-start md:justify-center overflow-x-auto gap-2 border-b border-slate-800 pb-px hide-scrollbar w-full">
          {["live", "upcoming", "finished"].map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex items-center gap-2 px-6 py-4 md:px-8 md:py-5 font-black text-[10px] md:text-xs uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === t ? "border-[#5E9BFF] text-[#5E9BFF] bg-[#5E9BFF]/10 rounded-t-xl md:rounded-t-3xl" : "border-transparent text-slate-500 hover:text-slate-300"}`}>{t} Matches</button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 w-full">
          {displayMatches.length > 0 ? (
            displayMatches.map((match) => {
                const config = SPORTS_CONFIG[match.sport];
                const isFinished = match.status === 'Completed';
                return (
                  <div key={match._id} className={`bg-slate-900/50 backdrop-blur-md p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-800 shadow-xl relative group transition-all duration-500 overflow-hidden w-full ${isFinished ? 'opacity-80 grayscale-20' : 'hover:border-slate-600'}`}>
                    
                    <div className="flex justify-between items-start mb-5 md:mb-6">
                      <div className="flex flex-col gap-1">
                        <span className="font-black text-[#5E9BFF] bg-[#5E9BFF]/10 border border-[#5E9BFF]/20 uppercase text-[9px] md:text-[10px] tracking-[0.2em] px-2.5 py-1 rounded-lg w-fit truncate max-w-[150px] md:max-w-full">{match.sport}</span>
                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.category} • {match.group}</span>
                      </div>
                      <button onClick={() => handleDeleteMatch(match._id)} className="p-1.5 md:p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition"><Trash2 size={18} /></button>
                    </div>

                    {match.status === 'Live' && config?.hasTimer && (
                       <div className="flex flex-col items-center gap-2 md:gap-3 mb-6 md:mb-8">
                         <div className="flex justify-center items-center gap-2 md:gap-4 bg-slate-950 text-white rounded-xl md:rounded-2xl p-2 md:p-3 shadow-inner shadow-black w-max border border-slate-800 mx-auto">
                           <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 border-r border-slate-800">
                              <span className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${match.isTimerRunning ? 'bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.8)]' : 'bg-slate-600'}`}></span>
                              <div className="flex items-center text-sm md:text-lg">
                                 <LiveClock match={match} />
                                 {match.extraTime > 0 && <span className="text-[10px] md:text-xs text-[#FF9B54] font-black ml-1.5 md:ml-2">+{match.extraTime}' ET</span>}
                              </div>
                           </div>
                           <div className="flex gap-1 md:gap-2 px-1 md:px-2">
                             <button onClick={() => toggleTimer(match)} className={`p-2 rounded-lg md:rounded-xl transition ${match.isTimerRunning ? 'bg-[#FF9B54]/20 text-[#FF9B54] hover:bg-[#FF9B54]/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}>
                                {match.isTimerRunning ? <Pause size={16}/> : <Play size={16} className="ml-0.5"/>}
                             </button>
                             <button onClick={() => resetTimer(match)} className="p-2 bg-slate-800 text-slate-400 rounded-lg md:rounded-xl hover:text-white hover:bg-slate-700 transition"><RotateCcw size={16}/></button>
                           </div>
                         </div>
                         <div className="flex gap-2">
                            <button onClick={() => updateExtraTime(match, -1)} className="text-[9px] md:text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-black px-2.5 md:px-3 py-1 rounded-full hover:bg-slate-700 transition">-1 Min ET</button>
                            <button onClick={() => updateExtraTime(match, 1)} className="text-[9px] md:text-[10px] bg-[#FF9B54]/10 text-[#FF9B54] border border-[#FF9B54]/20 font-black px-2.5 md:px-3 py-1 rounded-full hover:bg-[#FF9B54]/20 transition">+1 Min ET</button>
                         </div>
                       </div>
                    )}

                    {match.sport === 'Cricket' && isFinished ? (
                      <div className="text-center py-3 md:py-4 bg-slate-800/50 rounded-xl md:rounded-2xl border border-slate-700">
                         <p className="font-black text-[#5E9BFF] text-base md:text-lg uppercase tracking-tight wrap-break-word leading-tight px-2">{match.winner} WON</p>
                         <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-1">{match.resultSummary}</p>
                      </div>
                    ) : match.teamB ? (
                      <div className="flex justify-between items-start text-center px-0 md:px-2">
                        
                        <div className="w-[45%] md:w-5/12 flex flex-col items-center">
                          <p className={`font-black text-[9px] md:text-xs uppercase mb-3 md:mb-4 wrap-break-word leading-tight ${isFinished && match.winner === match.teamA ? 'text-[#5E9BFF]' : 'text-white'}`}>{match.teamA}</p>
                          
                          {match.status === "Live" && config?.scoreUI !== "none" ? (
                            <div className="bg-slate-800/50 p-2 md:p-5 rounded-2xl md:rounded-4xl border border-slate-700 flex flex-col items-center gap-3 relative w-full">
                              {config?.hasServe && <button onClick={() => toggleServe(match._id, 'A')} className={`absolute top-1 md:top-2 left-1 md:left-2 text-[7px] md:text-[8px] font-black uppercase px-1.5 md:px-2 py-0.5 md:py-1 rounded-full transition shadow-sm ${match.servingTeam === 'A' ? 'bg-[#FF9B54] text-slate-900 shadow-[0_0_10px_rgba(255,155,84,0.5)]' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>Serve</button>}
                              <div className={`flex items-center gap-1.5 md:gap-4 ${config?.hasServe ? 'mt-4' : ''}`}>
                                <button onClick={() => changeScore(match._id, "scoreA", config?.scoreUI === "goals" ? "goals" : "points", -1) } className="p-1 md:p-2 bg-slate-700 text-slate-300 rounded-md md:rounded-xl hover:bg-slate-600"><Minus size={12} /></button>
                                <span className="text-3xl md:text-5xl font-black text-white drop-shadow-md w-8 md:w-auto">{match.scoreA?.points || match.scoreA?.goals || 0}</span>
                                <button onClick={() => changeScore(match._id, "scoreA", config?.scoreUI === "goals" ? "goals" : "points", 1) } className="p-1 md:p-2 bg-[#5E9BFF] text-slate-900 rounded-md md:rounded-xl shadow-[0_0_15px_rgba(94,155,255,0.4)]"><Plus size={12} /></button>
                              </div>
                              {config?.scoreUI === "points_and_sets" && (
                                <div className="flex items-center gap-1.5 md:gap-3 bg-slate-900/50 px-2 md:px-4 py-1 md:py-1.5 rounded-full border border-slate-700 mt-2">
                                  <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase">Sets</span><span className="text-[10px] md:text-sm font-black text-[#5E9BFF]">{match.scoreA?.sets || 0}</span>
                                  <button onClick={() => changeScore(match._id, "scoreA", "sets", 1) } className="text-[#5E9BFF]"><Plus size={10} /></button>
                                </div>
                              )}
                              
                              {config?.scoreUI === "points_and_sets" && match.status === 'Live' && (
                                <button onClick={() => finishSet(match)} className="mt-3 bg-emerald-500/10 text-emerald-400 font-black text-[8px] md:text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-xl border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition w-full shadow-sm">
                                  End Set
                                </button>
                              )}
                              <button onClick={() => handleForfeit(match, match.teamA)} className="text-[7px] md:text-[9px] text-rose-500/70 font-black uppercase flex items-center gap-1 mt-2 hover:text-rose-500 transition"><Flag size={8} /> Forfeit</button>
                            </div>
                          ) : match.status === 'Completed' && config?.scoreUI !== "none" ? (
                            <div className="py-2 md:py-4">
                              <div className="text-4xl md:text-5xl font-black text-white tracking-tighter drop-shadow-md">
                                {config?.scoreUI === 'points_and_sets' ? (match.scoreA?.sets || 0) : (match.scoreA?.points || match.scoreA?.goals || 0)}
                              </div>
                              {config?.scoreUI === 'points_and_sets' ? (
                                <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 md:mt-2 block">Sets Won</span>
                              ) : (
                                match.scoreA?.sets > 0 && <span className="text-[8px] md:text-[10px] font-bold text-[#5E9BFF] uppercase mt-1 md:mt-2 block">Sets: {match.scoreA.sets}</span>
                              )}
                            </div>
                          ) : <div className="h-20 md:h-28 flex items-center justify-center font-black text-slate-600 uppercase tracking-[0.2em] text-[8px] md:text-[10px] border-2 border-dashed border-slate-700 rounded-2xl md:rounded-4xl">{isFinished ? 'Finished' : 'Awaiting'}</div>}
                        </div>

                        <div className="w-[10%] md:w-2/12 flex flex-col items-center mt-3 md:mt-4"><span className="text-[8px] md:text-[9px] font-black text-slate-600 italic tracking-widest uppercase">vs</span></div>

                        <div className="w-[45%] md:w-5/12 flex flex-col items-center">
                          <p className={`font-black text-[9px] md:text-xs uppercase mb-3 md:mb-4 wrap-break-word leading-tight ${isFinished && match.winner === match.teamB ? 'text-[#5E9BFF]' : 'text-white'}`}>{match.teamB || "OPEN FIELD"}</p>
                          
                          {match.status === "Live" && config?.scoreUI !== "none" ? (
                            <div className="bg-slate-800/50 p-2 md:p-5 rounded-2xl md:rounded-4xl border border-slate-700 flex flex-col items-center gap-3 relative w-full">
                              {config?.hasServe && <button onClick={() => toggleServe(match._id, 'B')} className={`absolute top-1 md:top-2 right-1 md:right-2 text-[7px] md:text-[8px] font-black uppercase px-1.5 md:px-2 py-0.5 md:py-1 rounded-full transition shadow-sm ${match.servingTeam === 'B' ? 'bg-[#FF9B54] text-slate-900 shadow-[0_0_10px_rgba(255,155,84,0.5)]' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>Serve</button>}
                              <div className={`flex items-center gap-1.5 md:gap-4 ${config?.hasServe ? 'mt-4' : ''}`}>
                                <button onClick={() => changeScore(match._id, "scoreB", config?.scoreUI === "goals" ? "goals" : "points", -1) } className="p-1 md:p-2 bg-slate-700 text-slate-300 rounded-md md:rounded-xl hover:bg-slate-600"><Minus size={12} /></button>
                                <span className="text-3xl md:text-5xl font-black text-white drop-shadow-md w-8 md:w-auto">{match.scoreB?.points || match.scoreB?.goals || 0}</span>
                                <button onClick={() => changeScore(match._id, "scoreB", config?.scoreUI === "goals" ? "goals" : "points", 1) } className="p-1 md:p-2 bg-[#5E9BFF] text-slate-900 rounded-md md:rounded-xl shadow-[0_0_15px_rgba(94,155,255,0.4)]"><Plus size={12} /></button>
                              </div>
                              {config?.scoreUI === "points_and_sets" && (
                                <div className="flex items-center gap-1.5 md:gap-3 bg-slate-900/50 px-2 md:px-4 py-1 md:py-1.5 rounded-full border border-slate-700 mt-2">
                                  <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase">Sets</span><span className="text-[10px] md:text-sm font-black text-[#5E9BFF]">{match.scoreB?.sets || 0}</span>
                                  <button onClick={() => changeScore(match._id, "scoreB", "sets", 1) } className="text-[#5E9BFF]"><Plus size={10} /></button>
                                </div>
                              )}
                              
                              {config?.scoreUI === "points_and_sets" && match.status === 'Live' && (
                                <button onClick={() => finishSet(match)} className="mt-3 bg-emerald-500/10 text-emerald-400 font-black text-[8px] md:text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-xl border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition w-full shadow-sm">
                                  End Set
                                </button>
                              )}
                              <button onClick={() => handleForfeit(match, match.teamB)} className="text-[7px] md:text-[9px] text-rose-500/70 font-black uppercase flex items-center gap-1 mt-2 hover:text-rose-500 transition"><Flag size={8} /> Forfeit</button>
                            </div>
                          ) : match.status === 'Completed' && config?.scoreUI !== "none" ? (
                            <div className="py-2 md:py-4">
                              <div className="text-4xl md:text-5xl font-black text-white tracking-tighter drop-shadow-md">
                                {config?.scoreUI === 'points_and_sets' ? (match.scoreB?.sets || 0) : (match.scoreB?.points || match.scoreB?.goals || 0)}
                              </div>
                              {config?.scoreUI === 'points_and_sets' ? (
                                <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 md:mt-2 block">Sets Won</span>
                              ) : (
                                match.scoreB?.sets > 0 && <span className="text-[8px] md:text-[10px] font-bold text-[#5E9BFF] uppercase mt-1 md:mt-2 block">Sets: {match.scoreB.sets}</span>
                              )}
                            </div>
                          ) : <div className="h-20 md:h-28 flex items-center justify-center font-black text-slate-600 uppercase tracking-[0.2em] text-[8px] md:text-[10px] border-2 border-dashed border-slate-700 rounded-2xl md:rounded-4xl">{isFinished ? 'Finished' : 'Awaiting'}</div>}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-3 md:py-4 bg-slate-800/50 rounded-xl md:rounded-2xl border border-slate-700">
                        <p className="text-base md:text-xl font-black text-white uppercase tracking-tighter px-2 wrap-break-word leading-tight">{match.teamA}</p>
                        {isFinished && <p className="text-[10px] md:text-xs font-bold text-[#5E9BFF] mt-1 md:mt-2">{match.resultSummary}</p>}
                      </div>
                    )}

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

                    <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4">
                      <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex flex-col sm:flex-row items-center gap-1 sm:gap-2">
                        <span className="flex items-center gap-1.5"><Calendar size={12} /> {match.date} @ {match.time}</span>
                        <span className="hidden sm:inline text-slate-700">•</span>
                        <span className="flex items-center gap-1.5 text-[#FF9B54]"><MapPin size={12}/> {match.venue || 'Main Ground'}</span>
                      </span>
                      {match.status === "Live" ? (
                        <button onClick={() => setResolvingMatch(match)} className="w-full md:w-auto bg-rose-500/10 text-rose-400 px-6 py-2.5 md:px-8 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase border border-rose-500/20 hover:bg-rose-500 hover:text-white transition">Finish Session</button>
                      ) : match.status === "Completed" ? (
                        <button onClick={() => openEditModal(match)} className="w-full md:w-auto bg-slate-800 text-slate-400 px-5 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase hover:bg-slate-700 hover:text-white transition flex justify-center items-center gap-2 border border-slate-700"><Edit3 size={12}/> Edit Result</button>
                      ) : (
                        <button onClick={async () => { const res = await apiCall(`matches/${match._id}`, "PUT", { status: "Live", isTimerRunning: false, timerElapsed: 0, timerUpdatedAt: new Date().toISOString(), extraTime: 0 }); if (res) fetchMatches(); }} className="w-full md:w-auto bg-[#5E9BFF] text-slate-900 px-6 py-2.5 md:px-8 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase transition shadow-[0_0_15px_rgba(94,155,255,0.4)] hover:bg-blue-400">Start Match</button>
                      )}
                    </div>
                  </div>
                );
              })
          ) : (
            <div className="col-span-full py-20 md:py-32 text-center bg-slate-900/50 rounded-[2rem] md:rounded-[4rem] border border-slate-800 backdrop-blur-md">
              <Search size={32} className="mx-auto text-slate-600 mb-3 md:mb-4" />
              <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] md:text-xs">No {activeTab} matches for {adminSportAccess}</p>
            </div>
          )}
        </div>

        {resolvingMatch && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0f1c] p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] max-w-xl w-full shadow-2xl border border-slate-800 animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4 md:pb-6">
              <h2 className="text-xl md:text-3xl font-black text-white tracking-tighter uppercase italic">Resolve Event</h2>
              <button onClick={closeResolveModal} className="bg-slate-800 p-2 md:p-3 rounded-xl md:rounded-2xl text-slate-400 hover:text-white transition"><X size={20} /></button>
            </div>
            
            <div className="space-y-4 md:space-y-6 mb-8 md:mb-10">
              {resolvingMatch.sport === "Cricket" ? (
                <div className="bg-[#5E9BFF]/10 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-[#5E9BFF]/30 space-y-3 md:space-y-4">
                  <select value={athleticsResult.winner} onChange={(e) => setAthleticsResult({ ...athleticsResult, winner: e.target.value }) } className="w-full p-3 md:p-4 rounded-xl md:rounded-2xl font-black outline-none bg-slate-800 text-white border border-slate-700 text-sm">
                    <option value="">WHO WON THE MATCH?</option><option>{resolvingMatch.teamA}</option><option>{resolvingMatch.teamB}</option>
                  </select>
                  <input placeholder="Result Summary (e.g. Won by 4 wickets)" value={resultSummary} onChange={(e) => setResultSummary(e.target.value)} className="w-full p-3 md:p-4 rounded-xl md:rounded-2xl font-bold bg-slate-800 text-white border border-slate-700 outline-none text-sm" />
                </div>
              ) : !resolvingMatch.teamB ? (
                <div className="bg-[#FF9B54]/10 p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-[#FF9B54]/30 space-y-3 md:space-y-4">
                  <div className="flex items-center gap-2 text-[#FF9B54] font-black text-[9px] md:text-[10px] uppercase tracking-widest"><Medal size={14} /> Podium Ranking</div>
                  <select value={athleticsResult.winner} onChange={(e) => setAthleticsResult({ ...athleticsResult, winner: e.target.value }) } className="w-full p-3 md:p-4 rounded-xl font-black outline-none bg-slate-800 text-white border border-yellow-500/50 text-sm"><option value="">🥇 1st Place (Gold)</option>{HOUSES.map((h) => (<option key={h} value={h}>{h}</option>))}</select>
                  <select value={athleticsResult.runnerUp} onChange={(e) => setAthleticsResult({ ...athleticsResult, runnerUp: e.target.value }) } className="w-full p-3 md:p-4 rounded-xl font-black outline-none bg-slate-800 text-white border border-slate-600 text-sm"><option value="">🥈 2nd Place (Silver)</option>{HOUSES.map((h) => (<option key={h} value={h}>{h}</option>))}</select>
                  <select value={athleticsResult.thirdPlace} onChange={(e) => setAthleticsResult({ ...athleticsResult, thirdPlace: e.target.value }) } className="w-full p-3 md:p-4 rounded-xl font-black outline-none bg-slate-800 text-white border border-orange-500/50 text-sm"><option value="">🥉 3rd Place (Bronze)</option>{HOUSES.map((h) => (<option key={h} value={h}>{h}</option>))}</select>
                </div>
              ) : null}

              <div className="bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-inner border border-slate-800">
                <p className="text-[9px] md:text-[10px] font-black text-[#5E9BFF] uppercase tracking-[0.3em] mb-4 md:mb-6 text-center italic">Distribute Championship Points</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  {housePointsAllocation.map((h, i) => (
                    <div key={h.name} className="flex justify-between items-center bg-slate-800 px-4 py-2.5 md:px-5 md:py-3 rounded-xl md:rounded-2xl border border-slate-700">
                      <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase wrap-break-word leading-tight max-w-[120px]">{h.name.split(" ")[0]}</span>
                      <input type="number" value={h.points} onChange={(e) => { const copy = [...housePointsAllocation]; copy[i].points = e.target.value; setHousePointsAllocation(copy); }} className="w-16 bg-transparent text-right font-black text-[#5E9BFF] outline-none text-sm md:text-base" placeholder="0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
              <button onClick={closeResolveModal} className="w-full md:flex-1 py-3.5 md:py-5 bg-slate-800 rounded-xl md:rounded-2xl font-black text-slate-400 uppercase tracking-widest hover:bg-slate-700 transition text-xs">Discard</button>
              <button onClick={finalizeMatch} className="w-full md:flex-1 py-3.5 md:py-5 bg-[#5E9BFF] text-slate-900 rounded-xl md:rounded-2xl font-black uppercase shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:bg-blue-400 transition text-xs">Complete Match</button>
            </div>
          </div>
        </div>
        )}

        {editingMatch && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0f1c] p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] max-w-xl w-full shadow-2xl border border-slate-800 animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 md:mb-6 border-b border-slate-800 pb-4 md:pb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">Correct Result</h2>
                <p className="text-[10px] md:text-xs text-[#5E9BFF] font-bold mt-1">Editing: {editingMatch.sport}</p>
              </div>
              <button onClick={() => setEditingMatch(null)} className="bg-slate-800 p-2 md:p-3 rounded-xl md:rounded-2xl text-slate-400 hover:text-white transition"><X size={18} /></button>
            </div>
            
            <div className="bg-rose-500/10 p-3 md:p-4 rounded-xl md:rounded-2xl flex items-start gap-2 md:gap-3 border border-rose-500/20 mb-5 md:mb-6">
               <AlertTriangle size={18} className="text-rose-400 shrink-0"/>
               <p className="text-[9px] md:text-[10px] font-bold text-rose-300 uppercase tracking-wide leading-relaxed">Note: Updating this panel fixes the scorecard, but it <span className="font-black">does not</span> recalculate Overall Championship points automatically.</p>
            </div>

            <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
              {SPORTS_CONFIG[editingMatch.sport]?.scoreUI !== 'none' && editingMatch.teamB && (
                 <div className="flex flex-col sm:flex-row gap-4 md:gap-6">
                    <div className="flex-1 bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-800">
                       <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase block mb-1.5 md:mb-2 wrap-break-word leading-tight">{editingMatch.teamA} Score</label>
                       <input type="number" value={editForm.scoreA} onChange={e => setEditForm({...editForm, scoreA: e.target.value})} className="w-full text-xl md:text-2xl font-black bg-slate-800 text-white p-2.5 md:p-3 rounded-lg md:rounded-xl border border-slate-700 outline-none" />
                    </div>
                    <div className="flex-1 bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-800">
                       <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase block mb-1.5 md:mb-2 wrap-break-word leading-tight">{editingMatch.teamB} Score</label>
                       <input type="number" value={editForm.scoreB} onChange={e => setEditForm({...editForm, scoreB: e.target.value})} className="w-full text-xl md:text-2xl font-black bg-slate-800 text-white p-2.5 md:p-3 rounded-lg md:rounded-xl border border-slate-700 outline-none" />
                    </div>
                 </div>
              )}
              <div className="space-y-2 md:space-y-3">
                 <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Official Winner</label>
                 <select value={editForm.winner} onChange={e => setEditForm({...editForm, winner: e.target.value})} className="w-full p-3 md:p-4 rounded-xl md:rounded-2xl bg-slate-800 text-white font-black outline-none border border-slate-700 text-sm">
                    <option value="">Draw / No Winner</option>
                    <option value={editingMatch.teamA}>{editingMatch.teamA}</option>
                    {editingMatch.teamB && <option value={editingMatch.teamB}>{editingMatch.teamB}</option>}
                 </select>
                 <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1 pt-1 md:pt-2">Summary Text</label>
                 <input type="text" value={editForm.resultSummary} onChange={e => setEditForm({...editForm, resultSummary: e.target.value})} className="w-full p-3 md:p-4 rounded-xl md:rounded-2xl bg-slate-800 text-white font-bold outline-none border border-slate-700 text-sm" />
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
              <button onClick={() => setEditingMatch(null)} className="w-full md:flex-1 py-3.5 md:py-4 bg-slate-800 rounded-xl md:rounded-2xl font-black text-slate-400 uppercase tracking-widest hover:bg-slate-700 transition text-xs">Cancel</button>
              <button onClick={saveEdit} className="w-full md:flex-1 py-3.5 md:py-4 bg-[#5E9BFF] text-slate-900 rounded-xl md:rounded-2xl font-black uppercase tracking-widest shadow-[0_0_20px_rgba(94,155,255,0.4)] hover:bg-blue-400 transition text-xs">Save</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AdminDashboard;