const { body, validationResult } = require('express-validator');

// Helper middleware to verify results and return formatted errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return the first validation error message to the client
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
};

// Register validations
const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Please enter your full name.')
    .isLength({ min: 3 }).withMessage('Name must be at least 3 characters.')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain alphabetic letters and spaces.'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Please enter your email address.')
    .isEmail().withMessage('Invalid email address format.'),
  
  body('mobile')
    .trim()
    .notEmpty().withMessage('Please enter your mobile number.')
    .isLength({ min: 10, max: 10 }).withMessage('Mobile number must be exactly 10 digits.')
    .isNumeric().withMessage('Mobile number can only contain digits.'),
  
  body('password')
    .notEmpty().withMessage('Please enter a password.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter (A-Z).')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter (a-z).')
    .matches(/\d/).withMessage('Password must contain at least one digit (0-9).')
    .matches(/[@$!%*?&#^()_+=\[\]{};':"\\|,.<>\/?`~-]/).withMessage('Password must contain at least one special character.'),
    
  handleValidationErrors
];

// Login validations
const validateLogin = [
  body('emailOrMobile')
    .trim()
    .notEmpty().withMessage('Please provide your registered email address or mobile number.'),
  
  body('password')
    .notEmpty().withMessage('Please provide your password.'),
    
  handleValidationErrors
];

// Forgot Password / OTP verify validations
const validateForgotPass = [
  body('emailOrMobile')
    .trim()
    .notEmpty().withMessage('Please enter your registered email address or mobile number.'),
    
  handleValidationErrors
];

// Password reset validations
const validateResetPass = [
  body('emailOrMobile')
    .trim()
    .notEmpty().withMessage('Please enter your registered email address or mobile number.'),
  
  body('password')
    .notEmpty().withMessage('Please enter a new password.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter (A-Z).')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter (a-z).')
    .matches(/\d/).withMessage('Password must contain at least one digit (0-9).')
    .matches(/[@$!%*?&#^()_+=\[\]{};':"\\|,.<>\/?`~-]/).withMessage('Password must contain at least one special character.'),
    
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPass,
  validateResetPass
};
