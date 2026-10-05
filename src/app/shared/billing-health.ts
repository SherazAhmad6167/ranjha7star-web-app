/*
 * Billing health: read-only checks over every customer's bills, credit and
 * advances. Each finding names the customer, the month and what looks wrong,
 * so it can be fixed before the customer is asked for the wrong amount.
 *
 * Nothing here writes - it only reads the data it is given.
 */

export type HealthSeverity = 'error' | 'warn' | 'info';

export type HealthCode =
  | 'duplicate_customer'
  | 'duplicate_bill'
  | 'advance_month_billed'
  | 'breakdown_mismatch'
  | 'own_part_off_fee'
  | 'open_balance_left_behind'
  | 'reverted_payment'
  | 'credit_no_source'
  | 'credit_used'
  | 'zero_bill_unpaid'
  | 'invalid_amount';

export interface HealthIssue {
  code: HealthCode;
  severity: HealthSeverity;
  user_id: string;
  internet_id: string;
  user_name: string;
  sublocality: string;
  month?: string;
  year?: string;
  bill_type?: string;
  message: string;
  /** Rupee amount the finding is about, for sorting. */
  amount?: number;
}

export const HEALTH_CHECKS: Record<HealthCode, { title: string; severity: HealthSeverity; help: string }> = {
  duplicate_customer: {
    title: 'Same ID on two customers',
    severity: 'error',
    help: 'Two or more customer records use one internet ID. Each record gets its own bill every month, so the customer can be billed twice.',
  },
  duplicate_bill: {
    title: 'Two bills for one month',
    severity: 'error',
    help: 'The customer has more than one bill of the same type for the same month.',
  },
  advance_month_billed: {
    title: 'Billed a month paid in advance',
    severity: 'error',
    help: 'An Advance Payment covers this month, but a bill was made for it too.',
  },
  breakdown_mismatch: {
    title: 'Total does not match its breakdown',
    severity: 'error',
    help: 'Fee + previous + charges − credit does not add up to the bill total. Something changed the total afterwards.',
  },
  own_part_off_fee: {
    title: 'Bill differs from package fee',
    severity: 'warn',
    help: "The month's own part (total minus previous balance) is not the package fee. Credit, installation charges or a fee change can cause this - check it is intended.",
  },
  open_balance_left_behind: {
    title: 'Unpaid month not moved forward',
    severity: 'warn',
    help: 'An older month still shows money owed although a newer bill exists. If the newer bill already includes it, the customer is asked twice - and the next bill run adds it again.',
  },
  reverted_payment: {
    title: 'Payment was reverted',
    severity: 'warn',
    help: "A payment on this bill was reverted. Reverts made before credit tracking left any extra paid on the customer's credit, which a later bill then took off.",
  },
  credit_no_source: {
    title: 'Credit with no record',
    severity: 'warn',
    help: 'The customer has credit (extra advance), but no payment or advance on record explains it.',
  },
  credit_used: {
    title: 'Credit taken off a bill',
    severity: 'info',
    help: 'Customer credit lowered this bill. Listed so it can be checked once.',
  },
  zero_bill_unpaid: {
    title: 'Rs. 0 bill marked unpaid',
    severity: 'info',
    help: 'The whole bill was covered by credit, so nothing is due, but it is still marked unpaid.',
  },
  invalid_amount: {
    title: 'Invalid amount',
    severity: 'error',
    help: 'The bill amount is negative or not a number.',
  },
};

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function period(bill: any): number {
  const month = MONTHS.indexOf(String(bill?.month || '').toLowerCase());
  return Number(bill?.year || 0) * 12 + Math.max(month, 0);
}

function label(bill: any): string {
  const m = String(bill?.month || '');
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${bill?.year || ''}`.trim();
}

function rs(n: number): string {
  return `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
}

function feeFor(user: any, type: string): number {
  return Number(type === 'cable' ? user?.cable_package_fee : user?.internet_package_fee) || 0;
}

function isCollected(bill: any): boolean {
  return Number(bill?.collected_amount) > 0;
}

/** What is still owed on a bill that was not moved to a later one. */
function openBalance(bill: any): number {
  if (bill?.carried_to) return 0;
  const owed =
    bill?.status === 'unpaid' ||
    (bill?.status === 'paid' && Number(bill?.remaining_amount) > 0);
  return owed ? Number(bill.remaining_amount ?? bill.amount ?? 0) || 0 : 0;
}

