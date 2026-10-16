# SMTP Email Configuration Guide

This guide explains how to set up email notifications in Gifty using SMTP.

## Overview

Gifty can send email notifications for upcoming events using your email provider's SMTP server. This requires configuring your email provider's settings and generating an "app password" for secure access.

## Supported Email Providers

### Built-in Support

Gifty has built-in support for these email providers:

- Gmail
- Outlook
- Yahoo Mail

For these providers, you only need to enter your email address and app password.

### Custom SMTP

For other email providers, you'll need to:

1. Select "Custom SMTP"
2. Enter the SMTP server details (host, port)
3. Configure security settings (SSL/TLS)
4. Provide your email credentials

## Setting Up App Passwords

For security reasons, many email providers recommend using "app passwords" instead of your regular account password.

### Gmail App Password

1. Go to your Google Account settings
2. Navigate to Security > 2-Step Verification
3. At the bottom, click on "App passwords"
4. Select "Mail" and "Other" (custom name: "Gifty")
5. Click "Generate"
6. Use the generated 16-character password in Gifty

### Outlook App Password

1. Go to account.microsoft.com/security
2. Select "Security" > "Advanced security options"
3. Under "App passwords", select "Create a new app password"
4. Use the generated password in Gifty

### Yahoo Mail App Password

1. Go to account.yahoo.com/security
2. Click "Generate app password" at the bottom
3. Select "Other app" and name it "Gifty"
4. Use the generated password in Gifty

## Troubleshooting

### Test Email Failures

If the test email fails:

1. Verify your email address and app password
2. Check that your email provider allows SMTP access
3. For Gmail, ensure "Less secure app access" is enabled or use an app password
4. For custom SMTP, verify the host, port, and security settings
5. Check if your email provider requires any special configuration

### Email Not Received

If you don't receive notifications:

1. Check your spam/junk folder
2. Verify that email notifications are enabled in your Gifty account settings
3. Confirm your notification preferences for each event
4. Try sending a test email from the configuration page

## Security Considerations

- Gifty securely encrypts your email password in the database
- App passwords provide limited access to your email account
- You can revoke app passwords at any time through your email provider
- Email information is only used for sending notifications related to your events

## Custom SMTP Settings

For popular email providers not built-in, here are common SMTP settings:

| Provider | SMTP Host | Port | Security |
|----------|-----------|------|----------|
| AOL | smtp.aol.com | 587 | TLS |
| Zoho | smtp.zoho.com | 587 | TLS |
| ProtonMail | smtp.protonmail.ch | 587 | TLS |
| iCloud | smtp.mail.me.com | 587 | TLS |
| GMX | mail.gmx.com | 587 | TLS |