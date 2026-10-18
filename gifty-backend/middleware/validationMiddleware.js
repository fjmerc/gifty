/**
 * Input validation middleware using express-validator
 */
const { body, validationResult, param, query } = require('express-validator');

/**
 * Common validation rules
 */
const validationRules = {
  // User validation
  registerUser: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, hyphens, and underscores'),
      
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
      
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
      
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters'),
      
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters'),
      
    body('dateOfBirth')
      .optional()
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
  ],

  // A new password from a reset link: the same rules as registration
  resetPassword: [
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
  ],

  // An invite: an optional email (normalised exactly as registration does,
  // so a tied invite matches) and an expiry of 1, 7 or 30 days
  createInvite: [
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
    body('days').optional().isIn([1, 7, 30]).withMessage('An invite lasts 1, 7 or 30 days').toInt()
  ],
  
  loginUser: [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
      
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
      
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
  ],
  
  updateUserProfile: [
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, hyphens, and underscores'),
      
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
      
    body('firstName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('First name cannot be empty if provided')
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters'),
      
    body('lastName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Last name cannot be empty if provided')
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters'),
      
    // Empty means "no date of birth"
    body('dateOfBirth')
      .optional({ values: 'falsy' })
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
  ],
  
  // Gift validation
  createGift: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Gift name is required')
      .isLength({ max: 100 })
      .withMessage('Gift name cannot exceed 100 characters'),
      
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
      
    body('price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
      
    body('recipient')
      .optional()
      .isMongoId()
      .withMessage('Invalid recipient ID'),
      
    body('event')
      .optional()
      .isMongoId()
      .withMessage('Invalid event ID'),
      
    body('link')
      .optional()
      .isURL()
      .withMessage('Link must be a valid URL')
  ],
  
  // Event validation
  createEvent: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Event title is required')
      .isLength({ max: 100 })
      .withMessage('Event title cannot exceed 100 characters'),
      
    body('date')
      .isISO8601()
      .withMessage('Event date must be a valid date'),
      
    body('recipients')
      .optional()
      .isArray()
      .withMessage('Recipients must be an array'),
      
    body('recipients.*')
      .optional()
      .isMongoId()
      .withMessage('Invalid recipient ID in recipients array'),
      
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters')
  ],
  
  // Recipient validation
  createRecipient: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Recipient name is required')
      .isLength({ max: 100 })
      .withMessage('Recipient name cannot exceed 100 characters'),
      
    body('relationship')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Relationship cannot exceed 50 characters'),
      
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
      
    body('preferences')
      .optional()
      .isArray()
      .withMessage('Preferences must be an array'),
      
    body('preferences.*')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Each preference cannot exceed 100 characters')
  ],
  
  // ID parameter validation
  validateId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid ID format')
  ],
  
  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
      
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ]
};

/**
 * Validate request
 * Middleware function that checks if there are any validation errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Check for common error cases to provide user-friendly messages
    const errorArray = errors.array();
    
    // Check for required field errors
    if (errorArray.some(err => err.msg.includes('required'))) {
      return res.status(400).json({
        message: 'Please provide all required fields',
        errors: errorArray.map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    
    // Registration: say what is wrong with the first invalid field
    if (req.path === '/register') {
      return res.status(400).json({
        message: errorArray[0].msg,
        errors: errorArray.map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }

    // For generic errors
    return res.status(400).json({ 
      message: 'Validation failed',
      errors: errorArray.map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

module.exports = {
  validationRules,
  validate
};
