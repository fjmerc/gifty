const GiftLibrary = require('../models/GiftLibrary');
const logger = require('../utils/logger');

// Daily gift-library upkeep (popularity decay, archiving, dedup); scheduled
// by services/schedulerService.js
class DiscoveryMaintenance {
  constructor() {
    this.popularityDecayRate = 0.95; // 5% decay daily
    this.archiveThresholdDays = 90; // Archive gifts older than 90 days with low popularity
  }

  /**
   * Run daily maintenance tasks
   */
  async runDailyMaintenance() {
    try {
      logger.info('Starting daily maintenance...');
      
      // Update popularity scores
      await this.updatePopularityScores();
      
      // Archive stale gifts
      await this.archiveStaleGifts();
      
      // Clean up duplicates
      await this.cleanupDuplicates();
      
      logger.info('Daily maintenance completed');
    } catch (error) {
      logger.error('Daily maintenance failed:', error);
    }
  }

  /**
   * Update popularity scores with decay
   */
  async updatePopularityScores() {
    const result = await GiftLibrary.updateMany(
      { status: 'active' },
      [{ 
        $set: { 
          popularityScore: { 
            $multiply: ['$popularityScore', this.popularityDecayRate] 
          }
        }
      }]
    );
    
    logger.info(`Updated popularity scores for ${result.modifiedCount} gifts`);
  }

  /**
   * Archive stale gifts with low popularity
   */
  async archiveStaleGifts() {
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - this.archiveThresholdDays);
    
    const result = await GiftLibrary.updateMany(
      {
        status: 'active',
        discoveryDate: { $lt: archiveDate },
        popularityScore: { $lt: 10 } // Low popularity threshold
      },
      {
        $set: { status: 'archived' }
      }
    );
    
    logger.info(`Archived ${result.modifiedCount} stale gifts`);
  }

  /**
   * Clean up duplicate gifts
   */
  async cleanupDuplicates() {
    // Find potential duplicates by name
    const duplicates = await GiftLibrary.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: { name: '$name' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          discoveryDates: { $push: '$discoveryDate' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    let removedCount = 0;
    
    for (const duplicate of duplicates) {
      // Keep the oldest (original) gift
      const sortedIds = duplicate.ids
        .map((id, index) => ({ id, date: duplicate.discoveryDates[index] }))
        .sort((a, b) => a.date - b.date);
      
      const keepId = sortedIds[0].id;
      const removeIds = sortedIds.slice(1).map(item => item.id);
      
      // Archive the duplicates
      await GiftLibrary.updateMany(
        { _id: { $in: removeIds } },
        { $set: { status: 'archived' } }
      );
      
      removedCount += removeIds.length;
    }
    
    logger.info(`Cleaned up ${removedCount} duplicate gifts`);
  }

}

const instance = new DiscoveryMaintenance();
module.exports = { runDailyMaintenance: () => instance.runDailyMaintenance() };
