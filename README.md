# OMNI Renewal Quote Assistant

Internal, local-first tool for preparing fire alarm inspection renewal proposals.
It replaces the manual Teams + D-Tools information hunt with one workspace:

- Company / client / location details
- Historical Hours explorer over the approved D-Tools timesheet export
- Copy-ready D-Tools project name using company, frequency and duration
- Three-year historical hours calculator with mileage rule
- Pricing checks and previous-vs-proposed comparison
- Exact Omni Scope of Work generation with live preview and plain-text copy
- Per-renewal status, 21-step renewal process checklist, autosave
- JSON export / restore

No paid API, AI call, analytics, or telemetry. The local and GitHub Pages
builds keep all client data in the browser profile. The online version
(below) keeps it in one private Cloudflare D1 database behind a login.

Customer CSV/Excel exports, backups, screenshots and browser audit output are
excluded from Git. Tests that read the local timesheet export or
`src/lib/__fixtures__/dtools-observed.csv` require those confidential files to be
provided separately on a new checkout; they are intentionally absent from GitHub.

## Start it (Windows)

Hosted app: https://omni-technologies.github.io/omni-renewal-quote-assistant/

GitHub Pages must use **GitHub Actions** as its deployment source. The Pages
workflow builds the app with `npm run build -- --mode pages` and publishes only
`dist`, with assets under `/omni-renewal-quote-assistant/`.
Data remains in each browser's IndexedDB; it does not sync between computers.
Use Export/Restore to transfer renewals and import timesheets separately at work.

### Online version: one shared database

**https://quotes.drewcassidy.dev** is the same app, but renewals, history and
merge decisions are kept in the Cloudflare D1 database `omni-renewal-quote`.
Every computer sees the same data, with no export/import.

- Cloudflare Access protects it with the app "Quote assistant", which reuses the
  chat site's **Owner only** policy (sign in as 67.nmh.69@gmail.com). The
  Worker (`worker/index.ts`) also checks the Access token and that email. It
  refuses every API call if `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` or
  `ALLOWED_EMAIL` in `wrangler.jsonc` is missing.
- Deploy with `npm run deploy:cloud`. It builds with Vite mode `cloud`, applies
  D1 migrations, then runs `wrangler deploy`. workers.dev and preview URLs
  are off, so the login cannot be skipped.
- Local test with `npm run dev:cloud` (http://127.0.0.1:8799, an empty local D1
  database, login bypass via `.dev.vars` on loopback only).
- Moving existing data in: open the online site, then **Restore** each
  browser's backup. Restore only adds what is missing.
- Use one tab at a time. Saves are last-write-wins, so an older tab left open
  can overwrite a newer edit, or bring back a renewal that was deleted
  elsewhere. Reload after working on another computer.

```powershell
cd E:\Projects\omni-renewal-quote-assistant
npm install
npm run dev
```

Open **http://127.0.0.1:5173**.

The dev server binds to `127.0.0.1` only, so it is not reachable from other
machines. Keep using the same URL: `127.0.0.1` and `localhost` are separate
browser origins with separate databases.

Production-style run:

```powershell
npm run build
npm run preview
```

Then open **http://127.0.0.1:4173**.

## Where data is stored

Renewals are saved in **IndexedDB**, database `omni-renewal-quote`, in the
browser profile that opened the app. Nothing is sent anywhere.

- Autosave runs about 0.4 seconds after a change; switching records or hiding
  the tab flushes pending edits.
- If a save fails, the edit stays queued and retries automatically with backoff.
  Navigation, create, duplicate, delete, and restore are cancelled until the
  queued edit is safely written.
- Data is tied to the origin. Use `http://127.0.0.1:5173` consistently. Clearing
  site data, using a different browser/profile, or a different port gives an
  empty database.
- The sidebar footer also states this.

## Backup and restore

- **Export** (top bar) downloads every renewal as
  `omni-renewal-backup-YYYY-MM-DD.json`. Do this regularly; it is the only
  backup mechanism.
- **Restore** validates the file, shows a confirmation with record count and
  export date, then **adds only what this browser is missing**. A renewal whose
  ID already exists here is kept exactly as it is, even if it changed after the
  backup; renewals made here are never removed. Structurally incomplete
  records — including an id-only record — are rejected before any database
  write. The message says how many were added and how many were kept.
- Invalid JSON, wrong backup format, unsupported versions, and unusable records
  are rejected or skipped with a visible message.
- Backups include the timesheet and job-cost history. A backup's timesheet or
  job-cost history is added only when this browser has none of that kind;
  otherwise this browser's history stays. Manual history decisions are added
  only for projects with no decision here. To update history, re-import the
  D-Tools exports instead.

