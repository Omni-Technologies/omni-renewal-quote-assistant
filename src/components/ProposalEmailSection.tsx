import { useRef } from 'react';
import { ClipboardCopy, Mail } from 'lucide-react';
import type { Renewal } from '../types';
import { buildProposalEmail } from '../lib/proposalEmail';
import { Field, SectionCard } from './ui';

export function ProposalEmailSection({ renewal, update, notify }: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
}) {
  const email = buildProposalEmail(renewal.company);
  const subjectRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const patch = (values: Partial<Renewal['company']>) => update((current) => ({
    ...current, company: { ...current.company, ...values },
  }));

  async function copy(part: 'subject' | 'body') {
    try {
      await navigator.clipboard.writeText(email[part]);
      notify(`Email ${part === 'subject' ? 'subject' : 'body'} copied.`);
    } catch {
      const field = part === 'subject' ? subjectRef.current : bodyRef.current;
      field?.focus();
      field?.select();
      notify('Text selected — press Ctrl+C to copy, then paste into your email.', 'info');
    }
  }

  return (
    <SectionCard icon={<Mail className="h-4 w-4" />} title="Proposal email" description="Copy-ready subject and message from this renewal.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email system type" hint="Applies to the email template.">
          <select className="input" aria-label="Email system type" value={renewal.company.emailSystemType ?? 'Fire Alarm'}
            onChange={(event) => patch({ emailSystemType: event.target.value as Renewal['company']['emailSystemType'] })}>
            {['Fire Alarm', 'Intrusion', 'Nurse Call'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Email greeting">
          <select className="input" aria-label="Email greeting" value={renewal.company.emailGreeting ?? 'Good Day'}
            onChange={(event) => patch({ emailGreeting: event.target.value as Renewal['company']['emailGreeting'] })}>
            {['Good Day', 'Good morning', 'Good afternoon'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Email subject" hint={!email.canCopySubject ? 'Enter Location name, D-Tools project # and contract duration to copy.' : undefined}>
          <textarea ref={subjectRef} className="textarea" aria-label="Email subject" readOnly value={email.subject} rows={2} onFocus={(event) => event.currentTarget.select()} />
        </Field>
        <button type="button" className="btn-secondary" disabled={!email.canCopySubject} onClick={() => void copy('subject')}>
          <ClipboardCopy className="h-3.5 w-3.5" />Copy email subject
        </button>
        <Field label="Email message" hint={!email.canCopyBody ? 'Enter Location name, Full site address and contract duration to copy.' : undefined}>
          <textarea ref={bodyRef} className="textarea" aria-label="Email message" readOnly value={email.body} rows={7} onFocus={(event) => event.currentTarget.select()} />
        </Field>
        <button type="button" className="btn-secondary" disabled={!email.canCopyBody} onClick={() => void copy('body')}>
          <ClipboardCopy className="h-3.5 w-3.5" />Copy email
        </button>
      </div>
    </SectionCard>
  );
}
