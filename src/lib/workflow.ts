export interface ChecklistStep {
  id: string;
  label: string;
}

/** The real-world renewal process, in the order it is performed. */
export const RENEWAL_CHECKLIST: readonly ChecklistStep[] = [
  { id: 'teams-dtools', label: 'Open company in Teams and D-Tools.' },
  { id: 'quoting-notes', label: 'Review company quoting notes.' },
  { id: 'three-years', label: 'Review at least three years of inspection hours.' },
  { id: 'verify-labor', label: 'Verify proposed labor hours and labor rate; ask Mike if rate is under $90.' },
  { id: 'template', label: 'Open template project 24-1033 and clone with all popup options unchecked.' },
  { id: 'update-project', label: 'Update client, project/location name, inspection frequency, contact, and address.' },
  { id: 'decline-labor', label: 'Decline review of labor types.' },
  { id: 'remove-years', label: 'Remove original Year 2 and Year 3 items.' },
  { id: 'update-hours', label: 'Update hours and mileage/travel unit cost.' },
  { id: 'round-pricing', label: 'Round pricing UP to zero decimal places.' },
  { id: 'clone-lines', label: 'Clone both lines to Year 2 and Year 3 with both clone checkboxes unchecked, using Annual under Systems.' },
  { id: 'enter-sow', label: 'Copy and enter generated SOW into D-Tools.' },
  { id: 'rtf', label: 'Switch to RTF, confirm popup, close Word, return to Text Format, save and close.' },
  { id: 'client-report', label: 'Run Client report: "Omni Sale Proposal Location Totals Only."' },
  { id: 'by-location', label: 'Select "By Location By System."' },
  { id: 'review-pricing', label: 'Review individual yearly pricing and verify no grand total.' },
  { id: 'export-pdf', label: 'Export PDF with Project Name filename.' },
  { id: 'save-network', label: 'Save in N:\\Inspections\\Proposals\\[Current Year]\\[Company Name].' },
  { id: 'check-in', label: 'Save and check in D-Tools project.' },
  { id: 'update-teams', label: 'Update Teams with renewal information.' },
  { id: 'julie', label: 'Send proposal to Julie for review.' },
] as const;

export const CHECKLIST_TOTAL = RENEWAL_CHECKLIST.length;

export function checklistProgress(checklist: Record<string, boolean>): number {
  return RENEWAL_CHECKLIST.reduce(
    (count, step) => count + (checklist[step.id] ? 1 : 0),
    0,
  );
}

export function resetChecklist(): Record<string, boolean> {
  return Object.fromEntries(RENEWAL_CHECKLIST.map((step) => [step.id, false]));
}