The JSON contains confidential client data. Store backups on `N:` or another
approved internal location, not in public cloud storage.

## Historical Hours (D-Tools timesheets)

Open **Historical Hours** in the top bar.

1. Import the approved D-Tools **CSV or XLSX** export (drag and drop or choose
   a file). The first worksheet with the timesheet columns is used.
2. Search for a company, client, or location. Matching sites stay separate;
   the tool never merges unrelated locations automatically.
3. Choose **Annual** or **Semi-Annual**, select the inspection occurrences
   that belong in the average, and expand any project to see every source row.
4. Click **Use These Hours for Renewal** to fill the selected renewal's client,
   location, frequency, and historical hours. Address, pricing, notes, quoted
   hours, SOW rules, and checklist state are preserved. If no renewal is open,
   confirmation creates and saves one with the selected history.

History matching treats UWCU as UW Credit Union and ignores a final Branch
suffix for those sites. Location still must match: New Berlin variants join
across years while other branches stay separate. Refresh to apply this to
existing imports; no reimport is needed.

East Madison Toyota history also joins the verified Penske Auto and PAG Madison
T1 dba East Madison Toyota client names, including the location title with
`(Penske Auto)`. Its 2023–2026 inspections appear together after refresh without
reimporting; other locations and original source details stay separate.

Classification is deterministic and deliberately conservative:

- Confirmed annual / semi-annual fire alarm inspection titles are included.
- SVC, service-call, troubleshooting, deficiency, discrepancy, repair, and
  corrective-work projects are excluded.
- Nurse call, intrusion, security, CCTV, AV, training, and office-time projects
  are excluded.
- Missing or conflicting years, missing frequency wording, mixed fire-alarm and
  other-system titles, and shared project numbers go to **Needs review**.
- Ambiguous projects are never guessed into an average.

Every included total expands to the full project title, project number, work
dates, inspector, task, duration, approval status, imported filename,
worksheet, and original Excel/CSV row number. Manual include/exclude,
frequency, year, correction notes, and per-project original quoted hours are
saved in IndexedDB. Replacing the dataset removes the old timesheet rows but
keeps renewals and manual decisions.

Duration is read as decimal hours exactly as exported. It is never multiplied
by 24. The tool only shows **actual approved hours**; it does not invent
originally quoted/bid hours.

## Budgeted vs actual hours (D-Tools job cost)

The D-Tools **Project Job Cost (By Phase)** report gives budgeted and actual
hours for every project, with a Travel phase where one exists. On **Historical
Hours**, click **Import job-cost workbooks** and select one or more exports at
once. Projects in both files are kept once; the same project number with
different hours stops the import. A new import replaces the previous one.

- Projects use the same classification, site grouping and manual decisions as
  the timesheet history, so excluded projects stay excluded.
- A phase block shared by several projects is shown as **Shared** and is not
  counted in the travel average.
- Each project's actual hours are compared against the timesheet history by
  project number: **Matches**, **Differs X h**, **Before timesheet export** or
  **Not in timesheet**. The timesheet export only reaches back about three
  years, so older projects cannot be compared.
- Averages skip projects with zero hours.
- A renewal shows the site's averages (D-Tools avg budgeted, actual and travel
  budget) in **Contract pricing**, and the per-year table under **Historical
  hours**. The site is found from the D-Tools project number, the applied
  history, or the client and location. These are reference figures; they
  never change the price, quoted hours or mileage.

### One history: job cost first, timesheets as a cross-check

The D-Tools **job-cost workbooks** (all I&T projects) are the main history.
Their actual hours are the summed timesheet hours, and they also carry budgeted
hours for every year. The timesheet export is optional. It was the first
experiment, and it is now used only to verify job cost and to fill gaps.
**Historical Hours** shows one list of occurrences per site:

- Each occurrence with a job-cost record counts its **D-Tools job-cost actual
  hours**. The **Source** column shows how it checks against the timesheet:
  **Job cost** (no timesheet rows, e.g. older years),
  **Job cost · timesheet verified**, or **Job cost · timesheet differs X h**.
  The timesheet total is printed under the hours, and the timesheet rows stay
  viewable when you expand the occurrence.
- Timesheet hours count only when job cost has no record for the occurrence
  (**Timesheet only**) or its record shows 0 actual hours (**Timesheet (job cost
  has no hours)**).
- The three most recent years are selected automatically. Older years are
  listed unchecked; check any to add them to the average. Zero-hour rows never
  count, and unrelated work stays out unless you include it manually.
- History works from the job-cost workbooks alone; no timesheet import is
  needed. Applied history says **D-Tools job-cost actual hours** in its basis.
  A saved summary keeps the timesheet hours next to each job-cost total, so
  backups keep the cross-check.

