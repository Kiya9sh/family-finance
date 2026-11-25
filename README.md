# مدیریت مالی خانواده — Family Finance

A mobile-first Progressive Web App for managing personal and family finances with a selectable currency unit and the **Jalali (Hejri Shamsi)** calendar. Built as a PWA, added to the Home Screen, working offline with no backend and no account.

Everything is static files: no build step, no server, no dependencies, no API keys.

---

## Screens

| Tab | What it does |
| --- | --- |
| **خانه / Home** | One Jalali month at a glance: recorded income, expected income, expenses, loan instalments paid, estimated money left. Person filter chips, expense-by-category bars, per-person comparison, six-month trend, recent transactions. |
| **تراکنش‌ها / Records** | Every income and expense, filtered by month (or all months), type, person and category, with search. Grouped by day with daily totals. |
| **برنامه / Planning** | Four sub-tabs: **expected income** per person/category/month, **loans** (instalments, payment history, remaining balance), **money lent & borrowed**. |
| **محاسبه / Calculate** | Loan instalment calculator, "can we afford a new loan?" estimate, buy-now-pay-later instalments (4 to 6 months and more), bank deposit interest with four methods, and an income-tax return estimate with editable brackets. |
| **گزارش / Report** | Choose a Jalali range, choose people and which fields to include, preview the Markdown, then share it with the iOS share sheet or save the `.md` file. |
| **بیشتر / More** | Family profiles, categories, stores/websites, accounts, daily reminder, currency and calendar settings, app update control, language (فارسی / English), sample data, backup & restore, delete everything, help & limitations. |

Sheets (bottom cards) handle every form: add/edit expense, add/edit income, paste-from-SMS import, loan, loan payment, expected income, lending, account, category, profile, and all confirmations before deleting.

---

## Data storage

- **IndexedDB**, database `family-finance`, one object store per record type:
  `profiles`, `categories`, `payees`, `transactions`, `expected`, `loans`, `lendings`, `accounts`, `assets`, `tombstones`, `settings`.
- Money is stored exactly as entered in the selected household unit (Toman, Rial, USD, EUR or a custom unit). There are **no exchange rates and no currency conversions**. Changing the unit only changes the label; existing numbers are not converted. Choose one unit and keep it consistent. Legacy installs are reset to Toman on upgrade so existing Toman figures keep their meaning.
- Dates are stored as ISO `YYYY-MM-DD` (Gregorian) so sorting is trivial, and **shown** in Jalali everywhere — month keys, grouping, reports, reminders. Monthly repeat rules advance by *Jalali* months, so a salary on 1 Mehr repeats on 1 Aban.
- Language choice is mirrored in the settings record; the UI is unrecoverably local. No analytics, no third-party scripts, and no fonts loaded from a CDN.
- The service worker precaches the whole shell, so the app opens offline after the first successful load. Internet is used to fetch the app and check for updates; financial records stay on the phone.

Financial records are never sent anywhere. A record only leaves the phone if you explicitly share an export or a backup.

## Accounts and sensitive data

- Accounts keep a nickname, an optional bank name, **four card digits at most**, and an optional IBAN.
- The IBAN is masked in lists (`IR06 •••• •••• •••• 0001`) behind a reveal button and is **excluded from reports and backups' readable exports by default** (a report only includes it when the “last 4 digits and IBAN” switch is turned on).
- The app never asks for a PIN, CVV, password or banking login, and there is no field for a full card number.
- An account nickname or IBAN **does not connect to a bank** and **does not verify a balance**.

---

## Installation on an iPhone

1. Open the published link in **Safari** (not Chrome, not an in-app browser). The first visit needs an internet connection.
2. Wait until the dashboard appears.
3. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
4. Open the app from the Home Screen icon. It now runs in standalone mode, full screen, without Safari's address bar.

Notes for iOS:

- Only Safari can install a PWA. If you opened the link inside Messages, Instagram, etc., tap “open in Safari” first, or copy the link into Safari.
- The **first** load must be online. After that the shell is cached and the app works with no connection; an “آفلاین / Offline” pill appears in the header while offline.
- iOS may show a screenshot as the icon if it ignores the icon links. The app draws a 180×180 PNG icon into `apple-touch-icon` at runtime to avoid this; if the icon still looks wrong, remove the Home Screen app and add it again after one full load.
- Deleting the Home Screen app deletes its local data. Keep a backup file.

---

## Publishing

