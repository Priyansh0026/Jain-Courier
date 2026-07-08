const mongoose = require('mongoose');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const OTPVerification = require('../models/OTPVerification');
const User = require('../models/User');
const memoryStore = require('../config/memoryStore');

// Helper to check if MongoDB is active
const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Trigger SMS OTP verification code
 * POST /api/send-mobile-otp
 */
const sendMobileOTP = async (req, res) => {
  const { mobile, countryCode } = req.body;

  if (!mobile || !/^\d{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid 10-digit mobile number.'
    });
  }

  try {
    // Check registered users
    let userExists = false;
    if (isDbConnected()) {
      userExists = await User.findOne({ mobile });
    } else {
      userExists = memoryStore.users.some(u => u.mobile === mobile);
    }

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'This mobile number is already registered to an account.'
      });
    }

    // Call SMS Service to send OTP code
    const result = await smsService.sendOTP(mobile, countryCode);

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to mobile number.`,
      sandbox: result.sandbox || false
    });
  } catch (error) {
    console.error('[JCMS OTP Controller] Send Mobile OTP error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to deliver SMS OTP code. Please try again.'
    });
  }
};

/**
 * Verify SMS OTP verification code
 * POST /api/verify-mobile-otp
 */
const verifyMobileOTP = async (req, res) => {
  const { mobile, code, countryCode } = req.body;

  if (!mobile || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide mobile number and verification code.'
    });
  }

  try {
    // Call SMS Service verification
    const result = await smsService.verifyOTP(mobile, code, countryCode);

    if (result.success) {
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      
      if (isDbConnected()) {
        await OTPVerification.findOneAndUpdate(
          { identifier: mobile },
          { identifier: mobile, verified: true, expiry },
          { upsert: true, new: true }
        );
      } else {
        // Fallback to memoryStore
        memoryStore.verifications.set(mobile, { verified: true, expiry });
      }

      return res.status(200).json({
        success: true,
        message: 'Mobile number verified successfully!'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Incorrect verification code.'
      });
    }
  } catch (error) {
    console.error('[JCMS OTP Controller] Verify Mobile OTP error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP code. Please try again.'
    });
  }
};

/**
 * Trigger Email OTP verification code
 * POST /api/send-email-otp
 */
const sendEmailOTP = async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.'
    });
  }

  try {
    // Check registered users
    let userExists = false;
    if (isDbConnected()) {
      userExists = await User.findOne({ email });
    } else {
      userExists = memoryStore.users.some(u => u.email.toLowerCase() === email.toLowerCase());
    }

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'This email address is already registered to an account.'
      });
    }

    // Call Email Service to send SMTP mail
    const result = await emailService.sendOTP(email);

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to email address.`,
      sandbox: result.sandbox || false
    });
  } catch (error) {
    console.error('[JCMS OTP Controller] Send Email OTP error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to deliver email OTP code. Please try again.'
    });
  }
};

/**
 * Verify Email OTP verification code
 * POST /api/verify-email-otp
 */
const verifyEmailOTP = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and verification code.'
    });
  }

  try {
    // Call Email Service verification
    const result = await emailService.verifyOTP(email, code);

    if (result.success) {
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      
      if (isDbConnected()) {
        await OTPVerification.findOneAndUpdate(
          { identifier: email.toLowerCase() },
          { identifier: email.toLowerCase(), verified: true, expiry },
          { upsert: true, new: true }
        );
      } else {
        // Fallback to memoryStore
        memoryStore.verifications.set(email.toLowerCase(), { verified: true, expiry });
      }

      return res.status(200).json({
        success: true,
        message: 'Email address verified successfully!'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Incorrect verification code.'
      });
    }
  } catch (error) {
    console.error('[JCMS OTP Controller] Verify Email OTP error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP code. Please try again.'
    });
  }
};

module.exports = {
  sendMobileOTP,
  verifyMobileOTP,
  sendEmailOTP,
  verifyEmailOTP
};
