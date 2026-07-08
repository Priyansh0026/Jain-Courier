const User = require('../models/User');
const OTPVerification = require('../models/OTPVerification');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const tokenUtils = require('../utils/tokenUtils');
const memoryStore = require('../config/memoryStore');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Helper to check if MongoDB is active
const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Register a new user
 * POST /api/register
 */
const register = async (req, res) => {
  const { name, email, mobile, password } = req.body;

  try {
    // 1. Verify that BOTH email and mobile have been verified via OTP
    let isEmailVerified = false;
    let isMobileVerified = false;

    if (isDbConnected()) {
      const emailVerifyRecord = await OTPVerification.findOne({ identifier: email.toLowerCase(), verified: true });
      const mobileVerifyRecord = await OTPVerification.findOne({ identifier: mobile, verified: true });
      isEmailVerified = !!emailVerifyRecord;
      isMobileVerified = !!mobileVerifyRecord;
    } else {
      const emailRecord = memoryStore.verifications.get(email.toLowerCase());
      const mobileRecord = memoryStore.verifications.get(mobile);
      isEmailVerified = emailRecord && emailRecord.verified && (Date.now() < emailRecord.expiry);
      isMobileVerified = mobileRecord && mobileRecord.verified && (Date.now() < mobileRecord.expiry);
    }

    if (!isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Registration blocked: Your email address is not verified via OTP.'
      });
    }

    if (!isMobileVerified) {
      return res.status(400).json({
        success: false,
        message: 'Registration blocked: Your mobile number is not verified via OTP.'
      });
    }

    // 2. Ensure User doesn't already exist (double-check race conditions)
    let emailExists = false;
    let mobileExists = false;

    if (isDbConnected()) {
      emailExists = await User.findOne({ email });
      mobileExists = await User.findOne({ mobile });
    } else {
      emailExists = memoryStore.users.some(u => u.email.toLowerCase() === email.toLowerCase());
      mobileExists = memoryStore.users.some(u => u.mobile === mobile);
    }

    if (emailExists) {
      return res.status(400).json({ success: false, message: 'This email is already registered.' });
    }

    if (mobileExists) {
      return res.status(400).json({ success: false, message: 'This mobile number is already registered.' });
    }

    let user;

    if (isDbConnected()) {
      // Create User in MongoDB
      user = await User.create({
        name,
        email,
        mobile,
        password,
        emailVerified: true,
        mobileVerified: true,
        role: 'owner',
        status: 'active'
      });
      // Delete temporary OTP verification records
      await OTPVerification.deleteMany({ identifier: { $in: [email.toLowerCase(), mobile] } });
    } else {
      // Create User in memoryStore
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);
      
      user = {
        _id: 'USR-' + Math.floor(100000 + Math.random() * 900000),
        name,
        email,
        mobile,
        password: hashed,
        emailVerified: true,
        mobileVerified: true,
        role: 'owner',
        status: 'active',
        loginAttempts: 0,
        createdAt: new Date().toISOString(),
        save: async function() {
          // Mock save for tokenUtils response
          return this;
        }
      };
      
      memoryStore.users.push(user);
      memoryStore.verifications.delete(email.toLowerCase());
      memoryStore.verifications.delete(mobile);
    }

    // Generate tokens and send response using cookies
    return tokenUtils.sendTokenResponse(user, 201, res, 'User account registered successfully.');
  } catch (error) {
    console.error('[JCMS Auth Controller] Register error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create owner account. Please try again.'
    });
  }
};

/**
 * Authenticate User & generate tokens
 * POST /api/login
 */
