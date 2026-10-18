# Security Policy

Please report vulnerabilities privately via GitHub's "Report a vulnerability" (Security tab) rather than a public issue. You'll get an acknowledgement within 7 days.

Supported versions: the latest minor release.

Known limitations before 1.0:
- The **first account created** is the instance owner. Only the owner and the admins they appoint can make backups or trigger discovery; only the owner restores or deletes backups and manages admins. Creating the first account needs the one-time setup code from the server's log (see the README).
- Sign-up is invite-only by default. Invite and reset links are one-time, expire (invites 1–30 days, reset links 24 hours) and are stored only as a SHA-256 hash; anyone holding a valid link can use it, so send links over a channel you trust. Account emails are not verified.
