import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import AddRecipientForm from '../../components/forms/js/AddRecipientForm';
import EditRecipientForm from '../../components/forms/js/EditRecipientForm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEdit, faTags, faPlus, faTimes, 
  faSearch, faEye, faTrash, 
  faCalendarAlt, faUser,
  faThList, faThLarge, faBirthdayCake
} from '@fortawesome/free-solid-svg-icons';
import { resolveAssetUrl } from '../../utils/apiBaseUrl';
import { initialsAvatar } from '../../utils/avatar';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import useConfirm from '../../components/ui/useConfirm';
import { eventDay, formatDateOnly } from '../../utils/dates';

// Birthdates are calendar days (stored at UTC midnight): read them as such
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
// The next birthday on or after today (today's counts)
const nextBirthday = (birthdate, today = startOfToday()) => {
  const born = eventDay(birthdate);
  const next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
};

const ImageWithFallback = ({ src, alt, fallback, ...props }) => {
  // Once the source errors, stick with the fallback until the src prop
  // itself changes. Resetting the error on the fallback's own onLoad
  // (as this used to do) bounced the element back to the broken src in
  // an endless error/load cycle, which showed up as flickering avatars.
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  return (
    <img
      src={!hasError && src ? src : fallback}
      alt={alt}
      loading="lazy"
      onError={() => setHasError(true)}
      {...props}
    />
  );
};

const NO_DELETE = { show: false, recipientId: null, recipientName: '', purchasedGiftCount: 0, permanent: false };
const fullName = (recipient) => `${recipient.firstName} ${recipient.lastName}`;
const giftCount = (n) => `${n} purchased gift${n === 1 ? '' : 's'}`;