const login = async (req, res) => {
  const { emailOrMobile, password } = req.body;

  try {
    let user;

    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { email: emailOrMobile.toLowerCase() },
          { mobile: emailOrMobile }
        ]
      }).select('+password');
    } else {
      user = memoryStore.users.find(u => 
        u.email.toLowerCase() === emailOrMobile.toLowerCase() || u.mobile === emailOrMobile
      );
    }

    // Special fallback to allow mock logging in if no registrations exist yet
    const isMockTrigger = !user && (
      (isDbConnected() && (await User.countDocuments()) === 0) ||
      (!isDbConnected() && memoryStore.users.length === 0)
    ) && emailOrMobile === 'owner@jaincourier.com' && password === 'Jcms@2026';

    if (isMockTrigger) {
      // Auto-create a temporary mock owner to let them log in instantly!
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Jcms@2026', salt);
      
      const mockUser = {
        _id: 'MOCK-OWNER-ID',
        name: 'Vikas Prasad',
        email: 'owner@jaincourier.com',
        mobile: '9876543210',
        password: hashed,
        emailVerified: true,
        mobileVerified: true,
        role: 'owner',
        status: 'active',
        loginAttempts: 0,
        createdAt: new Date().toISOString(),
        save: async function() { return this; }
      };

      if (!isDbConnected()) {
        memoryStore.users.push(mockUser);
      } else {
        await User.create(mockUser);
      }
      user = mockUser;
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials. User record not found.'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Your account has been suspended.'
      });
    }

    // Lockout checks helper
    const checkLock = (u) => {
      return !!(u.lockUntil && u.lockUntil > Date.now());
    };

    if (checkLock(user)) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);
      return res.status(403).json({
        success: false,
        message: `Account temporarily locked due to multiple failed logins. Try again in ${remainingTime} minutes.`
      });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      user.loginAttempts += 1;
      
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
        user.status = 'locked';
        if (isDbConnected()) {
          await user.save();
        }
        return res.status(403).json({
          success: false,
          message: 'Account locked due to 5 consecutive failed logins. Locked for 30 minutes.'
        });
      }

      if (isDbConnected()) {
        await user.save();
      }
      const attemptsRemaining = 5 - user.loginAttempts;
      return res.status(400).json({
        success: false,
        message: `Invalid credentials. Attempts remaining: ${attemptsRemaining}`
      });
    }

    // Reset attempts & lockouts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.status = 'active';

    if (isDbConnected()) {
      await user.save();
    }

    // Send response with access and refresh tokens attached to cookies
    return tokenUtils.sendTokenResponse(user, 200, res, 'Login successful.');
  } catch (error) {
    console.error('[JCMS Auth Controller] Login error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Terminate user session and clear cookies
 * POST /api/logout
 */
const logout = async (req, res) => {
  try {
    let token = req.cookies.refreshToken;

    if (token) {
      const decoded = jwt.decode(token);
      if (decoded && decoded.id) {
        if (isDbConnected()) {
          await User.findByIdAndUpdate(decoded.id, { $unset: { refreshToken: 1 } });
        } else {
          const idx = memoryStore.users.findIndex(u => u._id === decoded.id);
          if (idx !== -1) memoryStore.users[idx].refreshToken = undefined;
        }
      }
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    console.error('[JCMS Auth Controller] Logout error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Logout processing failed.'
    });
  }
};

/**
 * Generate a new access token from valid refresh token cookie
 * POST /api/refresh-token
 */
const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Session expired: Refresh token is missing. Please log in again.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    let user;

    if (isDbConnected()) {
      user = await User.findById(decoded.id);
    } else {
      user = memoryStore.users.find(u => u._id === decoded.id);
    }

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session: Refresh token is revoked or user mismatch.'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account suspended.'
      });
    }

    // Generate new access token
    const newAccessToken = tokenUtils.generateAccessToken(user);

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    return res.status(200).json({
      success: true,
      message: 'Access token refreshed successfully.'
    });
  } catch (error) {
    console.error('[JCMS Auth Controller] Refresh Token error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Session validation failed. Please log in again.'
    });
  }
};

/**
 * Forgot Password - Send OTP code to email or mobile
 * POST /api/forgot-password
 */
