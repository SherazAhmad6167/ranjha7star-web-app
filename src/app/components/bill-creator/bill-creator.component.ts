import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  Firestore,
  getDoc,
  getDocs,
  updateDoc,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../shared/toast/toast.service';
import {
  isCarried,
  linkUntrackedCarries,
  markCarried,
  releaseCarried,
  settleCarried,
} from '../../shared/bill-carry';
import { LoaderComponent } from '../../shared/loader/loader.component';

/** A user with no bill for the chosen month (see findMissingUsers). */
interface MissedUser {
  id: string;
  user_name: string;
  internet_id: string;
  sublocality: string;
  connection_type: string;
  /** Bill types still missing for the month. */
  types: ('cable' | 'internet')[];
  /** Package fee of those types - the bill also adds any balance / pending amounts. */
  fee: number;
}

@Component({
  selector: 'app-bill-creator',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchSelectComponent, LoaderComponent],
  templateUrl: './bill-creator.component.html',
  styleUrl: './bill-creator.component.scss',
})
export class BillCreatorComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  bills: any[] = [];
  filteredBills: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  internetAreas: any[] = [];
  sublocality: string = '';
  connection_type: string = '';
  selectedMonth: string = '';
  selectedYear: string = '';
  userName: string | null = '';
  overlayMessage = 'Loading bills...';

  months = [
    { value: 'january', label: 'January' },
    { value: 'february', label: 'February' },
    { value: 'march', label: 'March' },
    { value: 'april', label: 'April' },
    { value: 'may', label: 'May' },
    { value: 'june', label: 'June' },
    { value: 'july', label: 'July' },
    { value: 'august', label: 'August' },
    { value: 'september', label: 'September' },
    { value: 'october', label: 'October' },
    { value: 'november', label: 'November' },
    { value: 'december', label: 'December' },
  ];
  years: string[] = [];

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastService,
  ) {}

  ngOnInit(): void {
    this.userName = localStorage.getItem('username');
    this.buildYears();
    const now = new Date();
    this.missMonth = this.months[now.getMonth()].value;
    this.missYear = String(now.getFullYear());
    this.loadInternetAreas();
    this.loadBills();
  }

  buildYears() {
    const now = new Date().getFullYear();
    this.years = [];
    for (let y = now - 3; y <= now + 2; y++) this.years.push(String(y));
  }

  // ── Header stats ──────────────────────────────
  get totalUsersBilled(): number {
    return this.bills.reduce((sum, b) => sum + (Number(b.users) || 0), 0);
  }

  get totalAmountBilled(): number {
    return this.bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }

  // ── Display helpers ───────────────────────────
  get canCreate(): boolean {
    return !!(
      this.selectedMonth &&
      this.selectedYear &&
      this.connection_type &&
      this.sublocality
    );
  }

  connectionLabel(type: string): string {
    if (type === 'tv_cable') return 'Cable';
    if (type === 'internet') return 'Internet';
    if (type === 'both') return 'Both';
    if (type === 'mixed') return 'Mixed';
    return type || '—';
  }

  connectionClass(type: string): string {
    if (type === 'tv_cable') return 'conn-cable';
    if (type === 'internet') return 'conn-internet';
    if (type === 'both') return 'conn-both';
    return '';
  }

  areaLabel(area: string): string {
    return area === 'all' ? 'All Areas' : area;
  }

  monthLabel(value: string): string {
    return this.months.find((m) => m.value === value)?.label || value;
  }

  resetFilters() {
    this.selectedMonth = '';
    this.selectedYear = '';
    this.connection_type = '';
    this.sublocality = '';
  }

  async loadInternetAreas() {
    try {
      const ref = doc(this.firestore, 'internetArea', 'internetAreaDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.internetAreas = snap.data()?.['internetAreas'] || [];

        this.internetAreas.sort((a: any, b: any) => {
          return a.sublocality.localeCompare(b.sublocality);
        });
      }
    } catch (error) {
      console.error('Error loading internet areas', error);
    }
  }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredBills.slice(start, end);
  }

  async loadBills() {
    this.isLoading = true;
    this.overlayMessage = 'Loading bills...';

    try {
      const billsRef = collection(this.firestore, 'billCreator');
      const snapshot = await getDocs(billsRef);

      this.bills = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      this.bills.sort((a, b) => {
        // Firestore Timestamp
        const timeA = a.createdAt?.toDate
          ? a.createdAt.toDate().getTime()
          : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toDate
          ? b.createdAt.toDate().getTime()
          : new Date(b.createdAt).getTime();
        return timeB - timeA; // descending
      });

      this.filteredBills = this.bills;
      this.updateTotalPages();

      console.log('Fetched bills:', this.bills);
    } catch (error) {
      console.error('Error fetching bills:', error);
      this.toastr.error('Failed to load Bills');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredBills = this.bills.filter(
      (bill) =>
        bill.month?.toLowerCase().includes(term) ||
        String(bill.year ?? '').toLowerCase().includes(term) ||
        bill.sublocality?.toLowerCase().includes(term) ||
        bill.connection_type?.toLowerCase().includes(term) ||
        bill.created_by?.toLowerCase().includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
  }

  updateTotalPages() {
    this.totalPages = Math.ceil(this.filteredBills.length / this.pageSize) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  goToPage(page: number) {
    this.currentPage = page;
  }

  async createBill() {
    if (
      !this.selectedMonth ||
      !this.selectedYear ||
      !this.connection_type ||
      !this.sublocality
    ) {
      this.toastr.error('Please select all filters');
      return;
    }

    await this.checkDuplicateBill();
  }

  async checkDuplicateBill() {
    const billsRef = collection(this.firestore, 'billCreator');
    const snap = await getDocs(billsRef);

    // Missed-user runs bill a few people, so they don't count as the area's run.
    const exists = snap.docs.some(
      (d) =>
        d.data()['kind'] !== 'missing' &&
        d.data()['month'] === this.selectedMonth &&
        d.data()['year'] === this.selectedYear &&
        d.data()['connection_type'] === this.connection_type &&
        d.data()['sublocality'] === this.sublocality,
    );

    if (exists) {
      this.toastr.error('Bill already created for this Month & Year');
      return;
    }

    await this.createBillForUsers();
  }

  async createBillForUsers() {
    this.isLoading = true;
    this.overlayMessage = 'Creating bills, please wait...';

    try {
      const usersSnap = await getDocs(collection(this.firestore, 'users'));

      const matchingUsers = usersSnap.docs.filter((docSnap) => {
        const u = docSnap.data();
        return (
          u['connection_type'] === this.connection_type &&
          (this.sublocality === 'all' || u['sublocality'] === this.sublocality)
        );
      });

      // Only an explicit "inactive" is skipped - older records have no
      // customer_status at all and must keep getting billed.
      const eligibleUsers = matchingUsers.filter(
        (docSnap) => docSnap.data()['customer_status'] !== 'inactive',
      );
      const skippedInactive = matchingUsers.length - eligibleUsers.length;

      if (!eligibleUsers.length) {
        this.toastr.warning(
          skippedInactive ? 'No active users found' : 'No users found',
        );
        return;
      }

      const totalAmount = await this.updateUsersBills(eligibleUsers);

      await this.createBillCreatorDoc(eligibleUsers.length, totalAmount);

      this.toastr.success('Bill created successfully');
      if (skippedInactive) {
        this.toastr.info(`${skippedInactive} inactive customer(s) skipped`);
      }
      this.loadBills();
    } catch (e) {
      console.error(e);
      this.toastr.error('Bill creation failed');
    } finally {
      this.isLoading = false;
    }
  }

  remainingExtraAdvance: any;
  applyExtraAdvance(amount: number) {
    if (!this.remainingExtraAdvance || this.remainingExtraAdvance <= 0)
      return amount;

    if (this.remainingExtraAdvance >= amount) {
      this.remainingExtraAdvance -= amount;
      return 0;
    } else {
      const finalAmount = amount - this.remainingExtraAdvance;
      this.remainingExtraAdvance = 0;
      return finalAmount;
    }
  }

  async updateUsersBills(users: any[]) {
    let totalAmount = 0;

    for (const u of users) {
      const added = await this.addUserBills(u.id, {
        month: this.selectedMonth,
        year: this.selectedYear,
        connectionType: this.connection_type,
        sublocality: this.sublocality,
      });
      totalAmount += added.reduce((sum, b) => sum + b.amount, 0);
    }

    return totalAmount;
  }

  /**
   * Adds one user's bills for `month` / `year`: the package fee plus the
   * previous balance and any pending installation / other amount, less extra
   * advance. Used by bill runs and by missed users, so both bill the same way.
   * Returns the bills added - none for a type already billed that month.
   */
  private async addUserBills(
    userId: string,
    period: { month: string; year: string; connectionType: string; sublocality: string },
  ): Promise<any[]> {
    const { month, year, connectionType, sublocality } = period;
    const added: any[] = [];

    const ref = doc(this.firestore, 'users', userId);
    const snap = await getDoc(ref);

    const userData = snap.data();
    let bills = userData?.['bills'] || [];
    const advancePayments = userData?.['advancePayments'] || [];
    const installationAmount = Number(userData?.['installation_amount'] || 0);
    const otherAmount = Number(userData?.['other_amount'] || 0);
    const extraAdvance = Number(userData?.['extra_advance'] || 0);
    let remainingExtraAdvance = extraAdvance;

    const extraAmount = installationAmount + otherAmount;

    // ================= CABLE =================
    if (
      (connectionType === 'tv_cable' || connectionType === 'both') &&
      userData?.['cable_package_fee']
    ) {
      if (!this.isBilled(bills, month, year, 'cable') && !this.hasAdvanceForMonth(advancePayments, month, year)) {
        let amount = Number(userData['cable_package_fee']);
        const prevBill = this.findPreviousOwedBill(bills, 'cable');
        const prevRemaining = this.getPreviousMonthRemaining(bills, month, year, 'cable');
        amount += prevRemaining;
        amount += extraAmount;

        if (remainingExtraAdvance > 0) {
          if (remainingExtraAdvance >= amount) {
            remainingExtraAdvance -= amount;
            amount = 0;
          } else {
            amount -= remainingExtraAdvance;
            remainingExtraAdvance = 0;
          }
        }

        const bill: any = {
          bill_id: crypto.randomUUID(),
          month,
          year,
          type: 'cable',
          amount,
          status: 'unpaid',
          remaining_amount: amount,
          createdAt: new Date(),
        };
        this.linkCarriedBalance(bills, prevBill, bill, prevRemaining);
        bills.push(bill);
        added.push(bill);
      }
    }

    // ================= INTERNET =================
    if (
      (connectionType === 'internet' || connectionType === 'both') &&
      userData?.['internet_package_fee']
    ) {
      if (!this.isBilled(bills, month, year, 'internet') && !this.hasAdvanceForMonth(advancePayments, month, year)) {
        let amount = Number(userData['internet_package_fee']);

        const prevBill = this.findPreviousOwedBill(bills, 'internet');
        const prevRemaining = this.getPreviousMonthRemaining(bills, month, year, 'internet');
        amount += prevRemaining;
        amount += extraAmount;

        if (remainingExtraAdvance > 0) {
          if (remainingExtraAdvance >= amount) {
            remainingExtraAdvance -= amount;
            amount = 0;
          } else {
            amount -= remainingExtraAdvance;
            remainingExtraAdvance = 0;
          }
        }

        const bill: any = {
          bill_id: crypto.randomUUID(),
          month,
          year,
          type: 'internet',
          amount,
          sublocality,
          status: 'unpaid',
          remaining_amount: amount,
          createdAt: new Date(),
        };
        this.linkCarriedBalance(bills, prevBill, bill, prevRemaining);
        bills.push(bill);
        added.push(bill);
      }
    }

    const updatePayload: any = {
      bills,
      installation_amount: 0,
      other_amount: 0,
    };

    // ✅ remove or update extra advance
    if (remainingExtraAdvance > 0) {
      updatePayload.extra_advance = remainingExtraAdvance;
    } else {
      updatePayload.extra_advance = deleteField();
    }

    await updateDoc(ref, updatePayload);

    return added;
  }

  private isBilled(bills: any[], month: string, year: string, type: string): boolean {
    return bills.some((b: any) => b.month === month && b.year === year && b.type === type);
  }

  private hasAdvanceForMonth(advancePayments: any[], month: string, year: string): boolean {
    return advancePayments.some((adv: any) =>
      adv.months?.some(
        (m: any) => m.month.toLowerCase() === month.toLowerCase() && m.year === year,
      ),
    );
  }

  /**
   * Missed-users list only: true when an Advance Payment (saved by
   * Collections as `advance_months`) covers the month, so the user is not
   * listed. Bill runs keep their own check above.
   */
  private paidInAdvance(advancePayments: any[], month: string, year: string): boolean {
    return advancePayments.some((adv: any) =>
      (adv.advance_months || []).some(
        (m: any) =>
          String(m?.month || '').toLowerCase() === month.toLowerCase() &&
          String(m?.year) === String(year),
      ),
    );
  }

  async createBillCreatorDoc(totalUsers: number, totalAmount: number) {
    await addDoc(collection(this.firestore, 'billCreator'), {
      month: this.selectedMonth,
      year: this.selectedYear,
      connection_type: this.connection_type,
      sublocality: this.sublocality,
      amount: totalAmount,
      users: totalUsers,

      status: 'unpaid',
      createdAt: new Date(),
      created_by: this.userName || 'Unknown',
    });
  }

  getPreviousMonthRemaining(
    bills: any[],
    month: string,
    year: string,
    type: string,
  ) {
    const prevBill = this.findPreviousOwedBill(bills, type);

    if (!prevBill) return 0;

    // unpaid me remaining_amount nahi hota
    return Number(prevBill.remaining_amount ?? prevBill.amount ?? 0);
  }

  /** The owed bill whose balance rolls into the next one - never one already carried forward. */
  private findPreviousOwedBill(bills: any[], type: string): any {
    return bills.find(
      (b: any) =>
        b.type === type &&
        !isCarried(b) &&
        // case 1: unpaid bill → amount = remaining
        (b.status === 'unpaid' ||
          // case 2: paid but partial remaining
          (b.status === 'paid' && Number(b.remaining_amount) > 0)),
    );
  }

  /**
   * Ties the previous bill to the new one that now includes its balance, so
   * paying the new bill closes it too (see shared/bill-carry).
   */
  private linkCarriedBalance(bills: any[], prevBill: any, bill: any, prevRemaining: number) {
    if (!prevBill || !(prevRemaining > 0)) return;

    markCarried(prevBill, bill, prevRemaining);

    // Extra advance already covered the whole bill, balance included
    if (!(Number(bill.amount) > 0)) {
      settleCarried(bills, bill.bill_id);
      return;
    }

    // Same fields the Update form uses, so receipts show the balance separately
    // (never more than the bill, when advance took part of it)
    bill.previous_remaining = Math.min(prevRemaining, Number(bill.amount));
    bill.previous_remaining_month = prevBill.month;
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    try {
      const billRef = doc(this.firestore, 'billCreator', this.selectedDeleteId);
      const billSnap = await getDoc(billRef);
      const bill = billSnap.data();

      if (!billSnap.exists()) {
        this.toastr.error('Bill not found');
        return;
      }

      const logData = {
        ...billSnap.data(),
        type: 'bill',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);

      await deleteDoc(billRef);
      await this.removeBillFromUsers(bill);

      this.toastr.success('Bill deleted');
      this.loadBills();
      modal.close();
    } catch {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
    }
  }

  async removeBillFromUsers(bill: any) {
    // A missed-user run removes exactly the bills it added, never the area's
    // regular run for the same month.
    if (bill.kind === 'missing') {
      await this.removeMissingBills(bill);
      return;
    }

    const usersSnap = await getDocs(collection(this.firestore, 'users'));

    for (const docSnap of usersSnap.docs) {
      const ref = doc(this.firestore, 'users', docSnap.id);
      const bills = docSnap.data()['bills'] || [];

      const updatedBills = bills.filter(
        (b: any) =>
          !(
            b.month === bill.month &&
            b.year === bill.year &&
            b.sublocality === bill.sublocality &&
            (bill.connection_type === 'both' || b.type === bill.connection_type)
          ),
      );

      if (updatedBills.length !== bills.length) {
        this.releaseRemovedCarries(bills, updatedBills);
        await updateDoc(ref, { bills: updatedBills });
      }
    }
  }

  /** Balances carried into removed bills go back onto the bills they came from. */
  private releaseRemovedCarries(before: any[], kept: any[]) {
    const removedIds = new Set<string>(
      before.filter((b: any) => !kept.includes(b) && b.bill_id).map((b: any) => b.bill_id),
    );
    if (removedIds.size) releaseCarried(kept, removedIds);
  }

  private async removeMissingBills(run: any) {
    const billIds = new Set<string>(run.bill_ids || []);

    for (const userId of run.user_ids || []) {
      const ref = doc(this.firestore, 'users', userId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;

      const bills = snap.data()['bills'] || [];
      const kept = bills.filter((b: any) => !billIds.has(b.bill_id));
      if (kept.length !== bills.length) {
        releaseCarried(kept, billIds);
        await updateDoc(ref, { bills: kept });
      }
    }
  }

  // ── Carried balances ──────────────────────────
  // Bills made before carry tracking still show the old month as unpaid
  // next to the new bill that already includes it. This links them once.
  isFixingCarries = false;
  carryUnmatched: string[] = [];

  async fixCarriedBills() {
    if (this.isFixingCarries || this.isLoading) return;

    this.isFixingCarries = true;
    try {
      const usersSnap = await getDocs(collection(this.firestore, 'users'));
      let linked = 0;
      let usersFixed = 0;
      const unmatched: string[] = [];

      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();
        const bills = u['bills'] || [];

        const result = linkUntrackedCarries(bills, {
          cable: Number(u['cable_package_fee']) || 0,
          internet: Number(u['internet_package_fee']) || 0,
        });

        for (const period of result.unmatched) {
          unmatched.push(`${u['user_name'] || docSnap.id} (${u['internet_id'] || '-'}) – ${period}`);
        }

        if (result.linked) {
          linked += result.linked;
          usersFixed++;
          await updateDoc(doc(this.firestore, 'users', docSnap.id), { bills });
        }
      }

      this.carryUnmatched = unmatched;

      if (linked) {
        this.toastr.success(`Linked ${linked} carried bill(s) for ${usersFixed} user(s)`);
      } else {
        this.toastr.info('No carried bills needed fixing');
      }
      if (unmatched.length) {
        this.toastr.warning(
          `${unmatched.length} unpaid bill(s) could not be matched - check them by hand`,
        );
      }
    } catch (e) {
      console.error(e);
      this.toastr.error('Fixing carried bills failed');
    } finally {
      this.isFixingCarries = false;
    }
  }

  // ── Missed users ──────────────────────────────
  // Users with no bill for a month: added after its bill run, or skipped
  // then. They are billed one by one with the same rules as a bill run.
  missMonth = '';
  missYear = '';
  missArea = 'all';
  missConnection = '';
  missSearch = '';
  missUsers: MissedUser[] = [];
  missSelected = new Set<string>();
  missSearched = false;
  isFinding = false;

  get canFindMissing(): boolean {
    return !!(this.missMonth && this.missYear) && !this.isFinding && !this.isLoading;
  }

  /** False when the month has no regular run yet, so nearly everyone shows up. */
  get missMonthHasRun(): boolean {
    return this.bills.some(
      (b) => b.kind !== 'missing' && b.month === this.missMonth && b.year === this.missYear,
    );
  }

  get missVisible(): MissedUser[] {
    const term = this.missSearch.trim().toLowerCase();
    if (!term) return this.missUsers;

    return this.missUsers.filter(
      (u) =>
        u.user_name.toLowerCase().includes(term) ||
        u.internet_id.toLowerCase().includes(term) ||
        u.sublocality.toLowerCase().includes(term),
    );
  }

  get missAllVisibleSelected(): boolean {
    const visible = this.missVisible;
    return visible.length > 0 && visible.every((u) => this.missSelected.has(u.id));
  }

  get missSelectedFee(): number {
    return this.missUsers
      .filter((u) => this.missSelected.has(u.id))
      .reduce((sum, u) => sum + u.fee, 0);
  }

  /** A changed filter makes the list stale - search again. */
  onMissFilterChange() {
    this.missUsers = [];
    this.missSelected.clear();
    this.missSearched = false;
  }

  toggleMissUser(id: string) {
    if (this.missSelected.has(id)) this.missSelected.delete(id);
    else this.missSelected.add(id);
  }

  toggleMissAll() {
    const selectAll = !this.missAllVisibleSelected;
    for (const u of this.missVisible) {
      if (selectAll) this.missSelected.add(u.id);
      else this.missSelected.delete(u.id);
    }
  }

  /** Lists the users a bill run would bill that have no bill for the month. */
  async findMissingUsers() {
    if (!this.missMonth || !this.missYear) {
      this.toastr.error('Select month and year');
      return;
    }

    this.isFinding = true;
    try {
      const usersSnap = await getDocs(collection(this.firestore, 'users'));
      const found: MissedUser[] = [];

      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();

        // Same people a bill run takes: inactive customers are left out.
        if (u['customer_status'] === 'inactive') continue;
        if (this.missArea && this.missArea !== 'all' && u['sublocality'] !== this.missArea) continue;
        if (this.missConnection && u['connection_type'] !== this.missConnection) continue;

        const types = this.missingTypes(u, this.missMonth, this.missYear);
        if (!types.length) continue;

        found.push({
          id: docSnap.id,
          user_name: u['user_name'] || '',
          internet_id: u['internet_id'] || '',
          sublocality: u['sublocality'] || '',
          connection_type: u['connection_type'],
          types,
          fee: types.reduce(
            (sum, t) =>
              sum + (Number(t === 'cable' ? u['cable_package_fee'] : u['internet_package_fee']) || 0),
            0,
          ),
        });
      }

      found.sort(
        (a, b) =>
          a.sublocality.localeCompare(b.sublocality) ||
          a.internet_id.localeCompare(b.internet_id, undefined, { numeric: true }),
      );

      this.missUsers = found;
      this.missSelected.clear();
      this.missSearch = '';
      this.missSearched = true;
    } catch (error) {
      console.error('Error finding missed users', error);
      this.toastr.error('Could not load users');
    } finally {
      this.isFinding = false;
    }
  }

  /** Bill types this user should have for the month but doesn't (as a bill run decides). */
  private missingTypes(u: any, month: string, year: string): ('cable' | 'internet')[] {
    const advances = u['advancePayments'] || [];
    if (this.hasAdvanceForMonth(advances, month, year) || this.paidInAdvance(advances, month, year)) {
      return [];
    }

    const bills = u['bills'] || [];
    const type = u['connection_type'];
    const types: ('cable' | 'internet')[] = [];

    if (
      (type === 'tv_cable' || type === 'both') &&
      u['cable_package_fee'] &&
      !this.isBilled(bills, month, year, 'cable')
    ) {
      types.push('cable');
    }
    if (
      (type === 'internet' || type === 'both') &&
      u['internet_package_fee'] &&
      !this.isBilled(bills, month, year, 'internet')
    ) {
      types.push('internet');
    }
    return types;
  }

  async createMissingBills() {
    const selected = this.missUsers.filter((u) => this.missSelected.has(u.id));
    if (!selected.length || this.isLoading) return;

    this.isLoading = true;
    this.overlayMessage = `Creating bills for ${selected.length} user(s), please wait...`;

    try {
      const billed: MissedUser[] = [];
      const billIds: string[] = [];
      let totalAmount = 0;

      for (const u of selected) {
        const added = await this.addUserBills(u.id, {
          month: this.missMonth,
          year: this.missYear,
          connectionType: u.connection_type,
          sublocality: u.sublocality,
        });
        if (!added.length) continue; // billed by someone else meanwhile

        billed.push(u);
        for (const b of added) {
          billIds.push(b.bill_id);
          totalAmount += b.amount;
        }
      }

      if (!billed.length) {
        this.toastr.info('These users already have their bills');
      } else {
        await this.createMissingRunDoc(billed, billIds, totalAmount);
        this.toastr.success(`Bills created for ${billed.length} user(s)`);
      }

      this.loadBills();
      this.findMissingUsers();
    } catch (e) {
      console.error(e);
      this.toastr.error('Bill creation failed');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * History entry for a missed-user run. It keeps the exact users and bills,
   * so deleting it removes only these bills.
   */
  private async createMissingRunDoc(users: MissedUser[], billIds: string[], totalAmount: number) {
    const areas = new Set(users.map((u) => u.sublocality));
    const types = new Set(users.map((u) => u.connection_type));

    await addDoc(collection(this.firestore, 'billCreator'), {
      kind: 'missing',
      month: this.missMonth,
      year: this.missYear,
      connection_type: types.size === 1 ? [...types][0] : 'mixed',
      sublocality: areas.size === 1 ? [...areas][0] : 'all',
      amount: totalAmount,
      users: users.length,
      user_ids: users.map((u) => u.id),
      bill_ids: billIds,

      status: 'unpaid',
      createdAt: new Date(),
      created_by: this.userName || 'Unknown',
    });
  }

  typeLabel(type: 'cable' | 'internet'): string {
    return type === 'cable' ? 'Cable' : 'Internet';
  }

  get visiblePages(): number[] {
    const pages: number[] = [];

    const startPage = Math.floor((this.currentPage - 1) / 5) * 5 + 1;

    const endPage = Math.min(startPage + 4, this.totalPages);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.updateTotalPages();
  }
}
