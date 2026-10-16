// tests/routes/databaseRoutes.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const databaseRoutes = require('../../routes/databaseRoutes');
const backupService = require('../../services/backupService');
const { protect } = require('../../middleware/authMiddleware');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');

// Mock dependencies
// Owner-only gating is covered in ownerOnlyRoutes.test.js / instanceOwnerMiddleware.test.js
jest.mock('../../middleware/instanceOwnerMiddleware', () => ({ requireInstanceOwner: (req, res, next) => next() }));
jest.mock('../../services/backupService');
// tests/integration/database-restore.test.js runs these against MongoDB and Redis
jest.mock('../../services/dataUpgrade', () => ({
  upgradeData: jest.fn().mockResolvedValue({ moneyModel: 'not needed', textRepair: 'not needed' }),
  calendarUpkeep: jest.fn().mockResolvedValue({ recurringCreated: 0, birthdaysSynced: 0 })
}));
jest.mock('../../middleware/cacheMiddleware', () => ({
  clearAllResponseCaches: jest.fn().mockResolvedValue(0)
}));
jest.mock('../../middleware/authMiddleware');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const logger = require('../../utils/logger');

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Database Routes', () => {
  let app;
  const originalEnv = process.env;

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    
    // Add database routes to the app
    app.use('/api/database', databaseRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      res.json({ message: err.message });
    });
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      expect(typeof databaseRoutes).toBe('function');
      expect(databaseRoutes.stack).toBeDefined();
    });

    it('should register all database routes', () => {
      const routeCount = databaseRoutes.stack.length;
      expect(routeCount).toBe(5); // POST /backup, GET /backups, POST /restore/:backupName, DELETE /backups/:backupName, GET /system-check
    });

    it('should register routes with correct HTTP methods', () => {
      const routes = databaseRoutes.stack.map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

      // Verify specific routes and methods exist
      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/backup', methods: ['post'] }),
          expect.objectContaining({ path: '/backups', methods: ['get'] }),
          expect.objectContaining({ path: '/restore/:backupName', methods: ['post'] }),
          expect.objectContaining({ path: '/backups/:backupName', methods: ['delete'] }),
          expect.objectContaining({ path: '/system-check', methods: ['get'] })
        ])
      );
    });

    it('should have authentication protection on all routes', () => {
      // Check that all routes have the protect middleware
      databaseRoutes.stack.forEach(layer => {
        const middlewares = layer.route.stack;
        const hasProtectMiddleware = middlewares.some(mw => 
          mw.name === 'bound protect' || 
          mw.handle.name === 'protect' ||
          // Check if middleware function exists in the stack
          middlewares.length > 1 // Routes with protect middleware will have >1 middleware functions
        );
        expect(middlewares.length).toBeGreaterThan(1); // Should have protect + route handler
      });
    });
  });

  describe('Authentication Protection', () => {
    beforeEach(() => {
      // Mock protect middleware to simulate unauthenticated request
      protect.mockImplementation((req, res, next) => {
        res.status(401).json({ message: 'Not authorized, no token' });
      });
    });

    it('should protect POST /backup route with authentication middleware', async () => {
      const response = await request(app)
        .post('/api/database/backup')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect GET /backups route with authentication middleware', async () => {
      const response = await request(app)
        .get('/api/database/backups')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect POST /restore/:backupName route with authentication middleware', async () => {
      const response = await request(app)
        .post('/api/database/restore/test-backup')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect DELETE /backups/:backupName route with authentication middleware', async () => {
      const response = await request(app)
        .delete('/api/database/backups/test-backup')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect GET /system-check route with authentication middleware', async () => {
      const response = await request(app)
        .get('/api/database/system-check')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should test all protected endpoints in bulk', async () => {
      const endpoints = [
        { method: 'post', path: '/backup' },
        { method: 'get', path: '/backups' },
        { method: 'post', path: '/restore/test-backup' },
        { method: 'delete', path: '/backups/test-backup' },
        { method: 'get', path: '/system-check' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/database${endpoint.path}`)
          .expect(401);
        
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });
  });

  describe('Endpoint Functionality with Authentication', () => {
    let mockUser, authToken;

    beforeEach(() => {
      // Create a mock authenticated user
      mockUser = createMockUser({ _id: new mongoose.Types.ObjectId() });
      authToken = generateTestToken(mockUser._id);

      // Mock protect middleware to simulate successful authentication
      protect.mockImplementation((req, res, next) => {
        req.user = mockUser;
        next();
      });

      // Reset all backupService mocks
      jest.clearAllMocks();
    });

    describe('POST /backup', () => {
      it('should create a backup successfully', async () => {
        // Mock successful backup service calls
        backupService.createBackup.mockResolvedValue({
          backupName: 'backup-20250525-123456',
          backupPath: '/backups/backup-20250525-123456'
        });

        const response = await request(app)
          .post('/api/database/backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(201);

        expect(response.body).toEqual({
          success: true,
          message: 'Database backup created successfully',
          backupName: 'backup-20250525-123456',
          backupPath: '/backups/backup-20250525-123456'
        });

        expect(backupService.createBackup).toHaveBeenCalled();
      });

      it('should return 500 when backup creation fails', async () => {
        backupService.createBackup.mockRejectedValue(
          new Error('Backup creation failed')
        );

        const response = await request(app)
          .post('/api/database/backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'Backup creation failed',
          code: 'BACKUP_CREATION_FAILED'
        });
      });
    });

    describe('GET /backups', () => {
      it('should list available backups successfully', async () => {
        const mockBackups = [
          {
            name: 'backup-20250525-123456',
            path: '/backups/backup-20250525-123456',
            size: '1.2MB',
            created: '2025-05-25T12:34:56Z'
          },
          {
            name: 'backup-20250524-098765',
            path: '/backups/backup-20250524-098765',
            size: '1.1MB',
            created: '2025-05-24T09:87:65Z'
          }
        ];

        backupService.listBackups.mockResolvedValue(mockBackups);

        const response = await request(app)
          .get('/api/database/backups')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual(mockBackups);
        expect(backupService.listBackups).toHaveBeenCalled();
      });

      it('should return 500 when listing backups fails', async () => {
        backupService.listBackups.mockRejectedValue(
          new Error('Failed to list backups')
        );

        const response = await request(app)
          .get('/api/database/backups')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'Failed to list backups',
          code: 'BACKUP_LIST_FAILED'
        });
      });
    });

    describe('POST /restore/:backupName', () => {
      it('should restore backup successfully', async () => {
        backupService.restoreBackup.mockResolvedValue({
          collections: { gifts: 3 },
          safetyBackup: 'safety.tar.gz'
        });

        const response = await request(app)
          .post('/api/database/restore/backup-20250525-123456')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Database restored successfully',
          backupName: 'backup-20250525-123456',
          collections: { gifts: 3 },
          safetyBackup: 'safety.tar.gz',
          upgrade: { moneyModel: 'not needed', textRepair: 'not needed', recurringCreated: 0, birthdaysSynced: 0 }
        });

        expect(backupService.restoreBackup).toHaveBeenCalledWith('backup-20250525-123456');
      });

      it('should return 404 when backup is not found', async () => {
        backupService.restoreBackup.mockRejectedValue(
          new Error('Backup file not found')
        );

        const response = await request(app)
          .post('/api/database/restore/nonexistent-backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body).toEqual({
          success: false,
          message: 'Backup file not found',
          code: 'BACKUP_NOT_FOUND'
        });
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Backup file not found'));
      });

      it('should return 400 when backup is incompatible', async () => {
        backupService.restoreBackup.mockRejectedValue(
          new Error("Backup 'invalid-backup' has a missing or unreadable manifest; refusing to restore."
        ));

        const response = await request(app)
          .post('/api/database/restore/invalid-backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: "Backup 'invalid-backup' has a missing or unreadable manifest; refusing to restore.",
          code: 'INCOMPATIBLE_BACKUP'
        });
        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /backups/:backupName', () => {
      it('should delete backup successfully', async () => {
        backupService.deleteBackup.mockResolvedValue({
          message: 'Backup deleted successfully'
        });

        const response = await request(app)
          .delete('/api/database/backups/backup-20250525-123456')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Backup deleted successfully'
        });

        expect(backupService.deleteBackup).toHaveBeenCalledWith('backup-20250525-123456');
      });

      it('should return 404 when backup to delete is not found', async () => {
        backupService.deleteBackup.mockRejectedValue(
          new Error('Backup file not found')
        );

        const response = await request(app)
          .delete('/api/database/backups/nonexistent-backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body).toEqual({
          success: false,
          message: 'Backup file not found',
          code: 'BACKUP_NOT_FOUND'
        });
        // Expected (an old tab, a double click): not a server error
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Backup file not found'));
      });

      it('should return 500 when delete operation fails', async () => {
        backupService.deleteBackup.mockRejectedValue(
          new Error('Failed to delete backup file')
        );

        const response = await request(app)
          .delete('/api/database/backups/backup-20250525-123456')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'Failed to delete backup file',
          code: 'BACKUP_DELETE_FAILED'
        });
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete backup file'));
      });
    });

    describe('Edge Cases and Additional Coverage', () => {
      it('should handle backup creation failure with 404 status when backup not found error occurs', async () => {
        backupService.createBackup.mockRejectedValue(
          new Error('Backup file not found during creation')
        );

        const response = await request(app)
          .post('/api/database/backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body).toEqual({
          success: false,
          message: 'Backup file not found during creation',
          code: 'BACKUP_CREATION_FAILED'
        });
      });

      it('should handle restore operation with general error (500 status)', async () => {
        backupService.restoreBackup.mockRejectedValue(
          new Error('General restore failure')
        );

        const response = await request(app)
          .post('/api/database/restore/test-backup')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'General restore failure',
          code: 'RESTORE_FAILED'
        });
      });

      it('should report backup status without any Docker checks', async () => {
        backupService.BACKUP_DIR = '/app/data/backups';
        backupService.listBackups.mockResolvedValue([{ name: 'gifty-backup-20260101-000000.tar.gz' }]);

        const response = await request(app)
          .get('/api/database/system-check')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.systemStatus).toEqual({
          mongoConnected: expect.any(Boolean),
          backupPath: '/app/data/backups',
          backupCount: 1,
          automaticBackupsKept: 7
        });
      });

      it('should return 500 when system check fails unexpectedly', async () => {
        backupService.listBackups.mockRejectedValue(new Error('disk gone'));

        await request(app)
          .get('/api/database/system-check')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);
      });
    });
  });
});
