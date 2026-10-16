const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const logger = require('../utils/logger');

// Ensure uploads directory exists
const { UPLOADS_DIR } = require('../config/runtime');
const uploadsDir = UPLOADS_DIR;
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Created uploads directory');
}

/**
 * Enhanced storage configuration with secure filename generation
 */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Get extension from original filename and sanitize it
        let ext = path.extname(file.originalname).toLowerCase();
        // Whitelist of allowed extensions
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.json'];
        
        if (allowedExts.includes(ext)) {
            // Generate a secure random filename to prevent path traversal attacks
            const randomBytes = crypto.randomBytes(16).toString('hex');
            // Create secure filename: timestamp-randomhex-ext
            cb(null, `${Date.now()}-${randomBytes}${ext}`);
        } else {
            // For unrecognized extensions, use the raw buffer bytes
            const rawBuffer = crypto.randomBytes(16);
            // Default to .bin for unrecognized extensions
            cb(null, `${Date.now()}-${rawBuffer.toString('hex')}0.bin`);
        }
    }
});

/**
 * Enhanced file filter for images with better security
 */
const imageFilter = (req, file, cb) => {
    // Allowed MIME types for images
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    // Verify both the MIME type and file extension
    const isAllowedMime = allowedMimeTypes.includes(file.mimetype);
    const fileExt = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExt);
    
    if (isAllowedMime && isAllowedExt) {
        logger.info('Valid image upload', { 
            filename: file.originalname,
            mimetype: file.mimetype,
            userId: req.user?._id
        });
        cb(null, true);
    } else {
        logger.warn('Invalid image upload rejected', { 
            filename: file.originalname,
            mimetype: file.mimetype,
            userId: req.user?._id
        });
        const error = new Error('Invalid file type! Please upload only JPG, PNG, GIF, or WebP images.');
        error.statusCode = 400;
        cb(error, false);
    }
};

/**
 * Enhanced file filter for backup files
 */
const backupFilter = (req, file, cb) => {
    // Check both MIME type and extension
    const isValidMime = file.mimetype === 'application/json';
    const fileExt = path.extname(file.originalname).toLowerCase();
    const isValidExt = fileExt === '.json';
    
    if (isValidMime && isValidExt) {
        logger.info('Valid backup file upload', { 
            filename: file.originalname,
            userId: req.user?._id
        });
        cb(null, true);
    } else {
        logger.warn('Invalid backup file upload rejected', { 
            filename: file.originalname,
            mimetype: file.mimetype,
            userId: req.user?._id
        });
        const error = new Error('Invalid file type! Please upload only JSON backup files.');
        error.statusCode = 400;
        cb(error, false);
    }
};

/**
 * Enhanced upload middleware for images
 */
const imageUpload = multer({
    storage: storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
        files: 1                   // Only allow one file per upload
    }
});

/**
 * Enhanced upload middleware for backup files
 */
const backupUpload = multer({
    storage: multer.memoryStorage(), // Store backup file in memory
    fileFilter: backupFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size for backup files
        files: 1                    // Only allow one file per upload
    }
});

// The client declares the type and names the file, so neither proves the
// content: look at the first bytes of what was stored
const NOT_AN_IMAGE = "That file isn't a PNG, JPEG, GIF or WebP image.";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isImageContent = (head) =>
    head.subarray(0, 8).equals(PNG_SIGNATURE)
    || (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    || ['GIF87a', 'GIF89a'].includes(head.toString('latin1', 0, 6))
    || (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP');

const readHead = async (filePath, length = 12) => {
    const handle = await fsp.open(filePath, 'r');
    try {
        const head = Buffer.alloc(length);
        const { bytesRead } = await handle.read(head, 0, length, 0);
        return head.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
};

/**
 * Keeps an image upload only when its bytes are a PNG, JPEG, GIF or WebP
 * image; anything else is deleted before a route can point at it.
 * Call this after imageUpload.
 */
const validateUploadedFile = async (req, res, next) => {
    if (!req.file) {
        return next();
    }

    try {
        if (isImageContent(await readHead(req.file.path))) {
            logger.info('File upload validated', {
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                userId: req.user?._id
            });
            return next();
        }

        logger.warn('Upload rejected: content is not an image', {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            userId: req.user?._id
        });
        try {
            await fsp.unlink(req.file.path);
        } catch (unlinkErr) {
            logger.error('Failed to delete invalid uploaded file', {
                path: req.file.path,
                error: unlinkErr.message
            });
        }
        const error = new Error(NOT_AN_IMAGE);
        error.statusCode = 400;
        next(error);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    imageUpload,
    backupUpload,
    validateUploadedFile
};
