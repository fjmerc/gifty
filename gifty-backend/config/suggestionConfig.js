// Configuration for suggestion filtering and management
module.exports = {
  filtering: {
    // Minimum number of suggestions to always return
    minimumSuggestions: 3,
    
    // Default cooldown period in days
    defaultCooldownPeriod: 14,
    
    // Similarity threshold for considering items as duplicates (0-1)
    similarityThreshold: 0.8,
    
    // Maximum days to look back for suggestion history
    maxHistoryLookback: 90,
    
    // Enable dynamic cooldown based on user activity
    enableDynamicCooldown: true
  },
  
  hybrid: {
    // Ratio of discovered to AI-generated suggestions
    discoveredRatio: 0.7,
    
    // Minimum number of discovered gifts required for hybrid mode
    minimumDiscoveredGifts: 50,
    
    // Fallback to AI-only if insufficient discovered gifts
    enableFallback: true
  },
  
  feedback: {
    // Weight adjustments for different feedback types
    weights: {
      purchased: 5,
      saved: 2,
      favorited: 3,
      ignored: -1,
      disliked: -3
    },
    
    // Decay factor for older feedback (0-1)
    decayFactor: 0.9,
    
    // Maximum age of feedback to consider (days)
    maxFeedbackAge: 180
  }
};
