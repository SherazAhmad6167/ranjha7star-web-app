import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { carriedToLabel, isCarried } from '../../shared/bill-carry';
import {
  LEDGER_FLAG_LABELS,
  LEDGER_LABELS,
  LedgerType,
  loadLedger,
  toMillis,
} from '../../shared/ledger';
import { LoaderComponent } from '../../shared/loader/loader.component';

type BillState = 'paid' | 'partial' | 'unpaid' | 'carried' | 'credit';

/** One bill, worked out once for the template. */
interface BillView {
  key: string;
  label: string;
  type: string;
  amount: number;
  state: BillState;
  stateLabel: string;
  /** Where a carried balance went, or that a payment was reverted. */
  notes: string[];
  /** "4000 fee + 4000 previous − 1000 credit" - bills that recorded it. */
  breakdown: string;
  due: number;
  collected: number;
  extra: number;
  method: string;
  by: string;
  date: Date | null;
}

interface AdvanceView {
  key: string;
  months: string;
  amount: number;
  toCredit: number;
  method: string;
  by: string;
  date: Date | null;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const STATE_LABELS: Record<BillState, string> = {
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
  carried: 'Carried',
  credit: 'Covered by credit',
};

const HISTORY_ICONS: Record<LedgerType, { icon: string; tone: string }> = {
  bill_created: { icon: 'ri-file-add-line', tone: 'indigo' },
  payment: { icon: 'ri-hand-coin-line', tone: 'green' },
  payment_reverted: { icon: 'ri-arrow-go-back-line', tone: 'red' },
  advance: { icon: 'ri-calendar-check-line', tone: 'blue' },
  advance_reverted: { icon: 'ri-arrow-go-back-line', tone: 'red' },
  bill_edited: { icon: 'ri-edit-2-line', tone: 'amber' },
  bills_deleted: { icon: 'ri-delete-bin-line', tone: 'red' },
};

@Component({
  selector: 'app-user-collection-modal',
  imports: [CommonModule, LoaderComponent],
  templateUrl: './user-collection-modal.component.html',
  styleUrl: './user-collection-modal.component.scss'
})
export class UserCollectionModalComponent {
  @Input() docId!: string;
  user: any = null;
  isLoading = false;

  bills: BillView[] = [];
  advances: AdvanceView[] = [];
  totals = { due: 0, collected: 0, monthlyFee: 0 };

  /** Money history from the ledger, newest first. */
  history: any[] = [];
  historyLoading = false;
  historyError = false;

  constructor(public activeModal: NgbActiveModal, private firestore: Firestore) {}

  get credit(): number {
    return Number(this.user?.extra_advance) || 0;
  }

  get initial(): string {
    return String(this.user?.user_name || '?').replace(/^[\d\s.\-]+/, '').charAt(0).toUpperCase() || '?';
  }

  /** The customer's number: mobile_no first; phone_no is often '0' or "03… - 0". */
  get phone(): string {
    for (const value of [this.user?.mobile_no, this.user?.phone_no]) {
      const number = String(value ?? '').split(' - ')[0].trim();
      if (number.replace(/\D/g, '').length >= 10) return number;
    }
    return '';
  }

  get packageLabel(): string {
    const parts = [this.user?.select_package, this.user?.pkg_cable].filter(Boolean);
    return parts.join(' + ').toUpperCase();
  }

  /**
   * Imported records hold free text here, and 2000-01-01 is the import's
   * "unknown" placeholder - only a real date is shown (the date pipe throws
   * on text it can't read).
   */
  get installedOn(): Date | null {
    const date = new Date(this.user?.installation_date || '');
    return Number.isNaN(date.getTime()) || date.getFullYear() <= 2000 ? null : date;
  }

  get isInactive(): boolean {
    return this.user?.customer_status === 'inactive';
  }

  trackByKey = (_: number, item: { key: string }) => item.key;

  async ngOnInit() {
    if (!this.docId) return;
    this.isLoading = true;
    this.loadHistory();

    try {
      const userRef = doc(this.firestore, 'users', this.docId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        this.user = userSnap.data();
        this.buildView();
      } else {
        this.user = null;
        console.error('User not found:', this.docId);
      }
    } catch (err) {
      console.error('Error fetching user details', err);
    } finally {
      this.isLoading = false;
    }
  }

