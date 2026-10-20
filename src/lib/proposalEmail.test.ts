import { describe, expect, it } from 'vitest';
import { createRenewal } from './model';
import { buildProposalEmail } from './proposalEmail';

describe('proposal email', () => {
  const company = {
    ...createRenewal().company,
    companyName: 'Different company',
    locationName: 'The Dance Studio 3-D',
    siteAddress: '213 West Lake Street Lake Mills, WI 53551',
    dtoolsProjectNumber: '26-1852',
    emailGreeting: 'Good morning' as const,
  };

  it('matches the supplied subject and email using location rather than company', () => {
    const email = buildProposalEmail(company);
    expect(email.subject).toBe('The Dance Studio 3-D – Annual Fire Alarm Inspection Proposal – 3 Year – 26-1852');
expect(email.body).toBe('Good morning,\nAttached is a 3-year annual fire alarm inspection proposal for The Dance Studio 3-D, located at 213 West Lake Street Lake Mills, WI 53551.\n\nIf you have any questions, please let us know. Otherwise, please sign and return the proposal at your earliest convenience.');
    expect(email.canCopySubject).toBe(true);
    expect(email.canCopyBody).toBe(true);
  });

  it.each(['Intrusion', 'Nurse Call'] as const)('follows frequency, duration and %s selection', (emailSystemType) => {
    const email = buildProposalEmail({ ...company, inspectionFrequency: 'Semi-Annual', durationYears: 2, emailSystemType });
    expect(email.subject).toContain(`Semi-Annual ${emailSystemType} Inspection Proposal – 2 Year`);
    expect(email.body).toContain(`2-year semi-annual ${emailSystemType.toLowerCase()} inspection proposal`);
  });

  it('requires the relevant fields for each copy button', () => {
    expect(buildProposalEmail({ ...company, dtoolsProjectNumber: '' })).toMatchObject({ canCopySubject: false, canCopyBody: true });
    expect(buildProposalEmail({ ...company, siteAddress: '' })).toMatchObject({ canCopySubject: true, canCopyBody: false });
    expect(buildProposalEmail({ ...company, locationName: ' ' })).toMatchObject({ canCopySubject: false, canCopyBody: false });
    expect(buildProposalEmail({ ...company, durationYears: 0 })).toMatchObject({ canCopySubject: false, canCopyBody: false });
  });

  it('defaults older records to Fire Alarm and Good Day and flattens pasted address lines', () => {
    const email = buildProposalEmail({ ...company, emailSystemType: undefined, emailGreeting: undefined, siteAddress: '213 West Lake Street\nLake Mills, WI 53551' });
    expect(email.subject).toContain('Annual Fire Alarm');
    expect(email.body).toContain('Good Day,\nAttached');
    expect(email.body).toContain(company.siteAddress);
  });
});
