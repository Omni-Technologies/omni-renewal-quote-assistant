import { Building2, Plus, X } from 'lucide-react';
import type { AdditionalLocation, InspectionFrequency, Renewal } from '../types';
import { INSPECTION_FREQUENCIES } from '../types';
import { createId } from '../lib/model';
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
  const setAdditionalLocations = (
    change: (locations: AdditionalLocation[]) => AdditionalLocation[],
  ) =>
    update((current) => ({
      ...current,
      company: {
        ...current.company,
        additionalLocations: change(current.company.additionalLocations),
      },
    }));
  const patchAdditionalLocation = (id: string, values: Partial<AdditionalLocation>) =>
    setAdditionalLocations((locations) =>
      locations.map((location) => (location.id === id ? { ...location, ...values } : location)),
    );

  return (
    <SectionCard
      icon={<Building2 className="h-4 w-4" />}
      title="Company & location"
      description="Names exactly as they appear in Teams and D-Tools."
    >
      <div className="workspace-field-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Company name"
          required
          hint="Teams company name; used in the D-Tools project name and the SOW opening."
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
        <Field label="Inspection frequency" hint="For the D-Tools project name and email. The SOW uses its own Inspections included choice.">
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

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="label">Additional locations</span>
          <button
            type="button"
            className="btn-secondary btn-xs"
            onClick={() =>
              setAdditionalLocations((locations) => [
                ...locations,
                { id: createId(), locationName: '', siteAddress: '' },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add location
          </button>
        </div>
        <p className="hint mt-0.5">
          Multi-location proposals: listed under Location(s) Included in the SOW after the location above.
        </p>
        {company.additionalLocations.length > 0 ? (
          <div className="mt-2 space-y-2">
            {company.additionalLocations.map((location, index) => (
              <div
                key={location.id}
                className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
                  <TextInput
                    value={location.locationName}
                    onChange={(value) => patchAdditionalLocation(location.id, { locationName: value })}
                    placeholder="Location name"
                    ariaLabel={`Additional location ${index + 2} name`}
                  />
                  <TextInput
                    value={location.siteAddress}
                    onChange={(value) => patchAdditionalLocation(location.id, { siteAddress: value })}
                    placeholder="Full address with city, state and ZIP"
                    ariaLabel={`Additional location ${index + 2} full address`}
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost h-8 w-8 shrink-0 p-0"
                  onClick={() =>
                    setAdditionalLocations((locations) =>
                      locations.filter((entry) => entry.id !== location.id),
                    )
                  }
                  title="Remove this location"
                  aria-label={`Remove additional location ${index + 2}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
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
