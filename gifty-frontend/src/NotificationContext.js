import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from './axiosInstance';
import { createNotificationSound } from './assets/sounds/notification.js';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [notificationPermission, setNotificationPermission] = useState('default');
    const [settings, setSettings] = useState({
        defaultDuration: 5,
        displayOrder: 'newest',
        soundAlerts: true,
        visualAlerts: true,
        autoDismiss: true
    });
    // Sign-in lives in an httpOnly cookie: follow the app's auth state
    const { isAuthenticated: isLoggedIn = false } = useAuth() || {};
    // One sound object: a new one each render re-created the polling below
    const notificationAudio = useMemo(() => createNotificationSound(), []);

    // Check browser notification permission
    const checkNotificationPermission = useCallback(() => {
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission;
    }, []);

    // Request notification permission
    const requestNotificationPermission = useCallback(async () => {
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        
        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            return permission;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return 'error';
        }
    }, []);

    // Check initial permission on mount
    useEffect(() => {
        if ('Notification' in window) {
            const permission = Notification.permission;
            setNotificationPermission(permission);
        }
    }, []);

    const fetchUnreadCount = useCallback(async () => {
        if (!isLoggedIn) return;

        try {
            const response = await axios.get('/notifications/stats');
            setUnreadCount(response.data.unreadCount);
        } catch (error) {
            console.error('Failed to fetch notification count:', error);
        }
    }, [isLoggedIn]);

    // Load notification settings from localStorage
    useEffect(() => {
        const savedSettings = localStorage.getItem('notificationSettings');
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                setSettings(parsedSettings);
            } catch (error) {
                console.error('Error parsing notification settings:', error);
            }
        }
    }, []);

    // Initial fetch and polling
    useEffect(() => {
        let intervalId;

        fetchUnreadCount();

        if (isLoggedIn) {
            // Reduced polling frequency to reduce server load
            intervalId = setInterval(() => {
                fetchUnreadCount();
            }, 300000); // Poll every 5 minutes instead of every minute
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isLoggedIn, fetchUnreadCount]);
    
    // Track last fetch time to prevent excessive API calls
    const lastFetchTimeRef = useRef(0);
    // Ids of notices already shown or alerted (null until the first fetch)
    const seenIdsRef = useRef(null);
    useEffect(() => {
        if (!isLoggedIn) seenIdsRef.current = null;
    }, [isLoggedIn]);
    const FETCH_THROTTLE_MS = 10000; // 10 seconds minimum between fetches
    
    // Fetch latest notifications
    const fetchLatestNotifications = useCallback(async () => {
        if (!isLoggedIn) return;
        
        // Throttle API calls
        const now = Date.now();
        if (now - lastFetchTimeRef.current < FETCH_THROTTLE_MS) {
            return;
        }
        
        try {
            lastFetchTimeRef.current = now;
            
            const response = await axios.get('/notifications?page=1&limit=5');
            const newNotifications = response.data.notifications || [];

            // The first fetch only learns what is already there; later ones
            // alert for notices not seen before that are unread and not snoozed
            const seen = seenIdsRef.current;
            seenIdsRef.current = new Set([...(seen || []), ...newNotifications.map(n => n._id)]);
            const newNotificationItems = seen
                ? newNotifications.filter(n => !seen.has(n._id) && !n.read && !n.isSnoozed)
                : [];

            if (newNotificationItems.length > 0) {
                // Play sound if settings allow
                if (settings.soundAlerts) {
                    notificationAudio.play().catch(err => {
                        console.error('Failed to play notification sound:', err);
                    });
                }

                // Show visual alert if settings allow
                if (settings.visualAlerts) {
                    // Check for browser notification permission before showing notifications
                    if ('Notification' in window && notificationPermission === 'granted') {
                        newNotificationItems.forEach(notification => {
                            // The event (or its recipient) may have been deleted since
                            const title = notification.event?.name || 'Reminder';
                            const recipient = [notification.event?.recipient?.firstName, notification.event?.recipient?.lastName]
                                .filter(Boolean).join(' ');

                            new Notification('Gifty Notification', {
                                body: recipient ? `${title} - ${recipient}` : title,
                                icon: '/favicon.ico'
                            });
                        });
                    }
                }
            }

            setNotifications(newNotifications);
        } catch (error) {
            console.error('Failed to fetch latest notifications:', error);
        }
    }, [isLoggedIn, settings, notificationAudio, notificationPermission]);
    
    // Poll for latest notifications
    useEffect(() => {
        let notificationIntervalId;

        if (isLoggedIn) {
            fetchLatestNotifications();
            // Reduced polling frequency to reduce server load
            notificationIntervalId = setInterval(() => {
                fetchLatestNotifications();
            }, 120000); // Poll every 2 minutes instead of every 30 seconds
        }

        return () => {
            if (notificationIntervalId) {
                clearInterval(notificationIntervalId);
            }
        };
    }, [isLoggedIn, fetchLatestNotifications]);

    const updateUnreadCount = (change) => {
        setUnreadCount(prevCount => Math.max(0, prevCount + change));
    };
    
    const updateSettings = (newSettings) => {
        setSettings(prev => {
            const updatedSettings = { ...prev, ...newSettings };
            localStorage.setItem('notificationSettings', JSON.stringify(updatedSettings));
            return updatedSettings;
        });
    };

    return (
        <NotificationContext.Provider value={{
            unreadCount,
            updateUnreadCount,
            fetchUnreadCount,
            notifications,
            settings,
            updateSettings,
            notificationPermission,
            checkNotificationPermission,
            requestNotificationPermission
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
