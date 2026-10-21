import { Building2 } from 'lucide-react';
import type { InspectionFrequency, Renewal } from '../types';
import { INSPECTION_FREQUENCIES } from '../types';
import { parseAddressCity } from '../lib/renewalInputs';
import {
  Field,
  SectionCard,
  TextArea,
  TextInput,
  NumberInput,
} from './ui';

export function CompanySection({
  renewal,
  update,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
}) {
  const { company } = renewal;
  const patch = (values: Partial<Renewal['company']>) =>
    update((current) => ({
      ...current,
      company: { ...current.company, ...values },
    }));

  return (
    <SectionCard
      icon={<Building2 className="h-4 w-4" />}
      title="Company & location"
      description="Names exactly as they appear in Teams and D-Tools."
    >
      <div className="workspace-field-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Company name"
          hint="Teams company name; used in the D-Tools project name."
        >
          <TextInput
            value={company.companyName}
            onChange={(value) => patch({ companyName: value })}
            placeholder="Acme Property Management"
            ariaLabel="Company name"
          />
        </Field>
        <Field label="Client name" hint="Exactly as listed in D-Tools.">
          <TextInput
            value={company.clientName}
            onChange={(value) => patch({ clientName: value })}
            placeholder="Acme - D-Tools"
            ariaLabel="Client name"
          />
        </Field>
        <Field
          label="Location name"
          required
          hint="Used in the SOW and proposal email."
        >
          <TextInput
            value={company.locationName}
            onChange={(value) => patch({ locationName: value })}
            placeholder="Acme Tower"
            ariaLabel="Location name"
          />
        </Field>

        <Field
          label="Full site address"
          required
          className="sm:col-span-2"
          hint="Paste a full address with city, state and ZIP to fill city and state automatically."
        >
          <TextInput
            value={company.siteAddress}
            onChange={(value) => patch({ siteAddress: value, ...parseAddressCity(value) })}
            placeholder="1234 Main St"
            ariaLabel="Full site address"
          />
        </Field>
        <Field label="D-Tools project #" hint="Optional — for reference only.">
          <TextInput
            value={company.dtoolsProjectNumber}
            onChange={(value) => patch({ dtoolsProjectNumber: value })}
            placeholder="24-1033"
            ariaLabel="D-Tools project number"
          />
        </Field>

        <Field label="Site city">
          <TextInput
            value={company.siteCity}
            onChange={(value) => patch({ siteCity: value })}
            placeholder="Madison"
            ariaLabel="Site city"
          />
        </Field>
        <Field label="Site state">
          <TextInput
            value={company.siteState}
            onChange={(value) => patch({ siteState: value })}
            placeholder="WI"
            ariaLabel="Site state"
            maxLength={24}
          />
        </Field>
        <Field label="Inspection frequency" hint="For D-Tools. SOW keeps the standard annual inspection language.">
          <select
            className="input"
            value={company.inspectionFrequency}
            aria-label="Inspection frequency"
            onChange={(event) =>
              patch({
                inspectionFrequency: event.target.value as InspectionFrequency,
              })
            }
          >
            {INSPECTION_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {frequency}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Contract start year" hint="First inspection year. New renewals default to next year; three years starting in 2027 end 12/31/2029.">
          <NumberInput
            value={company.startYear}
            onChange={(value) =>
              patch({ startYear: value ?? new Date().getFullYear() + 1, startYearSource: 'manual' })
            }
            min={1900}
            max={2200}
            step={1}
            ariaLabel="Contract start year"
          />
        </Field>
        <Field label="Contract duration" hint="Years in this proposal.">
          <NumberInput
            value={company.durationYears}
            onChange={(value) => patch({ durationYears: value ?? 1 })}
            min={1}
            max={10}
            step={1}
            suffix="yrs"
            ariaLabel="Contract duration in years"
          />
        </Field>
        <div className="hidden xl:block" />
      </div>

      <div className="workspace-stack-grid mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field
          label="Special company quoting notes"
          hint="Standing requirements from Teams — visible while quoting."
        >
          <TextArea
            value={company.companyQuotingNotes}
            onChange={(value) => patch({ companyQuotingNotes: value })}
            placeholder="Two inspectors minimum. Always include elevator coordination..."
            rows={2}
            ariaLabel="Special company quoting notes"
          />
        </Field>
        <Field label="Internal renewal notes" hint="For this renewal only.">
          <TextArea
            value={company.internalRenewalNotes}
            onChange={(value) => patch({ internalRenewalNotes: value })}
            placeholder="Contact, access notes, Julie feedback..."
            rows={2}
            ariaLabel="Internal renewal notes"
          />
        </Field>
      </div>
    </SectionCard>
  );
}
