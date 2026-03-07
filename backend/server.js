require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet'); // ADDED: Security headers
const rateLimit = require('express-rate-limit'); // ADDED: DDOS/Brute force protection

const connectDB = require('./config/DB');

// --- DATABASE MODELS ---
const Secretary = require('./models/Secretary');
const Match = require('./models/Match');
const TeamStat = require('./models/TeamStat');
const House = require('./models/House');

const app = express();

// --- 1. PRODUCTION SECURITY MIDDLEWARE ---

// Security Headers (CSP, XSS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      // Allow connections to your frontend URL and Render websocket
      "connect-src": ["'self'", process.env.FRONTEND_URL, "wss://" + (process.env.RENDER_EXTERNAL_HOSTNAME || "localhost:5000")],
      "img-src": ["'self'", "data:"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "script-src": ["'self'"],
    },
  },
}));

// Dynamic CORS using Environment Variables
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by Security Policy (CORS)'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Login Rate Limiter (Prevents Brute Force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: { error: "Too many login attempts. Please try again later." }
});

// Prevent 404/CSP errors for favicon on API calls
app.get('/favicon.ico', (req, res) => res.status(204).end());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  } 
});

// --- 2. MONGODB CONNECTION & SEEDER ---

const startDatabase = async () => {
  try {
    await connectDB();
    console.log("📂 Database Connected...");
    // Only start seeding after connection is fully established
    seedSecretaries(); 
  } catch (err) {
    console.error("❌ DB Connection Failed:", err);
    process.exit(1);
  }
};

startDatabase();

const seedSecretaries = async () => {
  try {
    const count = await Secretary.countDocuments();
    if (count === 0) {
      console.log("🌱 Database empty. Reading secretaries.json...");
      
      const filePath = path.join(__dirname, 'data', 'secretaries.json');
      
      if (!fs.existsSync(filePath)) {
        console.warn("⚠️ secretaries.json not found. Skipping seeder.");
        return;
      }

      const rawData = fs.readFileSync(filePath, 'utf-8');
      const secretariesData = JSON.parse(rawData);

      const salt = await bcrypt.genSalt(10);
      const secretariesToInsert = await Promise.all(secretariesData.map(async (sec) => ({
        name: sec.name,
        email: sec.email.toLowerCase(),
        password: await bcrypt.hash(sec.password, salt),
        sportCategory: sec.sportCategory
      })));

      await Secretary.insertMany(secretariesToInsert);
      console.log(`✅ Successfully seeded ${secretariesToInsert.length} Secretaries!`);
    } else {
      console.log(`✅ Database already contains ${count} Secretaries. Skipping seeder.`);
    }
  } catch (err) {
    console.error("❌ Seeder Error:", err);
  }
};

// --- 3. AUTH MIDDLEWARE (WITH RBAC USER ATTACHMENT) ---
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'Access Denied. No token provided.' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'techavinya_secret', (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Unauthorized or token expired.' });
    
    req.user = decoded; 
    next();
  });
};

const hasSportAccess = (userAccess, targetSport) => {
  if (userAccess === 'All') return true;
  const SPORT_GROUPS = {
    'Indoor Games': ['Carrom', 'Chess', 'Table Tennis'],
    'Fitness': ['Tug of War', 'Kho-Kho', 'Marathon', 'High Jump', 'Long Jump', 'Skipping', 'Shotput']
  };
  const allowedSports = SPORT_GROUPS[userAccess] || [userAccess];
  return allowedSports.includes(targetSport);
};

// --- 4. PUBLIC API ROUTES ---
app.get('/api/matches', async (req, res) => {
  res.json(await Match.find().sort({ date: 1, time: 1 }));
});

app.get('/api/houses', async (req, res) => {
  res.json(await House.find().sort({ points: -1 }));
});

app.get('/api/points-table', async (req, res) => {
  const stats = await TeamStat.find();
  const formattedData = {};
  stats.forEach(stat => {
    if (!formattedData[stat.sport]) formattedData[stat.sport] = {};
    if (!formattedData[stat.sport][stat.group]) formattedData[stat.sport][stat.group] = [];
    formattedData[stat.sport][stat.group].push(stat);
  });
  res.json(formattedData);
});

// --- ADMIN LOGIN ---
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
  
    const admin = await Secretary.findOne({ email: username.toLowerCase() });
    if (!admin) return res.status(401).json({ error: 'Invalid ID or Password' });
  
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid ID or Password' });
  
    const token = jwt.sign(
      { id: admin._id, sportAccess: admin.sportCategory }, 
      process.env.JWT_SECRET || 'techavinya_secret', 
      { expiresIn: '12h' }
    );
    
    res.json({ 
      token, 
      sportAccess: admin.sportCategory,
      name: admin.name 
    });

  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- 5. PROTECTED ADMIN ROUTES WITH RBAC ---