`src/lib/unifiedHistory.ts` (`buildUnifiedHistory`, `occurrenceRows`) is the
combined data layer for building per-company or group-quote spreadsheets. It
returns one flat row per occurrence with these fields:

- `hours`: the counted hours.
- `hoursSource`: which export those hours came from.
- `jobCostActualHours`, budgeted hours and travel budget.
- `timesheetHours`: eligible approved timesheet hours.
- `difference`: job cost minus timesheet.
- `timesheetVerified`.

## Daily workflow

Start with the **historical hours search** at the top of a renewal. Matching
sites appear below as you type, without leaving the renewal. Click a site,
review/select its inspections and choose **Use These Hours for Renewal**, then
confirm. History fills the current renewal while keeping your company name,
address, pricing, quoted hours and notes. Results close after applying; use
**Hide results**, clear the search or press Escape to dismiss them yourself.
The full **Historical Hours** page remains available from the top bar.
**Proposed annual contract price**, **Proposed quoted labor hours**, and **Labor
rate per hour** are together in Contract pricing. The workspace follows this
order: history search, Company & contract, Contract pricing, Historical hours
& travel, SOW clause controls, Scope of work, Proposal email, then the checklist.
At desktop widths of1280px and up, the first row has Company & contract on the
left beside the renewals menu, Contract pricing in the middle, and Historical
hours & travel on the right. The next row puts SOW clause controls on the left
and the SOW preview across the other two columns. Proposal email and checklist
follow below. Smaller screens stack the sections in the same order.
Everything starts expanded, including More pricing details and the checklist.
Click any section heading to minimize or reopen it. The SOW preview and copy
controls sit directly after the clause controls in the same scrolling flow.

1. Click **New Renewal**.
2. Enter company, client, location, and address. Pasting a comma/newline-separated
   city and state fills those fields. Review the start year: new proposals default
   to next year, so three years starting2027 end12/31/2029. Copy the generated
   D-Tools project name inside Company & contract when needed; it uses Company name.
   The **Proposal email** section has **Copy email
   subject** and **Copy email** buttons. It uses Location name, full address,
   frequency, duration and D-Tools project number. Select Fire Alarm, Intrusion
   or Nurse Call and your greeting; defaults are Fire Alarm and Good Day.
   These selections only affect the email template and are saved per renewal.
3. Enter previous / proposed annual price and labor rate (defaults to$90).
   **Copy pricing** in Contract pricing copies a plain-text Teams list comment
   headed "Contract pricing update:" with previous and proposed annual prices,
   dollar and percentage changes, avg hours, quoted hours, labor rate and mileage
   cost. Pricing notes appear only when entered. It includes collapsed pricing
   details. If clipboard
   access is blocked, the summary appears selected for Ctrl+C.
4. Enter historical inspection hours. Use **Historical Hours** to import and
   apply actual D-Tools hours, or type them manually. Blank years are ignored,
   not counted as zero. The average and recommended whole hours are suggestions
   only.
5. Enter **quoted** hours or proposed annual price: either updates the other.
   Historical actual hours and their average remain independent suggestions.
6. Automatic mileage cost is `$50` per eight-hour block, rounded up. Customer
   mileage charge includes **20% markup**. Price = hours*rate + customer mileage
   charge. At$90/hour:5h+cost50->price510;13h+cost100->1290;14h+cost100->1380.
   Edit Annual mileage cost to override it; **Use automatic mileage** resets it.
   Mileage edits preserve entered labor hours and update the price. Price edits
   solve the mileage tier and calculate hours; a price in a gap between tiers
   has no matching hours, so enter hours or override mileage instead.
7. Review the SOW clause controls. Automatic rules are applied first; manual
   overrides are marked **Manual** and can be reset.
8. Resolve any blocking items in the preview, then click
   **Copy Scope of Work** and paste into D-Tools Text Format.
   - Empty manual drafts and unresolved `INSERT` placeholders block copying.
   - If a manual draft exists and the generated inputs changed, review it and
     click **Mark reviewed** (or refresh the draft) before copying. Manual text
     is never overwritten automatically.
9. Use the collapsible **Renewal process** checklist and set the status.
10. Send to Julie — this tool never emails customers.

## Business rules implemented

- **Labor / inspectors:** quoted hours of 8 or fewer → one inspector; over 8 →
  two. Two inspectors removes the single-inspector and FACP sentences. Manual
  override available.
- **Hospital:** YES removes the FACP monitoring sentence.
- **FACP:** included only when the site is not a hospital **and** one inspector
  is quoted.
- **Billing:** proposed annual price below $10,000 → annual-after-completion
  sentence; above $10,000 → 40% deposit. Exactly $10,000 requires an explicit
  choice. Blank price never defaults from the previous price.
