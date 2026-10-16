import React, { useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faCamera, faCartShopping, faCat, faClock, faDumbbell, faGamepad, faGift, faHeadphones, faHeart, faHouse, faLeaf, faMusic, faPaintbrush, faPlane, faShirt, faStar, faThumbsUp, faTrash, faUtensils } from '@fortawesome/free-solid-svg-icons';
import { useDispatch } from 'react-redux';
import { submitFeedback, deleteGift } from '../../slices/giftLibrarySlice';
import useConfirm from '../ui/useConfirm';

const GiftCard = ({ gift, onDelete }) => {
  const dispatch = useDispatch();
  const { confirm, confirmDialog } = useConfirm();

  // Validate URL format and log any issues
  const isValidUrl = useCallback((url) => {
    if (!url) return false;
    try {
      // Web links only: library items come from scraped pages, and a
      // javascript: or data: link would run in this app's window
      const { protocol } = new URL(url);
      return protocol === 'http:' || protocol === 'https:';
    } catch (e) {
      console.error(`Invalid URL for gift "${gift.name}":`, url, e);
      return false;
    }
  }, [gift.name]);

  const getSourceDomain = (url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      const mainDomain = domain.split('.')[0];
      // Handle very long domain names
      return mainDomain.length > 15 ? mainDomain.substring(0, 12) + '...' : mainDomain;
    } catch (e) {
      console.error('Error parsing URL domain:', e);
      return 'source';
    }
  };

  const handleCardClick = (e) => {
    // Don't navigate if clicking on action buttons
    if (e.target.closest('.gift-card-actions')) {
      return;
    }


    if (!gift.sourceUrl) {
      console.warn(`No source URL for gift "${gift.name}"`);
      return;
    }

    if (!isValidUrl(gift.sourceUrl)) {
      console.error(`Invalid source URL for gift "${gift.name}": ${gift.sourceUrl}`);
      return;
    }

    window.open(gift.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: 'Delete from library',
      message: 'Are you sure you want to delete this gift from the library?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      if (onDelete) {
        onDelete(gift._id);
      } else {
        dispatch(deleteGift(gift._id));
      }
    }
  };

  const handleAction = (action) => {
    dispatch(submitFeedback({
      giftId: gift._id,
      action,
      feedback: ''
    }));
  };

  const getCategoryIcon = () => {
    const category = gift.categories?.[0]?.toLowerCase() || '';
    
    switch (category) {
      case 'electronics':
        return <FontAwesomeIcon icon={faHeadphones} style={{ fontSize: 50 }} />;
      case 'books':
        return <FontAwesomeIcon icon={faBook} style={{ fontSize: 50 }} />;
      case 'games':
      case 'gaming':
        return <FontAwesomeIcon icon={faGamepad} style={{ fontSize: 50 }} />;
      case 'photography':
        return <FontAwesomeIcon icon={faCamera} style={{ fontSize: 50 }} />;
      case 'food':
      case 'kitchen':
      case 'cooking':
        return <FontAwesomeIcon icon={faUtensils} style={{ fontSize: 50 }} />;
      case 'fashion':
      case 'clothing':
        return <FontAwesomeIcon icon={faShirt} style={{ fontSize: 50 }} />;
      case 'home':
      case 'decor':
        return <FontAwesomeIcon icon={faHouse} style={{ fontSize: 50 }} />;
      case 'art':
      case 'craft':
        return <FontAwesomeIcon icon={faPaintbrush} style={{ fontSize: 50 }} />;
      case 'fitness':
      case 'sports':
        return <FontAwesomeIcon icon={faDumbbell} style={{ fontSize: 50 }} />;
      case 'music':
        return <FontAwesomeIcon icon={faMusic} style={{ fontSize: 50 }} />;
      case 'travel':
        return <FontAwesomeIcon icon={faPlane} style={{ fontSize: 50 }} />;
      case 'romance':
      case 'wedding':
        return <FontAwesomeIcon icon={faHeart} style={{ fontSize: 50 }} />;
      case 'pets':
        return <FontAwesomeIcon icon={faCat} style={{ fontSize: 50 }} />;
      case 'garden':
      case 'outdoor':
        return <FontAwesomeIcon icon={faLeaf} style={{ fontSize: 50 }} />;
      default:
        return <FontAwesomeIcon icon={faGift} style={{ fontSize: 50 }} />;
    }
  };

  // Category tint for the placeholder icon, from the chart series tokens so
  // it follows the theme (the category name is shown as text beside it)
  const getCategoryColor = () => {
    const category = gift.categories?.[0]?.toLowerCase() || '';
    const series = {
      electronics: 1, photography: 1, fitness: 1, sports: 1,
      games: 2, gaming: 2, food: 2, kitchen: 2, cooking: 2,
      home: 3, decor: 3, garden: 3, outdoor: 3, pets: 3, travel: 3, music: 3,
      art: 4, craft: 4,
      fashion: 5, clothing: 5, romance: 5, wedding: 5,
      books: 6,
    }[category];
    return series ? `var(--color-data-${series})` : 'var(--color-primary)';
  };

  const extractGiftCount = (title) => {
    const numberMatch = title.match(/\d+/);
    if (numberMatch) {
      return parseInt(numberMatch[0]);
    }
    return null;
  };

  const getSourceBadge = () => {
    const badges = [];
    
    if (gift.sourceType === 'discovered') {
      badges.push(
        <span key="discovered" className="source-badge discovered">
          Discovered
        </span>
      );
    } else if (gift.sourceType === 'ai_generated') {
      badges.push(
        <span key="ai" className="source-badge ai-generated">
          AI Generated
        </span>
      );
    }

    // Add article badge if URL is from a known article source
    const isArticleUrl = (url) => {
      const articlePatterns = [
        'wirecutter',
        'nytimes.com',
        'reviews',
        'best-',
        'guide',
        'blog',
        'top-',
        'roundup',
        'recommendations',
        'gift-ideas',
        'buying-guide',
        'cnet.com',
        'reviewed.com',
        'techradar.com',
        '/article/',
        '/post/',
        '/gifts/',
        'holiday-gift'
      ];
      return articlePatterns.some(pattern => url.toLowerCase().includes(pattern));
    };

    if (gift.sourceUrl && isArticleUrl(gift.sourceUrl)) {
      const giftCount = extractGiftCount(gift.name);
      badges.push(
        <span key="article" className="source-badge article">
          {giftCount ? `${giftCount} Gift Ideas` : 'Gift Guide'}
        </span>
      );
    }

    return badges.length > 0 ? <div className="source-badges">{badges}</div> : null;
  };

  const formatDescription = (description) => {
    if (!gift.sourceUrl) return description;

    const isArticleUrl = (url) => url.toLowerCase().match(/(wirecutter|review|guide|best|gift|blog)/);    
    if (!isArticleUrl(gift.sourceUrl)) return description;

    return (
      <>
        <span className="curated-list-indicator">Curated gift ideas from </span>
        <span className="source-link">{getSourceDomain(gift.sourceUrl)}</span>
      </>
    );
  };

  const categoryColor = getCategoryColor();

  return (
    <>
      <div 
        className="gift-card" 
        onClick={handleCardClick} 
        style={{ cursor: gift.sourceUrl && isValidUrl(gift.sourceUrl) ? 'pointer' : 'default' }}
      >
        <div className="gift-card-image">
          <div className="gift-card-icon-placeholder" style={{ color: categoryColor }}>
            <div className="gift-card-icon-wrapper">
              {getCategoryIcon()}
            </div>
          </div>
          {gift.popularityScore > 80 && (
            <div className="popularity-badge">
              <FontAwesomeIcon icon={faStar} /> Popular
            </div>
          )}
          {getSourceBadge()}
        </div>

        <div className="gift-card-content">
          <h3 title={gift.name}>{gift.name}</h3>
          <p className="gift-description">
            {formatDescription(gift.description)}
          </p>

          <div className="gift-categories">
            {gift.categories.map((category, index) => (
              <span key={index} className="category-tag">
                {category}
              </span>
            ))}
          </div>

          {gift.metadata && gift.metadata.avgRating && (
            <div className="gift-rating">
              <FontAwesomeIcon icon={faStar} /> {gift.metadata.avgRating.toFixed(1)}
              <span className="review-count">
                ({gift.metadata.reviewCount} reviews)
              </span>
            </div>
          )}

          <div className="gift-card-actions">
            <button 
              className="action-btn like-btn"
              onClick={() => handleAction('liked')}
              title="Like this gift"
            >
              <FontAwesomeIcon icon={faThumbsUp} />
            </button>
            
            <button 
              className="action-btn purchase-btn"
              onClick={() => handleAction('purchased')}
              title="Mark as purchased"
            >
              <FontAwesomeIcon icon={faCartShopping} />
            </button>

            <button 
              className="action-btn delete-btn"
              onClick={handleDelete}
              title="Delete from library"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>

          {gift.discoveryDate && (
            <div className="discovery-date">
              <FontAwesomeIcon icon={faClock} /> Discovered {new Date(gift.discoveryDate).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      {/* Outside the card: its clicks must not reach the card's own click */}
      {confirmDialog}
    </>
  );
};

export default GiftCard;