import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagic, faEdit, faTrash, faSave, faFilter, faSpinner, faStar as fasStar, faPlus, faDollarSign, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Tooltip } from 'react-tooltip';
import styles from '../css/Gifts.module.css';
import AddGiftForm from '../../components/forms/js/AddGiftForm';
import Modal from '../../components/ui/Modal';
import useConfirm from '../../components/ui/useConfirm';
import SuggestionModeSelector from '../../components/ui/SuggestionModeSelector';
import AIProviderSelector from '../../components/ui/AIProviderSelector';
import GiftFeedback from '../../components/ui/GiftFeedback';
import SystemHealthIndicator from '../../components/ui/SystemHealthIndicator';
import SourceBadge from '../../components/ui/SourceBadge';
import WebSources from '../../components/ui/WebSources';
import { useInstanceInfo } from '../../utils/instanceInfo';
import { formatMoney } from '../../utils/money';
import { getBudgetDisplay as getBudgetLabel } from '../../utils/giftBudget';
import { dateOnlyISO, todayLocalISO } from '../../utils/dates';

// What to tell the user when generating suggestions failed: the server's own
// message for refusals (4xx) and honest AI failures (502), and plain copy for
// the cases where the server's text is not meant for people
export const describeGenerateError = (err) => {
  const status = err?.response?.status;
  const data = err?.response?.data || {};
  if (!err?.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (status === 429) {
    const wait = Number(data.retryAfter) > 0 ? ` Try again in ${Number(data.retryAfter)} seconds.` : '';
    return `${data.message || 'You are generating suggestions too quickly.'}${wait}`;
  }
  if (status === 408) {
    return 'Generating took too long and was stopped. Please try again, or try Basic mode, which is faster. If a few suggestions were saved just as it stopped, they show after you reload the page.';
  }
  if (status === 502 && data.message) return data.message;
  if (status >= 400 && status < 500 && data.message) return data.message;
  return 'The server ran into a problem while generating suggestions. Please try again in a moment.';
};

const Gifts = () => {
  const [gifts, setGifts] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [events, setEvents] = useState([]);
  // Every event, for the add/edit form (it filters by the gift's recipient)
  const [allEvents, setAllEvents] = useState([]);
  const [budgets, setBudgets] = useState({ overallBudget: null, recipientBudgets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [webSearchWarning, setWebSearchWarning] = useState(null);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const instanceInfo = useInstanceInfo();
  // Favorites links here as /gifts?edit=<gift id>
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const aiDisabled = instanceInfo?.features?.ai === false;
  const [filterRecipient, setFilterRecipient] = useState('');
  const [selectedGifts, setSelectedGifts] = useState([]);
  const [showAddGiftForm, setShowAddGiftForm] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [editingGift, setEditingGift] = useState(null);
  const [suggestionMode, setSuggestionMode] = useState('basic');
  const [aiProvider, setAiProvider] = useState(null);
  const [aiModel, setAiModel] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [suggestionsDataCount, setSuggestionsDataCount] = useState(0);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState({});
  // feedbackSubmitted tracks which gifts have received user feedback
  const [loadedFeedback, setLoadedFeedback] = useState(false);
  // Timeout tracking for cleanup
  const timeoutRefs = useRef([]);
  // Simplified feedback tracking (removed dual state)
  const feedbackRef = useRef({});

  // Utility functions for timeout management
  const addTimeout = (timeoutId) => {
    timeoutRefs.current.push(timeoutId);
  };

  const clearAllTimeouts = () => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
  };

  const setTimedMessage = (setter, message, duration = 3000) => {
    setter(message);
    const timeoutId = setTimeout(() => setter(null), duration);
    addTimeout(timeoutId);
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  // Every figure of the year is in the overall budget's currency
  const currency = budgets?.currency || budgets?.overallBudget?.currency || 'USD';

  const fetchGifts = useCallback(async () => {
    try {
      setIsLoading(true);
      // Default API page size is 20 — request everything; this page has no pagination UI
      const response = await axiosInstance.get('/gifts', { params: { limit: 1000 } });

      // Add detailed logging to debug the response format

      let responseData = response.data;
      let giftsData = [];

      if (Array.isArray(responseData)) {
        // Format 1: Direct array of gifts
        giftsData = responseData;
      } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
        // Format 2: Object with a data property containing the array
        giftsData = responseData.data;
      } else if (responseData && responseData.gifts && Array.isArray(responseData.gifts)) {
        // Format 3: Object with a gifts property containing the array
        giftsData = responseData.gifts;
      } else {
        console.error('Unexpected response format from /gifts:', responseData);
        console.error('Expected formats: direct array, {data: []}, or {gifts: []}');
        console.error('Received structure:', JSON.stringify(responseData, null, 2));
        setError('Received an unexpected response format from the server for gifts. Please check the console for details.');
        setIsLoading(false);
        return;
      }

      const giftsWithStatus = giftsData.map(gift => ({
        ...gift,
        status: gift.status || 'suggestion'
      }));
      setGifts(giftsWithStatus);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching gifts:', err);
      setError('Failed to load gifts. Please try again.');
      setIsLoading(false);
    }
  }, []);

  const fetchRecipients = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/recipients');
      const sortedRecipients = response.data.sort((a, b) => 
        a.firstName.localeCompare(b.firstName)
      );
      setRecipients(sortedRecipients);
    } catch (err) {
      console.error('Error fetching recipients:', err);
      setError('Failed to load recipients. Please try again.');
    }
  }, []);

  const fetchEvents = useCallback(async (recipientId = '') => {
    try {
      const response = await axiosInstance.get(`/events${recipientId ? `?recipient=${recipientId}` : ''}`);
      if (!recipientId) setAllEvents(response.data);
      const today = todayLocalISO();
      
      // Filter for upcoming events and remove duplicates
      const uniqueUpcomingEvents = response.data
        .map(event => ({
          ...event,
          date: event.date ? new Date(event.date).toISOString() : null
        }))
        .filter(event => {
          // Today's and later events (dates are calendar days, not instants)
          return event.date && dateOnlyISO(event.date) >= today;
        })
        .reduce((unique, event) => {
          // Remove duplicates based on event name for the same recipient
          const exists = unique.find(e => e.name === event.name);
          if (!exists) {
            unique.push(event);
          }
          return unique;
        }, []);

      setEvents(uniqueUpcomingEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events. Please try again.');
    }
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const response = await axiosInstance.get(`/budgets/all/${currentYear}`);
      setBudgets(response.data || { overallBudget: null, recipientBudgets: [] });
    } catch (err) {
      console.error('Error fetching budgets:', err);
      setBudgets({ overallBudget: null, recipientBudgets: [] });
    }
  }, []);

  const fetchFeedbackCount = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/feedback/analytics');
      // Check if we have data and a valid globalMetrics property
      if (response.data && response.data.globalMetrics) {
        const interactionCount = response.data.globalMetrics.totalInteractions || 0;
        setSuggestionsDataCount(interactionCount);
      }
    } catch (err) {
      console.error('Error fetching feedback count:', err);
      // If there's an error, assume there's no data yet
      setSuggestionsDataCount(0);
    }
  }, []);

  const fetchUserFeedback = useCallback(async () => {
    try {
      setLoadedFeedback(false); // Ensure we show loading state
      
      // Fetch all feedback logs for the current user
      const response = await axiosInstance.get('/feedback/user');
      
      // Convert the array of feedback logs to an object keyed by giftId
      const feedbackMap = {};
      
      // Handle both response formats (array or object with feedback property)
      const feedbackData = response.data && response.data.feedback 
        ? response.data.feedback  // analytics branch format (object with feedback property)
        : response.data;          // modifications branch format (direct array)
      
      if (Array.isArray(feedbackData) && feedbackData.length > 0) {
        feedbackData.forEach(feedback => {
          // Check if we're dealing with an object with an _id property (populated gift)
          const giftId = typeof feedback.gift === 'object' && feedback.gift?._id 
            ? feedback.gift._id 
            : feedback.gift;
            
          feedbackMap[giftId] = {
            action: feedback.action,
            rating: feedback.explicitRating,
            timestamp: feedback.timestamp
          };
        });
      }

      // Update both the state and the ref for persistent access
      setFeedbackSubmitted(feedbackMap);
      feedbackRef.current = feedbackMap;
      setLoadedFeedback(true);
    } catch (err) {
      console.error('Error fetching user feedback:', err);
      // If the endpoint doesn't exist yet, we'll just continue without feedback data
      setLoadedFeedback(true);
    }
  }, []);

  // Fetch system health data
  const fetchSystemHealth = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/gift-library/system-health');
      setSystemHealth(response.data);
      
      // Load saved suggestion mode preference and AI provider/model.
      const settingsResponse = await axiosInstance.get('/settings/user-preferences');
      if (settingsResponse.data?.suggestionMode) {
        setSuggestionMode(settingsResponse.data.suggestionMode);
      }
      if (settingsResponse.data?.aiProvider) setAiProvider(settingsResponse.data.aiProvider);
      if (settingsResponse.data?.aiModel) setAiModel(settingsResponse.data.aiModel);
      if (settingsResponse.data?.activeProvider) setActiveProvider(settingsResponse.data.activeProvider);
      if (settingsResponse.data?.activeModel) setActiveModel(settingsResponse.data.activeModel);
    } catch (error) {
      console.error('Error fetching system health:', error);
    }
  }, []);

  // The server answers a saved choice with the provider and model now in
  // use, so the "Active" label follows (also back to the server default)
  const applyActive = (data) => {
    if (data && 'activeProvider' in data) setActiveProvider(data.activeProvider);
    if (data && 'activeModel' in data) setActiveModel(data.activeModel);
  };

  // Persist AI provider/model when user changes the dropdown.
  const handleAIProviderChange = async ({ provider, model }) => {
    setAiProvider(provider);
    setAiModel(model);
    try {
      const res = await axiosInstance.post('/settings/user-preferences', {
        aiProvider: provider,
        aiModel: model,
      });
      applyActive(res.data);
    } catch (error) {
      console.error('Error updating AI provider preference:', error);
      setError(error.response?.data?.message || 'Could not save the AI model choice. Please try again.');
    }
  };

  useEffect(() => {
    // Independent requests, side by side. Feedback is fetched once here and
    // again whenever the window regains focus.
    const fetchAllData = () => Promise.all([
      fetchUserFeedback().catch((error) => {
        console.error('Failed to fetch user feedback initially:', error);
      }),
      fetchGifts(),
      fetchRecipients(),
      fetchEvents(),
      fetchBudgets(),
      fetchFeedbackCount(),
      fetchSystemHealth()
    ]);

    fetchAllData();
    
    // Re-fetch feedback when component is focused (user returns to tab/window)
    const handleFocus = () => {
      fetchUserFeedback();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearAllTimeouts();
    };
  }, [fetchGifts, fetchRecipients, fetchEvents, fetchBudgets, fetchFeedbackCount, fetchUserFeedback, fetchSystemHealth]);

  // Open the gift named in ?edit= once the list is loaded (purchased gifts
  // are loaded too, though the list doesn't show them)
  useEffect(() => {
    if (!editId || isLoading) return;
    const gift = gifts.find(g => g._id === editId);
    if (gift) {
      setEditingGift(gift);
      setShowAddGiftForm(true);
    } else {
      // A failed load already explains why the gift is missing: keep that message
      setError(prev => prev || 'That gift no longer exists.');
    }
    setSearchParams({}, { replace: true });
  }, [editId, isLoading, gifts, setSearchParams]);

  const handleRecipientChange = (e) => {
    setSelectedRecipient(e.target.value);
    setSelectedEvent('');
    fetchEvents(e.target.value);
  };

  const handleEventChange = (e) => {
    setSelectedEvent(e.target.value);
  };

  // Save the chosen mode; it is restored on the next visit. A mode that
  // could not be saved goes back to the previous one.
  const handleSuggestionModeChange = async (mode) => {
    const previous = suggestionMode;
    setSuggestionMode(mode);
    try {
      const res = await axiosInstance.post('/settings/user-preferences', { suggestionMode: mode });
      applyActive(res.data);
    } catch (error) {
      console.error('Error updating suggestion mode:', error);
      setSuggestionMode(previous);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!selectedRecipient || !selectedEvent) {
      setError('Please select both a recipient and an event.');
      return;
    }
  
    setIsGeneratingSuggestions(true);
    clearMessages();
    setWebSearchWarning(null);
  
    try {
      
      // Determine which flags to set based on the selected mode
      const isEnhanced = suggestionMode === 'enhanced';
      const isWebSearch = suggestionMode === 'web';
      const isHybrid = suggestionMode === 'hybrid';
      
      const response = await axiosInstance.post('/gifts/suggestions', {
        recipientId: selectedRecipient,
        eventId: selectedEvent,
        enhanced: isEnhanced,
        webEnhanced: isWebSearch,
        hybrid: isHybrid,
        // Per-request override; falls back to user preference / env default.
        aiProvider: aiProvider || undefined,
        aiModel: aiModel || undefined,
      });
      
      // Add detailed logging to debug the response format
      
      let responseData = response.data;

      // Check if responseData is null, undefined, or not an object/array
      if (!responseData || typeof responseData !== 'object') {
        console.error('Invalid response data:', responseData);
        setError('Failed to generate gift suggestions due to invalid data from the server.');
        return;
      }

      let suggestions = [];
      let webSearchInfo = null;
      
      // Handle multiple possible response formats
      if (responseData && responseData.suggestions && responseData.webSearchInfo) {
        // Format 1: Object with suggestions and webSearchInfo
        suggestions = responseData.suggestions;
        webSearchInfo = responseData.webSearchInfo;
      } else if (Array.isArray(responseData)) {
        // Format 2: Direct array of suggestions
        suggestions = responseData;
      } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
        // Format 3: Object with a data property containing the array
        suggestions = responseData.data;
      } else if (responseData && responseData.suggestions && Array.isArray(responseData.suggestions)) {
        // Format 4: Object with only suggestions property
        suggestions = responseData.suggestions;
      } else {
        console.error('Unexpected response format:', responseData);
        console.error('Expected formats: {suggestions: [], webSearchInfo: {...}}, direct array, {data: []}, or {suggestions: []}');
        console.error('Received structure:', JSON.stringify(responseData, null, 2));
        setError('Received an unexpected response format from the server. Please check the console for details.');
        return;
      }
      
      // Web search warnings, and a notice when nothing new came back (all
      // ideas were already chosen, repeats or filtered out)
      const notices = [];
      if (webSearchInfo && webSearchInfo.warning) notices.push(webSearchInfo.warning);
      if (suggestions.length === 0) {
        notices.push('No new suggestions this time: every idea was already chosen, shown before or filtered out. Try again, or try another mode.');
      }
      if (notices.length > 0) {
        setTimedMessage(setWebSearchWarning, notices.join(' '), 10000);
      }
      
      const newSuggestions = suggestions.map(suggestion => ({
        ...suggestion,
        status: suggestion.status || 'suggestion',
        recipient: recipients.find(r => r._id === selectedRecipient),
        event: events.find(e => e._id === selectedEvent)
      }));
  
      // A repeated request within a few minutes gets the server's last answer:
      // add only gifts not already shown
      setGifts(prevGifts => [
        ...prevGifts,
        ...newSuggestions.filter(suggestion => !prevGifts.some(gift => gift._id === suggestion._id))
      ]);
      if (responseData.fromCache) {
        setTimedMessage(setSuccess, 'These are the same suggestions as a moment ago. Rate or remove them to get new ideas.', 8000);
      }
    } catch (err) {
      console.error('Error generating gift suggestions:', err);
      setError(describeGenerateError(err));
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleEditGift = (gift) => {
    setEditingGift(gift);
    setShowAddGiftForm(true);
  };

  const handleDeleteGift = async (giftId) => {
    const gift = gifts.find(g => g._id === giftId);
    const confirmed = await confirm({
      title: 'Delete gift',
      message: gift ? `Delete "${gift.name}"? This cannot be undone.` : 'Delete this gift? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axiosInstance.delete(`/gifts/${giftId}`);
      setGifts(prevGifts => prevGifts.filter(gift => gift._id !== giftId));
      // Spent and Left are derived from purchases; refresh them
      await fetchBudgets();
    } catch (err) {
      console.error('Error deleting gift:', err);
      setError('Failed to delete gift. Please try again.');
    }
  };

  const handleDeleteSelectedGifts = async () => {
    const confirmed = await confirm({
      title: 'Delete selected gifts',
      message: `Delete ${selectedGifts.length} selected gift(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(selectedGifts.map(giftId =>
      axiosInstance.delete(`/gifts/${giftId}`).then(() => giftId)
    ));
    const deletedIds = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failedCount = results.length - deletedIds.length;

    setGifts(prevGifts => prevGifts.filter(gift => !deletedIds.includes(gift._id)));
    setSelectedGifts(prevSelected => prevSelected.filter(id => !deletedIds.includes(id)));
    await fetchBudgets();

    if (failedCount > 0) {
      console.error(`Failed to delete ${failedCount} gift(s)`);
      setError(`Failed to delete ${failedCount} of ${results.length} gifts. Please try again.`);
    }
  };

  const handleUpdateGiftStatus = async (giftId, newStatus) => {
    try {
      const response = await axiosInstance.patch(`/gifts/${giftId}/status`, { status: newStatus });
      setGifts(prevGifts => prevGifts.map(gift => gift._id === giftId ? { ...gift, ...response.data, status: response.data.status || gift.status } : gift));
      // Spent and Left are derived from purchases; refresh them
      await fetchBudgets();
    } catch (err) {
      console.error('Error updating gift status:', err);
      setError('Failed to update gift status. Please try again.');
    }
  };

  // A purchase is dated the user's local today; the server answers with any budget warning
  const handlePurchaseGift = async (giftId) => {
    try {
      clearMessages();
      const giftToPurchase = gifts.find(gift => gift._id === giftId);
      if (!giftToPurchase) {
        throw new Error('Gift not found');
      }

      const confirmed = await confirm({
        title: 'Mark as purchased',
        message: `Mark "${giftToPurchase.name}" (${formatMoney(giftToPurchase.price, currency)}) as purchased? It will count toward this year's spending.`,
        confirmLabel: 'Mark purchased',
      });
      if (!confirmed) return;

      const response = await axiosInstance.post(`/gifts/${giftId}/purchase`, { purchaseDate: todayLocalISO() });

      // Preserve the existing gift data while updating with new purchase information
      setGifts(prevGifts => prevGifts.map(gift =>
        gift._id === giftId ? {
          ...gift,
          ...response.data.gift,
          _id: giftId, // Ensure we keep the ID
          status: 'purchased',
          recipient: gift.recipient, // Preserve recipient data
          event: gift.event // Preserve event data
        } : gift
      ));

      await fetchBudgets();

      if (response.data.warning) {
        setTimedMessage(setSuccess, `Gift purchased. ${response.data.warning}`, 10000);
      } else {
        setTimedMessage(setSuccess, 'Gift purchased successfully!');
      }
    } catch (err) {
      console.error('Error purchasing gift:', err);
      setError(err.response?.data?.message || 'Failed to purchase gift. Please try again.');
    }
  };

  const handleFilterChange = (e) => {
    setFilterRecipient(e.target.value);
  };

  const handleGiftSelection = (giftId) => {
    setSelectedGifts(prevSelected => 
      prevSelected.includes(giftId)
        ? prevSelected.filter(id => id !== giftId)
        : [...prevSelected, giftId]
    );
  };

  const handleFavoriteToggle = async (giftId) => {
    try {
      const response = await axiosInstance.patch(`/gifts/${giftId}/favorite`);
      setGifts(prevGifts => prevGifts.map(gift => 
        gift._id === giftId 
          ? { 
              ...gift, 
              ...response.data,
              _id: giftId, // Ensure we keep the ID
              event: gift.event,
              recipient: gift.recipient,
              status: response.data.status || gift.status || 'suggestion'
            } 
          : gift
      ));
    } catch (err) {
      console.error('Error updating favorite status:', err);
      setError('Failed to update favorite status. Please try again.');
    }
  };

  const handleAddGift = () => {
    setEditingGift(null);
    setShowAddGiftForm(true);
  };

  // One request per save: the server handles "save and mark purchased" atomically
  const handleFormSubmit = async (formData) => {
    try {
      clearMessages();
      const response = editingGift
        ? await axiosInstance.put(`/gifts/${editingGift._id}`, formData)
        : await axiosInstance.post('/gifts', formData);
      const updatedGift = response.data.gift;
      const purchaseWarning = response.data.warning || null;

      // Ensure we have all the required data
      const enrichedGift = {
        ...updatedGift,
        _id: updatedGift._id, // Ensure we keep the ID
        status: updatedGift.status || 'suggestion',
        // The server answers with recipient and event named
        recipient: (updatedGift.recipient?.firstName && updatedGift.recipient)
          || recipients.find(r => r._id === formData.recipientId)
          || (editingGift?.recipient?._id === formData.recipientId && editingGift.recipient)
          || { firstName: 'Unknown', lastName: '' },
        event: (updatedGift.event?.name && updatedGift.event)
          || allEvents.find(e => e._id === formData.eventId)
          || (editingGift?.event?._id === formData.eventId && editingGift.event)
          || { name: 'Unknown Event' }
      };

      setGifts(prevGifts =>
        editingGift
          ? prevGifts.map(gift => gift._id === editingGift._id ? enrichedGift : gift)
          : [...prevGifts, enrichedGift]
      );

      setShowAddGiftForm(false);
      setEditingGift(null);
      await fetchBudgets(); // Spent and Left are derived from purchases

      if (purchaseWarning) {
        setTimedMessage(setSuccess, `Gift saved. ${purchaseWarning}`, 10000);
      }
    } catch (err) {
      console.error('Error saving gift:', err);
      setError(err.response?.data?.message || 'Failed to save gift. Please try again.');
    }
  };

  const handleFormCancel = () => {
    setShowAddGiftForm(false);
    setEditingGift(null);
  };

  const handleFeedbackSubmitted = async (giftId, action, rating) => {
    try {
      // Create the feedback data object
      const feedbackData = { 
        action, 
        rating, 
        timestamp: new Date().toISOString() 
      };
      
      // Update feedback state (simplified to single source)
      const updatedFeedback = {
        ...feedbackSubmitted,
        [giftId]: feedbackData
      };
      
      setFeedbackSubmitted(updatedFeedback);
      feedbackRef.current = updatedFeedback;
      
      
      // Refresh the feedback count in case we've reached the threshold
      fetchFeedbackCount();
      
      // If the user marked the suggestion as "Not Helpful" (action: ignored), remove it from the list
      if (action === 'ignored') {
        // Remove the gift from the UI after a small delay to ensure feedback is recorded
        const removeTimeoutId = setTimeout(() => {
          setGifts(prevGifts => prevGifts.filter(gift => gift._id !== giftId));
        }, 1500);
        addTimeout(removeTimeoutId);
      }
      
      // After feedback is submitted, fetch the updated feedback data from the server
      // This ensures our state is synchronized with the backend
      const refreshTimeoutId = setTimeout(() => {
        fetchUserFeedback();
      }, 2000);
      addTimeout(refreshTimeoutId);
    } catch (err) {
      console.error('Error handling feedback submission:', err);
      setTimedMessage(setError, 'Failed to process feedback. Please try again.');
    }
  };

  const getBudgetDisplay = (gift) => {
    const { label, kind } = getBudgetLabel(gift, budgets?.recipientBudgets, currency);
    const className = kind === 'none'
      ? styles.noBudget
      : kind === 'unlimited'
        ? styles.unlimitedBudget
        : styles.budgetAmount;
    return (
      <p className={styles.budget}>
        <span className={styles.label}>Budget: </span>
        <span className={className}>{label}</span>
      </p>
    );
  };

  // Ensure gifts is always an array before filtering
const filteredGifts = Array.isArray(gifts)
  ? filterRecipient
    ? gifts.filter(gift => gift.recipient?._id === filterRecipient && gift.status !== 'purchased' && gift.status !== 'ignored')
    : gifts.filter(gift => gift.status !== 'purchased' && gift.status !== 'ignored')
  : [];

// Sort filtered gifts by date (most recent first)
const sortedGifts = [...filteredGifts].sort((a, b) => {
  // For purchased gifts, sort by purchaseDate
  if (a.purchaseDate && b.purchaseDate) {
    return new Date(b.purchaseDate) - new Date(a.purchaseDate);
  }
  // For suggestions, sort by createdAt or updatedAt if available
  const dateA = a.updatedAt || a.createdAt || 0;
  const dateB = b.updatedAt || b.createdAt || 0;
  return new Date(dateB) - new Date(dateA);
});

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin /> Loading...
      </div>
    );
  }
  return (
    <div className={styles.giftsPage}>
      <div className={styles.container}>
        <h1 className={styles.title}>Gifts Dashboard</h1>
        
        {/* Message Display */}
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.giftGenerator} aria-busy={isGeneratingSuggestions}>
          <h2>Generate Gift Suggestions</h2>
          
          {/* System Health Indicator */}
          {suggestionMode === 'hybrid' && (
            <SystemHealthIndicator 
              systemHealth={systemHealth} 
              onHealthUpdate={(newHealth) => setSystemHealth(newHealth)}
            />
          )}
          
          {/* Rendered at once (health and feedback fill in later) so the
              fields below never jump down when they arrive */}
          <SuggestionModeSelector
            selectedMode={suggestionMode}
            onModeChange={handleSuggestionModeChange}
            interactionCount={suggestionsDataCount}
            systemHealth={systemHealth}
          />
          <AIProviderSelector
            provider={aiProvider}
            model={aiModel}
            onChange={handleAIProviderChange}
            activeProvider={activeProvider}
            activeModel={activeModel}
          />
          {webSearchWarning && (
            <div className={styles.webSearchWarning}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
              {webSearchWarning}
            </div>
          )}
          <div className={styles.selectorContainer}>
            <select value={selectedRecipient} onChange={handleRecipientChange} aria-label="Recipient">
              <option value="">Select a Recipient</option>
              {recipients.map(recipient => (
                <option key={recipient._id} value={recipient._id}>
                  {recipient.firstName} {recipient.lastName}
                </option>
              ))}
            </select>

            <select value={selectedEvent} onChange={handleEventChange} disabled={!selectedRecipient} aria-label="Event">
              <option value="">Select an Event</option>
              {events.map(event => (
                <option key={event._id} value={event._id}>{event.name}</option>
              ))}
            </select>

            <button
              onClick={handleGenerateSuggestions}
              disabled={aiDisabled || isGeneratingSuggestions || !selectedRecipient || !selectedEvent}
              className={styles.generateButton}
            >
              {isGeneratingSuggestions ? (
                <div className={styles.buttonLoading}>
                  <FontAwesomeIcon icon={faSpinner} spin /> Generate Suggestions
                </div>
              ) : (
                <><FontAwesomeIcon icon={faMagic} /> Generate Suggestions</>
              )}
            </button>
            {aiDisabled && (
              <p className={styles.aiNotConfigured} role="status">
                AI suggestions aren't configured on this server. An admin can add an AI provider key — see the README.
              </p>
            )}
          </div>
          {/* Always rendered, so screen readers announce the change */}
          <p className={styles.generatingStatus} role="status" aria-live="polite">
            {isGeneratingSuggestions ? 'Generating… this can take up to a minute.' : ''}
          </p>
        </div>

        <div className={styles.giftList}>
          <h2>Gift List</h2>
          <p className={styles.selectionHelp}>Tick a gift's checkbox, or click anywhere on its card, to select it for bulk actions.</p>
          <div className={styles.filterContainer}>
            <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
            <select value={filterRecipient} onChange={handleFilterChange} aria-label="Filter gifts by recipient">
              <option value="">All Recipients</option>
              {recipients.map(recipient => (
                <option key={recipient._id} value={recipient._id}>
                  {recipient.firstName} {recipient.lastName}
                </option>
              ))}
            </select>
          </div>
          {selectedGifts.length > 0 && (
            <button onClick={handleDeleteSelectedGifts} className={styles.deleteSelectedButton}>
              <FontAwesomeIcon icon={faTrash} /> Delete Selected ({selectedGifts.length})
            </button>
          )}
          <div className={styles.giftGrid}>
            {sortedGifts.map(gift => {
              const giftStatus = gift.status || 'suggestion';
              const giftCurrency = currency;
              // Suggested prices (AI or gift library) are estimates, not shop prices
              const isEstimate = (gift.isAISuggested || gift.isDiscovered) && giftStatus !== 'purchased';
              const estimateSource = gift.isDiscovered ? 'Estimated from the gift library' : 'Estimated by the AI';
              return (
                <div 
                  key={gift._id} 
                  className={`${styles.giftCard} ${gift.isAISuggested ? styles.aiSuggested : ''} ${selectedGifts.includes(gift._id) ? styles.selected : ''}`}
                  onClick={() => handleGiftSelection(gift._id)}
                >
                  <input
                    type="checkbox"
                    className={styles.selectBox}
                    checked={selectedGifts.includes(gift._id)}
                    onChange={() => handleGiftSelection(gift._id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${gift.name}`}
                  />
                  {/* Source Badge */}
                  {gift.sourceType && <SourceBadge sourceType={gift.sourceType} />}
                  <div className={styles.giftHeader} onClick={(e) => e.stopPropagation()}>
                    <h3>{gift.name}</h3>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFavoriteToggle(gift._id);
                      }}
                      className={styles.favoriteButton}
                      aria-label={gift.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      title={gift.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <FontAwesomeIcon icon={gift.favorite ? fasStar : farStar} />
                    </button>
                  </div>
                  <p>{gift.description}</p>
                  <div className={styles.giftDetails}>
                    <p className={styles.price} title={isEstimate ? estimateSource : undefined}>
                      <span className={styles.label}>Price:</span> {`${isEstimate ? '≈ ' : ''}${formatMoney(gift.price, giftCurrency)}`}
                      {gift.overBudget && giftStatus !== 'purchased' && (
                        <span className={styles.overBudgetTag}>Over budget</span>
                      )}
                    </p>
                    {gift.category && (
                      <p className={styles.category}>
                        <span className={styles.label}>Category:</span> {gift.category}
                      </p>
                    )}
                    {gift.tags && gift.tags.length > 0 && (
                      <p className={styles.tags}>
                        <span className={styles.label}>Tags:</span>{" "}
                        <span className={styles.tagList}>
                          {gift.tags.map((tag, index) => (
                            <span key={index} className={styles.tag}>{tag}</span>
                          ))}
                        </span>
                      </p>
                    )}
                    {gift.whereToBuy && gift.whereToBuy.length > 0 && (
                      <p className={styles.whereToBuy}>
                        <span className={styles.label}>Where to Buy:</span>{" "}
                        {gift.whereToBuy.join(", ")}
                      </p>
                    )}
                    <p className={styles.recipient}>
                      <span className={styles.label}>Recipient: </span> 
                      {gift.recipient ? `${gift.recipient.firstName} ${gift.recipient.lastName}` : 'Unknown'}
                    </p>
                    <p className={styles.event}>
                      <span className={styles.label}>Event: </span> 
                      {gift.event ? gift.event.name : 'Unknown Event'}
                    </p>
                    <p className={styles.status}>
                      <span className={styles.label}>Status: </span> 
                      {giftStatus.charAt(0).toUpperCase() + giftStatus.slice(1)}
                    </p>
                    {getBudgetDisplay(gift)}
                    
                    {/* Web-Enhanced: the pages the web search returned for it */}
                    <WebSources sources={gift.webSources} />
                  </div>
                  {gift.isAISuggested && !gift.sourceType && (
                    <div className={styles.aiInfo}>
                      <p className={styles.aiLabel}>
                        AI Suggested
                        {gift.aiProvider && (
                          <span className={styles.aiProviderBadge} title={gift.aiModel || gift.aiProvider}>
                            {' · '}{gift.aiProvider}{gift.aiModel ? ` (${gift.aiModel})` : ''}
                          </span>
                        )}
                      </p>
                      {gift.relevanceScore && gift.relevanceScore < 100 && (
                        <p className={styles.relevanceScore}>
                          Relevance: {gift.relevanceScore}/100
                        </p>
                      )}
                    </div>
                  )}
                  <div className={styles.giftActions} onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditGift(gift);
                      }} 
                      className={styles.editButton}
                      data-tooltip-id={`edit-${gift._id}`}
                      data-tooltip-content="Edit gift details"
                      aria-label="Edit gift details"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <Tooltip id={`edit-${gift._id}`} />

                    {giftStatus === 'suggestion' && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateGiftStatus(gift._id, 'saved');
                        }} 
                        className={styles.saveButton}
                        data-tooltip-id={`save-${gift._id}`}
                        data-tooltip-content="Save suggestion"
                        aria-label="Save suggestion"
                      >
                        <FontAwesomeIcon icon={faSave} />
                      </button>
                    )}
                    <Tooltip id={`save-${gift._id}`} />

                    {giftStatus !== 'purchased' && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePurchaseGift(gift._id);
                        }} 
                        className={styles.purchaseButton}
                        data-tooltip-id={`purchase-${gift._id}`}
                        data-tooltip-content="Purchase gift"
                        aria-label="Purchase gift"
                      >
                        <FontAwesomeIcon icon={faDollarSign} />
                      </button>
                    )}
                    <Tooltip id={`purchase-${gift._id}`} />
                    {/* Delete sits apart at the far end, away from edit and purchase */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGift(gift._id);
                      }} 
                      className={styles.deleteButton}
                      data-tooltip-id={`delete-${gift._id}`}
                      data-tooltip-content="Delete gift"
                      aria-label="Delete gift"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                    <Tooltip id={`delete-${gift._id}`} />
                  </div>
                  {/* Rating is for open suggestions; a saved gift was already chosen */}
                  {gift.isAISuggested && giftStatus === 'suggestion' && (
                    <GiftFeedback
                      key={`feedback-${gift._id}`}
                      gift={gift}
                      onFeedbackSubmitted={(action, rating) => handleFeedbackSubmitted(gift._id, action, rating)}
                      existingFeedback={feedbackSubmitted[gift._id] || null}
                      isLoading={!loadedFeedback}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button type="button" className={styles.fab} onClick={handleAddGift} aria-label="Add gift" title="Add gift">
        <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
      </button>
      <Modal
        open={showAddGiftForm}
        onClose={handleFormCancel}
        title={editingGift ? 'Edit Gift' : 'Add New Gift'}
      >
        <AddGiftForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          initialData={editingGift}
          recipients={recipients}
          events={allEvents}
          budgets={budgets.recipientBudgets}
          currency={currency}
        />
      </Modal>
      {confirmDialog}
    </div>
  );
};

export default Gifts;
