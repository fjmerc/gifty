# Changelog

## 1.0.0 — 2026-10-18
- Roles: the owner (first account) and admins manage the instance; everyone else is a member. Existing instances: the oldest account becomes owner, every other account a member
- Admin page: list accounts, deactivate and reactivate members (deactivated accounts are signed out at once), make admins (owner), hand over ownership (owner, needs the current password)
- Backups, discovery and detailed health need an admin instead of the first account; restoring or deleting a backup stays with the owner, and a restore re-checks who the owner is
- Sign-up is invite-only: admins create one-time invite links (optionally for one email, valid 1, 7 or 30 days) on the Admin page; invited people join as members. Admins can open sign-up. Existing instances become invite-only on upgrade
- Forgotten passwords: admins create one-time reset links (24 hours); `docker compose exec gifty node scripts/reset-link.js <email>` prints one for any account, the owner's too
- First-run wizard at `/setup`: the owner account, household defaults (holiday country, currency, sign-up) and a check of what the server detected
- The household defaults live in the database: `DEFAULT_COUNTRY`/`DEFAULT_CURRENCY` only seed them; change them on Admin › Instance
- Database Management moved from Settings to Admin › Backups
- Invite and reset tokens are kept out of the server logs
- A reset link stops working when the admin who made it is deactivated or demoted, or when its account becomes an admin or the owner
- Fixed: the nightly backup and daily maintenance were skipped for the day when the server clock stepped by more than a second (time sync, a paused VM); late runs now go ahead, and a skipped run is logged

## 0.9.0 — 2026-10-16
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
