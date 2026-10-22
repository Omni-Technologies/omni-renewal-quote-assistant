import type {
  DtoolsDataset,
  DtoolsProjectDecision,
  DtoolsRow,
  JobCostDataset,
  JobCostRecord,
  Renewal,
} from '../types';

/** True in the hosted build (Vite mode "cloud"): data lives in the shared D1 database. */
export const cloudMode = import.meta.env.MODE === 'cloud';
/** Where records are kept, for user-facing messages. */
export const storeName = cloudMode ? 'the online database' : 'this browser';

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method: init.method ?? 'GET',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    credentials: 'same-origin',
    redirect: 'manual',
  });
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
    throw new Error('Your sign-in has expired. Reload the page to sign in again; nothing was saved.');
  }
  if (!response.ok) {
    throw new Error(`The online database refused the request (${response.status}): ${await response.text()}`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const listCloudRenewals = () => api<Renewal[]>('renewals');
export const putCloudRenewal = (renewal: Renewal) =>
  api<void>(`renewals/${encodeURIComponent(renewal.id)}`, { method: 'PUT', body: renewal });
export const putCloudRenewals = (renewals: readonly Renewal[]) =>
  api<void>('renewals', { method: 'PUT', body: renewals });
export const deleteCloudRenewal = (id: string) =>
  api<void>(`renewals/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const listCloudDecisions = () => api<DtoolsProjectDecision[]>('decisions');
export const putCloudDecision = (decision: DtoolsProjectDecision) =>
  api<void>(`decisions/${encodeURIComponent(decision.key)}`, { method: 'PUT', body: decision });
export const deleteCloudDecision = (key: string) =>
  api<void>(`decisions/${encodeURIComponent(key)}`, { method: 'DELETE' });

export const getCloudTimesheets = () =>
  api<{ dataset: DtoolsDataset; items: DtoolsRow[] } | null>('history/dtools');
export const putCloudTimesheets = (dataset: DtoolsDataset, rows: readonly DtoolsRow[]) =>
  api<void>('history/dtools', { method: 'PUT', body: { dataset, items: rows } });
export const getCloudJobCost = () =>
  api<{ dataset: JobCostDataset; items: JobCostRecord[] } | null>('history/jobcost');
export const putCloudJobCost = (dataset: JobCostDataset, projects: readonly JobCostRecord[]) =>
  api<void>('history/jobcost', { method: 'PUT', body: { dataset, items: projects } });

export const restoreCloudBackup = <T>(backup: unknown) => api<T>('restore', { method: 'POST', body: backup });