- **Both / neither billing clauses:** allowed only after an explicit
  acknowledgement.
- **Madison, WI:** AHJ fee sentence auto-included from the verified city and
  state (never a text search of the street address); manual override available.
- **Contract end date:** December31 of `start year + duration - 1`, formatted
  `MM/DD/YYYY`. New renewal start year defaults to the next calendar year.
  Existing unmarked current-year drafts created this year receive that default
  correction; approved records, historical starts, and marked manual years stay.
- **Core clauses:** elevator coordination, lift responsibility, detector
  cleaning, scheduling, T&M, and owner notification are never silently removed.
  Exceptional edits go through the manually modified draft mode.
- **Travel cost:** `$50` per eight-hour block, rounded up (8 → $50, 14 → $100,
  16 → $100, 24 → $150); customer charge is cost plus20% markup.
- **Labor rate:** under $90 shows the Mike warning; $90 or more does not.

## Tests and checks

```powershell
npm test        # business-rule, importer, persistence and safeguard tests
npm run lint    # oxlint
npm run build   # TypeScript + production bundle
```

Tests cover the hours rules, mileage, inspector/FACP/hospital/Madison rules,
billing thresholds, end dates, exact template preservation, manual-draft
protection and review gating, persistence round-trips, duplication, strict
backup validation, autosave failure retention/retry, D-Tools CSV parsing,
project classification and exclusions, source-row traceability, duplicate
imports, annual/semi separation, Dec/Jan occurrences, manual overrides, and
renewal hand-off preservation.

## Project structure

```
src/
  types.ts                  Typed domain model + D-Tools import shapes
  lib/
    calculations.ts         Hours, mileage, inspector, price math
    dtools.ts               CSV/table parsing, classification, grouping, averages
    dtoolsImport.ts         CSV/XLSX file reading, fingerprint, sheet selection
    sow.ts                  Clause evaluation, exact text generation, validation
    model.ts                New / duplicated renewals, runtime normalization
    db.ts                   Dexie/IndexedDB, D-Tools history, JSON backup validation
    workflow.ts             21-step checklist definition
    format.ts               Currency / date / time formatting
  components/
    HistoricalHours.tsx     Importer, site search, audit drill-down, hand-off
    CompanySection.tsx
    PricingSection.tsx
    LaborSection.tsx
    SowRulesSection.tsx
    SowPreview.tsx          Live preview, copy, manual draft
    ChecklistSection.tsx
    RenewalWorkspace.tsx
    Sidebar.tsx
    ui.tsx                  Form primitives, dialogs, badges
  App.tsx                   Shell, autosave, list, export/restore, views
```

Business logic is pure TypeScript in `src/lib` and never imports React.

## D-Tools importer architecture

The importer is intentionally split from the quote editor:

- `src/lib/dtools.ts` parses/normalizes rows, classifies projects, groups
  entries, infers years, and computes averages. It is pure TypeScript.
- `src/lib/dtoolsImport.ts` reads CSV or XLSX, validates headers, fingerprints
  the file, and selects the worksheet.
- Dexie tables `dtoolsDatasets`, `dtoolsRows`, and `dtoolsDecisions` hold the
  active export, normalized rows, and manual decisions. Renewals remain in the
  existing `renewals` table.
- `applyHistoryToRenewal()` writes only client, location, frequency, and the
  historical-hours list, plus an `importSummary` audit block.
- `Renewal.labor.source` becomes `'imported'`; quoted hours stay independent.

The original quoted/bid hours are not present in this approved timesheet
export. They come from the job-cost workbooks instead: `src/lib/jobCost.ts`
parses and compares them, `readJobCostFiles()` reads the files, Dexie tables
`jobCostDatasets` and `jobCostProjects` (schema v3) hold them, and
`src/lib/historyContextStore.ts` shares the loaded history with the workspace.

## Known limitations

- D-Tools is not automated; the SOW is copied to the clipboard for manual paste.
- The approved timesheet export contains actual hours only. Budgeted hours come
  from the separate job-cost workbooks; budgeted travel is only known where a
  project has its own Travel phase.
- Ambiguous project titles are intentionally sent to **Needs review** instead
  of being auto-included. Review them once and save decisions.
- XLSX support reads the first worksheet that contains the timesheet columns;
  very large future exports have not been stress-tested beyond this 6,380-row
  export. XLSX parsing uses SheetJS 0.20.3 (official CDN tarball); import only
  trusted internal D-Tools exports.
- One user per browser profile; no sync or multi-user collaboration.
- No emailing; proposals still go to Julie manually.
- Browser storage can be cleared by the user or by profile cleanup. Export
  backups routinely.
