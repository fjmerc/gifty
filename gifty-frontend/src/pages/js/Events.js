import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axiosInstance from '../../axiosInstance';
import EventForm from '../../components/forms/js/EventForm';
import CustomEventTypeForm from '../../components/forms/js/CustomEventTypeForm';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { buildEventTooltip } from '../../utils/eventTooltip';
import { dateOnlyISO, eventDay, formatDateOnly, todayLocalISO } from '../../utils/dates';
import styles from '../css/Events.module.css';
import '../css/FullCalendarOverrides.css'; // Import the FullCalendar overrides
import { toast } from 'react-toastify';
import Modal from '../../components/ui/Modal';
import useConfirm from '../../components/ui/useConfirm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faList, faPlus, faBell, faFilter, faFilterCircleXmark, faEdit, faTrash, faTags, faSearch, faCalendarCheck, faGift, faStar } from '@fortawesome/free-solid-svg-icons';

const Events = () => {
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [showCustomEventTypeForm, setShowCustomEventTypeForm] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState(null);
  const [view, setView] = useState('list');
  const [filters, setFilters] = useState({
    month: '',
    year: '',
    recipient: '',
    eventType: '',
    upcoming: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilters, setQuickFilters] = useState({
    today: false,
    thisWeek: false,
    thisMonth: false,
    overdue: false
  });
  const [recipients, setRecipients] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [yearRange, setYearRange] = useState({ min: new Date().getFullYear(), max: new Date().getFullYear() });
  const [isEditing, setIsEditing] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/events');
      const sortedEvents = response.data.sort((a, b) => new Date(a.date) - new Date(b.date));
      setEvents(sortedEvents);
      updateYearRange(sortedEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, []);

  const fetchRecipients = useCallback(async () => {
    try {
      // Use the new endpoint that includes system accounts
      const response = await axiosInstance.get('/recipients/all-including-system');
      
      // Sort recipients alphabetically by firstName and lastName
      const sortedRecipients = response.data.sort((a, b) => {
        // First compare by firstName
        const firstNameComparison = a.firstName.localeCompare(b.firstName);
        // If firstNames are the same, compare by lastName
        return firstNameComparison !== 0 ? firstNameComparison : a.lastName.localeCompare(b.lastName);
      });
      
      setRecipients(sortedRecipients);
    } catch (error) {
      console.error('Error fetching recipients:', error);
    }
  }, []);

  // Recipient names by id, from what is already loaded: the recipients list
  // (which knows system accounts) over the name each event carries (the
  // server populates it, and it still covers archived recipients).
  const recipientDetails = useMemo(() => {
    const byId = {};
    events.forEach((event) => {
      if (event.recipient && typeof event.recipient === 'object') {
        byId[event.recipient._id] = event.recipient;
      }
    });
    recipients.forEach((recipient) => {
      byId[recipient._id] = recipient;
    });
    return byId;
  }, [events, recipients]);

  const fetchEventTypes = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/eventTypes');
      
      // Sort event types alphabetically by name
      const sortedEventTypes = response.data.sort((a, b) => a.name.localeCompare(b.name));
      setEventTypes(sortedEventTypes);
    } catch (error) {
      console.error('Error fetching event types:', error);
    }
  }, []);

  const updateYearRange = (events) => {
    const years = events.map(event => eventDay(event.date).getFullYear());
    const minYear = Math.min(...years, new Date().getFullYear());
    const maxYear = Math.max(...years, new Date().getFullYear() + 10);
    setYearRange({ min: minYear, max: maxYear });
  };

  const applyFilters = useCallback(() => {
    let filtered = [...events];

    // Exclude events more than 12 months in the future
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 12);
    filtered = filtered.filter(event => eventDay(event.date) <= maxDate);

    // Search term filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(event => {
        const eventName = (event.name || '').toLowerCase();
        const recipientId = event.recipient && typeof event.recipient === 'object' ? event.recipient._id : event.recipient;
        const recipient = recipientId ? recipientDetails[recipientId] : null;
        const recipientName = recipient ? `${recipient.firstName} ${recipient.lastName}`.toLowerCase() : '';
        return eventName.includes(searchLower) || recipientName.includes(searchLower);
      });
    }

    // Quick filters
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date(now);
    weekFromNow.setDate(now.getDate() + 7);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    if (quickFilters.today) {
      filtered = filtered.filter(event => {
        const eventDate = eventDay(event.date);
        return eventDate >= today && eventDate < tomorrow;
      });
    }
    if (quickFilters.thisWeek) {
      filtered = filtered.filter(event => {
        const eventDate = eventDay(event.date);
        return eventDate >= today && eventDate <= weekFromNow;
      });
    }
    if (quickFilters.thisMonth) {
      filtered = filtered.filter(event => {
        const eventDate = eventDay(event.date);
        return eventDate >= today && eventDate <= endOfMonth;
      });
    }
    if (quickFilters.overdue) {
      filtered = filtered.filter(event => eventDay(event.date) < today);
    }

    // Traditional filters
    if (filters.month) {
      filtered = filtered.filter(event => eventDay(event.date).getMonth() === parseInt(filters.month) - 1);
    }
    if (filters.year) {
      filtered = filtered.filter(event => eventDay(event.date).getFullYear() === parseInt(filters.year));
    }
    if (filters.recipient) {
      filtered = filtered.filter(event => {
        const recipientId = event.recipient && typeof event.recipient === 'object' ? event.recipient._id : event.recipient;
        return recipientId === filters.recipient;
      });
    }
    if (filters.eventType) {
      filtered = filtered.filter(event => {
        const eventTypeId = event.type && typeof event.type === 'object' ? event.type._id : event.type;
        return eventTypeId === filters.eventType;
      });
    }
    if (filters.upcoming) {
      filtered = filtered.filter(event => eventDay(event.date) >= today);
    }

    setFilteredEvents(filtered);
  }, [events, filters, searchTerm, quickFilters, recipientDetails]);

  useEffect(() => {
    fetchEvents();
    fetchRecipients();
    fetchEventTypes();
  }, [fetchEvents, fetchRecipients, fetchEventTypes]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleAddEvent = (e) => {
    e.stopPropagation();
    setSelectedEvent(null);
    setIsEditing(false);
    setShowForm(true);
  };

  const handleAddCustomEventType = (e) => {
    e.stopPropagation();
    setSelectedEventType(null);
    setShowCustomEventTypeForm(true);
  };

  const handleEditCustomEventType = (eventType) => {
    setSelectedEventType(eventType);
    setShowCustomEventTypeForm(true);
  };

  const handleEditEvent = (event) => {
    setSelectedEvent(event);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setSelectedEvent(null);
    setIsEditing(false);
  };

  const handleCloseCustomEventTypeForm = () => {
    setShowCustomEventTypeForm(false);
    setSelectedEventType(null);
  };

  const handleSetReminder = async (event) => {
    // Send only the reminder: the listed event carries its recipient and
    // type populated, which the server would refuse as references
    // Without a time of its own, remind at 9:00 the day before (as holidays do)
    const dayBefore = eventDay(event.date);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(9, 0, 0, 0);
    const reminder = {
      isSet: !event.reminder?.isSet,
      time: event.reminder?.time || dayBefore.toISOString(),
      method: event.reminder?.method || 'Email'
    };
    try {
      await axiosInstance.put(`/events/${event._id}`, { reminder });
      fetchEvents(); // Refresh events list
    } catch (error) {
      toast.error(`Could not change the reminder: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const clearFilters = () => {
    setFilters({
      month: '',
      year: '',
      recipient: '',
      eventType: '',
      upcoming: false,
    });
    setSearchTerm('');
    setQuickFilters({
      today: false,
      thisWeek: false,
      thisMonth: false,
      overdue: false
    });
  };

  const handleQuickFilter = (filterType) => {
    setQuickFilters(prev => ({
      ...prev,
      [filterType]: !prev[filterType]
    }));
  };

  // Statistics calculation
  const eventStats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(now);
    weekFromNow.setDate(now.getDate() + 7);
    
    return {
      total: events.length,
      upcoming: events.filter(event => eventDay(event.date) >= today).length,
      thisWeek: events.filter(event => {
        const eventDate = eventDay(event.date);
        return eventDate >= today && eventDate <= weekFromNow;
      }).length,
      overdue: events.filter(event => eventDay(event.date) < today).length
    };
  }, [events]);

  const deleteEvent = async (eventId) => {
    const confirmed = await confirm({
      title: 'Delete event',
      message: 'Delete this event? Gifts saved or suggested for it are deleted too. Purchased gifts must be moved to another event or deleted first.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axiosInstance.delete(`/events/${eventId}`);
      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error(error.response?.data?.message || 'Failed to delete event. Please try again.');
    }
  };

  const deleteCustomEventType = async (eventTypeId) => {
    const confirmed = await confirm({
      title: 'Delete event type',
      message: 'Are you sure you want to delete this custom event type?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axiosInstance.delete(`/eventTypes/${eventTypeId}`);
      fetchEventTypes();
    } catch (error) {
      console.error('Error deleting custom event type:', error);
      // Surfaces the 409 message when events still reference this type.
      toast.error(error.response?.data?.message || 'Failed to delete event type. Please try again.');
    }
  };

  // Group event types into system and custom
  const systemEventTypes = eventTypes.filter(type => !type.isCustom);
  const customEventTypes = eventTypes.filter(type => type.isCustom);

  return (
    <div className={styles['events-page']}>
      <div className={styles['events-header']}>
        <div className={styles['header-content']}>
          <div className={styles['title-row']}>
            <h1>Events Management</h1>
            <div className={styles['header-actions']}>
              <button className={styles['btn-add']} onClick={handleAddEvent}>
                <FontAwesomeIcon icon={faPlus} /> Add Event
              </button>
              <button className={styles['btn-add']} onClick={handleAddCustomEventType}>
                <FontAwesomeIcon icon={faTags} /> Add Custom Event Type
              </button>
            </div>
          </div>
          <div className={styles['stats-overview']}>
            <div className={styles['stat-card']}>
              <FontAwesomeIcon icon={faCalendarCheck} className={styles['stat-icon']} />
              <div className={styles['stat-info']}>
                <span className={styles['stat-number']}>{eventStats.total}</span>
                <span className={styles['stat-label']}>Total Events</span>
              </div>
            </div>
            <div className={styles['stat-card']}>
              <FontAwesomeIcon icon={faGift} className={styles['stat-icon']} />
              <div className={styles['stat-info']}>
                <span className={styles['stat-number']}>{eventStats.upcoming}</span>
                <span className={styles['stat-label']}>Upcoming</span>
              </div>
            </div>
            <div className={styles['stat-card']}>
              <FontAwesomeIcon icon={faStar} className={styles['stat-icon']} />
              <div className={styles['stat-info']}>
                <span className={styles['stat-number']}>{eventStats.thisWeek}</span>
                <span className={styles['stat-label']}>This Week</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Search and Quick Filters */}
      <div className={styles['search-section']}>
        <div className={styles['search-bar']}>
          <FontAwesomeIcon icon={faSearch} className={styles['search-icon']} aria-hidden="true" />
          <input
            type="text"
            aria-label="Search events"
            placeholder="Search events or recipients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles['search-input']}
          />
        </div>
        <div className={styles['quick-filters']}>
          <button 
            className={`${styles['quick-filter-btn']} ${quickFilters.today ? styles['active'] : ''}`}
            onClick={() => handleQuickFilter('today')}
            aria-pressed={quickFilters.today}
          >
            Today
          </button>
          <button 
            className={`${styles['quick-filter-btn']} ${quickFilters.thisWeek ? styles['active'] : ''}`}
            onClick={() => handleQuickFilter('thisWeek')}
            aria-pressed={quickFilters.thisWeek}
          >
            This Week
          </button>
          <button 
            className={`${styles['quick-filter-btn']} ${quickFilters.thisMonth ? styles['active'] : ''}`}
            onClick={() => handleQuickFilter('thisMonth')}
            aria-pressed={quickFilters.thisMonth}
          >
            This Month
          </button>
          <button 
            className={`${styles['quick-filter-btn']} ${quickFilters.overdue ? styles['active'] : ''}`}
            onClick={() => handleQuickFilter('overdue')}
            aria-pressed={quickFilters.overdue}
          >
            Overdue
          </button>
          <button className={styles['btn-filters']} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
            <FontAwesomeIcon icon={faFilter} /> Advanced
          </button>
        </div>
      </div>
      
      <div className={styles['view-toggle']}>
        <button
          className={`${styles['btn-toggle']} ${view === 'list' ? styles['active'] : ''}`}
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
        >
          <FontAwesomeIcon icon={faList} /> List
        </button>
        <button
          className={`${styles['btn-toggle']} ${view === 'calendar' ? styles['active'] : ''}`}
          onClick={() => setView('calendar')}
          aria-pressed={view === 'calendar'}
        >
          <FontAwesomeIcon icon={faCalendarAlt} /> Calendar
        </button>
      </div>
      
      {showFilters && (
        <div className={styles['filters']}>
          <select name="month" value={filters.month} onChange={handleFilterChange} aria-label="Month">
            <option value="">All Months</option>
            {[...Array(12)].map((_, i) => (
              <option key={i} value={i + 1}>
                {new Date(0, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select name="year" value={filters.year} onChange={handleFilterChange} aria-label="Year">
            <option value="">All Years</option>
            {[...Array(yearRange.max - yearRange.min + 1)].map((_, i) => (
              <option key={i} value={yearRange.min + i}>
                {yearRange.min + i}
              </option>
            ))}
          </select>
          <select name="recipient" value={filters.recipient} onChange={handleFilterChange} aria-label="Recipient">
            <option value="">All Recipients</option>
            {recipients.map(recipient => (
              <option 
                key={recipient._id} 
                value={recipient._id}
                className={recipient.isSystemAccount ? 'system-account' : ''}
              >
                {recipient.firstName} {recipient.lastName}
                {recipient.isSystemAccount ? ' (System)' : ''}
              </option>
            ))}
          </select>
          <select name="eventType" value={filters.eventType} onChange={handleFilterChange} aria-label="Event type">
            <option value="">All Event Types</option>
            {systemEventTypes.map(type => (
              <option key={type._id} value={type._id}>
                {type.name}
              </option>
            ))}
            {customEventTypes.length > 0 && (
              <optgroup label="Custom Event Types">
                {customEventTypes.map(type => (
                  <option key={type._id} value={type._id}>
                    {type.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className={styles['filter-actions']}>
            <label>
              <input
                type="checkbox"
                name="upcoming"
                checked={filters.upcoming}
                onChange={handleFilterChange}
              />
              Upcoming Events Only
            </label>
            <button className={styles['btn-clear-filters']} onClick={clearFilters} title="Clear filters" aria-label="Clear filters">
              <FontAwesomeIcon icon={faFilterCircleXmark} />
            </button>
          </div>
        </div>
      )}
      
      <Modal
        open={showForm}
        onClose={handleCloseForm}
        title={isEditing ? 'Edit Event' : 'Create New Event'}
        size="lg"
      >
        <EventForm
          key={selectedEvent ? selectedEvent._id : 'new'}
          event={selectedEvent}
          onClose={handleCloseForm}
          onSubmit={async () => {
            await fetchEvents();
            handleCloseForm();
          }}
          isEditing={isEditing}
          showTitle={false}
        />
      </Modal>

      <Modal
        open={showCustomEventTypeForm}
        onClose={handleCloseCustomEventTypeForm}
        title={selectedEventType ? 'Edit Custom Event Type' : 'Create Custom Event Type'}
      >
        <CustomEventTypeForm
          key={selectedEventType ? selectedEventType._id : 'new'}
          eventType={selectedEventType}
          onClose={handleCloseCustomEventTypeForm}
          onSuccess={async () => {
            await fetchEventTypes();
          }}
          showHeader={false}
        />
      </Modal>
      {confirmDialog}

      <div className={styles['events-content']}>
        {view === 'list' ? (
          <ListEvents 
            events={filteredEvents} 
            onSetReminder={handleSetReminder} 
            recipientDetails={recipientDetails}
            onDeleteEvent={deleteEvent}
            onEditEvent={handleEditEvent}
          />
        ) : (
          <CalendarEvents 
            events={filteredEvents} 
            onEventSelect={setSelectedEvent} 
            recipientDetails={recipientDetails} 
            onEditEvent={handleEditEvent}
          />
        )}
      </div>

      {/* Section to manage custom event types */}
      {customEventTypes.length > 0 && (
        <div className={styles['custom-event-types-section']}>
          <h2>Your Custom Event Types</h2>
          <div className={styles['custom-event-types-grid']}>
            {customEventTypes.map(eventType => (
              <div key={eventType._id} className={styles['custom-event-type-card']}>
                <div className={styles['custom-event-type-content']}>
                  <h3>{eventType.name}</h3>
                  {eventType.description && <p>{eventType.description}</p>}
                </div>
                <div className={styles['custom-event-type-actions']}>
                  <button 
                    className={styles['edit-button']} 
                    onClick={() => handleEditCustomEventType(eventType)}
                    data-tooltip="Edit event type"
                    aria-label="Edit event type"
                    title="Edit event type"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    className={styles['delete-button']} 
                    onClick={() => deleteCustomEventType(eventType._id)}
                    data-tooltip="Delete event type"
                    aria-label="Delete event type"
                    title="Delete event type"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ListEvents = ({ events, onSetReminder, recipientDetails, onDeleteEvent, onEditEvent }) => {
  const [showPastEvents, setShowPastEvents] = useState(false);
  
  const currentDate = new Date(); // Use current date instead of hardcoded value
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const groupedEvents = events.reduce((groups, event) => {
    const date = eventDay(event.date);
    const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const isPastEvent = date < currentDate && 
      (date.getFullYear() < currentYear || 
       (date.getFullYear() === currentYear && date.getMonth() < currentMonth));

    if (!groups[monthYear]) {
      groups[monthYear] = {
        events: [],
        isPast: isPastEvent
      };
    }
    groups[monthYear].events.push(event);
    return groups;
  }, {});

  // Sort events within each month group by date
  Object.values(groupedEvents).forEach(group => {
    group.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  // Sort months so current month appears first, followed by future months, then past months
  const sortedMonthYears = Object.entries(groupedEvents).sort(([monthYearA], [monthYearB]) => {
    // Parse month and year from "Month Year" format (e.g., "January 2025")
    const [monthA, yearA] = monthYearA.split(' ');
    const [monthB, yearB] = monthYearB.split(' ');
    const dateA = new Date(`${monthA} 1, ${yearA}`);
    const dateB = new Date(`${monthB} 1, ${yearB}`);
    
    // If one is current month, it comes first
    if (dateA.getMonth() === currentMonth && dateA.getFullYear() === currentYear) return -1;
    if (dateB.getMonth() === currentMonth && dateB.getFullYear() === currentYear) return 1;
    
    // Determine if months are past, current, or future
    const currentMonthDate = new Date(currentYear, currentMonth, 1);
    const isAFuture = dateA > currentMonthDate;
    const isBFuture = dateB > currentMonthDate;
    const isAPast = dateA < currentMonthDate;
    const isBPast = dateB < currentMonthDate;
    
    // Both future: sort chronologically (earlier first)
    if (isAFuture && isBFuture) return dateA - dateB;
    
    // Both past: sort reverse chronologically (more recent first)
    if (isAPast && isBPast) return dateB - dateA;
    
    // Future comes before past
    if (isAFuture && isBPast) return -1;
    if (isBFuture && isAPast) return 1;
    
    // Fallback to chronological order
    return dateA - dateB;
  });

  const getDaysUntil = (date) => {
    const now = new Date();
    const eventDate = eventDay(date);
    const diffTime = eventDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  useEffect(() => {
    const buttons = document.querySelectorAll(`.${styles['reminder-button']}, .${styles['edit-button']}, .${styles['delete-button']}`);
    const tippyInstances = [];
    
    buttons.forEach(button => {
      const instance = tippy(button, {
        content: button.getAttribute('data-tooltip'),
        placement: 'top',
        arrow: true,
        delay: [200, 0]
      });
      tippyInstances.push(instance);
    });

    // Cleanup function to destroy tippy instances
    return () => {
      tippyInstances.forEach(instance => {
        if (instance && instance.destroy) {
          instance.destroy();
        }
      });
    };
  }, [events]);

  return (
    <div className={styles['list-view']}>
      <div className={styles['toggle-container']}>
        <label className={styles['toggle-switch']}>
          <input
            type="checkbox"
            checked={showPastEvents}
            onChange={() => setShowPastEvents(!showPastEvents)}
          />
          <span className={styles['toggle-slider']}></span>
          <span className={styles['toggle-label']}>
            <FontAwesomeIcon icon={faCalendarAlt} className={styles['toggle-icon']} />
            {showPastEvents ? 'Hide Past Events' : 'Show Past Events'}
          </span>
        </label>
      </div>
      
      {sortedMonthYears.map(([monthYear, { events: monthEvents, isPast }]) => {
        if (isPast && !showPastEvents) return null;
        
        return (
        <div key={monthYear} className={`${styles['month-group']} ${isPast ? styles['past-month'] : ''}`}>
          <h2 className={styles['month-header']}>{monthYear}</h2>
          <div className={styles['event-grid']}>
            {monthEvents.map(event => {
              const daysUntil = getDaysUntil(event.date);
              const recipientId = event.recipient && typeof event.recipient === 'object' ? event.recipient._id : event.recipient;
              const recipient = recipientId ? recipientDetails[recipientId] : null;
              
              let reminderTooltip = 'No reminder set';
              if (event.reminder && event.reminder.isSet) {
                // Format the reminder time in local time with user-friendly format
                const reminderDate = new Date(event.reminder.time);
                const formattedDate = reminderDate.toLocaleDateString();
                const formattedTime = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                reminderTooltip = `Reminder set for ${formattedDate} at ${formattedTime} (${event.reminder.method})`;
              }

              return (
                <div key={event._id} className={`${styles['event-card']} ${event.isSystemGenerated ? styles['system-event-card'] : ''}`}>
                  <div className={styles['event-content']}>
                    <div className={styles['event-card-header']}>
                      <h3>{event.name}</h3>
                      {event.isSystemGenerated && <span className={styles['system-tag']}>System Event</span>}
                    </div>
                    <p>{formatDateOnly(event.date)}</p>
                    {!recipient?.isSystemAccount && (
                      <p>Recipient: {recipient ? `${recipient.firstName} ${recipient.lastName}` : 'No recipient'}</p>
                    )}
                    <p className={styles['days-countdown']}>
                      {daysUntil === 0 ? "Today" : 
                       daysUntil === 1 ? "Tomorrow" : 
                       daysUntil > 1 ? `${daysUntil} days away` : 
                       "Past event"}
                    </p>
                  </div>
                  <div className={styles['event-actions']}>
                    <button 
                      className={styles['edit-button']} 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event);
                      }}
                      data-tooltip="Edit event"
                      aria-label="Edit event"
                      title="Edit event"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button 
                      className={styles['reminder-button']} 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetReminder(event);
                      }}
                      data-tooltip={reminderTooltip}
                      aria-label={reminderTooltip}
                      title={reminderTooltip}
                    >
                      <FontAwesomeIcon icon={faBell} style={{ color: event.reminder && event.reminder.isSet ? 'var(--color-warning)' : 'var(--color-ink-muted)' }} />
                    </button>
                    <button 
                      className={styles['delete-button']} 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEvent(event._id);
                      }}
                      data-tooltip="Delete event"
                      aria-label="Delete event"
                      title="Delete event">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
};

const CalendarEvents = ({ events, onEventSelect, recipientDetails, onEditEvent }) => {
  const calendarEvents = events.map(event => ({
    id: event._id,
    title: event.name,
    // The stored calendar day (a bare date is an all-day event on that day)
    start: dateOnlyISO(event.date),
    allDay: true,
    extendedProps: { 
      ...event, 
      recipientDetails: event.recipient ? recipientDetails[typeof event.recipient === 'object' ? event.recipient._id : event.recipient] : null
    }
  }));

  const handleEventClick = (info) => {
    onEditEvent(info.event.extendedProps);
  };

  const eventDidMount = (info) => {
    tippy(info.el, {
      content: buildEventTooltip(info.event),
      placement: 'top',
      arrow: true,
      delay: [200, 0]
    });
  };

  return (
    <div className={styles['calendar-container']}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={todayLocalISO()}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: ''
        }}
        events={calendarEvents}
        eventClick={handleEventClick}
        eventDidMount={eventDidMount}
        height="auto"
      />
    </div>
  );
};

export default Events;
