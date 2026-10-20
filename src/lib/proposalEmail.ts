import type { CompanyLocation } from '../types';

export function buildProposalEmail(company: CompanyLocation) {
  const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
  const location = clean(company.locationName);
  const address = clean(company.siteAddress);
  const project = clean(company.dtoolsProjectNumber);
  const system = company.emailSystemType ?? 'Fire Alarm';
  const greeting = company.emailGreeting ?? 'Good Day';
  const durationValid = Number.isInteger(company.durationYears) && company.durationYears > 0;
  const duration = durationValid ? String(company.durationYears) : '[Duration]';
  return {
    subject: `${location || '[Location name]'} – ${company.inspectionFrequency} ${system} Inspection Proposal – ${duration} Year – ${project || '[Project #]'}`,
body: `${greeting},\nAttached is a ${duration}-year ${company.inspectionFrequency.toLowerCase()} ${system.toLowerCase()} inspection proposal for ${location || '[Location name]'}, located at ${address || '[Full site address]'}.\n\nIf you have any questions, please let us know. Otherwise, please sign and return the proposal at your earliest convenience.`,
    canCopySubject: Boolean(location && project && durationValid),
    canCopyBody: Boolean(location && address && durationValid),
  };
}
