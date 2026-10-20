# OMNI Renewal Quote Assistant — agent entry point

Read the **Current operating handoff** at the top of `STATUS.md` first, then
`README.md`. Older sections in STATUS are dated implementation history and may
describe superseded behavior. Keep this local, personally validated app intact;
make targeted changes rather than rebuilding it.

## Environment and scope

- Project: `E:/Projects/omni-renewal-quote-assistant` (Windows PowerShell).
- App: `http://127.0.0.1:5173`, Vite loopback only. `npm.cmd run dev` starts it.
  Node dependencies and build artifacts belong on E:. Use `npm.cmd` on Windows.
- Source control: private Omni-Technologies/omni-renewal-quote-assistant on GitHub,
  requested by the user on2026-10-20. Keep customer exports, backups and browser
  artifacts out of Git. No cloud deployment; do not deploy, switch origins/ports,
  or reinstall dependencies unnecessarily. Ask once before commit/push/merge.
- Renewals and timesheet history live in the user's browser IndexedDB database
  `omni-renewal-quote`. Another browser profile, localhost, or another port has
  different data. Never clear it or test destructively in the user's profile.
- Browser tests use isolated profiles and the local CSV. Data and backups are
  confidential; do not send them to cloud services or commit them.

## Critical accepted behavior

- New proposals start next calendar year. In 2026, three years means inspections
  in 2027, 2028, 2029 and end date **12/31/2029**. End year is start+duration-1;
  do not add a year to that formula. Read model normalization before changing
  defaults; older current-year drafts and explicit manual start years differ.
- Price and quoted hours update each other in event handlers, not effects.
  Default rate90. Mileage cost =50 per eight-hour block rounded up; customer
  charge = cost*1.20. Thus 13h ->1290, 14h ->1380, 5h ->510 at rate90.
  Do not regress to subtracting a fixed60 for all quotes or use cost100 as the
  customer charge120. Keep historical actual hours independent of quoted hours.
- Automatic mileage is `pricing.mileageCostOverride === null`. A numeric
  override is manual. Customer charge remains `annualMileageCharge`; don't
  multiply it by1.2 again. Read `renewalInputs.ts` and model migrations together.
- Copy project name uses **Company name**, selected frequency, duration:
  `I&T - FA COMPANY Annual Fire Alarm Inspection 3 YR`. It intentionally does
  not use Location name, prepend Copy of, or retain update placeholders.
- Email copy uses **Location name**, full site address, frequency, duration,
  D-Tools project number and saved email system/greeting selections. Defaults
  Fire Alarm/Good Day also apply to older records. Email system selection does
  not change the validated fire-alarm SOW or D-Tools project-name template.
- DNR grouping uses exact verified title aliases within the same client.
  UWCU expands to UW Credit Union in client/site names; a trailing Branch on
  UW Credit Union sites is ignored. Location still must match across years.
  Never merge all sites just because they share a client. Export has no site
  addresses, completion status, or original quoted/budget hours.
- History apply creates a renewal when none exists; when updating an existing
  renewal it preserves address, pricing, notes, quoted hours and other settings.
- Preserve exact supplied SOW wording and manual drafts. Changed generated
  inputs require manual-draft review; never overwrite a manual draft silently.

## Source map

| Area | Files |
| --- | --- |
| Defaults, load migrations, strict backup validation | `src/lib/model.ts` |
| Price/hours/mileage linkage, address parsing | `src/lib/renewalInputs.ts` |
| Basic hours/mileage/inspector math | `src/lib/calculations.ts` |
| Historical import/classification/site grouping | `src/lib/dtools.ts`, `dtoolsImport.ts` |
| IndexedDB, backups, source/decision persistence | `src/lib/db.ts` |
| Exact SOW, inclusive contract end date, copy rules | `src/lib/sow.ts`, `components/SowPreview.tsx` |
| Forms | `components/CompanySection.tsx`, `PricingSection.tsx`, `LaborSection.tsx` |
| Project-name preview/copy, layout | `components/ProjectNameSection.tsx`, `RenewalWorkspace.tsx` |
| Email subject/body preview/copy | `lib/proposalEmail.ts`, `components/ProposalEmailSection.tsx` |
| History UI/apply, app shell/autosave | `components/HistoricalHours.tsx`, `App.tsx`, `lib/saveQueue.ts` |

## Verification and handoff

Run actual commands in order: `npm.cmd run typecheck`, `npm.cmd run lint`,
`npm.cmd test`, `npm.cmd run build`. Run affected browser behavior too; exact
Playwright/Chromium environment and regression commands are at top of STATUS.
Use escalated execution if the session cannot write build caches on E:.
Report failures honestly and never weaken safeguards to make tests pass.

For persistence/migration changes, request independent review and verify its
findings. On substantial completion or a requested context reset, update the
existing STATUS current handoff with behavior, changed paths, checks, remaining
limits and next action. Keep README's user workflow current. Do not create a
second progress file or treat old milestone text as current instructions.
