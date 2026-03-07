const mongoose = require('mongoose');

const secretarySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  sportCategory: { type: String, required: true } 
}, { timestamps: true });

module.exports = mongoose.model('Secretary', secretarySchema);