const mongoose = require('mongoose');

const HouseSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 }
});

module.exports = mongoose.model('House', HouseSchema);