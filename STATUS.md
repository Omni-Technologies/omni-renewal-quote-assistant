# STATUS — OMNI Renewal Quote Assistant

## Current operating handoff — 2026-10-20

### Focused visual polish — 2026-10-20 (deployed and verified)

- User requested a walkthrough and polish of the OMNI quote helper while
  preserving its established design. Acceptance: retain the three-column layout,
  expanded sections and validated renewal workflows; improve visual hierarchy,
  helper-text readability, control consistency and keyboard accessibility.
- src/index.css adds tinted disclosure headers with right-aligned chevrons,
  separate date/average subtitles, flatter nested section cards, darker helper
  text, 36px standard inputs and keyboard focus outlines. Compact inputs retain
  their sizing. Light/dark themes and the existing section order remain intact.
- Sidebar.tsx exposes the selected record and full truncated names; App.tsx
  exposes active navigation state; ui.tsx adds segmented-control focus outlines;
  RenewalWorkspace.tsx names the duplicate icon on mobile. CompanySection.tsx
  corrects field hints: Company drives project name, Location drives SOW/email.
  No storage, calculations, generated text or data migrations changed.
- Verified: npm.cmd run typecheck, npm.cmd run lint, npm.cmd test (178 tests),
  npm.cmd run build, npm.cmd run build -- --mode pages all exit0. Existing Vite
  chunk-size warning remains. Isolated browser scripts/layout_check.mjs,
  scripts/inline_history_check.mjs and scripts/renewal_handoff_check.mjs all
  exit0 with no page errors. Layout checks cover390/768/1024/1280/1440px,
  column containment, collapse/keyboard, dark mode, pricing and reload; workflow
  checks cover confidential local history, copy/fallback, dates and mileage.
- Reviewed desktop light/dark and mobile screenshots under artifacts/layout;
  git diff --check passed. No user-profile data touched.
- Production scripts/pages_check.mjs passed at4173/repository-path with no
  page/request errors, including logos/favicon, linked pricing and saved reload.
  Initial attempt exited1 at pages_check.mjs:17 (welcome-logo timeout): preview
  used default mode against a Pages build. Restarting with
  `npm.cmd run preview -- --mode pages --host 127.0.0.1` fixed asset serving;
  unchanged smoke check reran exit0. No application change was needed.
- User approved commit/push on2026-10-20. Polish commit f8f3957 pushed to main;
  Pages deployment39521355420 succeeded, including hosted typecheck/lint/build.
  Hosted scripts/pages_check.mjs passed with PAGES_URL set to
  https://omni-technologies.github.io/omni-renewal-quote-assistant/: compiled
  assets, logos/favicon, renewal creation,13h=1290 and saved reload verified;
  zero page/request errors. No remaining polish or publication work.

### OMNI logo — 2026-10-20 (deployed and verified)

- User requested Downloads/omni.png throughout the website. Copied unchanged to
  public/omni-logo.png; header and welcome screen use it, replacing generic icons.
  index.html uses the same image for favicon and apple-touch-icon; removed old
  flame favicon.svg. Vite BASE_URL keeps local and Pages paths correct.
- Typecheck/lint/178 tests/Pages build passed; existing bundle warning remains.
  scripts/pages_check.mjs now verifies both logos and favicon; checks passed at
  local5173 and production-preview4173/repository-path with no page/request errors.
  First browser assertion raced initial DB loading; corrected the check to wait
  for welcome logo and image decode, then reran both targets successfully.
- User approved commit/push. Commit de20a8e deployed successfully in Pages run
  39507622370. Hosted pages_check.mjs passed logos/favicon, renewal creation,
  linked price/hours and reload with zero page/request errors. No remaining work.
  No business or browser-data changes.

### GitHub Pages repair — 2026-10-20 (deployed and verified)

- Live Pages was configured as legacy main/root and served uncompiled index.html
  with /src/main.tsx, causing the blank app. Prepared Actions workflow builds
  and uploads only dist. Vite mode pages uses /omni-renewal-quote-assistant/;
  default local dev/build URLs remain unchanged. No business/data logic changes.
- Changed vite.config.ts, added .github/workflows/pages.yml and
  scripts/pages_check.mjs; updated README and AGENTS for hosted usage.
- Typecheck/lint/178 tests/Pages production build passed. Existing chunk-size
  warning remains. Isolated browser at127.0.0.1:4173/repository-path loads all
  assets without request/page errors; creates renewal, links13h to1290, reload
  retains data. git diff --check passed.
- User approved publication. Fix commit6c9a593 pushed to main; Pages now uses
  build_type=workflow. Deployment run39504455256 succeeded, including hosted
  typecheck/lint/build. Live isolated pages_check.mjs passed with PAGES_URL
  set to https://omni-technologies.github.io/omni-renewal-quote-assistant/:
  no page/request errors, renewal creation,13h=1290 and saved reload verified.
  No remaining repair work. Future main pushes rebuild/deploy automatically.
  Do not upload customer fixtures; workflow runs typecheck/lint/build, because
  full tests require confidential files that intentionally remain local.
- Hosted data stays in that browser/origin and does not sync across PCs.
  Existing export/restore moves renewals; import timesheets separately.

### GitHub source publication — 2026-10-20

- User requested and explicitly approved initial commit/push to the private
  Omni-Technologies/omni-renewal-quote-assistant repository on2026-10-20.
  Source branch: main. No deployment or browser-data changes.
- .gitignore excludes all CSV/Excel data, audit/backups/screenshots, artifacts,
  environment files and build/dependency output. Confidential fixture remains
  local; CSV-dependent checks require separately supplied data on new checkouts.
- App checks passed immediately before this preparation: typecheck, lint,
  178 tests, build, inline/layout/full renewal browser regressions. Preparation
  changes only ignore rules and documentation. Publication verification uses
  gh repo view for private visibility and git ls-remote for matching main HEAD.

**Complete. Read this section and AGENTS.md first.** This is the current behavior;
the dated milestones below are history and include superseded approaches.
User personally validated the working foundation. Do not redesign it.

### Inline historical-hours search — 2026-10-20 (current)

- User requested live results and apply inside the new renewal screen. Typing
  now opens filtered site results below the search, with no view/navigation change.
  Site click shows the existing inspection selection, source detail, averages and
  Use These Hours for Renewal action. Existing apply confirmation remains.
- Reuses HistoricalHours via optional inlineSearch {query,onQuery}; hides its
  duplicate page title/search/dataset summary inline. Import, frequency selection,
  decision editing, visit/annualized basis and selected-hour payload logic are
  shared with the full explorer. Full Historical Hours page remains unchanged.
- Workspace passes existing App.applyHistory through onApplyHistory. Applying
  closes/clears results, retains current renewal, preserves manual fields using
  unchanged applyHistoryToRenewal. Hide results, empty search and Escape dismiss.
  Results scroll within70vh. When a new query excludes the selected site, its
  previous detail/apply action is hidden to prevent applying unrelated results.
- Changed App.tsx, RenewalWorkspace.tsx, HistoricalHours.tsx, README, layout browser
  check; added scripts/inline_history_check.mjs. No schema, storage, matching,
  calculations or original history-apply business logic changes.
- Acceptance: live filtering without submit/navigation; click/review/apply in place;
  source/selection safeguards retained; manual company/address/price/hours/notes
  retained; no stale unrelated apply action; dismissal and save/reload work.