The app is plain static files (`index.html` at the top level, no build script, no Dockerfile).

- **From FreeMilk:** tap **Run** in this project. It publishes the files to the private preview link (`…--preview.freemilk.app`), which is HTTPS. **Go Live** in Project Details puts that version on the public link (`….freemilk.app`).
- **Any free static host** works the same way, since there is nothing to compile:
  - *GitHub Pages*: in **Settings → Pages**, set **Source** to **Deploy from a branch**, branch `main`, folder `/ (root)`. Every push to `main` publishes the site at `https://<user>.github.io/<repo>/` a minute or so later. No workflow file is needed and none is included: the repository is plain static files. (Without a Pages run, even `/styles.css` answers 404 — that is what a "blank site" usually means.)
  - *Netlify Drop*: drag the folder onto `app.netlify.com/drop`.
  - *Cloudflare Pages*: connect the repository, empty build command, output directory `/`.
  
  All of them serve over HTTPS, which a PWA requires.

Nothing in this repository is live until one of those steps uploads it.

---

## Daily reminder, and why it is in-app

iOS does not let an installed web app schedule a background notification the way a native app can (no Notification Triggers API, no background timers). So:

- The **in-app reminder** shows a card on the dashboard when the reminder is on, the time has passed and today has no expenses recorded.
- **“Review unrecorded days”** lists every day of the month with nothing recorded, each with a one-tap way to add an expense for that day.
- **“Add to iPhone Calendar”** downloads a small `.ics` file with a daily repeating event at your chosen time. Opening it in Calendar gives you a real notification that works while the app is closed.

The app never requests notification permission and never sends a push message.

---

## Backup, restore, deletion

- **Backup** writes one JSON file with every store (`{"app":"family-finance","version":1,…}`). Save it with the share sheet (AirDrop, Files, iCloud Drive).
- **Restore** reads such a file and replaces everything after a confirmation. No developer and no server needed. To move phones: send the file with AirDrop, install the app there, restore.
- **Delete all data** wipes every store after a confirmation; language and reminder settings survive, everything else is gone.
- Browser storage is not a backup: iOS can evict it under storage pressure. The app asks for persistent storage on every launch, but a backup file is the reliable copy.

## Sample data

“Add sample data” creates a clearly labelled set of made-up records (people, transactions, a loan, lending, an account), all flagged as samples. A banner sits on the dashboard, exports skip samples unless you tick “include sample data”, and **Remove** deletes exactly those records.

---

## Project layout

```
index.html            app shell, iOS meta tags, manifest link
manifest.webmanifest  name, icons, standalone, shortcuts
sw.js                 precache + network-first service worker (bump CACHE_VERSION on release)
styles.css            one stylesheet, logical properties for RTL/LTR
icons/icon.svg        maskable app icon
js/jalali.js          Jalali ⇆ Gregorian maths (jalaali algorithm), month arithmetic
js/i18n.js            language state; strings are written as L('فارسی', 'English')
js/util.js            currency formatting/parsing, Jalali display, file sharing
js/db.js              IndexedDB wrapper, backup/restore primitives
js/state.js           in-memory store + every calculation (summaries, loans, reminders)
js/components.js      icons, sheets, fields, Jalali date picker, charts
js/bus.js             action/form registry used by the views
js/report.js          Markdown report builder
js/views/*.js         dashboard, records, planning, reports, more, entry forms
js/app.js             router, event delegation, onboarding, boot
```

Conventions worth keeping: amounts are kept as entered in the selected currency unit with no conversion; dates in storage are ISO Gregorian; every string goes through `L('fa', 'en')`; every write goes through `state.upsert`/`removeRecord` so IndexedDB and memory cannot drift.

## Testing checklist (iPhone Safari)

1. Add to Home Screen, launch from the icon, confirm standalone mode and a working icon.
2. Turn on Airplane Mode, relaunch: the app opens and shows the offline pill.
3. Add an expense with Persian digits and separators (`۱٬۲۵۰٬۰۰۰`), check the month summary and category bars.
4. Add a recurring monthly income, change months, confirm the repeats appear once each.
5. Record an expected income, confirm it never counts as recorded income.
6. Add a loan, record two payments, check remaining balance and “upcoming instalments”.
7. Run the calculator, then the affordability check; confirm the numbers and the “estimate, not advice” note.
8. Report → pick a range, toggle people and fields, preview, share to Notes/Files.
9. Backup → save to Files → delete all data → restore the file → confirm everything returns.
10. Check Jalali dates across dashboard, records, report, and the reminder's unrecorded days.
11. Switch currency after adding records; confirm the warning appears and saved numbers stay unchanged while labels change. Confirm USD/Euro/custom entries keep two decimal places and Toman/Rial stay whole.
12. Add investment holdings quoted in different currencies; confirm each currency has its own value and gain/loss total, with no cross-currency sum.
13. More → App update → Check and reload; confirm the app reloads and saved records remain.


