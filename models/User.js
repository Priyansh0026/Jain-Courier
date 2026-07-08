const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter your full name'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters']
    },
    email: {
      type: String,
      required: [true, 'Please enter your email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
    },
    mobile: {
      type: String,
      required: [true, 'Please enter your mobile number'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number']
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Exclude from queries by default for safety
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    mobileVerified: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      enum: ['owner', 'operator', 'user'],
      default: 'owner'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'locked'],
      default: 'active'
    },
    loginAttempts: {
      type: Number,
      required: true,
      default: 0
    },
    lockUntil: {
      type: Number // Epoch timestamp indicating account lock end
    },
    refreshToken: {
      type: String
    },
    lastLogin: {
      type: Date
    }
  },
  {
    timestamps: true // Auto adds createdAt and updatedAt
  }
);

// Pre-save hook: Hash password if modified
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password helper method
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if account is currently locked
UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model('User', UserSchema);
