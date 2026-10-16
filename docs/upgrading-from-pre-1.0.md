# Upgrading from a pre-1.0 source install

Gifty's own backup moves your data into the new layout.

**Check your CPU first:** `grep -c avx /proc/cpuinfo`. If it prints `0`, MongoDB 5+ cannot run on this machine — keep MongoDB 4.4 by setting `MONGO_IMAGE=mongo:4.4` in `.env` and skip the MongoDB swap (steps 5–6).

1. Stop the old stack. Note where its Mongo data and uploads volumes live (`docker volume ls | grep gifty`).
2. Create a folder for the new install with the new `docker-compose.yml` and `.env` (see README). Set `MONGO_IMAGE=mongo:4.4` in `.env` and mount your old Mongo data in the `mongo` service: `- <old-mongo-volume-or-path>:/data/db`.
3. Copy old uploads into `./data/app/uploads/` (from the old `backend_uploads` volume: `docker run --rm -v gifty_backend_uploads:/from -v "$PWD/data/app/uploads:/to" alpine cp -a /from/. /to/`).
4. `docker compose up -d`, log in as the oldest account (the instance owner), Settings → Backups → **Create backup**. Confirm a `gifty-backup-*.tar.gz` appears in `data/app/backups/`.
5. *(AVX CPUs only)* `docker compose down`. Remove `MONGO_IMAGE` from `.env` and point the `mongo` volume back at the new, empty `./data/mongo`.
6. *(AVX CPUs only)* `docker compose up -d`, register a temporary account, Settings → Backups → **Restore** the backup from step 4. Log in with your old account; delete the temporary account.

## Before the first start: set your time zone

Set `TZ` in `.env` to your household's IANA time zone (for example `TZ=America/New_York`) **before** the first boot of the new version. Gifty uses it to decide which year and month every purchase counts in — including all your existing purchases — so a wrong value moves purchases near midnight into the wrong month or year. An invalid value stops Gifty from starting with a clear error.

## What happens on the first start

The first boot of this version runs a one-time money-model migration before it serves requests:

1. It previews the changes. If there is nothing to do (a fresh install), it just records that it ran.
2. Otherwise it takes a full backup first — a new `gifty-backup-*.tar.gz` in `data/app/backups/` — and only then applies the changes. If the backup fails, nothing is changed.
3. It rounds every gift price to whole cents, removes the old stored budget counters (spent/remaining/allocated are now calculated from your purchases), gives purchased gifts without a purchase date one (from when they were last updated), and clears purchase dates from gifts that aren't purchased.
4. It prints a report in the container log (`docker compose logs gifty | grep money-migration`):
   - **Drift**: for each recipient budget, the old stored "spent" next to the real total of purchases. Differences are expected — they are the bugs this version fixes.
   - **Purchased on their event's date**: purchases whose date equals the event's date. Older versions sometimes recorded the event date instead of the day you bought the gift. Check these in **Purchase History** and correct the date where needed.

A large instance may take a minute on that first start (mostly the backup). If the migration fails, Gifty still starts, logs the error, and retries on the next start.

To preview without changing anything: `docker compose exec gifty node scripts/migrate-money-model.js` (dry run is the default).

### Repairing text stored with codes like `&#39;`

Older versions HTML-encoded text before saving it, so a name typed as `O'Brien` was stored, and sometimes shown, as `O&#39;Brien`. The same applied to `&`, `<`, `>` and `"`. Each time you edited and saved something, another layer was added (`O&amp;#39;Brien`). After the money migration, the first start also runs a one-time text repair that removes every layer:

1. If nothing is encoded (a fresh install), it just records that it ran.
2. Otherwise it takes another backup first, then decodes the text and clears cached pages. Its counts appear in `docker compose logs gifty | grep text-repair`.
3. It runs **only once**. After the upgrade text is stored exactly as typed, and a second run would change text you type on purpose, such as a note containing `&lt;`. If a run is interrupted (the log says so on every start), restore the backup it names, then run `docker compose exec gifty node scripts/repair-encoded-text.js --apply --force`.

To preview it: `docker compose exec gifty node scripts/repair-encoded-text.js` (dry run is the default).

### Restoring a backup taken before the upgrade

No extra step is needed. A full restore (Settings → Backups → **Restore**) runs the one-time migrations right after it restores, and the restore message says whether any of them failed. Restoring your own backup file (Settings → **Restore Backup**) applies the same fixes as the file comes in, and its summary lists what it fixed.

### Calendar repairs on the first start

The first start also brings your events in line with how this version stores them. Each step logs a line in `docker compose logs gifty`:

- **Recurring events** are linked into series once: a renamed or moved series now updates its future occurrences, and a deleted occurrence stays deleted. Look for `Recurring events: N created`. It should be about `0`. A large number means an old series was not recognised and its occurrences were created again. The shapes at risk are monthly series on the 29th–31st and yearly ones on Feb 29, which older versions shifted by days. Check those on the Events page and delete any doubles.
- **Birthday events** get this install's Birthday type and follow the recipient's birthdate and name from now on (`Repaired the event type of N birthday events`).
- **Holidays and other dates stored at the server's local midnight** move onto their own day. On a server east of UTC (for example `TZ=Europe/Berlin`) older versions showed them a day early (`Moved N events stored at local midnight onto their calendar day`). Keep `TZ` set to the zone those dates were written under for this first start.
- **Floating holidays** (Thanksgiving, Memorial Day, Mother's and Father's Day, Easter-based days such as Karfreitag or Vatertag) were generated on a fixed date every year by older versions. Their definitions get the right rule (`Holidays: 0 added, N definitions updated`), and generated holiday events move onto the day the holiday really falls, together with their reminders (`Moved N holiday events onto the day their holiday falls`). Two generated copies of a holiday on the same day become one. Holiday events you created yourself are not touched.
- **Holidays now carry on to the next year.** Older versions generated each holiday once and never again. On every start, and on the 1st of each month, a holiday whose last occurrence has passed gets next year's event (`Holiday regeneration complete. … Created: N`); a holiday you deleted is not brought back. Holidays that older versions never generated for this year appear when you click **Refresh Holidays** on the home page or save the holiday settings. Changing the holiday settings no longer deletes past holidays, holidays with gifts, or events you filed under the Holiday type yourself.
- **Vendors** saved before accounts were separated have no owner and were listed for every account. They now belong to the instance owner, the oldest account (`Gave N vendors without an owner to the instance owner`), and each account sees only its own.

### Things to check after the upgrade

1. Names and notes with apostrophes or `&` read correctly.
2. **Purchase History**: dates of purchases flagged in the money report, and the yearly totals on the Budgets page.
3. **Events**: a few events and holidays show on the right day, and recurring series look complete.

### Text it cannot repair

Some things it cannot fix:
- Text you deliberately typed as a code before upgrading (a note containing `&lt;` or `&amp;`) can't be told apart from the encoding, so it is decoded as well (`&lt;` becomes `<`).
- The old filter also **deleted** `javascript:`, `data:` and `on…=` from text. For example, a note containing `Metadata:` was saved as `Meta`. Those characters cannot be restored.
- **Passwords** containing `& < > " '` were saved in encoded form. Your real password still works: you log in normally and Gifty updates the stored password on that login.
- Per-account **email (SMTP) passwords** with those characters were sent to your mail server in encoded form, so sending failed. The repair restores them. If reminders still fail, re-enter the password in Settings.