const forgotPassword = async (req, res) => {
  const { emailOrMobile } = req.body;

  try {
    let user;

    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { email: emailOrMobile.toLowerCase() },
          { mobile: emailOrMobile }
        ]
      });
    } else {
      user = memoryStore.users.find(u => 
        u.email.toLowerCase() === emailOrMobile.toLowerCase() || u.mobile === emailOrMobile
      );
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No registered account found with that email or mobile number.'
      });
    }

    // Determine target channel (email or mobile)
    const isEmail = emailOrMobile.includes('@');
    let result;

    if (isEmail) {
      result = await emailService.sendOTP(user.email);
    } else {
      result = await smsService.sendOTP(user.mobile);
    }

    return res.status(200).json({
      success: true,
      message: `Verification code sent successfully to your registered ${isEmail ? 'email' : 'mobile'}.`,
      sandbox: result.sandbox || false
    });
  } catch (error) {
    console.error('[JCMS Auth Controller] Forgot Password trigger error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send recovery OTP code. Please try again.'
    });
  }
};

/**
 * Verify Recovery OTP code
 * POST /api/verify-reset-otp
 */
const verifyResetOtp = async (req, res) => {
  const { emailOrMobile, code } = req.body;

  if (!emailOrMobile || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide identifier and verification code.'
    });
  }

  try {
    const isEmail = emailOrMobile.includes('@');
    let result;

    if (isEmail) {
      result = await emailService.verifyOTP(emailOrMobile, code);
    } else {
      result = await smsService.verifyOTP(emailOrMobile, code);
    }

    if (result.success) {
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      
      if (isDbConnected()) {
        await OTPVerification.findOneAndUpdate(
          { identifier: emailOrMobile.toLowerCase() },
          { identifier: emailOrMobile.toLowerCase(), verified: true, expiry },
          { upsert: true, new: true }
        );
      } else {
        memoryStore.verifications.set(emailOrMobile.toLowerCase(), { verified: true, expiry });
      }

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully! You may now reset your password.'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Incorrect verification code.'
      });
    }
  } catch (error) {
    console.error('[JCMS Auth Controller] Verify Reset OTP error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};

/**
 * Reset User password to new entered value
 * POST /api/reset-password
 */
const resetPassword = async (req, res) => {
  const { emailOrMobile, password } = req.body;

  try {
    // 1. Check if verified token is valid
    let isVerified = false;

    if (isDbConnected()) {
      const verifyRecord = await OTPVerification.findOne({ identifier: emailOrMobile.toLowerCase(), verified: true });
      isVerified = !!verifyRecord;
    } else {
      const record = memoryStore.verifications.get(emailOrMobile.toLowerCase());
      isVerified = record && record.verified && (Date.now() < record.expiry);
    }
    
    if (!isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Action blocked: OTP verification was not completed or has expired.'
      });
    }

    // 2. Fetch user & update
    let user;
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { email: emailOrMobile.toLowerCase() },
          { mobile: emailOrMobile }
        ]
      });
      
      if (user) {
        user.password = password; // pre-save hook handles hashing
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.status = 'active';
        await user.save();
        await OTPVerification.deleteOne({ identifier: emailOrMobile.toLowerCase() });
      }
    } else {
      const idx = memoryStore.users.findIndex(u => 
        u.email.toLowerCase() === emailOrMobile.toLowerCase() || u.mobile === emailOrMobile
      );
      
      if (idx !== -1) {
        user = memoryStore.users[idx];
        user.password = hashed;
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.status = 'active';
        memoryStore.verifications.delete(emailOrMobile.toLowerCase());
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully! You can now log in.'
    });
  } catch (error) {
    console.error('[JCMS Auth Controller] Reset Password error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Reset password processing failed. Please try again.'
    });
  }
};

/**
 * Get User Profile
 * GET /api/user/profile
 */
const getUserProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      mobile: req.user.mobile,
      role: req.user.role,
      emailVerified: req.user.emailVerified,
      mobileVerified: req.user.mobileVerified,
      status: req.user.status,
      createdAt: req.user.createdAt
    }
  });
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getUserProfile
};