const RecipientsPage = () => {
  const navigate = useNavigate();
  const [showAddForm, setShowAddForm] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [error, setError] = useState('');
  const [, setOperationLoading] = useState({ add: false, edit: false, delete: false });
  const [editingRecipient, setEditingRecipient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmation, setDeleteConfirmation] = useState(NO_DELETE);
  // Recipients you bought gifts for are archived, not deleted
  const [archivedRecipients, setArchivedRecipients] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState('');
  
  // New state for enhanced UX
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all'); // all, relation, recent, favorites
  const [sortBy, setSortBy] = useState('name'); // name, recent, relation, birthday
  const [viewMode, setViewMode] = useState('grid'); // grid, list
  const [selectedRecipients, setSelectedRecipients] = useState(new Set());
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    fetchRecipients();
    fetchArchived();
  }, []);

  // Only feeds the archived section, so a failure just leaves it hidden
  const fetchArchived = async () => {
    try {
      const response = await axiosInstance.get('/recipients', { params: { archived: true } });
      setArchivedRecipients(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching archived recipients:', error);
    }
  };

  const fetchRecipients = async () => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get('/recipients');
      const recipientsWithTags = response.data.map(recipient => ({
        ...recipient,
        tags: recipient.tags.map(tag => ({
          _id: tag._id,
          name: tag.name
        }))
      }));
      setRecipients(recipientsWithTags.sort((a, b) => a.firstName.localeCompare(b.firstName)));
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching recipients:', error);
      setError('Failed to load recipients. Please try again later.');
      setIsLoading(false);
    }
  };

  const handleDeleteRecipient = useCallback((recipientId) => {
    const recipient = recipients.find(r => r._id === recipientId);
    setDeleteConfirmation({
      ...NO_DELETE,
      show: true,
      recipientId,
      recipientName: recipient ? fullName(recipient) : '',
      purchasedGiftCount: recipient?.purchasedGiftCount || 0
    });
  }, [recipients]);

  const handlePermanentDelete = (recipient) => {
    setDeleteConfirmation({
      show: true,
      recipientId: recipient._id,
      recipientName: fullName(recipient),
      purchasedGiftCount: recipient.purchasedGiftCount || 0,
      permanent: true
    });
  };

  const handleRestore = async (recipient) => {
    try {
      await axiosInstance.post(`/recipients/${recipient._id}/restore`);
      setNotice(`${fullName(recipient)} was restored.`);
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to restore recipient. Please try again.');
    }
    await Promise.all([fetchRecipients(), fetchArchived()]);
  };

  const confirmDelete = async () => {
    const { recipientId, recipientName, permanent } = deleteConfirmation;
    setDeleteConfirmation(NO_DELETE);
    setOperationLoading(prev => ({ ...prev, delete: true }));
    
    try {
      const response = await axiosInstance.delete(`/recipients/${recipientId}${permanent ? '?permanent=true' : ''}`);
      
      setRecipients(prevRecipients => 
        prevRecipients.filter(recipient => recipient._id !== recipientId)
      );
      if (permanent) {
        setArchivedRecipients(prev => prev.filter(recipient => recipient._id !== recipientId));
      }
      if (response?.data?.archived) {
        setNotice(`${recipientName} was archived to keep your spending history. Find them under Show archived.`);
        await fetchArchived();
      } else {
        setNotice('');
      }
      
      // Clear any existing errors
      setError('');
      setOperationLoading(prev => ({ ...prev, delete: false }));
    } catch (error) {
      console.error('Error deleting recipient:', {
        recipientId,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      setError(
        error.response?.data?.message || 
        'Failed to delete recipient. Please try again.'
      );
      setOperationLoading(prev => ({ ...prev, delete: false }));
      // On error, refetch to restore correct state
      await fetchRecipients();
    }
  };

  const handleEditClick = useCallback((recipient) => {
    setEditingRecipient(recipient);
  }, []);

  const closeEditForm = useCallback(() => {
    setEditingRecipient(null);
  }, []);

  // EditRecipientForm already PUTs and passes the server response here, so this
  // only updates local state — no second PUT.
  const handleRecipientUpdate = (updatedRecipient) => {
    setRecipients(prevRecipients =>
      prevRecipients.map(recipient =>
        recipient._id === updatedRecipient._id ? updatedRecipient : recipient
      ).sort((a, b) => a.firstName.localeCompare(b.firstName))
    );
    closeEditForm();
    setError('');
  };

  const handleAddRecipient = async (newRecipient) => {
    setOperationLoading(prev => ({ ...prev, add: true }));
    try {
      const response = await axiosInstance.post('/recipients', newRecipient);
      
      // Optimistic update with server response
      const createdRecipient = {
        ...response.data,
        tags: response.data.tags?.map(tag => ({
          _id: tag._id,
          name: tag.name
        })) || []
      };
      
      setRecipients(prevRecipients => 
        [...prevRecipients, createdRecipient].sort((a, b) => a.firstName.localeCompare(b.firstName))
      );
      
      setShowAddForm(false);
      setError('');
      setOperationLoading(prev => ({ ...prev, add: false }));
    } catch (error) {
      console.error('Error adding recipient:', error);
      setError('Failed to add recipient. Please try again.');
      setOperationLoading(prev => ({ ...prev, add: false }));
    }
  };

  const handleAvatarClick = useCallback((recipientId) => {
    navigate(`/recipients/${recipientId}`);
  }, [navigate]);

  // Enhanced filtering and sorting logic
  const filteredAndSortedRecipients = useMemo(() => {
    let filtered = recipients.filter(recipient => {
      const matchesSearch = searchTerm === '' || 
        `${recipient.firstName} ${recipient.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipient.relation.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipient.tags.some(tag => tag.name.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = filterBy === 'all' || 
        (filterBy === 'recent' && new Date() - new Date(recipient.updatedAt || recipient.createdAt) < 30 * 24 * 60 * 60 * 1000) ||
        (filterBy !== 'all' && filterBy !== 'recent' && recipient.relation.toLowerCase() === filterBy.toLowerCase());
      
      return matchesSearch && matchesFilter;
    });

    // Sort recipients
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case 'recent':
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        case 'relation':
          return a.relation.localeCompare(b.relation);
        case 'birthday':
          const aNext = nextBirthday(a.birthdate);
          const bNext = nextBirthday(b.birthdate);
          return aNext - bNext;
        default:
          return 0;
      }
    });

    return filtered;
  }, [recipients, searchTerm, filterBy, sortBy]);

  // Get unique relations for filter dropdown
  const uniqueRelations = useMemo(() => {
    return [...new Set(recipients.map(r => r.relation))].sort();
  }, [recipients]);

  // Handle bulk selection
  const toggleRecipientSelection = useCallback((recipientId) => {
    setSelectedRecipients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recipientId)) {
        newSet.delete(recipientId);
      } else {
        newSet.add(recipientId);
      }
      return newSet;
    });
  }, []);

  const selectAllRecipients = useCallback(() => {
    if (selectedRecipients.size === filteredAndSortedRecipients.length) {
      setSelectedRecipients(new Set());
    } else {
      setSelectedRecipients(new Set(filteredAndSortedRecipients.map(r => r._id)));
    }
  }, [selectedRecipients.size, filteredAndSortedRecipients]);

  // Bulk delete function
  const handleBulkDelete = useCallback(async () => {
    if (selectedRecipients.size === 0) return;
    
    const recipientsToDelete = recipients.filter(r => selectedRecipients.has(r._id));
    const names = recipientsToDelete.map(fullName).join(', ');
    const toArchive = recipientsToDelete.filter(r => r.purchasedGiftCount > 0).map(fullName);
    const archiveNote = toArchive.length === 0 ? null : toArchive.length === 1
      ? `${toArchive[0]} has purchased gifts and will be archived instead, so your spending history stays accurate.`
      : `${toArchive.join(', ')} have purchased gifts and will be archived instead, so your spending history stays accurate.`;

    const confirmed = await confirm({
      title: 'Delete recipients',
      message: `Are you sure you want to delete ${selectedRecipients.size} recipient(s): ${names}?`,
      details: archiveNote && <p className="mt-3 text-sm text-warning">{archiveNote}</p>,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    const ids = Array.from(selectedRecipients);
    const results = await Promise.allSettled(
      ids.map(id => axiosInstance.delete(`/recipients/${id}`))
    );

    const deletedIds = new Set(
      ids.filter((id, i) => results[i].status === 'fulfilled')
    );
    const failedCount = results.length - deletedIds.size;
    const archivedCount = results.filter(r => r.status === 'fulfilled' && r.value?.data?.archived).length;
    if (archivedCount > 0) {
      setNotice(`${archivedCount} recipient${archivedCount === 1 ? '' : 's'} archived to keep your spending history. Find them under Show archived.`);
      fetchArchived();
    }

    // Remove the ones that actually succeeded, even if some failed.
    setRecipients(prev => prev.filter(r => !deletedIds.has(r._id)));
    setSelectedRecipients(prev => new Set(Array.from(prev).filter(id => !deletedIds.has(id))));
    setError(failedCount > 0
      ? `Failed to delete ${failedCount} recipient(s). Please try again.`
      : '');
  }, [selectedRecipients, recipients, confirm]);

  // Calculate upcoming birthdays
  const getUpcomingBirthdays = useCallback(() => {
    const today = startOfToday();
    const thirtyDaysFromNow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);

    return recipients
      .filter(recipient => nextBirthday(recipient.birthdate, today) <= thirtyDaysFromNow)
      .sort((a, b) => nextBirthday(a.birthdate, today) - nextBirthday(b.birthdate, today));
  }, [recipients]);

  const upcomingBirthdays = getUpcomingBirthdays();

  // Keyboard navigation
  const handleKeyDown = useCallback((e, recipientId) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        // A button or checkbox inside the card handles its own Enter/Space
        if (e.target !== e.currentTarget) break;
        e.preventDefault();
        handleAvatarClick(recipientId);
        break;
      case 'Delete':
      case 'Backspace':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleDeleteRecipient(recipientId);
        }
        break;
      case 'e':
      case 'E':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const recipient = recipients.find(r => r._id === recipientId);
          if (recipient) handleEditClick(recipient);
        }
        break;
      default:
        break;
    }
  }, [recipients, handleAvatarClick, handleDeleteRecipient, handleEditClick]);

  // Focus management
  const [focusedRecipientId, setFocusedRecipientId] = useState(null);


  // Loading skeleton component
  const LoadingSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-card rounded-xl shadow-sm p-6 mb-4">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 bg-border rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-border rounded w-3/4"></div>
              <div className="h-3 bg-border rounded w-1/2"></div>
              <div className="h-3 bg-border rounded w-1/3"></div>
              <div className="flex space-x-2">
                <div className="h-6 bg-border rounded-full w-16"></div>
                <div className="h-6 bg-border rounded-full w-20"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="h-8 bg-border rounded w-64 mb-4 animate-pulse"></div>
            <div className="h-4 bg-border rounded w-96 animate-pulse"></div>
          </div>
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="page-frame">
      <div>
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="type-display text-primary mb-1">Recipients</h1>
              <p className="text-muted-foreground mb-2">
                Manage your gift recipients and their preferences
                {recipients.length > 0 && ` • ${recipients.length} total`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors"
                title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                aria-label={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
              >
                <FontAwesomeIcon icon={viewMode === 'grid' ? faThList : faThLarge} />
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-card rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search Bar */}
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-muted-foreground" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search recipients by name, relation, or tags..."
                  className="block w-full pl-10 pr-3 py-2 border border-input rounded-lg
                           focus:ring-2 focus:ring-ring focus:border-primary
                           text-foreground placeholder-muted-foreground"
                  aria-label="Search recipients"
                  autoComplete="off"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-muted-foreground"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value)}
                  aria-label="Filter by relation"
                  className="max-w-full min-w-0 px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-primary text-foreground bg-card"
                >
                  <option value="all">All Relations</option>
                  <option value="recent">Recently Updated (30 days)</option>
                  {uniqueRelations.map(relation => (
                    <option key={relation} value={relation}>{relation}</option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort recipients"
                  className="max-w-full min-w-0 px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-primary text-foreground bg-card"
                >
                  <option value="name">Sort by Name</option>
                  <option value="recent">Recent Activity</option>
                  <option value="relation">Relation</option>
                  <option value="birthday">Upcoming Birthday</option>
                </select>

                {selectedRecipients.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-destructive-wash text-destructive-strong rounded-lg hover:bg-destructive-wash
                             transition-colors font-medium"
                  >
                    Delete ({selectedRecipients.size})
                  </button>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            {upcomingBirthdays.length > 0 && (
              <div className="mt-4 p-3 bg-warning-wash border border-warning rounded-lg">
                <div className="flex items-center gap-2 text-warning">
                  <FontAwesomeIcon icon={faBirthdayCake} />
                  <span className="font-medium">
                    {upcomingBirthdays.length} upcoming birthday{upcomingBirthdays.length !== 1 ? 's' : ''} in the next 30 days
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bulk Selection Controls */}
          {filteredAndSortedRecipients.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAllRecipients}
                  className="text-sm text-primary hover:text-primary-strong font-medium"
                >
                  {selectedRecipients.size === filteredAndSortedRecipients.length ? 'Deselect All' : 'Select All'}
                </button>
                {selectedRecipients.size > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedRecipients.size} selected
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {filteredAndSortedRecipients.length} recipient{filteredAndSortedRecipients.length !== 1 ? 's' : ''}
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive-wash border border-destructive rounded-lg">
            <div className="flex items-center gap-2 text-destructive-strong">
              <FontAwesomeIcon icon={faTimes} />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-destructive-strong mt-1">{error}</p>
          </div>
        )}

        {notice && (
          <div role="status" className="mb-6 p-4 bg-primary-wash border border-border rounded-lg text-primary-strong">
            {notice}
          </div>
        )}

        {/* Recipients Grid/List */}
        <div className={`recipient-container ${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}`}>
        {filteredAndSortedRecipients.length > 0 ? (
          filteredAndSortedRecipients.map(recipient => (
            <div 
              key={recipient._id} 
              className={`group relative bg-card rounded-xl shadow-sm hover:shadow-lg 
                         transition-all duration-300 transform hover:-translate-y-1 
                         ${viewMode === 'grid' ? 'p-6' : 'p-4 flex items-center'} 
                         ${selectedRecipients.has(recipient._id) ? 'ring-2 ring-ring shadow-lg' : ''}
                         ${focusedRecipientId === recipient._id ? 'ring-2 ring-ring' : ''}
                         cursor-pointer border border-border`}
              onClick={(e) => {
                if (!e.target.closest('.action-button') && !e.target.closest('.checkbox-container')) {
                  handleAvatarClick(recipient._id);
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, recipient._id)}
              onFocus={() => setFocusedRecipientId(recipient._id)}
              onBlur={() => setFocusedRecipientId(null)}
              tabIndex={0}
              role="button"
              aria-label={`${recipient.firstName} ${recipient.lastName}, ${recipient.relation}, born ${formatDateOnly(recipient.birthdate)}. Press Enter to view profile, Ctrl+E to edit, Ctrl+Delete to delete.`}
              aria-describedby={`tags-${recipient._id} actions-${recipient._id}`}
            >
              {/* Selection Checkbox */}
              <div className="absolute top-3 left-3 checkbox-container z-10">
                <input
                  type="checkbox"
                  checked={selectedRecipients.has(recipient._id)}
                  onChange={() => toggleRecipientSelection(recipient._id)}
                  className="w-5 h-5 text-primary border-2 border-input rounded 
                           focus:ring-ring focus:ring-2 transition-colors
                           checked:border-primary checked:bg-primary"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${recipient.firstName} ${recipient.lastName}`}
                />
              </div>

              {/* Avatar Section */}
              <div className={`${viewMode === 'grid' ? 'flex flex-col items-center mb-4' : 'flex-shrink-0 mr-4'}`}>
                <div className="relative">
                  <div className={`${viewMode === 'grid' ? 'w-20 h-20' : 'w-16 h-16'} rounded-full overflow-hidden 
                                 bg-primary p-0.5 shadow-lg
                                 group-hover:shadow-xl transition-shadow duration-300`}>
                    <ImageWithFallback
                      src={resolveAssetUrl(recipient.profilePicture) || ''}
                      alt={`${recipient.firstName} ${recipient.lastName}`}
                      fallback={initialsAvatar(recipient.firstName, recipient.lastName)}
                      className="w-full h-full object-cover rounded-full bg-card"
                    />
                  </div>
                  
                  {/* Status indicators */}
                  {upcomingBirthdays.find(b => b._id === recipient._id) && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-warning rounded-full 
                                   flex items-center justify-center shadow-sm border-2 border-card"
                         title="Birthday coming up!">
                      <FontAwesomeIcon icon={faBirthdayCake} className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
                {viewMode === 'grid' && (
                  <div className="mt-2 text-center">
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to view profile
                    </span>
                  </div>
                )}
              </div>
              {/* Details Section */}
              <div className={`${viewMode === 'grid' ? 'text-center flex-1' : 'flex-1 min-w-0'}`}>
                <h3 className="type-title text-foreground mb-1 truncate">
                  {recipient.firstName} {recipient.lastName}
                </h3>
                <div className={`${viewMode === 'grid' ? 'space-y-2' : 'flex items-center gap-4 text-sm'}`}
                     aria-live="polite">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-muted-foreground" />
                    <span>{recipient.relation}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FontAwesomeIcon icon={faCalendarAlt} className="w-4 h-4 text-muted-foreground" />
                    <span>{formatDateOnly(recipient.birthdate)}</span>
                  </div>
                </div>
                {/* Tags Section */}
                <div className={`${viewMode === 'grid' ? 'mt-3' : 'mt-2'}`}
                     id={`tags-${recipient._id}`}
                     aria-label={`Tags: ${recipient.tags?.length > 0 ? recipient.tags.map(tag => tag.name).join(', ') : 'No tags'}`}>
                  {recipient.tags && recipient.tags.length > 0 ? (
                    <div className={`${viewMode === 'grid' ? 'flex flex-wrap justify-center gap-1' : 'flex flex-wrap gap-1'}`}>
                      {recipient.tags.slice(0, viewMode === 'grid' ? 3 : 5).map((tag) => (
                        <span 
                          key={tag._id} 
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                   bg-primary-wash text-primary-strong hover:bg-primary-wash transition-colors"
                        >
                          {tag.name}
                        </span>
                      ))}
                      {recipient.tags.length > (viewMode === 'grid' ? 3 : 5) && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                       bg-muted text-muted-foreground">
                          +{recipient.tags.length - (viewMode === 'grid' ? 3 : 5)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <FontAwesomeIcon icon={faTags} className="w-3 h-3" />
                      <span className="italic">No tags</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Action buttons: in grid view a column in the top-right corner,
                  clear of the card body (a click there opens the profile).
                  Revealed on hover and keyboard focus; always shown on touch
                  screens, which can't hover. Inline in list view. */}
              <div className={`action-buttons ${viewMode === 'grid' 
                ? 'absolute top-3 right-3 z-10 flex flex-col gap-1 transition-opacity duration-200 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                : 'flex items-center gap-2 ml-4'
              }`}
                   id={`actions-${recipient._id}`}
                   role="group"
                   aria-label="Recipient actions">
                <button 
                  className={`action-button flex items-center justify-center transition-all duration-200
                             ${viewMode === 'grid' 
                               ? 'w-9 h-9 bg-card border border-border rounded-full shadow-sm hover:scale-110 focus:scale-110 text-foreground hover:text-primary focus:text-primary focus:outline-none focus:ring-2 focus:ring-ring'
                               : 'w-8 h-8 bg-muted hover:bg-primary-wash focus:bg-primary-wash rounded-lg text-muted-foreground hover:text-primary-strong focus:text-primary-strong focus:outline-none focus:ring-2 focus:ring-ring'
                             }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAvatarClick(recipient._id);
                  }}
                  title="View Profile"
                  aria-label={`View ${recipient.firstName} ${recipient.lastName}'s profile`}
                >
                  <FontAwesomeIcon icon={faEye} className="w-4 h-4" aria-hidden="true" />
                </button>
                
                <button 
                  className={`action-button flex items-center justify-center transition-all duration-200
                             ${viewMode === 'grid' 
                               ? 'w-9 h-9 bg-card border border-border rounded-full shadow-sm hover:scale-110 focus:scale-110 text-foreground hover:text-info-ink focus:text-info-ink focus:outline-none focus:ring-2 focus:ring-ring'
                               : 'w-8 h-8 bg-muted hover:bg-info-wash focus:bg-info-wash rounded-lg text-muted-foreground hover:text-info-ink focus:text-info-ink focus:outline-none focus:ring-2 focus:ring-ring'
                             }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(recipient);
                  }}
                  title="Edit Recipient (Ctrl+E)"
                  aria-label={`Edit ${recipient.firstName} ${recipient.lastName}`}
                >
                  <FontAwesomeIcon icon={faEdit} className="w-4 h-4" aria-hidden="true" />
                </button>
                
                <button 
                  className={`action-button flex items-center justify-center transition-all duration-200
                             ${viewMode === 'grid' 
                               ? 'w-9 h-9 bg-card border border-border rounded-full shadow-sm hover:scale-110 focus:scale-110 text-foreground hover:text-destructive-strong focus:text-destructive-strong focus:outline-none focus:ring-2 focus:ring-destructive'
                               : 'w-8 h-8 bg-muted hover:bg-destructive-wash focus:bg-destructive-wash rounded-lg text-muted-foreground hover:text-destructive-strong focus:text-destructive-strong focus:outline-none focus:ring-2 focus:ring-destructive'
                             }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRecipient(recipient._id);
                  }}
                  title="Delete Recipient (Ctrl+Delete)"
                  aria-label={`Delete ${recipient.firstName} ${recipient.lastName}`}
                >
                  <FontAwesomeIcon icon={faTrash} className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center" aria-hidden="true">
                <FontAwesomeIcon icon={faUser} className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="type-title text-foreground mb-2" role="status" aria-live="polite">
                {searchTerm || filterBy !== 'all' ? 'No recipients match your search' : 'No recipients yet'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchTerm || filterBy !== 'all' 
                  ? 'Try adjusting your search terms or filters'
                  : 'Add your first recipient to get started with gift planning'
                }
              </p>
              {(!searchTerm && filterBy === 'all') && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg
                           hover:bg-primary-strong transition-colors font-medium"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Add Your First Recipient
                </button>
              )}
            </div>
          </div>
        )}
      </div>
        {archivedRecipients.length > 0 && (
          <section className="mt-10" aria-label="Archived recipients">
            <button
              onClick={() => setShowArchived(!showArchived)}
              aria-expanded={showArchived}
              className="text-sm font-medium text-muted-foreground hover:text-foreground underline"
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedRecipients.length})`}
            </button>
            {showArchived && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Archived recipients are hidden from lists and get no new events. Their purchased gifts stay in your spending history.
                </p>
                <ul className="divide-y divide-border bg-card rounded-xl border border-border">
                  {archivedRecipients.map(recipient => (
                    <li key={recipient._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-foreground">{fullName(recipient)}</p>
                        <p className="text-sm text-muted-foreground">{giftCount(recipient.purchasedGiftCount || 0)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestore(recipient)}
                          aria-label={`Restore ${fullName(recipient)}`}
                          className="px-3 py-1.5 text-sm bg-primary hover:bg-primary-strong text-primary-foreground rounded-lg font-medium"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(recipient)}
                          aria-label={`Delete ${fullName(recipient)} permanently`}
                          className="px-3 py-1.5 text-sm text-destructive-strong bg-destructive-wash hover:bg-destructive-wash rounded-lg font-medium"
                        >
                          Delete permanently
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Floating Action Button */}
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary hover:bg-primary-strong text-primary-foreground 
                   rounded-full shadow-lg hover:shadow-xl transition-all duration-300
                   flex items-center justify-center z-40 hover:scale-110
                   focus:outline-none focus:ring-4 focus:ring-ring"
          title="Add New Recipient"
          aria-label="Add new recipient"
        >
          <FontAwesomeIcon 
            icon={faPlus} 
            className={`w-6 h-6 transition-transform duration-300 ${showAddForm ? 'rotate-45' : ''}`} 
            aria-hidden="true"
          />
        </button>

      </div>
      <Modal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        title="Add New Recipient"
        size="lg"
      >
        <AddRecipientForm onSubmit={handleAddRecipient} onCancel={() => setShowAddForm(false)} showTitle={false} />
      </Modal>

      {(() => {
        const { recipientName, purchasedGiftCount, permanent } = deleteConfirmation;
        const archives = !permanent && purchasedGiftCount > 0;
        const title = permanent ? 'Delete Permanently' : 'Delete Recipient';
        return (
          <ConfirmDialog
            open={deleteConfirmation.show}
            title={title}
            message={(
              <>
                Are you sure you want to delete <strong>{recipientName}</strong>?
                {!archives && ' This action cannot be undone.'}
              </>
            )}
            confirmLabel={archives ? 'Archive Recipient' : title}
            variant="danger"
            onConfirm={confirmDelete}
            onClose={() => setDeleteConfirmation(NO_DELETE)}
          >
            {archives ? (
              <div className="mt-3 p-3 bg-warning-wash border border-warning rounded-lg">
                <p className="text-sm text-warning">
                  {recipientName} has {giftCount(purchasedGiftCount)}. They'll be archived so your spending
                  history stays accurate. Their events, reminders and saved gift ideas (including ideas
                  for others on their events) are removed.
                </p>
              </div>
            ) : (
              <div className="mt-3 p-3 bg-destructive-wash border border-destructive rounded-lg">
                <p className="text-sm text-destructive-strong">
                  {permanent && purchasedGiftCount > 0
                    ? `This also deletes their ${giftCount(purchasedGiftCount)}, so that spending drops out of your past totals.`
                    : 'This will permanently remove all associated data including gifts, events, and budget information.'}
                </p>
              </div>
            )}
          </ConfirmDialog>
        );
      })()}

      <Modal
        open={Boolean(editingRecipient)}
        onClose={closeEditForm}
        title={editingRecipient ? `Edit ${editingRecipient.firstName} ${editingRecipient.lastName}` : ''}
        size="lg"
      >
        {editingRecipient && (
          <EditRecipientForm
            recipient={editingRecipient}
            closeForm={closeEditForm}
            onSubmit={handleRecipientUpdate}
          />
        )}
      </Modal>
      {confirmDialog}
    </div>
  );
};

export default RecipientsPage;
