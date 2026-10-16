# Notification Catch-up System

## Overview

The Notification Catch-up System is a feature designed to handle missed notifications when the Gifty server is offline. When the server is turned off during a scheduled notification time, the notification is stored and delivered when the server comes back online.

## Problem Statement

Previously, if the server was offline when a notification was scheduled to be sent, the notification would never be triggered. This resulted in users missing important event reminders if the server happened to be down for maintenance or experienced an outage.

## Solution

The implemented solution has several components:

1. **Missed Notification Detection**: When the server starts up, it checks for notifications that were scheduled during the downtime.
2. **Retroactive Processing**: Identified missed notifications are processed with a special "retroactive" flag.
3. **Visual Indicators**: Retroactive notifications have distinct styling in the UI to differentiate them from real-time notifications.
4. **User Preferences**: Users can opt-out of retroactive notifications if desired.
5. **Original Schedule Tracking**: The system preserves and displays the original scheduled time for retroactive notifications.

## Implementation Details

### Backend Changes

#### 1. Notification Model Updates
- Added `isRetroactive` boolean field to indicate retroactive notifications
- Added `scheduledTime` field to store the original scheduled time
- Added `retroactive` status to the status enum

#### 2. Catch-up Service
A new service (`catchupService.js`) was created to:
- Run during server startup
- Find events with reminders that should have triggered during downtime
- Create retroactive notifications for these events
- Respect user preferences regarding retroactive notifications

#### 3. Standardized Date Handling
- Improved the `standardizeDate` function in `notificationService.js` to better handle timezone issues
- Added a new `formatDateForDisplay` function for consistent date formatting

#### 4. User Preferences
- Added preferences in the User model, including a `allowRetroactiveNotifications` setting

### Frontend Changes

#### 1. Visual Indicators
- Added styling for retroactive notifications with a distinct color scheme
- Added a "Retroactive" badge to clearly identify these notifications
- Displayed the original scheduled time alongside the actual delivery time

#### 2. Filtering Options
- Added a toggle to show/hide retroactive notifications
- Added statistics for retroactive notification count

#### 3. User Preference Controls
- Added ability to turn retroactive notifications on/off

## API Changes

The notification endpoints now support:

1. **GET /api/notifications**
   - Added `includeRetroactive` query parameter to filter notifications
   - Now returns formatted dates based on user's timezone
   
2. **GET /api/notifications/stats**
   - Now includes retroactive notification count
   - Returns user preferences for retroactive notifications

3. **PUT /api/notifications/:notificationId**
   - Added support for updating retroactive notification preferences

## Usage

### For End Users

- Retroactive notifications are marked with an amber color and a "Retroactive" badge
- The original scheduled time is displayed below the delivery time
- Users can toggle visibility of retroactive notifications using the filter button
- Users can opt out of retroactive notifications in their settings

### For Developers

When adding new notification types, be aware that all notifications are now subject to retroactive processing. If you need to exempt a specific notification type from this behavior, add a check in the `processMissedNotifications` function in `catchupService.js`.

## Limitations

- The system only checks for missed notifications within the last 7 days (configurable via environment variable)
- The catch-up process runs only when the server starts, not periodically
- Very long periods of server downtime may impact performance of the startup process

## Future Improvements

Potential enhancements for the future:
- Periodic catch-up processing instead of only at startup
- Batch processing for better performance with large numbers of missed notifications
- More detailed logging and monitoring of the catch-up process
- Integration with other notification channels (SMS, push notifications) for retroactive delivery

## Testing

The catch-up system has been tested with:
- Unit tests for the catch-up service functionality
- End-to-end tests for the notification flow
- Timezone handling tests for various regions

To run the tests: `npm test -- catchupService.test.js`
