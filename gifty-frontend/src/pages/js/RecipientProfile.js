import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faTags, faGift, faMapMarkerAlt, faHeart, faBook, faFilm, faMusic, 
  faUserTie, faClock, faUsers, faUtensils, faTshirt, faListUl, faEdit, 
  faCalendarAlt, faChevronLeft, faChevronRight, faCamera, faBirthdayCake, 
  faCaretDown, faCaretUp, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import styles from '../css/RecipientProfile.module.css';
import RecipientNotFound from '../../components/ui/RecipientNotFound';
import { resolveAssetUrl } from '../../utils/apiBaseUrl';
import { initialsAvatar } from '../../utils/avatar';
import { formatMoney, formatLeftToSpend } from '../../utils/money';
import { todayLocalISO, dateOnlyISO, formatDateOnly } from '../../utils/dates';

const ImageWithFallback = ({ src, alt, fallback, ...props }) => {
  const [imgSrc, setImgSrc] = useState(src);

  useEffect(() => {
    const img = new Image();
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const imgSrcWithTimestamp = src ? `${src}?t=${timestamp}` : src;
    img.src = imgSrcWithTimestamp;
    img.onload = () => setImgSrc(imgSrcWithTimestamp);
    img.onerror = () => setImgSrc(fallback);
  }, [src, fallback]);

  return <img src={imgSrc} alt={alt} {...props} />;
};

