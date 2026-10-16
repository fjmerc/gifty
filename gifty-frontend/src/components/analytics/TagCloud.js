import React, { useState } from 'react';
import styles from '../css/analytics/TagCloud.module.css';

const TagCloud = ({ data, isLoading }) => {
  // State for sorting and filtering
  const [maxTags, setMaxTags] = useState(50);
  const [minCount, setMinCount] = useState(2);
  
  // Only real tags: nothing while loading or when the period is empty
  const hasData = !isLoading && Array.isArray(data) && data.length > 0;

  // Process and prepare tag data
  const prepareTagData = () => {
    if (!hasData) return [];

    // Filter by minimum count and limit the number of tags
    return [...data]
      .filter(tag => tag.count >= minCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxTags);
  };

  const tagData = prepareTagData();
  
  // Find max and min counts for font size calculation
  const maxCount = tagData.length > 0 
    ? Math.max(...tagData.map(tag => tag.count)) 
    : 10;
  const minTagCount = tagData.length > 0 
    ? Math.min(...tagData.map(tag => tag.count)) 
    : 1;

  // Calculate font size based on tag count (normalized between 0.8 and 1.5)
  const calculateFontSize = (count) => {
    if (maxCount === minTagCount) return 1; // If all tags have the same count
    const size = 0.8 + ((count - minTagCount) / (maxCount - minTagCount)) * 0.7;
    return Math.max(0.8, Math.min(1.5, size)); // Ensure size is between 0.8 and 1.5
  };

  // Handle max tags change
  const handleMaxTagsChange = (e) => {
    setMaxTags(parseInt(e.target.value, 10));
  };

  // Handle min count change
  const handleMinCountChange = (e) => {
    setMinCount(parseInt(e.target.value, 10));
  };

  return (
    <div className={`card ${styles.tagCloudCard}`}>
      <div className={`card-header ${styles.cardHeader}`}>
        <h5>Tag Cloud</h5>
      </div>
      <div className="card-body">
        <div className={styles.controls}>
          <div className={styles.formGroup}>
            <label htmlFor="maxTags" className={`form-label ${styles.formLabel}`}>Max Tags</label>
            <select id="maxTags"
              value={maxTags} 
              onChange={handleMaxTagsChange}
              className={`form-select ${styles.formSelect}`}
              disabled={!hasData}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={150}>150</option>
            </select>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="minCount" className={`form-label ${styles.formLabel}`}>Min Occurrences</label>
            <select id="minCount"
              value={minCount} 
              onChange={handleMinCountChange}
              className={`form-select ${styles.formSelect}`}
              disabled={!hasData}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>
        
        <div className={styles.tagCloudContainer}>
          {isLoading ? (
            <div className={styles.loadingPlaceholder}>
              <span>Loading tag data...</span>
            </div>
          ) : tagData.length > 0 ? (
            <div className={styles.tagCloud}>
              {tagData.map((tag, index) => (
                <span 
                  key={index} 
                  className={styles.tag}
                  style={{ 
                    fontSize: `${calculateFontSize(tag.count)}em`,
                    opacity: 0.6 + (tag.count / maxCount) * 0.4,
                    padding: `${Math.max(3, Math.min(6, 3 + (tag.count / maxCount) * 3))}px ${Math.max(8, Math.min(12, 8 + (tag.count / maxCount) * 4))}px`
                  }}
                  title={`${tag.tag}: ${tag.count} occurrences`}
                >
                  {tag.tag}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.noDataMessage}>
              {hasData
                ? `No tags appear at least ${minCount} times in this period. Lower Min Occurrences to see more.`
                : 'No tag data available for the selected period.'}
            </p>
          )}
        </div>
        
        {!isLoading && tagData.length > 0 && (
          <div className={styles.tagCountInfo}>
            Showing {tagData.length} tags (min {minCount} occurrences)
          </div>
        )}
      </div>
    </div>
  );
};

export default TagCloud;
