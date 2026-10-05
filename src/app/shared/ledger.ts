import {
  collection,
  doc,
  Firestore,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { APP_VERSION } from './app-version';

/*
 * Money history. Every change to a bill, a payment or a customer's credit
 * (extra_advance) also adds one entry to the `ledger` collection, so any
 * amount can be traced back to who did what, when, and from which build.
 *
 * Entries are only ever added - a mistake is fixed by a newer entry, never by
 * editing an old one. Recording is fire-and-forget: it never blocks or fails
 * the change it describes (offline it queues like every other write).
 */

export const LEDGER_COLLECTION = 'ledger';

export type LedgerType =
  | 'bill_created'
  | 'payment'
  | 'payment_reverted'
  | 'advance'
  | 'advance_reverted'
  | 'bill_edited'
  | 'bills_deleted';

export interface LedgerEntry {
  type: LedgerType;
  /** users doc id */
  user_id: string;
  internet_id?: string;
  user_name?: string;
  bill_id?: string | null;
  bill_type?: string | null;
  month?: string | null;
  year?: string | null;
  /** Money this event is about: amount received, bill total, ... */
  amount: number;
  /** Customer credit (extra_advance) around this event, when it touched it. */
  credit_before?: number;
  credit_after?: number;
  /** Things that need a second look, e.g. 'credit_already_used'. */
  flags?: string[];
  note?: string;
  details?: Record<string, unknown>;
}

export const LEDGER_LABELS: Record<LedgerType, string> = {
  bill_created: 'Bill created',
  payment: 'Payment',
  payment_reverted: 'Payment reverted',
  advance: 'Advance',
  advance_reverted: 'Advance reverted',
  bill_edited: 'Bill edited',
  bills_deleted: 'Bill deleted',
};

export const LEDGER_FLAG_LABELS: Record<string, string> = {
  credit_already_used:
    'Part of the extra paid was already used on a later bill - that bill still has it taken off',
  credit_source_unknown:
    'Advance made before credit was tracked - check the customer credit by hand',
  credit_restored: 'Credit this bill had used was given back',
};

/** Records entries in the background. Never throws, never waits. */
export function recordLedger(
  firestore: Firestore,
  entries: LedgerEntry | LedgerEntry[] | null | undefined,
): void {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(
    (e): e is LedgerEntry => !!e,
  );
  if (!list.length) return;

  try {
    const stamp = {
      by: localStorage.getItem('username') || '',
      role: localStorage.getItem('role') || '',
      at: new Date(),
      app_version: APP_VERSION,
      offline: !navigator.onLine,
    };

    // a batch takes 500 writes
    for (let i = 0; i < list.length; i += 450) {
      const batch = writeBatch(firestore);
      for (const entry of list.slice(i, i + 450)) {
        batch.set(
          doc(collection(firestore, LEDGER_COLLECTION)),
          clean({ ...entry, ...stamp }),
        );
      }
      batch.commit().catch((err) => console.error('Ledger write failed', err));
    }
  } catch (err) {
    console.error('Ledger entry not recorded', err);
  }
}

/** A customer's history, newest first. */
export async function loadLedger(firestore: Firestore, userId: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(firestore, LEDGER_COLLECTION), where('user_id', '==', userId)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .sort((a, b) => toMillis(b.at) - toMillis(a.at));
}

/** When history was last recorded, from any device - null if never. */
export async function lastLedgerEntryAt(firestore: Firestore): Promise<Date | null> {
  const snap = await getDocs(
    query(collection(firestore, LEDGER_COLLECTION), orderBy('at', 'desc'), limit(1)),
  );
  const at = snap.docs[0]?.data()?.['at'];
  return at ? new Date(toMillis(at)) : null;
}

/** The fields of a bill worth keeping in history. */
export function billSnapshot(bill: any): Record<string, unknown> {
  if (!bill) return {};
  const keep = [
    'bill_id', 'type', 'month', 'year', 'amount', 'remaining_amount', 'status',
    'collected_amount', 'collected_by', 'collected_date', 'collected_method',
    'collected_bank', 'collected_id', 'extra_amount', 'previous_remaining',
    'previous_remaining_month', 'fee_amount', 'carried_in', 'charges_amount',
    'credit_used', 'carried_to', 'carried_amount', 'settled_with',
  ];
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    if (bill[key] !== undefined) out[key] = bill[key];
  }
  return out;
}

export function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Firestore rejects undefined - drop it, keep Dates and Timestamps as they are. */
function clean(value: any): any {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map(clean);
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v !== undefined) out[key] = clean(v);
    }
    return out;
  }
  return typeof value === 'number' && Number.isNaN(value) ? null : value;
}
