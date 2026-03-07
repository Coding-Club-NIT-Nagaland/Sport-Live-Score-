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

const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'http://localhost:5173',
    'https://sport-live-score.vercel.app' 
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error("CORS Blocked for origin:", origin);
      callback(new Error('Blocked by Security Policy (CORS)'));
    }
  },
  credentials: true
}));

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
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  } 
});

// --- 2. MONGODB CONNECTION & SEEDER ---

const startDatabase = async () => {
  try {
    await connectDB();
    console.log("📂 Database Connected...");
    await seedSecretaries(); 
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
  }
};

startDatabase();

const seedSecretaries = async () => {
  try {
    const count = await Secretary.countDocuments();
    if (count === 0) {
      console.log("🌱 Database empty. Reading secretaries.json...");
      const filePath = path.join(__dirname, 'data', 'secretaries.json');
      
      if (!fs.existsSync(filePath)) return;

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
    }
  } catch (err) {
    console.error("❌ Seeder Error:", err);
  }
};

// --- 3. AUTH & RBAC MIDDLEWARE ---

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token provided.' });
  
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
  
    const token = jwt.sign(
      { id: admin._id, sportAccess: admin.sportCategory }, 
      process.env.JWT_SECRET || 'techavinya_secret', 
      { expiresIn: '12h' }
    );
    
    res.json({ token, sportAccess: admin.sportCategory, name: admin.name });
  } catch (error) { res.status(500).json({ error: 'Login error' }); }
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
  const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true });
  io.emit('matchUpdated', match);
  res.json(match);
});

app.put('/api/matches/:id/resolve', verifyToken, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match || !hasSportAccess(req.user.sportAccess, match.sport)) return res.status(403).json({ error: "Unauthorized." });

    const { overallHousePoints, winnerOverride } = req.body;
    match.status = 'Completed';
    match.winner = winnerOverride || match.winner;
    await match.save();

    if (overallHousePoints && Array.isArray(overallHousePoints)) {
      for (const hp of overallHousePoints) {
        if (hp.points > 0) {
          await House.findOneAndUpdate(
            { name: hp.name },
            { $inc: { points: Number(hp.points) } },
            { upsert: true }
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

// --- START SERVER ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));