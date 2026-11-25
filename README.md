# مدیریت مالی خانواده — Family Finance

A mobile-first Progressive Web App for managing personal and family money in **Iranian Toman** with the **Jalali (Hejri Shamsi)** calendar. Built as a PWA, added to the Home Screen, working offline with no backend and no account.

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
| **بیشتر / More** | Family profiles, categories, stores/websites, accounts, daily reminder, language (فارسی / English), sample data, backup & restore, delete everything, help & limitations. |

Sheets (bottom cards) handle every form: add/edit expense, add/edit income, paste-from-SMS import, loan, loan payment, expected income, lending, account, category, profile, and all confirmations before deleting.

---

## Data storage

- **IndexedDB**, database `family-finance`, one object store per record type:
  `profiles`, `categories`, `payees`, `transactions`, `expected`, `loans`, `lendings`, `accounts`, `settings`.
- Amounts are stored as **integers in Toman**. Nothing is ever converted between Toman and Rial; the app never asks for or shows Rial.
- Dates are stored as ISO `YYYY-MM-DD` (Gregorian) so sorting is trivial, and **shown** in Jalali everywhere — month keys, grouping, reports, reminders. Monthly repeat rules advance by *Jalali* months, so a salary on 1 Mehr repeats on 1 Aban.
- Language choice is mirrored in the settings record; the UI is unrecoverably local. No analytics, no network calls, no third-party scripts, no fonts loaded from a CDN.
- The service worker precaches the whole shell, so the app opens offline after the first successful load.

Nothing is sent anywhere. A record only leaves the phone if you explicitly share an export or a backup.

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
  - *GitHub Pages*: in **Settings → Pages**, set **Source** to **Deploy from a branch**, branch `main`, folder `/ (root)`. Every push to `main` publishes the site at `https://<user>.github.io/<repo>/` a minute or so later. No workflow file is needed and none is included: the repository is plain static files.
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
sw.js                 precache + cache-first service worker (bump CACHE_VERSION on release)
styles.css            one stylesheet, logical properties for RTL/LTR
icons/icon.svg        maskable app icon
js/jalali.js          Jalali ⇆ Gregorian maths (jalaali algorithm), month arithmetic
js/i18n.js            language state; strings are written as L('فارسی', 'English')
js/util.js            Toman formatting/parsing, Jalali display, file sharing
js/db.js              IndexedDB wrapper, backup/restore primitives
js/state.js           in-memory store + every calculation (summaries, loans, reminders)
js/components.js      icons, sheets, fields, Jalali date picker, charts
js/bus.js             action/form registry used by the views
js/report.js          Markdown report builder
js/views/*.js         dashboard, records, planning, reports, more, entry forms
js/app.js             router, event delegation, onboarding, boot
```

Conventions worth keeping: amounts are integers in Toman; dates in storage are ISO Gregorian; every string goes through `L('fa', 'en')`; every write goes through `state.upsert`/`removeRecord` so IndexedDB and memory cannot drift.

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


---

## Version 2

Added on top of version 1:

- **Calendar choice** — More → *Calendar & currency* switches every date between Jalali and Gregorian for display and entry. Dates are still stored one way (ISO Gregorian), and monthly periods (salary, instalments, monthly reports) stay on the Jalali month, because that is the payroll and billing cycle the app is built around.
- **Currency choice** — Toman (default) or Rial. Amounts are always stored in Toman; Rial is the same money shown ×10, and what you type in Rial is divided back before it is stored. Nothing else is ever converted.
- **A separate Calculate tab** — loan instalments, the affordability check, buy-now-pay-later instalments, bank deposit interest and the income-tax estimate, out of Planning.
- **Buy now, pay later** — price, down payment, 2–24 instalments (4 and 6 are one tap away), a percentage or fixed fee, the resulting schedule, the effective annual rate, and a button that saves the plan as an instalment loan in Planning.
- **Deposit interest** — simple, yearly compounded, monthly compounded, or interest paid out monthly, with optional withholding and an effective annual yield. The method, rate, term and result are all listed.
- **Income tax estimate** — taxable income after deductions, progressive brackets you can edit (the defaults are placeholders, not the law), tax already paid, and the balance due or refund. The screen says plainly it is an estimate.
- **Markdown and JSON exports** — the Report tab and More → Backup both write `.md`; the JSON backup is the only format that can be restored, and the backup screen says so next to the buttons.
- **Family sharing** — a phone-to-phone exchange file that *merges* instead of replacing: people, categories and stores are matched by name, a newer edit wins, and deletions travel as tombstones so a removed record does not come back. No server, no account. Live sync between phones would need its own secure backend and is not part of this version.


---

## Version 3

- **More currencies** — display amounts in Toman, Rial, US dollar, Euro or a custom unit of your own naming. Amounts are still stored in Toman; the other units use a rate you enter (Rial is fixed at 10), and the rate screen is where you change it. Nothing is converted without the unit being written next to the number.
- **Investment holdings** — Planning → *Assets*: currencies, gold, silver, shares and crypto, each with quantity, unit, price per unit and optional buy price, so the screen can show portfolio value and gain or loss. Values are quantity × price, and prices can be updated by hand in one pass or fetched from a public source when the network allows it.
- **Update check** — More → *App version*: a button asks the browser whether a newer version is waiting and reloads into it. iOS never updates an installed web app on its own, so this is the only way to pull a release onto the Home Screen icon.
- Database v3 adds the `assets` store; the version-3 cache is `family-finance-v6`.
