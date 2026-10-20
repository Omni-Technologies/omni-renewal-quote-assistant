import { useRef } from 'react';
import { ClipboardCopy } from 'lucide-react';
import type { Renewal } from '../types';
import { SectionCard } from './ui';

export function ProjectNameSection({
  renewal,
  notify,
}: {
  renewal: Renewal;
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
}) {
  const { companyName, inspectionFrequency, durationYears } = renewal.company;
  const name = companyName.trim().replace(/\s+/g, ' ');
  const projectName = name
    ? `I&T - FA ${name} ${inspectionFrequency} Fire Alarm Inspection ${durationYears} YR`
    : '';
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(projectName);
      notify('Project name copied — paste into D-Tools.');
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      notify('Select and copy the project name with Ctrl+C, then paste into D-Tools.', 'info');
    }
  }

  return (
    <SectionCard
      icon={<ClipboardCopy className="h-4 w-4" />}
      title="D-Tools project name"
      description="Uses company name, inspection frequency, and contract duration."
      actions={
        <button type="button" className="btn-secondary" disabled={!projectName} onClick={() => void copy()}>
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copy project name
        </button>
      }
    >
      <textarea
        ref={textRef}
        className="input resize-none"
        aria-label="D-Tools project name"
        value={projectName}
        placeholder="Enter Company name above to generate the project name."
        readOnly
        rows={2}
        onFocus={(event) => event.currentTarget.select()}
      />
    </SectionCard>
  );
}
