# Gifty

Self-hosted gift planning: keep track of the people you buy for, their birthdays and holidays, budgets, and gift ideas — with optional AI suggestions.

## Features
- Recipients with interests, sizes, wish lists and budgets
- Events and reminders (in-app, plus email if you configure SMTP)
- Gift tracking from idea to purchased, with purchase history
- Budgets per year and per person
- Optional AI gift suggestions (OpenAI, Anthropic or Gemini key) and web gift discovery (Brave Search key)
- Built-in backups, daily and on demand

## Requirements
- Docker with Compose v2
- amd64, or arm64 with ARMv8.2-A (Raspberry Pi 5, Apple Silicon, most ARM cloud VMs). Raspberry Pi 4 is **not supported**.
- MongoDB 7 needs a CPU with AVX. On older x86 CPUs (`grep -c avx /proc/cpuinfo` prints `0`), set `MONGO_IMAGE=mongo:4.4` in `.env`.
- ~1 GB RAM

## Install
```bash
mkdir gifty && cd gifty
curl -fsSLO https://raw.githubusercontent.com/fjmerc/gifty/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/fjmerc/gifty/main/.env.example -o .env
docker compose up -d
```
Open `http://<your-server>:3000/setup`: the setup wizard creates the first account (with the setup code below), sets the household defaults and checks what the server detected. **The first account created is the instance owner** and an admin. Admins can make backups and trigger gift discovery, and manage accounts on the **Admin** page (deactivate and reactivate members). The owner also makes other people admins and can hand ownership to someone else there, and only the owner can restore or delete backups. The owner can't delete their account while other accounts exist, so hand over ownership first.

### First run: the setup code
So that nobody else who reaches the server first can claim it, the first registration asks for a one-time **setup code**. Gifty makes one whenever it starts with no accounts and shows it in two places:

- the log: `docker compose logs gifty | grep "setup code"`
- the file `data/app/setup-code.txt` (readable only by the container user; `sudo cat data/app/setup-code.txt`)

Enter it in the **Setup code** field in the setup wizard. The code is used once: after the first account exists the file is deleted and later accounts register without a code. Restarting before then replaces the code with a new one. Servers that already have accounts never ask for it.

### Adding people

Sign-up is invite-only. On the **Admin** page, open **Invites** and create a link (optionally for one email address, valid 1, 7 or 30 days); send it yourself. Invited people join as members. Admins can switch sign-up to open on **Admin › Instance**; then anyone who can reach the address can create an account.

Links use `GIFTY_URL`. Set it to the address people open (for example `https://gifty.example.org`), or the links will point at `localhost`.

### Forgotten passwords

Admins make a one-time reset link on **Admin › Users** (valid 24 hours). If nobody who can make one can sign in, run on the server:

    docker compose exec gifty node scripts/reset-link.js you@example.com

It prints a reset link for any account, the owner's too.

## Configuration
All settings live in `.env`; all are optional.

| Variable | Default | Purpose |
|---|---|---|
| `GIFTY_URL` | `http://localhost:3000` | Address users open. Set `https://…` when a TLS reverse proxy sits in front. |
| `TZ` | `UTC` | Your household's IANA time zone (e.g. `America/New_York`). It decides which year and month each purchase counts in for budgets and spending, and schedules reminders, discovery and backups. |
| `DEFAULT_COUNTRY` | `US` | Holidays new accounts get: `US` or `DE`. Each member can change it in Settings; existing accounts keep theirs. Gifty refuses to start with a country it has no holidays for. Read once, on the first start: afterwards change it on **Admin › Instance** |
| `DEFAULT_CURRENCY` | `USD` | Currency new accounts see money in until a year's overall budget sets one (purchase history, home chart, AI suggestions without a budget, the budget form): `USD`, `EUR`, `GBP`, `JPY` or `CNY`. Existing accounts keep theirs. Read once, on the first start: afterwards change it on **Admin › Instance** |
| `OPENAI_API_KEY` | – | Enables AI suggestions (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` also work) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | – | Server email for reminders. Users can also configure their own email in Settings. |
| `INSTANCE_SMTP_DAILY_LIMIT` | `20` | Max server-email messages per account per day |
| `BRAVE_SEARCH_API_KEY` | – | Enables web gift discovery |
| `BACKUP_KEEP` | `7` | Daily automatic backups to keep (`0` = off) |
| `SMTP_BLOCK_PRIVATE_HOSTS` | off | `true` refuses private, loopback and compose-service addresses (e.g. `mongo`, `192.168.x.x`) as a member's own mail server. Leave off if members relay through a mail server on your LAN. Custom mail servers are limited to ports 25, 465, 587 and 2525 either way |
| `TRUST_PROXY` | off | Behind a reverse proxy: its IP/CIDR (or hop count) so rate limits see real client IPs. Without it every client looks like the proxy and one person's failed logins lock everyone out; Gifty logs a warning when requests carry `X-Forwarded-For` and this is unset |
| `MONGO_IMAGE` | `mongo:7` | Use `mongo:4.4` on CPUs without AVX |
| `GIFTY_VERSION` | `latest` | Pin an image version |
| `GIFTY_PORT` | `3000` | Host port |

Secrets are generated on first start and stored in `data/app/secrets.json`.

The server email only ever sends to an account's own email address. To send reminders elsewhere, a user configures their own email in Settings.

## Data and backups
Everything lives in `./data/` next to `docker-compose.yml`. Daily backups are written to `data/app/backups/` (readable only by the container user, uid 1000); admins can create backups on **Admin › Backups**; only the owner can restore or delete them. A restore first takes a safety backup of the current data. To move servers, copy the whole `data/` directory.

Server backups hold every account's data, including password hashes, and keep data of accounts deleted after they were made. Keep the `backups` folder private and prune it when an account leaves.

Each user can also download their own data (Settings → **Create Backup**) and restore it into their account here or on another Gifty server. Recipients, events, gifts and budgets come back linked together; event types and tags are matched by name. Profile photos are not included. Settings → **Export** (CSV, JSON or ZIP) is a readable copy for spreadsheets, with names instead of ids and the year's currency on every price; it cannot be restored.

## Upgrading
```bash
docker compose pull && docker compose up -d
```
Coming from a pre-1.0 source install? See [docs/upgrading-from-pre-1.0.md](docs/upgrading-from-pre-1.0.md).

## Reverse proxy
Proxy everything to the Gifty container on port 3000 — no path rewriting needed. Set `GIFTY_URL` to the public `https://` address and `TRUST_PROXY` to the proxy's address so login rate limits work per client.

## Development
See [docs/development.md](docs/development.md).

## License
[AGPL-3.0](LICENSE)