const RecipientProfile = () => {
  const [recipient, setRecipient] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [budget, setBudget] = useState(null);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRecipientAndEvents = async () => {
      setIsLoading(true);
      setNotFound(false);
      setError(null);
      // The recipient first: only its own 404 means there is no such recipient
      let recipientResponse;
      try {
        recipientResponse = await axiosInstance.get(`/recipients/${id}`);
      } catch (error) {
        console.error('Error fetching data:', error);
        if (error.response?.status === 404) {
          setNotFound(true);
        } else {
          setError('Failed to load data. Please try again.');
        }
        setIsLoading(false);
        return;
      }
      try {
        const [eventsResponse, navigationResponse, budgetResponse] = await Promise.all([
          axiosInstance.get(`/events?recipient=${id}`),
          axiosInstance.get(`/recipients/${id}/navigation`),
          axiosInstance.get(`/budgets/recipient/${id}/${new Date().getFullYear()}`)
        ]);

        setRecipient(recipientResponse.data);
        setEvents(eventsResponse.data.sort((a, b) => new Date(a.date) - new Date(b.date)));
        setPrevId(navigationResponse.data.prevId);
        setNextId(navigationResponse.data.nextId);
        setBudget(budgetResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipientAndEvents();
  }, [id]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
      const response = await axiosInstance.post(`/recipients/${id}/upload-profile-picture`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setRecipient(prevState => ({ ...prevState, profilePicture: response.data.profilePicture }));
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      setUploadError(error.response?.data?.message || 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
      // Choosing the same file again must fire a change
      event.target.value = '';
    }
  };

  const navigateRecipient = (targetId) => {
    if (targetId) {
      navigate(`/recipients/${targetId}`);
    }
  };  

  const handleEdit = () => {
    navigate(`/recipients/${id}/edit`);
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin /> Loading...
      </div>
    );
  }
  if (notFound) return <RecipientNotFound />;
  if (error) return <div className={styles['error-message']}>{error}</div>;
  if (!recipient) return <div className={styles['error-message']}>No recipient data found.</div>;

  // Event dates are date-only: compare calendar days, so an event today is upcoming
  const today = todayLocalISO();
  const upcomingEvents = events.filter(event => dateOnlyISO(event.date) >= today);
  const pastEvents = events.filter(event => dateOnlyISO(event.date) < today);

  // Figures come from the server, in the overall budget's currency
  const budgetCurrency = budget?.currency || 'USD';
  const hasBudget = budget?.exists === true;
  const hasLimit = hasBudget && budget.limit !== null && budget.limit !== undefined;

  const handleRestore = async () => {
    try {
      await axiosInstance.post(`/recipients/${id}/restore`);
      setRecipient(prevState => ({ ...prevState, archived: false, archivedAt: null }));
      // Back in the list, so it has neighbours again
      const navigation = await axiosInstance.get(`/recipients/${id}/navigation`);
      setPrevId(navigation.data.prevId);
      setNextId(navigation.data.nextId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restore recipient. Please try again.');
    }
  };

  return (
    <div className={styles['recipient-profile-container']}>
      <div className={styles['recipient-profile']}>
        {recipient.archived && (
          <div role="status" className={styles['archived-banner']}>
            <span>
              {recipient.firstName} is archived: hidden from your lists, with no new events.
              Their purchased gifts stay in your spending history.
            </span>
            <button type="button" onClick={handleRestore}>Restore</button>
          </div>
        )}
        <div className={styles['profile-header']}>
          <button 
            className={styles['nav-button']} 
            onClick={() => navigateRecipient(prevId)}
            disabled={!prevId}
            aria-label="Previous recipient"
            title="Previous recipient"
          >
            <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
          </button>
          
          <div className={styles['profile-header-content']}>
            <div className={styles['profile-image-container']}>
              <ImageWithFallback
                src={resolveAssetUrl(recipient.profilePicture) || ''}
                alt={`${recipient.firstName} ${recipient.lastName}`} 
                fallback={initialsAvatar(recipient.firstName, recipient.lastName)}
                className={styles['profile-image']}
              />
              <label htmlFor="profile-picture-upload" className={styles['upload-button']}>
                <FontAwesomeIcon icon={faCamera} />
                <input
                  id="profile-picture-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  aria-describedby={uploadError ? 'profile-picture-upload-error' : undefined}
                  style={{ display: 'none' }}
                />
              </label>
              {isUploading && <span className={styles['uploading-text']}>Uploading...</span>}
            </div>
            {uploadError && (
              <p id="profile-picture-upload-error" role="alert" className={styles['upload-error']}>{uploadError}</p>
            )}
            <h1>{recipient.firstName} {recipient.lastName}</h1>
            <span className={styles['relation']}>{recipient.relation}</span>
          </div>
          
          <button 
            className={styles['nav-button']} 
            onClick={() => navigateRecipient(nextId)}
            disabled={!nextId}
            aria-label="Next recipient"
            title="Next recipient"
          >
            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </button>

          <button onClick={handleEdit} className={styles['edit-button']} aria-label="Edit Profile">
            <FontAwesomeIcon icon={faEdit} />
          </button>
        </div>

        <div className={styles['profile-layout']}>
          <div className={styles['events-sidebar']}>
            <h2><FontAwesomeIcon icon={faCalendarAlt} /> Events</h2>
            {upcomingEvents.length > 0 ? (
              <ul className={styles['event-list']}>
                {upcomingEvents.map((event) => (
                  <li key={event._id} className={styles['event-item']}>
                    <span className={styles['event-name']}>{event.name}</span>
                    <span className={styles['event-date']}>{formatDateOnly(event.date)}</span>
                    <span className={styles['event-type']}>{event.type?.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No upcoming events</p>
            )}
            {pastEvents.length > 0 && (
              <>
                <button className={styles['toggle-past-events']} onClick={() => setShowPastEvents(!showPastEvents)}>
                  {showPastEvents ? <FontAwesomeIcon icon={faCaretUp} /> : <FontAwesomeIcon icon={faCaretDown} />}
                  {showPastEvents ? 'Hide Past Events' : 'Show Past Events'}
                </button>
                {showPastEvents && (
                  <ul className={styles['event-list']}>
                    {pastEvents.map((event) => (
                      <li key={event._id} className={styles['event-item']}>
                        <span className={styles['event-name']}>{event.name}</span>
                        <span className={styles['event-date']}>{formatDateOnly(event.date)}</span>
                        <span className={styles['event-type']}>{event.type?.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className={styles['profile-content']}>
            {/* Personal Information Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faBirthdayCake} /> Personal Information</h2>
              <p><strong>Age:</strong> {recipient.age || 'Not available'}</p>
              <p><strong>Birthdate:</strong> {formatDateOnly(recipient.birthdate)}</p>
              <p><strong>Relationship Type:</strong> {recipient.relationship || 'Not specified'}</p>
            </section>

            {/* Gift Information Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faGift} /> Gift Information</h2>
              <p><strong>Gift Status:</strong> {recipient.giftStatus || 'Not set'}</p>
              {hasBudget ? (
                <>
                  <p><strong>Budget:</strong> {hasLimit ? formatMoney(budget.limit, budgetCurrency) : 'Unlimited'}</p>
                  <p><strong>Spent:</strong> {formatMoney(budget.spent, budgetCurrency)}</p>
                  {hasLimit && <p><strong>Left:</strong> {formatLeftToSpend(budget.left, budgetCurrency)}</p>}
                </>
              ) : (
                <>
                  <p><strong>Budget:</strong> No budget</p>
                  {budget?.spent > 0 && <p><strong>Spent:</strong> {formatMoney(budget.spent, budgetCurrency)}</p>}
                </>
              )}
              <p><strong>Gift Preferences:</strong> {recipient.giftPreferences || 'Not specified'}</p>
            </section>

            {/* Address Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faMapMarkerAlt} /> Address</h2>
              {recipient.address ? (
                <>
                  <p><strong>Street:</strong> {recipient.address.street || 'Not specified'}</p>
                  <p><strong>City:</strong> {recipient.address.city || 'Not specified'}</p>
                  <p><strong>State:</strong> {recipient.address.state || 'Not specified'}</p>
                  <p><strong>Country:</strong> {recipient.address.country || 'Not specified'}</p>
                  <p><strong>Zip Code:</strong> {recipient.address.zipCode || 'Not specified'}</p>
                </>
              ) : (
                <p>No address information available</p>
              )}
            </section>

            {/* Tags Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faTags} /> Tags</h2>
              <div className={styles['tag-list']}>
                {recipient.tags && recipient.tags.length > 0 ? (
                  recipient.tags.map((tag, index) => (
                    <span key={index} className={styles['tag']}>{tag.name}</span>
                  ))
                ) : (
                  <span>No tags</span>
                )}
              </div>
            </section>

            {/* Interests & Hobbies Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faHeart} /> Interests & Hobbies</h2>
              <div className={styles['list-items']}>
                {recipient.interests && recipient.interests.length > 0 ? (
                  recipient.interests.map((interest, index) => (
                    <span key={index} className={styles['list-item']}>{interest}</span>
                  ))
                ) : (
                  <span>No interests specified</span>
                )}
                {recipient.hobbies && recipient.hobbies.length > 0 ? (
                  recipient.hobbies.map((hobby, index) => (
                    <span key={index} className={styles['list-item']}>{hobby}</span>
                  ))
                ) : (
                  <span>No hobbies specified</span>
                )}
              </div>
            </section>

            {/* Favorite Books Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faBook} /> Favorite Books</h2>
              <div className={styles['list-items']}>
                {recipient.favoriteBooks && recipient.favoriteBooks.length > 0 ? (
                  recipient.favoriteBooks.map((book, index) => (
                    <span key={index} className={styles['list-item']}>{book}</span>
                  ))
                ) : (
                  <span>No favorite books specified</span>
                )}
              </div>
            </section>

            {/* Favorite Movies Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faFilm} /> Favorite Movies</h2>
              <div className={styles['list-items']}>
                {recipient.favoriteMovies && recipient.favoriteMovies.length > 0 ? (
                  recipient.favoriteMovies.map((movie, index) => (
                    <span key={index} className={styles['list-item']}>{movie}</span>
                  ))
                ) : (
                  <span>No favorite movies specified</span>
                )}
              </div>
            </section>

            {/* Favorite Music Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faMusic} /> Favorite Music</h2>
              <div className={styles['list-items']}>
                {recipient.favoriteMusic && recipient.favoriteMusic.length > 0 ? (
                  recipient.favoriteMusic.map((music, index) => (
                    <span key={index} className={styles['list-item']}>{music}</span>
                  ))
                ) : (
                  <span>No favorite music specified</span>
                )}
              </div>
            </section>

            {/* Occupation Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faUserTie} /> Occupation</h2>
              <p>{recipient.occupation || 'Not specified'}</p>
              <p><strong>Work Schedule:</strong> {recipient.workSchedule || 'Not specified'}</p>
            </section>

            {/* Relationship Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faClock} /> Relationship</h2>
              <p><strong>Length:</strong> {recipient.relationshipLength ? `${recipient.relationshipLength} years` : 'Not specified'}</p>
              <p><strong>Closeness:</strong> {recipient.relationshipCloseness || 'Not specified'}</p>
            </section>

            {/* Personality Traits Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faUsers} /> Personality Traits</h2>
              <div className={styles['list-items']}>
                {recipient.personalityTraits && recipient.personalityTraits.length > 0 ? (
                  recipient.personalityTraits.map((trait, index) => (
                    <span key={index} className={styles['list-item']}>{trait}</span>
                  ))
                ) : (
                  <span>No personality traits specified</span>
                )}
              </div>
            </section>

            {/* Dietary Restrictions Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faUtensils} /> Dietary Restrictions</h2>
              <div className={styles['list-items']}>
                {recipient.dietaryRestrictions && recipient.dietaryRestrictions.length > 0 ? (
                  recipient.dietaryRestrictions.map((restriction, index) => (
                    <span key={index} className={styles['list-item']}>{restriction}</span>
                  ))
                ) : (
                  <span>No dietary restrictions specified</span>
                )}
              </div>
            </section>

            {/* Clothing Sizes Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faTshirt} /> Clothing Sizes</h2>
              {recipient.clothingSizes ? (
                <>
                  <p><strong>Shirt:</strong> {recipient.clothingSizes.shirt || 'Not specified'}</p>
                  <p><strong>Pants:</strong> {recipient.clothingSizes.pants || 'Not specified'}</p>
                  <p><strong>Shoe:</strong> {recipient.clothingSizes.shoe || 'Not specified'}</p>
                </>
              ) : (
                <p>No clothing sizes specified</p>
              )}
            </section>

            {/* Wish List Section */}
            <section className={styles['profile-section']}>
              <h2><FontAwesomeIcon icon={faListUl} /> Wish List</h2>
              {recipient.wishList && recipient.wishList.length > 0 ? (
                <ul className={styles['wish-list']}>
                  {recipient.wishList.map((item, index) => (
                    <li key={index} className={styles['wish-list-item']}>
                      {item.item} <span className={styles['priority']}>{item.priority} priority</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No items in the wish list</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>  
  );
};

export default RecipientProfile;
