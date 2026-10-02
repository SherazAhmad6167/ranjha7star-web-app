import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../shared/toast/toast.service';
import { isCarried } from '../../shared/bill-carry';
import { LoaderComponent } from '../../shared/loader/loader.component';

interface Bill {
  amount: number;
  collected_amount?: number;
  collected_bank?: string | null;
  collected_by?: string | null;
  collected_date?: any; // Firestore Timestamp
  collected_id?: string;
  collected_method?: string;
  month: string;
  status: string;
  type: string;
  year: string;
}

interface AdvancePayment {
  advance_amount: number;
  advance_months?: any[];
  collected_by?: string | null;
  collected_date?: any;
  isAdvance?: boolean;
}

interface User {
  docId: string;
  user_name: string;
  internet_id: string;
  sublocality: string;
  address: string;
  bills?: Bill[];
  advancePayments?: AdvancePayment[];
  [key: string]: any; // For other optional fields
}

@Component({
  selector: 'app-ro-report',
  imports: [CommonModule, FormsModule, SearchSelectComponent, LoaderComponent],
  templateUrl: './ro-report.component.html',
  styleUrl: './ro-report.component.scss',
})
export class RoReportComponent {
  filters = {
    startDate: '',
    endDate: '',
    sublocality: '',
    connectionType: '',
    operator: '',
  };

  internetAreas: any[] = [];
  operators: any[] = [];
  reportData: any = null;
  isLoading = false;
  filteredUsers: User[] = [];

  constructor(
    private firestore: Firestore,
    private toastr: ToastService,
    private modalService: NgbModal,
  ) {}

  async ngOnInit() {
    await this.loadInternetAreas();
    await this.loadOperators();
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

  async loadOperators() {
    try {
      const q = query(
        collection(this.firestore, 'recoveryOfficer'),
        // where('role', '==', 'operator'),
      );
      const snapshot = await getDocs(q);
      this.operators = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (err) {
      console.error(err);
    }
  }

  async generateReport() {
    this.isLoading = true;
    this.reportData = null;
    this.filteredUsers = [];
    try {
      const usersSnap = await getDocs(collection(this.firestore, 'users'));
      const users: User[] = usersSnap.docs.map((d) => {
        return { ...d.data(), docId: d.id } as User;
      });

      let filteredUsers = users;

      // 🔹 Apply filters
      if (this.filters.sublocality) {
        filteredUsers = filteredUsers.filter(
          (u) => u.sublocality === this.filters.sublocality,
        );
      }

      const start = this.filters.startDate
        ? new Date(this.filters.startDate)
        : null;
      start?.setHours(0, 0, 0, 0);

      const end = this.filters.endDate ? new Date(this.filters.endDate) : null;
      // Include the whole end day
      end?.setHours(23, 59, 59, 999);

      // Officer, connection type and date range must all hold for the *same*
      // bill / advance - otherwise a user with an old bill and a new one would
      // pass a range that neither of them falls inside.
      const hasRecordFilter =
        !!this.filters.operator ||
        !!this.filters.connectionType ||
        !!start ||
        !!end;

      if (hasRecordFilter) {
        filteredUsers = filteredUsers.filter(
          (u) =>
            u.bills?.some((b: any) => this.matchesRecord(b, start, end)) ||
            u.advancePayments?.some((a: any) =>
              this.matchesRecord(a, start, end),
            ),
        );
      }

      // Latest collection first; users with nothing collected go last.
      const latest = new Map<User, number>();
      filteredUsers.forEach((u) =>
        latest.set(u, this.latestCollection(u, hasRecordFilter, start, end)),
      );
      filteredUsers = [...filteredUsers].sort(
        (a, b) => (latest.get(b) || 0) - (latest.get(a) || 0),
      );

      this.filteredUsers = filteredUsers;

      // 🔹 Initialize counters
      let totalUsers = filteredUsers.length;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalUnpaid = 0;
      let totalPaidUsers = 0;
      let totalUnpaidUsers = 0;
      let totalAdvanceUsers = 0;
      let totalAdvanceAmount = 0;

      filteredUsers.forEach((u) => {
        let userPaid = false;
        let userUnpaid = false;

        u.bills?.forEach((b: any) => {
          // Its balance is counted in the later bill it was carried into
          if (isCarried(b) && !(Number(b.collected_amount) > 0)) return;

          totalAmount += Number(b.amount);

          if (b.status === 'paid') {
            totalPaid += Number(b.amount);
            userPaid = true;
          }
          if (b.status === 'unpaid') {
            totalUnpaid += Number(b.amount);
            userUnpaid = true;
          }
        });

        if (userPaid) totalPaidUsers += 1;
        if (userUnpaid) totalUnpaidUsers += 1;

        const advancePaid =
          u.advancePayments?.filter((a: any) => a.isAdvance) || [];
        if (advancePaid.length > 0) {
          totalAdvanceUsers += 1;
          advancePaid.forEach(
            (a) => (totalAdvanceAmount += Number(a.advance_amount)),
          );
        }
      });

      this.reportData = {
        totalUsers,
        totalAmount,
        totalPaid,
        totalUnpaid,
        totalPaidUsers,
        totalUnpaidUsers,
        totalAdvanceUsers,
        totalAdvanceAmount,
      };
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to generate report');
      this.isLoading = false;
    } finally {
      this.isLoading = false;
    }
  }

  private normalizeName(name: any): string {
    return String(name || '')
      .trim()
      .toLowerCase();
  }

  // Bills store the officer's login handle (`user_name`), but older rows may
  // carry his display `name` instead - accept either spelling.
  private matchesOperator(collectedBy: any): boolean {
    const recordName = this.normalizeName(collectedBy);
    if (!recordName) return false;

    const selected = this.normalizeName(this.filters.operator);
    const officer = this.operators.find(
      (o: any) => this.normalizeName(o.user_name) === selected,
    );

    return (
      recordName === selected ||
      (!!officer?.name && recordName === this.normalizeName(officer.name))
    );
  }

  /**
   * Time of the user's newest collection (0 when none). With an officer /
   * type / date filter on, only the bills and advances that match it count.
   */
  private latestCollection(
    u: User,
    onlyMatching: boolean,
    start: Date | null,
    end: Date | null,
  ): number {
    let latest = 0;
    for (const rec of [...(u.bills || []), ...(u.advancePayments || [])]) {
      if (onlyMatching && !this.matchesRecord(rec, start, end)) continue;

      // Pending offline writes are still plain Dates
      const collected = rec.collected_date?.toDate?.() ?? rec.collected_date;
      if (collected instanceof Date && !isNaN(collected.getTime())) {
        latest = Math.max(latest, collected.getTime());
      }
    }
    return latest;
  }

  // A bill / advance payment that satisfies every active record-level filter.
  private matchesRecord(rec: any, start: Date | null, end: Date | null): boolean {
    if (this.filters.operator && !this.matchesOperator(rec.collected_by)) {
      return false;
    }

    if (
      this.filters.connectionType &&
      rec.type !== this.filters.connectionType
    ) {
      return false;
    }

    if (start || end) {
      // Pending offline writes are still plain Dates
      const collected = rec.collected_date?.toDate?.() ?? rec.collected_date;
      if (!(collected instanceof Date) || isNaN(collected.getTime())) {
        return false;
      }
      if (start && collected < start) return false;
      if (end && collected > end) return false;
    }

    return true;
  }
}