app.post('/api/matches', verifyToken, async (req, res) => {
  if (!hasSportAccess(req.user.sportAccess, req.body.sport)) {
    return res.status(403).json({ error: `Unauthorized. You can only manage ${req.user.sportAccess} matches.` });
  }
  const newMatch = await Match.create(req.body);
  io.emit('matchesUpdated');
  res.json(newMatch);
});

app.put('/api/matches/:id', verifyToken, async (req, res) => {
  const matchCheck = await Match.findById(req.params.id);
  if (!matchCheck) return res.status(404).json({ error: 'Match not found' });
  if (!hasSportAccess(req.user.sportAccess, matchCheck.sport)) {
    return res.status(403).json({ error: `Unauthorized to edit ${matchCheck.sport}.` });
  }
  const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true });
  io.emit('matchUpdated', match);
  res.json(match);
});

app.put('/api/matches/:id/forfeit', verifyToken, async (req, res) => {
  const { winner } = req.body;
  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!hasSportAccess(req.user.sportAccess, match.sport)) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  match.status = 'Completed';
  match.winner = winner;
  match.resultSummary = "Match Forfeited";
  match.isTimerRunning = false; 
  await match.save();

  if (match.sport !== 'Cricket' && !['Knockout', 'Semi-Final', 'Final'].includes(match.group) && match.teamB) {
    const updateStat = async (teamName, isWin) => {
      let stat = await TeamStat.findOne({ team: teamName, sport: match.sport, group: match.group });
      if (!stat) stat = new TeamStat({ team: teamName, sport: match.sport, group: match.group });
      stat.p += 1;
      if (isWin) { stat.w += 1; stat.pts += 3; }
      else { stat.l += 1; }
      await stat.save();
    };
    await updateStat(winner, true);
    await updateStat(match.teamA === winner ? match.teamB : match.teamA, false);
  }
  io.emit('matchUpdated', match);
  io.emit('pointsTableUpdated');
  res.json(match);
});

app.delete('/api/matches/:id', verifyToken, async (req, res) => {
  try {
    const matchCheck = await Match.findById(req.params.id);
    if (!matchCheck || !hasSportAccess(req.user.sportAccess, matchCheck.sport)) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    await Match.findByIdAndDelete(req.params.id);
    io.emit('matchesUpdated'); 
    res.json({ message: 'Match deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

app.put('/api/matches/:id/resolve', verifyToken, async (req, res) => {
  const { penaltiesA, penaltiesB, overallHousePoints, resultSummary, winnerOverride, isTimerRunning } = req.body;
  try {
    const match = await Match.findById(req.params.id);
    if (!match || !hasSportAccess(req.user.sportAccess, match.sport)) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    match.status = 'Completed';
    match.penaltiesA = penaltiesA || 0;
    match.penaltiesB = penaltiesB || 0;
    match.resultSummary = resultSummary || '';
    if (isTimerRunning !== undefined) match.isTimerRunning = isTimerRunning;

    const isAthletics = !match.teamB || match.teamB.trim() === '';
    let winner = winnerOverride || null;
    let isDraw = false;

    if (!winner && !isAthletics && match.sport !== 'Cricket') {
      const sA = match.scoreA;
      const sB = match.scoreB;
      if (match.sport === 'Football' || match.sport === 'Futsal') {
        if (sA.goals > sB.goals) winner = match.teamA;
        else if (sB.goals > sA.goals) winner = match.teamB;
        else {
          if (match.penaltiesA > match.penaltiesB) winner = match.teamA;
          else if (match.penaltiesB > match.penaltiesA) winner = match.teamB;
          else isDraw = true;
        }
      } else {
        if (sA.points > sB.points) winner = match.teamA;
        else if (sB.points > sA.points) winner = match.teamB;
        else isDraw = true;
      }
    }

    match.winner = winner;
    await match.save();

    if (['Group A', 'Group B', 'Group C'].includes(match.group) && !isAthletics) {
      const updateStat = async (teamName, isWin, isTie) => {
        let stat = await TeamStat.findOne({ team: teamName, sport: match.sport, group: match.group });
        if (!stat) stat = new TeamStat({ team: teamName, sport: match.sport, group: match.group });
        stat.p += 1;
        if (isWin) { stat.w += 1; stat.pts += 3; } 
        else if (isTie) { stat.d += 1; stat.pts += 1; } 
        else { stat.l += 1; }
        await stat.save();
      };
      await updateStat(match.teamA, winner === match.teamA, isDraw);
      await updateStat(match.teamB, winner === match.teamB, isDraw);
    }

    if (overallHousePoints && Array.isArray(overallHousePoints)) {
      for (const hp of overallHousePoints) {
        if (hp.points && Number(hp.points) > 0) {
          await House.findOneAndUpdate(
            { name: hp.name },
            { $inc: { points: Number(hp.points) } },
            { upsert: true, new: true }
          );
        }
      }
      io.emit('leaderboardUpdated'); 
    }
    io.emit('matchUpdated', match);
    io.emit('pointsTableUpdated');
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));