  private buildView() {
    const bills: any[] = (this.user?.bills || []).filter((b: any) => b && typeof b === 'object');

    this.bills = bills
      .map((bill, i) => this.billView(bill, i))
      .sort((a, b) => this.period(b) - this.period(a) || a.type.localeCompare(b.type));

    this.advances = (this.user?.advancePayments || [])
      .filter((adv: any) => adv?.isAdvance)
      .map((adv: any, i: number): AdvanceView => ({
        key: adv.advance_id || String(i),
        months: this.getAdvanceMonthsString(adv),
        amount: Number(adv.paid_amount ?? adv.advance_amount) || 0,
        toCredit: Number(adv.extra_added) || 0,
        method: adv.collected_method || '',
        by: adv.collected_by || '',
        date: this.toDate(adv.collected_date),
      }))
      .sort((a: AdvanceView, b: AdvanceView) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    this.totals = {
      due: this.bills.reduce((sum, b) => sum + b.due, 0),
      collected:
        this.bills.reduce((sum, b) => sum + b.collected + b.extra, 0) +
        this.advances.reduce((sum, a) => sum + a.amount, 0),
      monthlyFee:
        (Number(this.user?.internet_package_fee) || 0) + (Number(this.user?.cable_package_fee) || 0),
    };
  }

  private billView(bill: any, index: number): BillView {
    const amount = Number(bill.amount) || 0;
    const remaining = Number(bill.remaining_amount ?? amount) || 0;
    const notes: string[] = [];

    let state: BillState;
    if (isCarried(bill) && bill.status !== 'paid') {
      state = 'carried';
      notes.push(`Added to ${carriedToLabel(bill)} bill`);
    } else if (bill.status === 'paid' && remaining > 0) {
      state = 'partial';
    } else if (bill.status === 'paid') {
      state = 'paid';
      if (bill.settled_with) notes.push(`Paid with ${carriedToLabel(bill)} bill`);
    } else if (amount === 0) {
      state = 'credit';
    } else {
      state = 'unpaid';
    }

    // Revert clears every collected field back to null
    if (bill.status === 'unpaid' && 'collected_amount' in bill && bill.collected_amount === null) {
      notes.push('A payment on this bill was reverted');
    }

    const due =
      state === 'carried' || state === 'paid' || state === 'credit'
        ? 0
        : state === 'partial'
          ? remaining
          : remaining || amount;

    return {
      key: bill.bill_id || `${bill.month}-${bill.year}-${bill.type}-${index}`,
      label: this.monthLabel(bill.month, bill.year),
      type: String(bill.type || ''),
      amount,
      state,
      stateLabel: STATE_LABELS[state],
      notes,
      breakdown: this.breakdown(bill),
      due,
      collected: Number(bill.collected_amount) || 0,
      extra: Number(bill.extra_amount) || 0,
      method: bill.collected_method || '',
      by: bill.collected_by || '',
      date: this.toDate(bill.collected_date),
    };
  }

  /** "4000 fee + 4000 previous − 1000 credit" for bills that recorded it. */
  private breakdown(bill: any): string {
    if (bill?.fee_amount === undefined) return '';
    const parts = [`${bill.fee_amount} fee`];
    const previous = Number(bill.carried_in ?? bill.previous_remaining) || 0;
    if (previous) parts.push(`+ ${previous} previous`);
    if (Number(bill.charges_amount)) parts.push(`+ ${bill.charges_amount} charges`);
    if (Number(bill.credit_used)) parts.push(`− ${bill.credit_used} credit`);
    return parts.length > 1 ? parts.join(' ') : '';
  }

  private period(view: BillView): number {
    const [month, year] = view.label.toLowerCase().split(' ');
    return Number(year || 0) * 12 + Math.max(MONTHS.indexOf(month), 0);
  }

  private monthLabel(month: any, year: any): string {
    return `${this.titleCase(String(month || ''))} ${year || ''}`.trim();
  }

  private toDate(value: any): Date | null {
    const ms = toMillis(value);
    return ms ? new Date(ms) : null;
  }

  // ── History ─────────────────────────────────

  historyLabel(type: LedgerType): string {
    return LEDGER_LABELS[type] || type;
  }

  historyIcon(type: LedgerType): string {
    return HISTORY_ICONS[type]?.icon || 'ri-record-circle-line';
  }

  historyTone(type: LedgerType): string {
    return HISTORY_ICONS[type]?.tone || 'slate';
  }

  flagLabel(flag: string): string {
    return LEDGER_FLAG_LABELS[flag] || flag;
  }

  historyDate(entry: any): Date | null {
    return this.toDate(entry?.at);
  }

  creditChanged(entry: any): boolean {
    return (
      entry?.credit_before !== undefined &&
      entry?.credit_after !== undefined &&
      entry.credit_before !== entry.credit_after
    );
  }

  private async loadHistory() {
    this.historyLoading = true;
    try {
      this.history = await loadLedger(this.firestore, this.docId);
      this.historyError = false;
    } catch (err) {
      console.error('Could not load history', err);
      this.historyError = true;
    } finally {
      this.historyLoading = false;
    }
  }

  getAdvanceMonthsString(adv: any) {
    if (!adv.advance_months) return '';
    return adv.advance_months
      .map((m: any) => `${this.titleCase(m.month)} ${m.year}`)
      .join(', ');
  }

  // simple titleCase helper
  titleCase(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}
