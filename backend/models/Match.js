const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  sport: String, category: String, group: { type: String, default: 'Group A' },
  teamA: String, teamB: { type: String, default: '' }, 
  date: String, time: String, cricHeroesLink: { type: String, default: '' },
  status: { type: String, enum: ['Upcoming', 'Live', 'Completed'], default: 'Upcoming' },
  scoreA: { goals: { type: Number, default: 0 }, points: { type: Number, default: 0 }, sets: { type: Number, default: 0 } },
  scoreB: { goals: { type: Number, default: 0 }, points: { type: Number, default: 0 }, sets: { type: Number, default: 0 } },
  penaltiesA: { type: Number, default: 0 }, penaltiesB: { type: Number, default: 0 },
  winner: { type: String, default: null },
  resultSummary: { type: String, default: '' },
  timerElapsed: { type: Number, default: 0 },
  isTimerRunning: { type: Boolean, default: false },
  timerUpdatedAt: { type: Date, default: Date.now },
  extraTime: { type: Number, default: 0 } ,
  servingTeam: { type: String, enum: ['A', 'B', null], default: null } 
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);