import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Check,
  Info,
  X,
} from 'lucide-react';
import type { RenewalStatus } from '../types';

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
/* -------------------------------------------------------------------------- */
/* Form primitives                                                            */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="label">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : hint ? (
        <span className="hint mt-1 block">{hint}</span>
      ) : null}
    </label>
  );
}

export function Group({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className="mt-1">{children}</div>
      {hint ? <div className="hint mt-1">{hint}</div> : null}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  className,
  prefix,
  suffix,
  ariaLabel,
  disabled,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  const display = focused ? text : value === null ? '' : String(value);

  function commit(raw: string) {
    setText(raw);
    if (raw.trim() === '') {
      onChange(null);
      return;
    }
    if (!/^-?\d*\.?\d*$/.test(raw.trim())) {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) ||
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max)) {
      onChange(null);
      return;
    }
    onChange(parsed);
  }

  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-400">
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode={step && !Number.isInteger(step) ? 'decimal' : 'numeric'}
        className={cx(
          'input tabular-nums',
          prefix && 'pl-6',
          suffix && 'pr-7',
          className,
        )}
        value={display}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        onFocus={() => {
          setText(value === null ? '' : String(value));
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          if (text.trim() === '') {
            setText('');
            onChange(null);
            return;
          }
          if (!/^-?\d*\.?\d*$/.test(text.trim()) || !Number.isFinite(Number(text))) {
            setText(value === null ? '' : String(value));
          } else {
            setText(String(Number(text)));
          }
        }}
        onChange={(event) => commit(event.target.value)}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] font-medium text-slate-400">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      className={cx('input', className)}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <textarea
      className={cx('textarea', className)}
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950/60',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cx(
              'min-w-0 rounded-md px-2.5 py-1 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function YesNo({
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
  ariaLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <Segmented
      ariaLabel={ariaLabel}
      value={value ? 'yes' : 'no'}
      options={[
        { value: 'no', label: noLabel },
        { value: 'yes', label: yesLabel },
      ]}
      onChange={(next) => onChange(next === 'yes')}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'switch-track',
        checked
          ? 'bg-brand-600 dark:bg-brand-500'
          : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span
        className={cx(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout / feedback                                                          */
/* -------------------------------------------------------------------------- */

export function SectionCard({
  id,
  icon,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx('card scroll-mt-4', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="text-slate-400 dark:text-slate-500">{icon}</span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {description ? (
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Banner({
  severity = 'warning',
  children,
  action,
}: {
  severity?: 'warning' | 'info' | 'danger' | 'success';
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    warning:
      'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    info: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200',
    danger:
      'border-red-300/70 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
    success:
      'border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  }[severity];
  const Icon =
    severity === 'danger' || severity === 'warning'
      ? AlertTriangle
      : severity === 'success'
        ? Check
        : Info;

  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug',
        styles,
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <div className="min-w-0 flex-1 font-medium">{children}</div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<RenewalStatus, string> = {
  Draft:
    'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  'Ready for Julie Review':
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  'Sent To Mike For Review First':
    'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
  'Changes Requested':
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  Approved:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  Completed:
    'bg-slate-800 text-slate-100 ring-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:ring-slate-300',
};

export function StatusBadge({
  status,
  className,
}: {
  status: RenewalStatus;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        STATUS_STYLES[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog + toast                                                             */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card relative w-full max-w-md shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2
            id={titleId}
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
          <button
            type="button"
            className="btn-ghost -mr-1 -mt-1 h-7 w-7 p-0"
            onClick={onCancel}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-[13px] text-slate-600 dark:text-slate-300">
          {description ? <div>{description}</div> : null}
          {children}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            disabled={confirmDisabled}
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone = 'success',
  onClose,
}: {
  message: string;
  tone?: 'success' | 'danger' | 'info';
  onClose?: () => void;
}) {
  const icon =
    tone === 'success' ? (
      <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
    ) : tone === 'danger' ? (
      <AlertTriangle className="h-4 w-4 text-red-500" />
    ) : (
      <Info className="h-4 w-4 text-brand-500" />
    );
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] font-medium text-slate-700 shadow-pop dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    >
      {icon}
      <span>{message}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
