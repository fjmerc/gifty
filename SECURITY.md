# Security Policy

Please report vulnerabilities privately via GitHub's "Report a vulnerability" (Security tab) rather than a public issue. You'll get an acknowledgement within 7 days.

Supported versions: the latest minor release.

Known limitations before 1.0:
- There are no admin roles yet. The **first account created** is the instance owner and the only account that can back up, restore or trigger discovery. Creating it needs the one-time setup code from the server's log (see the README).
- After the first account, sign-up is open to anyone who can reach the instance, and account emails are not verified. Don't expose a pre-1.0 instance to the public internet; 1.0 adds invite-only sign-up.
