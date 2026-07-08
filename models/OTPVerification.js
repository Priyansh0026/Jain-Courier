const mongoose = require('mongoose');

const OTPVerificationSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
    unique: true, // E.g., email or mobile number
    trim: true,
    lowercase: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  expiry: {
    type: Date,
    required: true,
    index: { expires: '15m' } // Mongoose TTL index: auto deletes record 15 mins after expiry
  }
});

module.exports = mongoose.model('OTPVerification', OTPVerificationSchema);
