const mongoose = require('mongoose');

const TeamStatSchema = new mongoose.Schema({
  team: String, sport: String, group: String,
  p: { type: Number, default: 0 }, w: { type: Number, default: 0 }, 
  d: { type: Number, default: 0 }, l: { type: Number, default: 0 }, pts: { type: Number, default: 0 }
});

module.exports = mongoose.model('TeamStat', TeamStatSchema);