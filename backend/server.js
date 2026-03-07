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

const connectDB = require('./config/DB');

// --- DATABASE MODELS ---
const Secretary = require('./models/Secretary');
const Match = require('./models/Match');
const TeamStat = require('./models/TeamStat');
const House = require('./models/House');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- 1. MONGODB CONNECTION & JSON SEEDER ---
connectDB();

mongoose.connection.once('open', () => {
  seedSecretaries(); 
});
const seedSecretaries = async () => {
  try {
    const count = await Secretary.countDocuments();
    if (count === 0) {
      console.log("🌱 Database empty. Reading secretaries.json...");
      
      const filePath = path.join(__dirname, './data/secretaries.json');
      
      if (!fs.existsSync(filePath)) {
        console.warn("⚠️ secretaries.json not found. Skipping seeder.");
        return;
      }

      const rawData = fs.readFileSync(filePath, 'utf-8');
      const secretariesData = JSON.parse(rawData);

      const secretariesToInsert = [];
      const salt = await bcrypt.genSalt(10);
      for (const sec of secretariesData) {
        const hashedPassword = await bcrypt.hash(sec.password, salt);
        secretariesToInsert.push({
          name: sec.name,
          email: sec.email.toLowerCase(),
          password: hashedPassword,
          sportCategory: sec.sportCategory
        });
      }

      await Secretary.insertMany(secretariesToInsert);
      console.log(`✅ Successfully seeded ${secretariesToInsert.length} Secretaries from JSON!`);
    } else {
      console.log(`✅ Database already contains ${count} Secretaries. Skipping seeder.`);
    }
  } catch (err) {
    console.error("❌ Seeder Error:", err);
  }
};

// --- 2. AUTH MIDDLEWARE (WITH RBAC USER ATTACHMENT) ---
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
app.post('/api/admin/login', async (req, res) => {
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

// --- 4. PROTECTED ADMIN ROUTES WITH RBAC ---

// Schedule Match
app.post('/api/matches', verifyToken, async (req, res) => {
  if (!hasSportAccess(req.user.sportAccess, req.body.sport)) {
    return res.status(403).json({ error: `Unauthorized. You can only manage ${req.user.sportAccess} matches.` });
  }

  const newMatch = await Match.create(req.body);
  io.emit('matchesUpdated');
  res.json(newMatch);
});

// Update Live Match (Scores, Timers, Serves, Corrections)
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

// Forfeit Match
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

// Delete Match
app.delete('/api/matches/:id', verifyToken, async (req, res) => {
  try {
    const matchCheck = await Match.findById(req.params.id);
    if (!matchCheck) return res.status(404).json({ error: 'Match not found' });

    if (!hasSportAccess(req.user.sportAccess, matchCheck.sport)) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    await Match.findByIdAndDelete(req.params.id);
    io.emit('matchesUpdated'); 
    res.json({ message: 'Match deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

// Resolve/Finalize Match
app.put('/api/matches/:id/resolve', verifyToken, async (req, res) => {
  const { penaltiesA, penaltiesB, overallHousePoints, resultSummary, winnerOverride, isTimerRunning } = req.body;
  
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (!hasSportAccess(req.user.sportAccess, match.sport)) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    // 1. Basic match updates
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

    const isGroupStage = ['Group A', 'Group B', 'Group C'].includes(match.group);
    
    if (isGroupStage && !isAthletics) {
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

    // Update Overall House Championship (Main Leaderboard)
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
    console.error("Resolve Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));