/** Runs every check. `users` are user docs with their id as `id`. */
export function checkBillingHealth(users: any[]): HealthIssue[] {
  const issues: HealthIssue[] = [...duplicateCustomers(users)];
  for (const user of users) issues.push(...checkUser(user));
  return issues;
}

function base(user: any, bill?: any) {
  return {
    user_id: user.id,
    internet_id: String(user.internet_id || ''),
    user_name: String(user.user_name || ''),
    sublocality: String(user.sublocality || ''),
    ...(bill
      ? { month: bill.month, year: String(bill.year ?? ''), bill_type: bill.type }
      : {}),
  };
}

function issue(code: HealthCode, fields: Omit<HealthIssue, 'code' | 'severity'>, severity?: HealthSeverity): HealthIssue {
  return { code, severity: severity ?? HEALTH_CHECKS[code].severity, ...fields };
}

function duplicateCustomers(users: any[]): HealthIssue[] {
  const byId = new Map<string, any[]>();
  for (const user of users) {
    const key = String(user.internet_id || '').trim().toLowerCase();
    if (!key) continue;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key)!.push(user);
  }

  const issues: HealthIssue[] = [];
  for (const group of byId.values()) {
    if (group.length < 2) continue;

    // Billed twice for the same month - not just a leftover record
    const billedMonths = new Map<string, number>();
    for (const user of group) {
      const seen = new Set<string>();
      for (const bill of user.bills || []) {
        const key = `${bill.type}|${bill.month}|${bill.year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        billedMonths.set(key, (billedMonths.get(key) || 0) + 1);
      }
    }
    const doubleBilled = [...billedMonths.values()].some((n) => n > 1);

    const records = group
      .map((u) => `"${u.user_name || '-'}" (${(u.bills || []).length} bills, fee ${rs(feeFor(u, 'internet'))})`)
      .join(', ');

    issues.push(
      issue(
        'duplicate_customer',
        {
          ...base(group[0]),
          message: `${group.length} records: ${records}.${doubleBilled ? ' Both were billed for the same month.' : ''}`,
        },
        doubleBilled ? 'error' : 'warn',
      ),
    );
  }
  return issues;
}

function checkUser(user: any): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const bills: any[] = (user.bills || []).filter((b: any) => b && typeof b === 'object');
  const credit = Number(user.extra_advance) || 0;
  const advances: any[] = user.advancePayments || [];

  // ── per bill ─────────────────────────────────
  const seen = new Map<string, number>();
  for (const bill of bills) {
    const amount = Number(bill.amount);

    if (!Number.isFinite(amount) || amount < 0) {
      issues.push(issue('invalid_amount', { ...base(user, bill), message: `${label(bill)} amount is "${bill.amount}".` }));
      continue;
    }

    const key = `${bill.type}|${bill.month}|${bill.year}`;
    seen.set(key, (seen.get(key) || 0) + 1);

    // Advance months
    const advance = advances.find((adv: any) =>
      (adv?.advance_months || adv?.months || []).some(
        (m: any) =>
          String(m?.month || '').toLowerCase() === String(bill.month || '').toLowerCase() &&
          String(m?.year) === String(bill.year),
      ),
    );
    if (advance) {
      const paidBy = `${rs(advance.advance_amount)} advance by ${advance.collected_by || '-'}`;
      issues.push(
        issue('advance_month_billed', {
          ...base(user, bill),
          amount,
          message:
            amount > 0
              ? `${label(bill)} was billed ${rs(amount)} (${bill.status}${isCollected(bill) ? `, ${rs(bill.collected_amount)} collected` : ''}), but it is paid in advance (${paidBy}).`
              : `${label(bill)} is paid in advance (${paidBy}), but a Rs. 0 bill was made for it - customer credit was probably used up on a month already paid.`,
        }),
      );
    }

    // Bills that record how they were made must still add up
    const open = bill.status === 'unpaid' && !isCollected(bill);
    if (open && bill.fee_amount !== undefined) {
      const expected = Math.max(
        0,
        (Number(bill.fee_amount) || 0) +
          (Number(bill.carried_in ?? bill.previous_remaining) || 0) +
          (Number(bill.charges_amount) || 0) -
          (Number(bill.credit_used) || 0),
      );
      if (expected !== amount) {
        issues.push(
          issue('breakdown_mismatch', {
            ...base(user, bill),
            amount: amount - expected,
            message: `${label(bill)} total is ${rs(amount)} but its breakdown adds up to ${rs(expected)}.`,
          }),
        );
      }
    }

    // Reverted payment: every collected field cleared, back to unpaid
    if (bill.status === 'unpaid' && 'collected_amount' in bill && bill.collected_amount === null) {
      issues.push(
        issue('reverted_payment', {
          ...base(user, bill),
          message: `A payment on ${label(bill)} was reverted.${credit > 0 ? ` Customer still has ${rs(credit)} credit.` : ''} If the customer had paid extra, check that the extra was not left on credit and taken off a later bill.`,
        }),
      );
    }

    if (Number(bill.credit_used) > 0 && open) {
      issues.push(
        issue('credit_used', {
          ...base(user, bill),
          amount: Number(bill.credit_used),
          message: `${rs(bill.credit_used)} credit was taken off ${label(bill)} (now ${rs(amount)}). Credit left: ${rs(credit)}.`,
        }),
      );
    }

    if (amount === 0 && bill.status === 'unpaid') {
      issues.push(
        issue('zero_bill_unpaid', {
          ...base(user, bill),
          message: `${label(bill)} is Rs. 0 and still marked unpaid.`,
        }),
      );
    }
  }

  for (const [key, count] of seen) {
    if (count < 2) continue;
    const [type, month, year] = key.split('|');
    issues.push(
      issue('duplicate_bill', {
        ...base(user, { type, month, year }),
        message: `${count} ${type} bills for ${label({ month, year })}.`,
      }),
    );
  }

  // ── per bill type, in month order ────────────
  for (const type of ['internet', 'cable']) {
    const ofType = bills
      .filter((b) => b.type === type && Number.isFinite(Number(b.amount)))
      .sort((a, b) => period(a) - period(b));
    if (!ofType.length) continue;

    // An owed month left behind while a newer bill exists
    for (let i = 0; i < ofType.length - 1; i++) {
      const prev = ofType[i];
      const balance = openBalance(prev);
      if (balance <= 0) continue;

      const next = ofType[i + 1];
      const fee = feeFor(user, type);
      const included = Number(next.amount) === fee + balance;
      issues.push(
        issue(
          'open_balance_left_behind',
          {
            ...base(user, prev),
            amount: balance,
            message: included
              ? `${rs(balance)} from ${label(prev)} is already inside ${label(next)} (${rs(next.amount)}) but not linked to it. Opening Collections links it automatically.`
              : `${rs(balance)} from ${label(prev)} is still open and ${label(next)} (${rs(next.amount)}) does not show it as included. Check whether the customer is being asked for it twice.`,
          },
          included ? 'info' : 'warn',
        ),
      );
    }

    // The latest bill's own part vs the fee - older bills that don't record a breakdown
    const latest = ofType[ofType.length - 1];
    const fee = feeFor(user, type);
    if (
      latest.fee_amount === undefined &&
      latest.status === 'unpaid' &&
      !isCollected(latest) &&
      !latest.carried_to &&
      fee > 0 &&
      Number(latest.amount) > 0
    ) {
      const own = Number(latest.amount) - (Number(latest.previous_remaining) || 0);
      const gap = own - fee;
      if (gap !== 0) {
        issues.push(
          issue('own_part_off_fee', {
            ...base(user, latest),
            amount: gap,
            message: `${label(latest)} is ${rs(latest.amount)}${latest.previous_remaining ? ` (${rs(latest.previous_remaining)} previous)` : ''}, so the month itself is ${rs(own)} - the fee is ${rs(fee)} (${gap < 0 ? `${rs(-gap)} less` : `${rs(gap)} more`}).`,
          }),
        );
      }
    }
  }

  // ── credit ───────────────────────────────────
  if (credit > 0) {
    const explained =
      advances.length > 0 || bills.some((b) => Number(b.extra_amount) > 0);
    if (!explained) {
      issues.push(
        issue('credit_no_source', {
          ...base(user),
          amount: credit,
          message: `${rs(credit)} credit, but no overpayment or advance on record explains it.`,
        }),
      );
    }
  }

  return issues;
}
