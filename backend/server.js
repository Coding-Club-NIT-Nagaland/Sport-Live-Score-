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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/DB');

const Secretary = require('./models/Secretary');
const Match = require('./models/Match');
const TeamStat = require('./models/TeamStat');
const House = require('./models/House');

const app = express();

app.set('trust proxy', 1);

// --- 1. SECURITY & HEADERS ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "connect-src": ["'self'", process.env.FRONTEND_URL, "wss://" + (process.env.RENDER_EXTERNAL_HOSTNAME || "localhost:10000")],
      "img-src": ["'self'", "data:"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "script-src": ["'self'"],
    },
  },
}));

// DYNAMIC CORS ALLOWANCE
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'http://localhost:5173',
    'https://sport-live-score.vercel.app' 
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.error("CORS Blocked for origin:", origin);
      callback(new Error('Blocked by Security Policy (CORS)'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { error: "Too many login attempts. Please try again later." }
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  } 
});

// --- 2. MONGODB CONNECTION ---
const startDatabase = async () => {
  try {
    await connectDB();
    console.log("📂 Database Connected...");
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
  }
};
startDatabase();

// --- 3. AUTH & RBAC MIDDLEWARE ---
const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    console.error("🚨 FATAL ERROR: JWT_SECRET environment variable is missing!");
    process.exit(1); 
  }
  return process.env.JWT_SECRET;
};

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token provided.' });
  
  jwt.verify(token, getJwtSecret(), (err, decoded) => {
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
  return (SPORT_GROUPS[userAccess] || [userAccess]).includes(targetSport);
};

// --- 4. API ROUTES ---
app.get('/api/matches', async (req, res) => res.json(await Match.find().sort({ date: 1, time: 1 })));
app.get('/api/houses', async (req, res) => res.json(await House.find().sort({ points: -1 })));

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

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Secretary.findOne({ email: username.toLowerCase() });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: 'Invalid ID or Password' });
    }
    const token = jwt.sign({ id: admin._id, sportAccess: admin.sportCategory }, getJwtSecret(), { expiresIn: '12h' });
    res.json({ token, sportAccess: admin.sportCategory, name: admin.name });
  } catch (error) { res.status(500).json({ error: 'Login error' }); }
});

app.get('/api/admin/verify', verifyToken, (req, res) => {
  res.status(200).json({ valid: true, user: req.user });
});

// --- 5. PROTECTED MATCH ROUTES ---
app.post('/api/matches', verifyToken, async (req, res) => {
  if (!hasSportAccess(req.user.sportAccess, req.body.sport)) return res.status(403).json({ error: 'Unauthorized' });
  const newMatch = await Match.create(req.body);
  io.emit('matchesUpdated');
  res.json(newMatch);
});

app.put('/api/matches/:id', verifyToken, async (req, res) => {
  const matchCheck = await Match.findById(req.params.id);
  if (!matchCheck || !hasSportAccess(req.user.sportAccess, matchCheck.sport)) return res.status(403).json({ error: 'Unauthorized' });
  const match = await Match.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  io.emit('matchUpdated', match);
  res.json(match);
});

// UPGRADED: Math-Aware & Set-Aware Resolve Route
app.put('/api/matches/:id/resolve', verifyToken, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match || !hasSportAccess(req.user.sportAccess, match.sport)) return res.status(403).json({ error: "Unauthorized." });

    const { overallHousePoints, winnerOverride, resultSummary } = req.body;

    // AUTO-CALCULATE WINNER FROM SCORES OR SETS
    let finalWinner = winnerOverride || match.winner;
    let finalSummary = resultSummary || match.resultSummary;

    if (match.teamB && match.sport !== 'Cricket') {
       const setBasedSports = ['Volleyball', 'Badminton', 'Table Tennis'];
       const isSetBased = setBasedSports.includes(match.sport);

       if (!winnerOverride) { 
           if (isSetBased) {
               // International Rule: Winner is decided by Sets won
               const setsA = match.scoreA?.sets || 0;
               const setsB = match.scoreB?.sets || 0;

               if (setsA > setsB) {
                   finalWinner = match.teamA;
                   if (!resultSummary) finalSummary = `${match.teamA} won ${setsA}-${setsB} in sets`;
               } else if (setsB > setsA) {
                   finalWinner = match.teamB;
                   if (!resultSummary) finalSummary = `${match.teamB} won ${setsB}-${setsA} in sets`;
               } else {
                   finalWinner = "Draw";
                   if (!resultSummary) finalSummary = `Match Draw (${setsA}-${setsB} sets)`;
               }
           } else {
               // Standard Rule: Winner decided by Points/Goals
               const scoreType = (match.sport === 'Football' || match.sport === 'Futsal') ? 'goals' : 'points';
               const scoreA = match.scoreA?.[scoreType] || 0;
               const scoreB = match.scoreB?.[scoreType] || 0;

               if (scoreA > scoreB) {
                  finalWinner = match.teamA;
                  if (!resultSummary) finalSummary = `${match.teamA} won by ${scoreA - scoreB} ${scoreType}`;
               } else if (scoreB > scoreA) {
                  finalWinner = match.teamB;
                  if (!resultSummary) finalSummary = `${match.teamB} won by ${scoreB - scoreA} ${scoreType}`;
               } else {
                  finalWinner = "Draw";
                  if (!resultSummary) finalSummary = `Match Draw (${scoreA}-${scoreB})`;
               }
           }
       }
    }

    match.status = 'Completed';
    match.winner = finalWinner;
    match.resultSummary = finalSummary;
    match.isTimerRunning = false;
    await match.save();

    if (overallHousePoints && Array.isArray(overallHousePoints)) {
      for (const hp of overallHousePoints) {
        if (hp.points > 0) {
          await House.findOneAndUpdate(
            { name: hp.name },
            { $inc: { points: Number(hp.points) } },
            { upsert: true, returnDocument: 'after' }
          );
        }
      }
      io.emit('leaderboardUpdated'); 
    }
    io.emit('matchUpdated', match);
    io.emit('pointsTableUpdated');
    res.json(match);
  } catch (error) { res.status(500).json({ error: "Internal Server Error" }); }
});

app.delete('/api/matches/:id', verifyToken, async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (match && hasSportAccess(req.user.sportAccess, match.sport)) {
    await Match.findByIdAndDelete(req.params.id);
    io.emit('matchesUpdated'); 
    return res.json({ message: 'Deleted' });
  }
  res.status(403).json({ error: "Unauthorized." });
});
app.put('/api/houses/override', verifyToken, async (req, res) => {
  try {
    const { updates } = req.body; // Expects an array: [{name: 'Wolves', points: 15}, ...]
    if (updates && Array.isArray(updates)) {
      for (const u of updates) {
        await House.findOneAndUpdate(
          { name: u.name },
          { points: Number(u.points) },
          { upsert: true }
        );
      }
      io.emit('leaderboardUpdated'); 
      res.json({ message: "Points overridden successfully" });
    } else {
      res.status(400).json({ error: "Invalid data" });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));