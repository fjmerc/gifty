# Changelog

## 0.9.0 — unreleased
First self-hostable release.
- Single `gifty` image (amd64/arm64) serving UI and API on port 3000; compose with MongoDB 7 (or 4.4 via `MONGO_IMAGE` on CPUs without AVX) and Redis 7
- Secrets generated automatically on first start
- Works over plain HTTP on a LAN and behind HTTPS reverse proxies (`GIFTY_URL`, `TRUST_PROXY`)
- Backups no longer need Docker access; daily automatic backups with retention; safety backup before every restore; archives are owner-only
- Backup/restore and discovery limited to the instance owner (first account)
- Optional instance-wide SMTP (account's own address only, daily cap); AI and web search are optional and detected at startup
- Each scheduled job runs once (hourly discovery removed; discovery is weekly)
- Text is stored as typed: names and notes no longer turn into `O&#39;Brien`. A one-time repair decodes existing text on first start, after a backup. Reminder emails escape names themselves and link to `GIFTY_URL`
- Money adds up: what you spent comes from purchases (counted in the year and month bought, in the instance's time zone); overspending shows "Over by …" instead of being hidden
- Recipients with purchased gifts are archived instead of deleted, so past spending stays correct
- Restore accepts older JSON backups and backups from another server (matched by names)
- First registration needs a one-time setup code from the server log; signing out, changing the password or email, and deleting the account end every other session
- Saved mail server passwords are encrypted; custom mail servers are limited to ports 25, 465, 587 and 2525 and need STARTTLS on 587 by default (`SMTP_BLOCK_PRIVATE_HOSTS` refuses LAN addresses)
- Stricter Content Security Policy (no inline scripts), per-email login limits, generic login errors, current password required to change email or delete an account
- `DEFAULT_COUNTRY` (US or DE holidays) and `DEFAULT_CURRENCY` for new accounts
- Dark mode, keyboard access, phone layout and faster first load across the app
- AI suggestions use real price estimates, skip gifts you already saved or bought, and say plainly when the AI service fails. Web-Enhanced mode links to related pages it found instead of a "Buy Now" product lookup (RapidAPI removed)
- Removed: gift reviews, invented testimonials and sample analytics numbers
