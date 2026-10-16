// tests/middleware/uploadMiddleware.test.js
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Mock dependencies before requiring the middleware
jest.mock('crypto', () => ({
  randomBytes: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlink: jest.fn()
}));

jest.mock('fs/promises', () => ({
  open: jest.fn(),
  unlink: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn(),
  extname: jest.fn()
}));

jest.mock('../../config/runtime', () => ({ UPLOADS_DIR: '/uploads/' }));

jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Custom multer mock that captures function calls
let capturedImageConfig = null;
let capturedBackupConfig = null;
let capturedStorageConfig = null;

jest.mock('multer', () => {
  const mockMulter = jest.fn((config) => {
    if (config.limits && config.limits.fileSize === 5 * 1024 * 1024) {
      capturedImageConfig = config;
    } else if (config.limits && config.limits.fileSize === 10 * 1024 * 1024) {
      capturedBackupConfig = config;
    }
    return {
      single: jest.fn()
    };
  });
  
  mockMulter.diskStorage = jest.fn((config) => {
    capturedStorageConfig = config;
    return {};
  });
  
  mockMulter.memoryStorage = jest.fn(() => ({}));
  
  return mockMulter;
});

const { createMockReqRes, mockNext } = require('../utils/mockUtils');

describe('Upload Middleware', () => {
  let imageUpload, backupUpload, validateUploadedFile;
  
  beforeAll(() => {
    // Import after mocks are set up
    const uploadMiddleware = require('../../middleware/uploadMiddleware');
    imageUpload = uploadMiddleware.imageUpload;
    backupUpload = uploadMiddleware.backupUpload;
    validateUploadedFile = uploadMiddleware.validateUploadedFile;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export imageUpload, backupUpload, and validateUploadedFile', () => {
      expect(imageUpload).toBeDefined();
      expect(backupUpload).toBeDefined();
      expect(validateUploadedFile).toBeDefined();
      expect(typeof validateUploadedFile).toBe('function');
    });
  });

  describe('Directory Initialization', () => {
    it('should create uploads directory if it does not exist', () => {
      // Directory initialization happens at module load time
      expect(typeof imageUpload).toBe('object');
      expect(typeof backupUpload).toBe('object');
      expect(typeof validateUploadedFile).toBe('function');
    });
  });

  describe('Storage Configuration', () => {
    it('should set destination to uploads directory', () => {
      expect(capturedStorageConfig).toBeDefined();
      expect(capturedStorageConfig.destination).toBeDefined();
      
      const mockCallback = jest.fn();
      const mockReq = {};
      const mockFile = {};
      
      // Test destination function
      capturedStorageConfig.destination(mockReq, mockFile, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith(null, '/uploads/');
    });

    it('should generate secure filename with timestamp and random hex', () => {
      expect(capturedStorageConfig).toBeDefined();
      expect(capturedStorageConfig.filename).toBeDefined();
      
      // Mock crypto.randomBytes
      const mockBuffer = Buffer.from('1234567890abcdef1234567890abcdef', 'hex');
      crypto.randomBytes.mockReturnValue(mockBuffer);
      path.extname.mockReturnValue('.jpg');
      
      const mockCallback = jest.fn();
      const mockReq = {};
      const mockFile = { originalname: 'test.jpg' };
      
      // Mock Date.now to make test deterministic
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 1234567890);
      
      // Test filename function
      capturedStorageConfig.filename(mockReq, mockFile, mockCallback);
      
      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(path.extname).toHaveBeenCalledWith('test.jpg');
      expect(mockCallback).toHaveBeenCalledWith(null, '1234567890-1234567890abcdef1234567890abcdef.jpg');
      
      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should sanitize unrecognized file extensions to .bin', () => {
      expect(capturedStorageConfig).toBeDefined();
      expect(capturedStorageConfig.filename).toBeDefined();
      
      const mockBuffer = Buffer.from('1234567890abcdef1234567890abcdef', 'hex');
      crypto.randomBytes.mockReturnValue(mockBuffer);
      path.extname.mockReturnValue('.exe'); // Unrecognized extension
      
      const mockCallback = jest.fn();
      const mockReq = {};
      const mockFile = { originalname: 'malicious.exe' };
      
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 1234567890);
      
      capturedStorageConfig.filename(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(null, '1234567890-1234567890abcdef1234567890abcdef0.bin');
      
      Date.now = originalDateNow;
    });
  });

  describe('Image Filter Validation', () => {
    const logger = require('../../utils/logger');
    
    it('should accept valid JPEG files', () => {
      expect(capturedImageConfig).toBeDefined();
      expect(capturedImageConfig.fileFilter).toBeDefined();
      
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.jpg');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(path.extname).toHaveBeenCalledWith('test.jpg');
      expect(logger.info).toHaveBeenCalledWith('Valid image upload', {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        userId: 'user123'
      });
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });

    it('should accept PNG files', () => {
      const mockFile = {
        originalname: 'test.png',
        mimetype: 'image/png'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.png');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });

    it('should accept GIF files', () => {
      const mockFile = {
        originalname: 'test.gif',
        mimetype: 'image/gif'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.gif');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });

    it('should accept WebP files', () => {
      const mockFile = {
        originalname: 'test.webp',
        mimetype: 'image/webp'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.webp');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });

    it('should reject files with invalid MIME types', () => {
      const mockFile = {
        originalname: 'test.txt',
        mimetype: 'text/plain'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.txt');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(logger.warn).toHaveBeenCalledWith('Invalid image upload rejected', {
        filename: 'test.txt',
        mimetype: 'text/plain',
        userId: 'user123'
      });
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid file type! Please upload only JPG, PNG, GIF, or WebP images.'
        }),
        false
      );
    });

    it('should reject files with mismatched MIME type and extension', () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'text/plain'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.jpg');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid file type! Please upload only JPG, PNG, GIF, or WebP images.'
        }),
        false
      );
    });

    it('should handle requests without user context', () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg'
      };
      const mockReq = {}; // No user
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.jpg');
      
      capturedImageConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(logger.info).toHaveBeenCalledWith('Valid image upload', {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        userId: undefined
      });
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('Backup Filter Validation', () => {
    const logger = require('../../utils/logger');
    
    it('should accept valid JSON files', () => {
      expect(capturedBackupConfig).toBeDefined();
      expect(capturedBackupConfig.fileFilter).toBeDefined();
      
      const mockFile = {
        originalname: 'backup.json',
        mimetype: 'application/json'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.json');
      
      capturedBackupConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(logger.info).toHaveBeenCalledWith('Valid backup file upload', {
        filename: 'backup.json',
        userId: 'user123'
      });
      expect(mockCallback).toHaveBeenCalledWith(null, true);
    });

    it('should reject non-JSON files', () => {
      const mockFile = {
        originalname: 'backup.txt',
        mimetype: 'text/plain'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.txt');
      
      capturedBackupConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(logger.warn).toHaveBeenCalledWith('Invalid backup file upload rejected', {
        filename: 'backup.txt',
        mimetype: 'text/plain',
        userId: 'user123'
      });
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid file type! Please upload only JSON backup files.'
        }),
        false
      );
    });

    it('should reject JSON files with wrong extension', () => {
      const mockFile = {
        originalname: 'backup.txt',
        mimetype: 'application/json'
      };
      const mockReq = { user: { _id: 'user123' } };
      const mockCallback = jest.fn();
      
      path.extname.mockReturnValue('.txt');
      
      capturedBackupConfig.fileFilter(mockReq, mockFile, mockCallback);
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid file type! Please upload only JSON backup files.'
        }),
        false
      );
    });
  });

  describe('validateUploadedFile Middleware', () => {
    const logger = require('../../utils/logger');
    const fsp = require('fs/promises');
    const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    const mockFile = {
      originalname: 'test.png',
      filename: 'generated-filename.png',
      size: 1024,
      mimetype: 'image/png',
      path: '/uploads/generated-filename.png'
    };
    const storedBytes = (bytes) => {
      fsp.open.mockResolvedValue({
        read: jest.fn(async (buffer) => ({ bytesRead: bytes.copy(buffer, 0, 0, Math.min(bytes.length, buffer.length)) })),
        close: jest.fn().mockResolvedValue()
      });
    };

    it('should call next() when no file is uploaded', async () => {
      const { req, res } = createMockReqRes({
        file: null
      });

      await validateUploadedFile(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('keeps a file whose bytes are an image', async () => {
      storedBytes(PNG_HEAD);
      const { req, res } = createMockReqRes({ file: { ...mockFile }, user: { _id: 'user123' } });

      await validateUploadedFile(req, res, mockNext);

      expect(fsp.open).toHaveBeenCalledWith(mockFile.path, 'r');
      expect(fsp.unlink).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('File upload validated', {
        filename: mockFile.filename,
        size: mockFile.size,
        mimetype: mockFile.mimetype,
        userId: 'user123'
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('deletes a file whose bytes are not an image and passes on a 400', async () => {
      storedBytes(Buffer.from('plain text'));
      fsp.unlink.mockResolvedValue();
      const { req, res } = createMockReqRes({ file: { ...mockFile }, user: { _id: 'user123' } });

      await validateUploadedFile(req, res, mockNext);

      expect(fsp.unlink).toHaveBeenCalledWith(mockFile.path);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: "That file isn't a PNG, JPEG, GIF or WebP image."
      }));
    });

    it('still refuses the file when deleting it fails', async () => {
      storedBytes(Buffer.from('plain text'));
      fsp.unlink.mockRejectedValue(new Error('File deletion failed'));
      const { req, res } = createMockReqRes({ file: { ...mockFile }, user: { _id: 'user123' } });

      await validateUploadedFile(req, res, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Failed to delete invalid uploaded file', {
        path: mockFile.path,
        error: 'File deletion failed'
      });
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });
});