---

## Version 2

Added on top of version 1:

- **Calendar choice** — More → *Calendar & currency* switches every date between Jalali and Gregorian for display and entry. Dates are still stored one way (ISO Gregorian), and monthly periods (salary, instalments, monthly reports) stay on the Jalali month, because that is the payroll and billing cycle the app is built around.
- **Currency choice** — Toman, Rial, USD, Euro or a custom label. The selected unit is used as entered; the app never converts amounts and requires no exchange rates. Changing the selected unit only changes labels, not saved numbers.
- **A separate Calculate tab** — loan instalments, the affordability check, buy-now-pay-later instalments, bank deposit interest and the income-tax estimate, out of Planning.
- **Buy now, pay later** — price, down payment, 2–24 instalments (4 and 6 are one tap away), a percentage or fixed fee, the resulting schedule, the effective annual rate, and a button that saves the plan as an instalment loan in Planning.
- **Deposit interest** — simple, yearly compounded, monthly compounded, or interest paid out monthly, with optional withholding and an effective annual yield. The method, rate, term and result are all listed.
- **Income tax estimate** — taxable income after deductions, progressive brackets you can edit (the defaults are placeholders, not the law), tax already paid, and the balance due or refund. The screen says plainly it is an estimate.
- **Attribution** — More → Help & limitations credits the app's coding and idea to Kianoosh Gholami.
- **Markdown and JSON exports** — the Report tab and More → Backup both write `.md`; the JSON backup is the only format that can be restored, and the backup screen says so next to the buttons.
- **Family sharing** — a phone-to-phone exchange file that *merges* instead of replacing: people, categories and stores are matched by name, a newer edit wins, and deletions travel as tombstones so a removed record does not come back. No server, no account. Live sync between phones would need its own secure backend and is not part of this version.


---

## Version history and recovery

The current release is **version 2.1**. It restores multi-currency input and investment tracking without exchange-rate conversion, and includes a manual update control under More → App update.

- **The database opener asks the phone which version is stored** and opens at
  least that, adding any missing stores. It keeps existing version-3 databases
  usable while adding stores required by a release.
- **The service worker fetches files from the network first** and keeps the
  cache only as the offline fallback, so an older cached script can never be
  paired with a newer page. The cache name is bumped for each release.

If the app ever shows a blank page or the «برنامه بارگذاری نشد» card:

1. Tap **تلاش دوباره**.
2. If that fails, open `<site>/reset.html` in Safari: it clears the cached app
   files and the service worker, then reloads. **Your records are not touched.**
3. Removing the Home Screen icon removes that icon's storage, so back up first
   if you are going to do that.


---

## Version 2.1 — more currencies and investments

Added on top of version 2:

- **USD, Euro and a custom unit** — More → *Calendar & currency* offers Toman,
  Rial, USD, Euro or a unit you name. It is a unit label/input choice only: the
  entered amount is kept as-is. No exchange rate is requested or applied, and
  changing the choice does not convert existing values. Keep one unit selected
  consistently for the household.
- **Investments** — Planning → *داراییها / Assets*: currencies, gold (gram and
  coin), silver, shares and crypto (BTC, ETH, USDT, or your own name), each with
  quantity, unit, price per unit and an optional buy price. Holdings and gains
  are totalled separately by quoted currency; unlike currencies are never added
  together or converted. Prices are entered manually; *Update prices* lets you
  refresh all holdings in one pass.
- **Assets travel with backups and family sharing** — the JSON backup, the
  Markdown report source data and the family exchange file all include holdings.
- **App update control** — More → App update checks the service worker for a newer release and reloads the app without touching local records.
- Database version 3 adds the `assets` store; the cache is
  `family-finance-r5`. The database opener still accepts a phone whose database
  is older or newer, so an existing install keeps working.

Amount inputs now accept a decimal point (and switch the iPhone keypad to the
decimal one) when the selected unit is USD, Euro or custom.