- Checks: typecheck/lint/178 tests/production build exit0, existing chunk warning
  remains. Inline browser check passes actual New Berlin export selection/source
  history, no navigation, apply preservation, stale-result hiding, narrow viewport,
  Escape and reload with zero page errors. Layout browser check also passed.
  Full handoff regression and independent integration review checked at completion.
- Review found and fixed selected-site detail disappearing when more than40
  clients share a location label: selected-site query matching now runs independently
  of the capped result list. Added an isolated45-client browser regression; it passes.
  Final typecheck, lint,178 tests and build passed after the fix, plus inline and
  layout browser checks. No new review findings or remaining implementation work.
- Same PLAYWRIGHT_MODULE and CHROMIUM_PATH variables below; new command:
  `node scripts/inline_history_check.mjs`. Uses an isolated browser and local CSV;
  no user-profile access, deployment, publishing or Git action.

### Three-column workspace — 2026-10-20 (layout remains current)

- User requested Company & contract beside the left renewals menu, Contract
  pricing in the middle, Historical hours/travel on the right. Next row: SOW
  controls on the left, Scope of work across middle/right. Proposal email follows
  full-width, then checklist. History search remains first and full-width.
- RenewalWorkspace uses three equal columns at1280px+ with8px outside padding
  and12px gaps, no centered width limit. Smaller screens stack in original order.
  Everything still starts expanded and can be collapsed independently.
- Container queries size inner field grids to their actual columns: two columns
  for company/pricing fields and stats, one for history rows, labor/travel panels,
  company notes and SOW rule controls when the parent is480px or narrower.
  Suggestions wrap as necessary. CSS selectors must beat Tailwind grid utility
  specificity; first screenshot caught this and selectors were fixed.
- Changed RenewalWorkspace, CompanySection, PricingSection, LaborSection,
  SowRulesSection, index.css, layout_check.mjs, README and STATUS only. No storage,
  calculations, generated text, matching, history import/apply or copy logic changed.
- Acceptance: three aligned top columns against sidebar, SOW preview spans two
  columns beside controls, email below both rows, controls fit their columns,
  expanded/collapsible sections, existing workflows and responsive widths intact.
- Checks: typecheck/lint/178 tests/build passed; nonblocking bundle warning remains.
  Both isolated browser scripts passed geometry/order, collapse, history search,
  linked pricing, keyboard, dark mode, reload and established copy/history rules.
  Final typecheck/lint/178 tests/build and layout browser check passed after
  SOW field adjustment. Browser assertions also verify every visible input,
  select, textarea and segmented control fits its desktop column at1280/1440px.
  Reviewed the changed layout/CSS and desktop screenshots for both rows.
  Screenshots artifacts/layout/desktop-three-columns.png and desktop-sow-row.png.
- Next: refresh127.0.0.1:5173 and evaluate with D-Tools. No user profile/data touched;
  no Git, publish or deployment actions.

### Workflow section order — 2026-10-20 (superseded by three-column layout above)

- User specified exact order: historical-hours search, Company & contract,
  Contract pricing, Historical hours & travel, SOW clause controls, Scope of
  work, Proposal email. Checklist follows email. All sections start expanded,
  including nested More pricing details and the checklist; minimize individually
  using their headings. This supersedes the pinned-pricing layout below.
- Single centered column with one workspace scroll at all widths. SOW preview
  moved from the side panel into an expanded disclosure after clause controls,
  before email; its text retains an internal scroll and visible copy controls.
  Proposed price/hours/rate remain together in Contract pricing. No calculations,
  persistence, history search or clipboard business logic changed.
- Changed RenewalWorkspace.tsx, PricingSection.tsx (expanded default), README,
  scripts/layout_check.mjs and this handoff. Acceptance: exact section order,
  expanded defaults, independent collapse/reopen, retained edits and copy behavior,
  no horizontal overflow at390/768/1024/1280/1440px.
- Verification: typecheck, lint,178 tests/10 files, build passed. Existing
  nonblocking bundle warning remains. Isolated layout browser check passed exact
  order, expanded defaults, every section collapse/reopen, price/hours, history
  search, keyboard, dark mode, reload and five viewport widths, zero page errors.
  Existing full handoff regression passed exit0 with zero page errors (history,
  dates, mileage, pricing, project-name/email copy and fallback, saved reload).
  Final typecheck/lint/178 tests/build and layout browser rerun passed after the
  SOW wrapper spacing adjustment. Inspected changed JSX and desktop screenshot.
- No user-profile data touched; no Git or deployment. Next: refresh127.0.0.1:5173
  and review the ordered, expanded workflow. README reflects this layout.

### Unified workspace follow-up — 2026-10-20 (superseded by section order above)

- User requested price and proposed quoted hours together at the top, a single
  workspace instead of separate tabs, a collapsed checklist, and history search
  as the first step of a new renewal. This supersedes the tabbed layout below.
- Contract pricing now contains the only editable quoted-hours field, beside
  annual price and rate. Existing updateRenewalLabor/updateRenewalPricing handlers
  still own all calculations. Historical actual hours remain independent.
  Previous price, mileage, comparisons and notes expand under More pricing details;
  the under-$90 warning stays visible even when that disclosure is collapsed.
- History search is first in the workspace. Submitting transfers the query into
  the existing HistoricalHours explorer (optional initialQuery prop). No duplicate
  search/grouping/import/apply logic. New Renewal from history now returns to the
  new quote workspace. Existing history imports and apply confirmations remain.
- Desktop keeps history search/pricing above an independently scrolling detail
  area and the live SOW alongside. Company & contract starts open; historical
  hours/travel, clauses, proposal email and checklist start collapsed inline.
  Expanded pricing is height-capped and scrollable so details stay reachable.
  Narrow screens use the same content in one vertical flow. Each renewal mounts
  its own workspace UI state; saved business data and schema are unchanged.
- Changed App.tsx, RenewalWorkspace.tsx, PricingSection.tsx, LaborSection.tsx,
  HistoricalHours.tsx, index.css, README and both browser scripts. ChecklistSection
  now uses its original collapsed default (previous optional expanded prop remains).
- Acceptance: search available immediately on new renewal; seeded history search;
  price/hours editable together and linked both ways; no separate section tabs;
  checklist collapsed; desktop pricing stays put while details scroll; preserved
  save/reload and existing quote/copy/history regressions; no horizontal overflow.
- Final verification: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (178 tests / 10 files), `npm.cmd run build`: all exit0 after final UI changes.
  Existing nonblocking bundle-size warning remains. Both isolated browser scripts
  passed exit0 with zero page errors. Layout
  checks cover history query handoff, New from history, price/hours linkage,
  pinned inputs, disclosures, keyboard, dark mode, reload and widths390–1440.
  Low-rate warning visibility with pricing details collapsed is covered too.
  Initial test failures were missing waits after async New and using an empty
  profile without first importing history; importing resets search by design.
  Test setup now imports the local fixture before testing search handoff.
  A final test locator matched both pricing and SOW warnings; scoped it to the
  pricing form, reran both browser scripts successfully. No app failure involved.
- No real user profile, stored data, schema, canonical SOW or business calculations
  modified. No publish, deployment or Git action. Next: refresh127.0.0.1:5173 and
  try the unified workspace alongside D-Tools. Screenshots: artifacts/layout/*unified.png.

### First layout polish — 2026-10-20 (superseded by follow-up above)

- User authorized a full layout polish for intuitive access and less scrolling;
  the personally validated business behavior and storage remain intact.
- RenewalWorkspace now has persistent section navigation: Company & contract,
  Hours & pricing, Scope of work, Proposal email, Checklist, and All sections.
  A persistent summary shows annual price, quoted hours, inclusive contract years
  and checklist progress. Sections stay mounted to preserve in-progress UI state;
  switching sections resets form scrolling. Switching renewals retains the section.
- Wide screens keep the live SOW and its copy controls alongside the active form.
  Below 1280px the preview is in Scope of work / All sections. Sidebar narrowed
  to give the quote more room. Checklist starts expanded inside its own section.
  Proposal email now has its own section, superseding the old below-company layout.
- Changed only RenewalWorkspace.tsx, Sidebar.tsx, ChecklistSection.tsx, README,
  browser regression scripts and this handoff. No pricing, matching, persistence,
  model, SOW text or clipboard business logic changed. ChecklistSection gained an
  optional expanded prop (default false); existing callers retain their default.
- Acceptance: direct access to each workflow area; summary and navigation remain
  accessible; live preview on desktop; no document horizontal overflow at widths
  390/768/1024/1280/1440; retained edits and established quote regressions pass.
- Checks: typecheck, lint, all 178 tests / 10 files, production build passed.
  Existing nonblocking bundle-size warning remains. New isolated browser command
  `node scripts/layout_check.mjs` passed navigation, summary, scroll reset, expanded
  checklist, keyboard activation, dark mode, linked pricing, save/reload and all
  five widths with zero page errors. Local screenshots: artifacts/layout/.
  A first test run used an unsupported Playwright isInViewport helper; replaced
  that assertion with bounding-box checks. No app failure was involved.
- Existing `node scripts/renewal_handoff_check.mjs` passed all history, dates,
  price/hours/mileage, project name, email clipboard/fallback and persistence cases
  with zero page errors. It selects All sections via a locator handler so its
  existing cross-section assertions still exercise the complete form. Same
  PLAYWRIGHT_MODULE / CHROMIUM_PATH environment variables documented below.
- No user-profile data touched; browser tests use isolated profiles. No publish,
  deployment or Git operations. Next action: user refreshes 127.0.0.1:5173 and
  tries the sections alongside D-Tools, then identifies workflow refinements.

### Run, storage, and verification

- Workspace: `E:/Projects/omni-renewal-quote-assistant`, Windows/Node24, no Git
  metadata. Local-only app at **http://127.0.0.1:5173**; Vite currently running.
  Start with `npm.cmd run dev`; production bundle `npm.cmd run build` and
  preview `npm.cmd run preview` uses a DIFFERENT origin4173 and separate data.
  Do not change the user's origin/profile or clear browser storage.
- Data: IndexedDB `omni-renewal-quote` holds renewals, imported D-Tools rows,
  datasets and project decisions. Autosave/save queue retries retain failed
  edits. History replacement is transactional and preserves renewals/decisions.
  JSON backup includes renewals/history; strict restore validates before write.
- Final commands on2026-10-20: `npm.cmd run typecheck`, `npm.cmd run lint`,
  `npm.cmd test` (**178 tests,10 files**), `npm.cmd run build`: all exit0.
  Build retains its nonblocking chunk-size warning.
- Browser regression: first set PowerShell environment variables:
  `$env:PLAYWRIGHT_MODULE='C:/Users/drewc/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'`
  and `$env:CHROMIUM_PATH='C:/Users/drewc/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'`,
  then `node scripts/renewal_handoff_check.mjs` while Vite runs. Final run passed
  all covered workflows with zero page errors. Tests use isolated browser data;
  user's actual browser profile was not read or changed by verification.
- `scripts/browser_audit.mjs` is the broader original importer/SOW audit;
  see historical audit below. Do not assume its old hardcoded year expectations
  match today's next-year defaults without inspecting it. No new dependency
  was installed. E: writes/test caches may need sandbox escalation.

### Accepted business behavior

- **Contract dates:** proposals sent2026 default first inspection2027. Three
  inspections2027/2028/2029 end **12/31/2029**. Formula remains
  startYear+durationYears-1; only the start-year default was wrong. New records
  use next calendar year based on creation time. Editing start year marks
  `company.startYearSource='manual'`; duplication uses source start+duration.
- **Older draft years:** records lacking startYearSource, still Draft, with
  start year equal to BOTH current year and their creation calendar year move
  forward once. Normalized output marks next-year, making migration idempotent.
  Only untouched manual blank three-year default history labels shift with it;
  entered/imported actual history is preserved. Approved/older/manual-marked
  starts stay. Pre-marker records cannot reveal whether a current-year draft
  was manually chosen; those matching the old default are treated as defaults.
  The user can explicitly override start year. Manual SOW text is never silently
  changed; changed generated inputs trigger the established review gate.
- **Price/hours:** rate defaults90, custom rate editable. Hours edits update
  annual price = hours*rate+customerMileageCharge; price edits derive hours.
  Event handlers update only the counterpart, not effect-based loops. Prices
  round to cents and derived hours to two decimals. Historical actual hours
  stay independent; Use average/recommended deliberately copies to quoted hours.
- **Mileage:** automatic cost50 per eight-hour block rounded up; charge=cost*1.2.
  At rate90:5h->cost50/charge60/total510;13h->100/120/1290;14h->100/120/1380;
  17h->150/180/1710. UI shows cost,20% markup dollars and customer charge.
  `pricing.mileageCostOverride===null` means automatic. Numeric override means
  manual; Use automatic mileage resets it. Manual cost edits preserve hours and
  change price. Legacy `labor.mileageOverride` feeds auto customer charge too.
  Some prices fall in a gap between mileage blocks (e.g.800 at90); no exact
  hours exist, so calculated hours stays blank. Enter hours or override cost.
  Zero hours retains the minimum60 automatic charge; explicit zero cost is
  available as a manual override. Unrelated notes don't recalculate pricing.
- **Legacy mileage:** missing mode + charge60 + >8h + total matching
  hours*rate+60 is normalized to proper tier while retaining hours. Saved UW
  Credit13h/1230 loads13h/1290. Custom non60 charges become manual costs;
  arbitrary saved prices are preserved. No schema/database reset. Normalize
  and backup restore share compatibility rules; read model.ts before changing.
- **Company/address:** pasted comma/newline-separated city,state with optional
  ZIP/country fills city/state. Street-only input does not guess a city.
- **Project name:** directly above Contract pricing, copyable plain text:
  `I&T - FA COMPANY Annual Fire Alarm Inspection 3 YR`. Uses Company name
  (NOT Location name), selected frequency and duration. No Copy of or update
  placeholders. Copy disabled for blank company; blocked clipboard selects text
  for Ctrl+C. Updates live as inputs change.
- **Proposal email:** easy-to-find block immediately below Company form, before
  D-Tools project-name/pricing blocks. Separate Copy email subject / Copy email
  buttons use Location name (not Company name), full site address, frequency,
  duration and project number. Subject matches `LOCATION – Annual Fire Alarm
  Inspection Proposal – 3 Year – PROJECT#`; body uses lowercase frequency/system
  and the supplied message, with a blank line between the Attached paragraph
  and If you have any questions paragraph. Saved optional company.emailSystemType
  supports Fire Alarm/Intrusion/Nurse Call; emailGreeting supports Good Day,
  Good morning/Good afternoon. Older records default Fire Alarm/Good Day;
  backup/save/duplicate preserve choices. These affect email only, not SOW or
  project-name template. Missing required fields disable the relevant copy
  button; clipboard denial selects text for Ctrl+C. Full address whitespace is
  flattened for email. No email is sent by the app.
- **History apply:** with no renewal, valid selected hours open confirmation
  and create/save a new record. Existing-record apply preserves address,
  pricing, quoted hours, notes, SOW rules, checklist, Company name. Applies
  client/location/frequency/history and detailed original source snapshot.
- **DNR aliases:** actual CSV annual projects2024(24-0328,2.5h),2025(24-2224,3.4h),
  2026(25-0855,2.58333333h) use Wisconsin DNR versus Wisconsin Department of
  Natural Resources(DNR). Exact site-name aliases within the same client group
  these; other DNR locations remain separate. buildProjects recomputes site keys
  from source titles, fixing existing imports without reimport. Do not merge by
  client alone; this export has no address column for address-based matching.
- **UWCU matching:** siteKeyFor expands the standalone UWCU abbreviation to
  UW Credit Union in both client and derived site names. A trailing Branch is
  ignored only on UW Credit Union site names. Remaining location and client
  must match, keeping branches/other clients separate. Original source titles,
  hours and project decisions remain intact. Recomputed keys fix saved imports
  on refresh without reimport. Real New Berlin projects23-0519,24-0186,24-2222,
  25-0942 now share one site; total hours9.5,10,12.65,11.76666667 respectively.
- **SOW:** supplied canonical wording, clause controls, billing threshold,
  inspector rules, Madison fee and manual-draft review gates remain. Exact
  generated end date follows first/final inspection year as above. Never
  overwrite a user-edited draft automatically.

### Final change, checks, and next action

- UWCU branch matching: targeted dtools.ts normalization, synthetic boundary
  and saved-key regression plus actual-export audit in dtools.test.ts and
  dtoolsAudit.test.ts. Typecheck/lint/178 tests/build passed; build has the
  existing chunk-size warning. Refresh history to see New Berlin grouped.
  Isolated browser regression confirmed all four projects on one New Berlin
  history screen and existing workflows passed with zero page errors. Independent
  matching review found no concrete data-integrity regression.
- Follow-up email spacing: added two newline characters after the Attached
  sentence, leaving one clean blank line before If you have any questions.
  Updated exact unit/browser expectations; typecheck, lint, 176 tests, build
  and isolated browser preview/clipboard regression passed on2026-10-20.
- Email addition changed types.ts, model.ts, RenewalWorkspace.tsx, db.test.ts;
  added proposalEmail.ts, proposalEmail.test.ts and ProposalEmailSection.tsx.
  Browser regression verifies the exact Dance Studio subject/body, clipboard
  contents (normalizing Windows CRLF), Nurse Call selection, denied-clipboard
  text selection and greeting persistence. Final browser run exited0 with zero
  page errors. Initial test-only failures were an incorrect accessible label
  and Windows clipboard line endings; both assertions corrected, no app fault.
  Independent email/persistence review found no concrete bug. README and AGENTS
  explain the email block and source fields for future sessions.
- Date fix changed types.ts, model.ts, CompanySection.tsx, db.test.ts and browser
  regression. New project AGENTS.md directs agents here and maps source modules;
  README workflow updated for defaults, copy block, linked pricing and markup.
- Browser verified default next-year dates, legacy current-year UW draft repair,
  visible generated **Contract End Date:12/31/2029** when start2027/duration3,
  both price/hours directions, markup, mileage tiers, old UW persistence,
  DNR2024-26, Dance Studio apply/create/reload, address fill, project-name
  clipboard and clipboard-denied fallback. Full checks listed above pass.
- Independent reviewer caught unchanged blank history labels on date migration;
  fixed narrowly and regression covered. Prior independent review also verified
  linked mileage edits and legacy-price preservation. Scoped edits inspected;
  no Git diff available because directory lacks Git metadata.
- No pending implementation. Next user action: refresh127.0.0.1:5173 and review
  the Proposal email block below Company information and corrected draft
  start2027/end2029; review any manual SOW draft if flagged.
  Source export does not prove completion or original bid hours; original XLSX
  formatting and live D-Tools paste remain outside tested coverage. Test data
  stayed isolated. No commit/push/deployment or customer communication performed.

## Historical implementation milestones (superseded where noted above)

## Automatic mileage + legacy UW Credit repair (2026-10-20)

- User confirmed mileage must follow labor hours, rather than remain fixed at
  the prior $60 default. Automatic mode now uses $50 cost per eight-hour block
  rounded up, plus 20% markup. 5h ->cost50/charge60/total510; 13h ->100/120/1290;
  14h ->100/120/1380; 17h ->150/180/1710 at rate90. Price edits invert the block
  rule; impossible prices in a gap between blocks leave calculated hours blank.
- Optional pricing.mileageCostOverride: null is automatic; a number is a manual
  cost. New records default automatic. Editing cost preserves hours and reprices;
  Use automatic mileage restores the block rule. Existing D-Tools unit-cost
  overrides feed automatic customer charge; unrelated edits do not reprice.
- Legacy records with no mode, default charge60, >8 quoted hours and a total
  matching hours*rate+60 are repaired on load, preserving hours and adjusting
  price. An older UW Credit 13h/1230 becomes 13h/1290 with cost100/charge120.
  Custom non60 legacy charges become manual costs; arbitrary saved prices are
  preserved. Migration is idempotent and applied by backup normalization too.
  User's actual browser data was not read or manually edited; code handles it
  when refreshed. Initial tests caught optional-field and arbitrary-price
  preservation requirements; both repaired and regression covered.
- Changed types.ts, model.ts, renewalInputs.ts/test, PricingSection.tsx,
  db.test.ts, browser regression. No Git metadata; scoped edits inspected.
  Independent review found mileage-cost edits changed hours and unit-cost edits
  left price stale; both fixed, regression covered, final review passes.
- Final `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (169 tests), `npm.cmd run build`: all exit0. Final isolated browser
  `node scripts/renewal_handoff_check.mjs` with environment paths below passed:
  persisted legacy UW Credit refresh ->1290 with13h, hours14 ->1380, hours5
  ->510, price1290 ->13h andcharge120; prior clipboard/address/history passes.
- Refresh http://127.0.0.1:5173. No commit/push/deployment performed.

## Explicit mileage markup (2026-10-20)

- User confirmed D-Tools marks mileage cost up 20%. Contract pricing now
  accepts Annual mileage cost and displays the calculated Annual mileage
  charge, including a cost + 20% markup dollar breakdown. Cost100 -> charge120.
  Price and hours calculations use the customer charge, not the cost.
- Retained existing persisted annualMileageCharge semantics/schema to avoid
  changing validated saved quotes. Displayed cost is charge /1.2 rounded to
  cents; editing cost sets charge = cost *1.2 rounded to cents. Default charge60
  therefore displays cost50; existing quotes are not silently repriced. Enter
  cost100 for the user's 13/14-hour quote. Suggested mileage unit cost remains
  independent and unchanged.
- Updated PricingSection.tsx, renewalInputs.ts/test, browser regression.
  Scoped source edits reviewed directly; no Git metadata. `npm.cmd run typecheck`,
  `npm.cmd run lint`, `npm.cmd test` (167 tests), `npm.cmd run build`: exit0.
- Isolated `node scripts/renewal_handoff_check.mjs` (environment below) passed
  exact D-Tools examples: cost100 +20%=charge120, total1290->13 hours at90,
  hours14->total1380; earlier copy/address/history/persistence checks pass.
- Refresh http://127.0.0.1:5173 and set Annual mileage cost to100 for this quote.
  No user-profile edits, commit, push, or deployment performed.

## Bidirectional hours / price (2026-10-20)

- Editing Proposed quoted labor hours now sets proposed annual contract price
  to hours * current labor rate + annual mileage charge, rounded to cents.
  Price edits still derive hours from (price - mileage) / rate. No effect loop:
  the edited field is retained and only its counterpart is calculated.
- LaborSection uses updateRenewalLabor for hour edits and its Use average /
  Use recommended buttons. Unrelated labor edits preserve price. Blank hours
  or unusable rate/mileage clears price; zero hours produces mileage-only price.
  Historical actual hours remain independent. No data migration performed.
- Changed renewalInputs.ts/test, LaborSection.tsx, PricingSection.tsx hint,
  scripts/renewal_handoff_check.mjs. Scoped edits reviewed directly, no Git
  metadata. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (166 tests), `npm.cmd run build`: all exit 0.
- Isolated browser regression `node scripts/renewal_handoff_check.mjs` with
  environment paths below passed both editing directions (12h at100 plus110
  mileage ->1310; price610->5h; hours6->710), plus prior clipboard, history,
  default rates, address, DNR and persistence checks; zero page errors.
- Refresh http://127.0.0.1:5173 and edit either field. No commit/push/deploy.

## D-Tools project-name copy block (2026-10-20)

- Added ProjectNameSection directly above Contract pricing. Live read-only
  text uses Company name (explicitly requested, not Location name), Inspection
  frequency and Contract duration: `I&T - FA COMPANY Annual Fire Alarm Inspection
  3 YR`. No `Copy of` prefix or update placeholders. Blank company disables
  copying and shows an entry hint. Frequency and duration changes update text.
- Copy project name writes plain text to clipboard; blocked clipboard access
  selects the visible text and instructs Ctrl+C. No saved-data changes.
- Changed RenewalWorkspace.tsx; added components/ProjectNameSection.tsx;
  extended scripts/renewal_handoff_check.mjs. Targeted source inspection found
  no unrelated edits; project has no Git metadata.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` (165 tests),
  `npm.cmd run build`: all exit 0. Isolated browser verification passed exact
  project name generation, company/frequency/duration updates, actual clipboard
  content, blocked clipboard fallback, and existing hours/address/DNR flows.
- Refresh http://127.0.0.1:5173 to use it. No commit/push/deployment performed.

## Mileage correction (2026-10-20)

- User confirmed $510 annual total consists of 5.00 labor hours at $90/hour
  plus $60 mileage. Correct quoted-hours formula is now
  `(proposed annual price - annual mileage charge) / labor rate`, rounded to
  two decimals. This supersedes the price/rate-only formula below.
- Added editable `pricing.annualMileageCharge`, default $60 for new renewals
  and legacy records missing the field. Custom charge is persisted, restored
  from backups, and retained when duplicating. Legacy backups remain accepted;
  negative numeric/text charges and malformed fields are rejected. Blank charge,
  zero/blank rate, or price below mileage clears calculated hours. Enter zero
  mileage explicitly for labor-only quotes. Existing saved hours are preserved
  until price/rate/mileage is edited; no mass recalculation of user records.
- Contract pricing distinguishes the annual customer mileage charge from the
  pre-existing suggested D-Tools mileage unit cost ($50/eight-hour block).
  Original unit-cost rule is unchanged.
- Changed types.ts, model.ts, renewalInputs.ts/test, PricingSection.tsx,
  db.test.ts, scripts/renewal_handoff_check.mjs. Reviewed scoped edits directly
  (no Git metadata). Independent review found negative string validation edge
  case, fixed and covered with regression assertion.
- Final `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (165 tests, 9 files), `npm.cmd run build`: all exit 0. Earlier tests exposed
  legacy-field expectation and negative-charge validation; both corrected.
- Isolated browser `node scripts/renewal_handoff_check.mjs` using environment
  paths below passed: $510/$60/$90 gives 5 hours; rate100 gives4.5; mileage110
  gives4; manual hours remain editable; prior address/DNR/Dance Studio flows
  pass with zero page errors. An initial browser tool approval review timed
  out before launching; retry succeeded. User profile data was untouched.
- Refresh http://127.0.0.1:5173 and edit/re-enter proposed price to recalculate
  an existing renewal. No commit/push/deployment required or performed.

## Quality-of-life updates (2026-10-20)

- Acceptance complete: new renewals and saved renewals with blank labor rates
  default to $90/hour; explicit numeric custom rates are preserved. Proposed
  price or rate edits calculate quoted hours as price / rate, rounded to two
  decimals. Users can edit hours afterward; unrelated pricing edits preserve
  manual hours. Clearing price or entering an unusable rate clears calculated
  hours. Historical actual hours remain independent.
- Full site address input recognizes comma/newline-separated city and two-letter
  state, with optional ZIP and country, and fills city/state. Street-only input
  leaves these fields unchanged. Original address text is preserved.
- Exact Wisconsin DNR / Wisconsin Department of Natural Resources (DNR) site
  aliases now group within the same client. Actual projects 24-0328 (2024,
  2.5h), 24-2224 (2025, 3.4h), 25-0855 (2026, 2.58333333h) appear together.
  Other named DNR locations remain separate. Project site keys are recomputed
  on load, so existing imported history works without reimport. Source rows,
  decisions, and project identities are retained. The timesheet export has no
  site-address column, so address-based history matching is not possible here.
- Changed model defaults, CompanySection, PricingSection, dtools site keys;
  added renewalInputs helpers/tests and DNR regression; expanded the existing
  scripts/renewal_handoff_check.mjs browser check.
- Final checks: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (164 tests, 9 files), `npm.cmd run build`: all exit 0. Browser command using
  the PLAYWRIGHT_MODULE / CHROMIUM_PATH listed below:
  `node scripts/renewal_handoff_check.mjs` exit 0; actual CSV DNR years applied,
  price/rate/manual hours/address/default90 checks passed, prior Dance Studio
  creation/persistence behavior passed, zero page errors. Independent read-only
  review found no concrete regression. No Git metadata; scoped edits reviewed.
- Refresh http://127.0.0.1:5173 to load defaults and new grouping. Reapply DNR
  history to an already-created renewal to bring in the missing years. No user
  browser data was changed by verification. No commit/push/deployment performed.

## Renewal hand-off fix (2026-10-20)

- Fixed the disabled Use These Hours for Renewal action when Historical Hours
  is opened with no saved renewal. Valid selected hours now enable the action;
  confirmation creates and saves a new renewal before opening its editor.
- Existing-renewal behavior and invalid-selection safeguards are preserved.
  The no-renewal hint and confirmation now explain that a new record is created.
- Changed `src/App.tsx`, `src/components/HistoricalHours.tsx`; added
  `scripts/renewal_handoff_check.mjs` for an isolated browser regression check.
- Verified `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`
  (160 tests, 8 files), and `npm.cmd run build`: all exit 0.
- Browser regression uses the same PLAYWRIGHT_MODULE and CHROMIUM_PATH below:
  `node scripts/renewal_handoff_check.mjs` passed with the actual CSV.
  Dance Studio 3-D creates one saved renewal with 2.53333333, 4.8, and 2.75
  hours for 2026/2025/2024, survives reload, and applying again preserves an
  existing address without creating another record. Zero page errors.
  First browser attempt failed with ERR_CONNECTION_REFUSED because the local
  server was stopped; started Vite hidden and reran successfully.
- App is running at http://127.0.0.1:5173. Refresh the user's tab and retry.
  Real user browser data was not accessed or changed. No Git metadata here;
  reviewed targeted edits directly. No commit/push/deployment needed.

**State:** Version 1 stable, plus the Phase 2 Historical Hours importer
(2026-10-19). Importer accepts CSV/XLSX, classifies projects, groups inspection
occurrences, keeps source-row audit trails, and applies verified hours to a
renewal. Independent Phase 2 audit and repairs are complete; see the final
audit section below for current evidence and source limitations.
**Location:** `E:\Projects\omni-renewal-quote-assistant`
**Run:** `npm run dev` → http://127.0.0.1:5173
**Data:** IndexedDB `omni-renewal-quote` in the browser profile for that origin.
**Actual export used:** `Time Sheets Oct 19, 2026 02 57.csv` (6,380 data rows;
15 columns; approved/unapproved; decimal-hour Duration).

## Acceptance criteria

- [x] Full renewal editor (company/client/location, pricing, hours, SOW rules).
- [x] Historical hours average / recommended / separate quoted hours / mileage rule.
- [x] Exact Omni SOW template with all conditional rules A–I.
- [x] Live preview, plain-text copy with real `•` bullets, clipboard fallback.
- [x] Manual SOW draft, changed-input review warning, refresh, reset to generated.
- [x] Required-field and contractual validation blocks copy.
- [x] Statuses, autosave, saved indicator, search, duplicate, delete.
- [x] 21-step renewal checklist with progress and reset.
- [x] JSON export and validated restore with confirmation.
- [x] Light/dark mode, loopback-only server, local-only data.
- [x] 160 automated tests, TypeScript check, production build and clean lint after Phase 2 audit repairs.
- [x] Manual draft finalization validates the actual copied text (empty/placeholders/review).
- [x] Malformed backup records cannot overwrite valid saved customers.
- [x] Failed autosaves are retained, retried, and block dependent operations.

## Phase 2 — Historical Hours importer (2026-10-19)

### Import results from the actual export

| Metric | Value |
|---|---|
| Data rows | 6,380 |
| Valid rows | 6,380 |
| Rejected rows | 0 |
| Unapproved rows (excluded by default) | 13 |
| Unique projects (`Project Number` + normalized title) | 1,153 |
| Classified annual FA inspections | 705 |
| Classified semi-annual FA inspections | 145 |
| Excluded unrelated work | 257 |
| Needs manual review | 46 |
| Client/site groups | 677 sites across 149 clients |
| Approved actual hours in confirmed annual projects | 26,435.28 h |
| Approved actual hours in confirmed semi-annual projects | 4,622.32 h |
| Actual hours in review projects (not auto-included) | 2,726.40 h |

Duration column values are numeric decimal hours (e.g. `0.46666667`, `8.5`);
they are used directly, never multiplied by 24.

### Classification rules

- **Annual / semi-annual:** fire alarm (`FA`, `Fire Alarm`, `Fire Inspection`)
  plus `Annual` or `Semi-Annual` wording; typo `Annaul` is recognized. Missing
  frequency wording goes to review.
- **Excluded:** `SVC` at project start, service-call wording, troubleshoot,
  deficiency, discrepancy, repair, corrective work, nurse call, intrusion,
  security, CCTV, AV, training, and office time. `Human Services`, `Service
  Bldg`, and `Svc Bldg` are not rejected as service work.
- **Review:** missing/conflicting year, mixed fire-alarm and other-system
  titles, inconsistent/absent frequency, shared project number, or approved
  entries spanning more than 400 days. Semi-annual projects spanning over 90
  days with a gap over 60 days need scope review rather than invented visits.
- Contract position (`2 of 3`) is recorded but never used as a year. Missing
  years are inferred from work dates, marked `inferred`, and still require
  review. Dec/Jan work stays one occurrence.
- Individual task names are checked for clear service/repair/sprinkler work;
  those entries are excluded from totals by default and can be included after
  review.

### Grouping and averages

Rows are grouped first by `Project Number` + normalized full project title, so
employee/task/date rows sum into one inspection total before averaging.
Annual and semi-annual projects are always separate. Annual default selects
the latest three distinct years; semi-annual default selects up to six recent
visits (max two per year). Every occurrence remains individually checkable.
Semi-annual shows per-visit average, calendar-year totals, and an annualized
average only for years with two visits. Missing history is omitted, never
zero-filled.

### Persistence and hand-off

- Dexie v2 adds `dtoolsDatasets`, `dtoolsRows`, `dtoolsDecisions`; existing
  `renewals` data is untouched.
- Dataset replacement is transactional and clears old timesheet rows, so a
  re-import cannot inflate totals. File SHA-256 fingerprint blocks importing
  the same file twice.
- Manual include/exclude, frequency, year, note, per-project original quoted
  hours, average selection, and flagged-entry inclusion persist across refresh and dataset
  replacement.
- **Use These Hours for Renewal** updates client, location, frequency,
  historical entries, and an `importSummary` audit block. Address, pricing,
  notes, quoted hours, SOW rules, checklist, and `companyName` are preserved.
- `LaborSection` shows the imported filename, import date, frequency/basis, and
  each source project/year/entry count/hours, labelled as actual hours.

### Verification

- `npm.cmd run typecheck` — pass.
- `npm.cmd run lint` — clean.
- `npm.cmd test` — 160/160 pass across 8 files, including every source row and
  all 1,153 project totals independently reconciled with Python Decimal sums.
- `npm.cmd run build` — pass; application 490.58 kB, separate XLSX parser 492.12 kB.
- `python scripts/source_csv_audit.py` — independent reconciliation artifact
  `audit/source-verification.json`; original CSV SHA-256 remains unchanged.
- Browser (Playwright, isolated persistent profile): 14 workflow checks pass,
  including duplicate/failed import protection, search, both frequencies,
  manual exclusion/selection persistence, source expansion, renewal handoff,
  copy, autosave, checklist, duplicate/delete, full backup/restore, and browser
  close/relaunch. No runtime errors or external requests.
- XLSX: generated from the actual CSV export and imported with identical row
  and project counts.

### Observed naming anomalies handled

- `I&T - FA`, `I&T- FA`, `I&T  - FA`, `FA - I&T`, and `I&T - I&T FA` spacing.
- `Annual Fire Inspection` (without "Alarm"), `Annual FA Inspection`,
  `Annual Fire Alarm Inspections`.
- `Annaul` typo (`25-1243`).
- `Semi Annual` without hyphen.
- Missing year, e.g. `24-1859`, `22-0085`, `24-0458`; inferred and reviewed.
- Missing frequency, e.g. `25-1252` Gerhards, `24-0233` T&M, `Rock Co. Human
  Services Fire Alarm Inspection 1 of 5 2026`; review.
- Mixed systems, e.g. `I&T - FA/INT/CCTV SSA … / Semi Annual FA Inspection`;
  review, never auto-averaged.
- `I&T - NC`, `I&T - INT`, `I&T - SEC` and `SVC - FA` projects excluded.
- Real SVC examples: `SVC - FA I&T Dean Deerfield Clinic Annual Inspection
  Discrepancies`, `SVC - FA I&T Investigate Rubins Annual Inspection
  Discrepancies`.

### Remaining ambiguities for user review

- 46 projects are intentionally **Needs review**, mostly missing years. They
  show inferred years and source rows for confirmation.
- 257 excluded projects include SVC/other-system work; review them in the
  **Excluded & needs-review projects** view if a project was mislabeled in
  D-Tools.
- Original quoted/bid hours are not in this export; they remain manual.
- Project 25-2320 has two flagged `Assisting Sprinkler Testing` entries
  (2.33 h) and no other approved time, so it is excluded from averages rather
  than counted as a zero-hour inspection. 25-0512 has one `Replace duct
  detector` entry (1.0 h) excluded from its 6.03 counted hours. Both remain
  visible with a manual override option.

## Independent QA audit — 2026-10-19

Acceptance: all requested V1 calculations, exact canonical text, eight required SOW scenarios, record operations, safe malformed restore, reliable persistence, full checklist, local-only behavior, usable light/dark/responsive UI. Preserve existing application; larger safeguards are repair work for the original implementer.

Executed after fixes: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` (61/61, 3 files), `npm.cmd run build` — all exit 0. The initial `npm` invocation hit PowerShell execution policy; use `npm.cmd`. E: cache/build writes required tool sandbox escalation. Existing dev server was already running; a duplicate launch correctly failed because port 5173 was occupied. Verified listener is 127.0.0.1 only.

Browser evidence: `audit-browser.log`; screenshots `audit-desktop.png`, `audit-dark.png`, `audit-mobile.png`; synthetic backup `audit-backup.json`. Repro script: `C:/Users/drewc/omni-audit-browser.mjs`, using existing cached Playwright and installed Chromium (no installation). Every run uses a disposable browser context and synthetic customers, never the user's browser records. Final complete browser script exited 0. Lines labeled `PASS BUG` confirm a defect reproduction, not acceptable product behavior.

Browser checks passed: all four required hours/hospital/city/price combinations; exactly $10,000 blocked until explicit selection; blank annual price blocked; manual inspector and clause overrides; contradictory billing acknowledgement; real clipboard equals preview after Windows CRLF normalization; manual text retained after form changes; refresh persistence; separate blank new renewal; 2023/2024/2025 hours 12.5/14/15.5 average 14; blank exclusion/additional year; invalid numeric price cleared; labor rate 89.99 warning and 90 no warning; search; duplicate; delete confirmation; status selection; JSON download; valid restore; invalid JSON rejected without changes. No uncaught page errors or external requests in ordinary operation. Widths 390/768/1280/1600 had no document horizontal overflow. Screenshots inspected. The 21-step checklist covers all required workflow steps and sends proposals to Julie, without customer email integration.

Small fixes: `src/lib/sow.ts` restores the canonical single-inspector period; `src/lib/calculations.ts` suppresses mileage for nonpositive hours; `src/components/ui.tsx` clears the committed numeric value when typed input is invalid/out of bounds, preventing calculations from retaining an earlier valid number; `src/lib/model.ts` preserves deliberately empty manual drafts after reload. Regression coverage added/updated in `sow.test.ts`, `calculations.test.ts`, `db.test.ts`. Empty-draft persistence change independently reviewed with no issue found. No git metadata exists here, so a Git diff/status is unavailable; targeted patch review was used.

Remaining repairs (do not rebuild):

1. **High — `src/components/SowPreview.tsx:37-43` / `copy()`:** readiness checks form inputs, not resolved manual text. With valid form values, replace the manual draft with `(INSERT LOCATION NAME)` or empty text: Copy remains enabled. Validate the actual resolved text, block empty/placeholder drafts, and require an explicit review of outdated manual drafts before final copying. Keep manual edits intact.
2. **High — `src/lib/model.ts:266`, `src/lib/db.ts:90` / `replaceRenewals`:** a correctly enveloped backup containing only `{id: existingId}` is normalized to defaults and overwrites that saved customer's fields. Reproduced through Restore UI. Require valid record structure before restore; reject/skip malformed records before any database write, preserving valid legacy compatibility deliberately. Add collision regression coverage.
3. **High — `src/App.tsx:77-91`:** `flushPending` clears the queue before writes and catches failures without restoring entries or signaling failure. Simulated native IndexedDB QuotaExceededError, edited notes, restored storage, then created another record: the failed notes were never retried. Keep failed entries queued without replacing newer edits; propagate save success/failure and prevent dependent destructive/replacement operations on failure. Test storage failure, recovery, switching and reload.

Limits: verified clipboard text, not a live D-Tools editor paste. Browser refresh/reopen persistence checked; no physical PC restart tested. App code makes no network requests for customer data and requires no paid API/account. The Excel/CSV importer described later in this file was built after this audit; large-file performance is validated for the 6,380-row export only.

## Safeguard repair pass — 2026-10-19

All three High findings were fixed without redesigning the app or touching the
Excel importer:

1. **Manual SOW copy validation** — `validateSowText()` now checks the exact
   resolved text (empty and unresolved `INSERT`/`GENERATED DATE` placeholders).
   `manualDraftNeedsReview()` blocks copying changed generated inputs until the
   user clicks **Mark reviewed**; edits are never overwritten. Refresh remains a
   separate, confirmed action.
2. **Backup safety** — `validateBackupRenewal()` requires the full record
   structure (`company`, `pricing`, `labor.history`, `sow`, timestamps) before
   `parseBackupJson` accepts anything. An id-only record with an existing ID is
   skipped/rejected and cannot be normalized into defaults over customer data.
3. **Autosave reliability** — new `src/lib/saveQueue.ts` retains failed
   snapshots, never lets an older retry replace a newer edit, retries with
   backoff, and returns failure from `flush()`. `runAfterSave()` gates switching,
   create, duplicate, delete, and restore so unsaved work cannot be discarded.

Regression coverage: `saveQueue.test.ts` (5 cases), strict backup cases in
`db.test.ts`, and manual-text/review cases in `sow.test.ts`. Browser QA reran
the three reproductions: copy blocked for empty/placeholder drafts and changed
inputs, malformed id-only backup rejected with data intact, and a simulated
IndexedDB `put` failure showing “Save failed” → blocked New Renewal → automatic
retry success → content intact after reload.

Next action: keep V1 stable; do not begin the future importer until requested.

### Nested backup validation follow-up — 2026-10-19

Fixed the remaining malformed-restore bypass in `src/lib/model.ts`: validate required company, pricing, labor/history and SOW fields before normalization, including field types and rule selections. Schema/status, checklist entries and manual drafts are also checked to prevent normalization from clearing approvals, progress or edited text (identified by independent review). Empty nested objects and missing/mistyped fields are rejected rather than filled with defaults. Blank valid renewals, numeric strings in older backups, and drafts missing the newer optional review field still restore. Existing local-record normalization is unchanged.

Added eleven regression cases in `src/lib/db.test.ts`, including actual mixed-backup restore: a malformed record sharing a saved customer's ID is skipped, the saved record stays identical, and a valid incoming record restores successfully. Parameterized coverage checks missing and mistyped nested fields, malformed history, schema/status/checklist/manual draft preservation, and compatibility.

Verification: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` (83/83, four files), `npm.cmd run build` all exit 0. Exact isolated browser reproduction (`node C:/Users/drewc/omni-repair-check.mjs`) now reports `malformedAccepted: false`; company, location and $9,000 price remain identical before/after. No user browser records touched. Source changes limited to validator and regression tests; no Git diff available because this directory has no Git metadata.

## Verification evidence

| Check | Command | Result |
|---|---|---|
| Types + bundle | `npm run build` | Pass (Vite 8.3.4, ~407 kB JS / 124 kB gzip) |
| Business rules | `npm.cmd test` | 83/83 pass (4 files), after nested backup validation fix |
| Lint | `npm run lint` | Clean, no warnings |
| Browser rules | Playwright against `127.0.0.1:5173` | 8 h one inspector + FACP; 14 h two inspectors; hospital removes FACP; Madison adds AHJ; $10,000 blocks until choice; copy/fallback; persistence; export/restore; duplicate/delete; dark/mobile layouts |
| Safeguard QA | Playwright against `127.0.0.1:5173` | empty/placeholder manual copy blocked; changed-input review required; id-only backup rejected; simulated IndexedDB failure retained, retried, and blocked New Renewal until recovery |
| Bind address | `Get-NetTCPConnection -LocalPort 5173` | `127.0.0.1` only |

## Key files

- `src/lib/sow.ts` — clause evaluation, exact SOW text, validation.
- `src/lib/calculations.ts` — hours, mileage, inspector, pricing math.
- `src/lib/db.ts` — Dexie persistence + backup parse/validate.
- `src/lib/model.ts` — new/duplicate renewals + strict backup validation.
- `src/lib/saveQueue.ts` — retained/retried autosave queue and mutation gate.
- `src/App.tsx` — shell, autosave (400 ms + pagehide focus/online flush), export/restore.
- `src/components/SowPreview.tsx` — preview, copy, manual draft review gate.

## Decisions / limitations

- Backup restore **upserts by ID** and leaves unrelated saved renewals in place.
- Duplicate shifts the start year by the contract duration, carries company/location/notes/labor rate, resets prices, hours, approvals, SOW overrides, manual draft, and checklist.
- `127.0.0.1` and `localhost` are different origins; always use `127.0.0.1`.
- No D-Tools automation, multi-user sync, or email (by design).
- The timesheet export has actual hours only; quoted/budget hours remain manual until a D-Tools budget export exists.
- Future exports larger than ~6,380 rows have not been stress-tested.

## Future work

- Add a D-Tools quoted/budgeted-hours export and compare it with actual hours
  without changing the existing `importSummary` shape.
- Optionally expose a bulk review screen for the 46 currently ambiguous
  projects.

## Independent Phase 2 audit — current handoff, 2026-10-19

Acceptance: approved source rows reconcile without duplication; inspection
identity and frequency stay separate; uncertain scope stays reviewable;
physical source rows and full names remain auditable after applying hours;
renewal rules, manually entered information, persistence and backup survive.
Applicable checks pass. No demonstrated application defect remains open.

Repairs are limited to importer parsing/classification/grouping and selection
in `src/lib/dtools.ts`, XLSX handling in `dtoolsImport.ts`, decision persistence
and backup validation in `db.ts`/`model.ts`, and their UI integration in
`HistoricalHours.tsx`, `LaborSection.tsx`, `App.tsx`, and `types.ts`.
Regression tests accompany the changes. No new dependency was introduced.

- Decimal hours remain unchanged. Dates retain the correct calendar day;
  XLSX header offsets, blank rows, formatted identifiers and 1904 dates are
  covered. Ambiguous time-formatted Duration cells and multiple timesheet
  worksheets are rejected with an explanation.
- Exact source strings are preserved. Rejected rows flag incomplete sibling
  project totals, including rows missing a title as well as having bad dates.
  Refreshing stored history preserves those review reasons.
- Uncertain semi-annual spans (24-0179 and 24-1718) now need review. Conflicting
  title years and mixed scope cannot silently become accepted through an
  unrelated correction. Street numbers such as 2024/2025 remain in site names.
- Each selected annual project remains one averaging entry when applied to a
  renewal. Semi-annual annualization requires exactly two selected visits in
  a year. Average-selection checkboxes persist without silently backfilling
  older projects; rapid manual corrections merge and serialize safely.
- Applied renewals retain complete source-row snapshots, approvals, task
  names, resources, dates, decimal durations and exclusion reasons. Original
  quoted hours are never inferred from actual time.
- Backup format 2 contains renewals, source history and decisions, restored
  atomically; version 1 remains supported. Malformed dates, negative source
  durations, repeated source rows, mismatched project identities and totals
  cannot overwrite valid history. Failed imports retain the current dataset.

Independent source evidence: 6,380 data rows plus the header; 6,367 approved
rows total 35,135.13766658 h across all types of work; 13 unapproved rows total
49.11666666 h and are excluded. All 1,153 project sums and physical source-row
assignments match the Python csv/Decimal oracle, without importing app code.
Examples: Decade 25-1179 = 18.61666667 h; St. Mary's annual 22-0256 / 23-1097 /
24-1501 = 115.5 / 795.896 / 857 h (average 589.46533333 h); Meriter 23-0359 =
849.91666667 h across Nov 2023–Apr 2024, kept as one 2023 inspection. SVC,
deficiency, mixed-system, missing-year, and multiple-location cases are covered.

Final commands, all exit 0 on 2026-10-19 after repairs:
`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` (160 tests, 8 files),
`npm.cmd run build`. Independent reviewer found no unresolved issue after
the final correction to preserve reviewed client-name differences in backups.

Browser command (uses installed tooling; no dependency added):
set `PLAYWRIGHT_MODULE` to
`C:/Users/drewc/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright`
and `CHROMIUM_PATH` to
`C:/Users/drewc/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe`,
then run `node scripts/browser_audit.mjs` with the dev server on 127.0.0.1:5173.
Final evidence: `audit/browser-verification.json` and `audit/verified-browser.png`.
Full import took 1.37 s; recorded searches about 0.13–0.15 s; JS heap after
restart about 38 MB; 14 checks passed, zero page errors, zero external requests.
Test profiles and downloaded backups stay local under `audit/` and are ignored.

Remaining human/source limits: no original XLSX workbook exists here. Actual
CSV and a generated XLSX containing all source values were tested; original
Excel cell formats cannot be verified. The export has no completion status or
original budget. Confirm inspection completion and export coverage in D-Tools
before using any total, especially older boundary-year history. Resolve the
46 review projects individually; do not invent visits, missing years, addresses
or original quoted hours. Live D-Tools pasting and physical PC restart were not
tested; clipboard content and complete browser restart were tested.

Next action: use the repaired application for reviewed renewal preparation;
obtain the original workbook only if original-format verification is required.
No commit, push, deployment or customer communication was performed. This
directory has no Git metadata, so changes were reviewed by targeted source
inspection and independent review rather than a Git diff. Local dev server
was restarted and remains available at http://127.0.0.1:5173.
