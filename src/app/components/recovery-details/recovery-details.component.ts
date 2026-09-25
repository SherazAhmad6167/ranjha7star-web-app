import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { RecoveryDetailModalComponent } from '../recovery-detail-modal/recovery-detail-modal.component';
import { TemplateMapperService } from '../../shared/template-mapper.service';

@Component({
  selector: 'app-recovery-details',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './recovery-details.component.html',
  styleUrl: './recovery-details.component.scss',
})
export class RecoveryDetailsComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  recoveryOfficerList: string[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  sublocality: string = '';
  internetAreas: any[] = [];
  showReceiptModal = false;
  companyDetail: any = {};
  selectedDate: string = '';
  totalRecovery: number = 0;
  totalExpenses: number = 0;
  remainingAmount: number = 0;
  role: string = '';
  loggedInOperator: string = '';
  loggedInOperatorName: string = '';
  operatorSublocalities: string[] = [];
  operatorName: string = '';
  internetOperators: any[] = [];
  selectedMsgUser: any = null;
  recoveryTemplate: string = '';
  selectedMonth: string | null = null;
  monthMap: any = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
    private templateMapper: TemplateMapperService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.role = localStorage.getItem('role') || '';
    this.loggedInOperator = localStorage.getItem('username') || '';

    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
      // Records are matched on his display name, so resolve it first.
      await this.resolveOperatorName();
    }

    this.loadExpenses();
    this.loadOperatorName();
    this.loadRecoveryTemplate();
  }

  // Login stores `user_name`, while recovery records store the operator's
  // display `name` - resolve it once so his own rows can be matched.
  private async resolveOperatorName() {
    this.loggedInOperatorName = localStorage.getItem('name') || '';
    if (this.loggedInOperatorName || !this.loggedInOperator) return;

    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'recoveryOfficer'),
          where('user_name', '==', this.loggedInOperator),
        ),
      );
      if (!snap.empty) {
        this.loggedInOperatorName = snap.docs[0].data()['name'] || '';
        localStorage.setItem('name', this.loggedInOperatorName);
      }
    } catch (error) {
      console.error('Error resolving recovery officer name', error);
    }
  }

  private normalizeName(name: string): string {
    return String(name || '').trim().toLowerCase();
  }

  // Older rows may carry the login handle instead of the display name.
  private isOwnRecord(user: any): boolean {
    const recordName = this.normalizeName(user.operator_name);
    if (!recordName) return false;

    return (
      recordName === this.normalizeName(this.loggedInOperatorName) ||
      recordName === this.normalizeName(this.loggedInOperator)
    );
  }

  async loadRecoveryTemplate() {
    try {
      const snap = await getDoc(doc(this.firestore, 'messageTemplates/recovery'));
      if (snap.exists()) this.recoveryTemplate = snap.data()['message'] || '';
    } catch {}
  }

  openMsgModal(user: any, modal: any) {
    this.selectedMsgUser = user;
    this.modalService.open(modal, { centered: true, size: 'sm' });
  }

  formatPhoneForSms(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92')  && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0')   && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  formatPhoneNumber(phone: string): string {
    phone = (phone || '').replace(/\D/g, '');
    if (phone.startsWith('03'))  return '92' + phone.substring(1);
    if (phone.startsWith('3'))   return '92' + phone;
    if (phone.startsWith('92'))  return phone;
    if (phone.startsWith('+92')) return phone.substring(1);
    return phone;
  }

  async sendSms(user: any) {
    const phone = this.formatPhoneForSms(user.operator_phone);
    if (!phone) { this.toastr.error('No valid operator phone number'); return; }
    if (!this.recoveryTemplate) { this.toastr.error('Recovery template not configured in Settings'); return; }
    const message = this.templateMapper.map(this.recoveryTemplate, user);
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  sendWhatsapp(user: any) {
    if (!this.recoveryTemplate) { this.toastr.error('Recovery template not configured in Settings'); return; }
    const phone = this.formatPhoneNumber(user.operator_phone || '');
    const message = this.templateMapper.map(this.recoveryTemplate, user);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  async loadOperatorName() {
    try {
      const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.internetOperators = snap.data()?.['operatorNames'] || [];

        this.internetOperators.sort((a: any, b: any) => {
          return a.operator_name.localeCompare(b.operator_name);
        });
      }
    } catch (error) {
      console.error('Error loading internet operators', error);
    }
  }


  async loadExpenses() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'recoveryDetails');
      const recoveryOfficerRef = collection(this.firestore, 'recoveryOfficer');

      // ✅ Order by createdAt descending
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const rq = query(recoveryOfficerRef, orderBy('createdAt', 'desc'));

      const snapshot = await getDocs(q);
      const recoveryOfficerSnapshot = await getDocs(rq);

      this.recoveryOfficerList = recoveryOfficerSnapshot.docs.map((docSnap) => docSnap.data()['user_name']);

      this.users = snapshot.docs.map((docSnap) => {
        const data: any = docSnap.data();

        const profit = (data.total_recovery || 0) - (data.total_expenses || 0);

        return {
          id: docSnap.id,
          ...data,
          profit,
        };
      });

      // Restrict operator to their own records only
      if (this.role === 'operator') {
        this.users = this.users.filter((u) => this.isOwnRecord(u));
      }

      this.filteredUsers = this.users;
      this.updateTotalPages();
      this.calculateTotals(this.users);

      console.log('Fetched users:', this.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      this.toastr.error('Failed to load users');
    } finally {
      this.isLoading = false;
    }
  }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  updateTotalPages() {
    this.totalPages = Math.ceil(this.filteredUsers.length / this.pageSize) || 1;
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

  onFilterChange() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter((user) => {
      const matchesSearch =
        user.recovey_officer?.toLowerCase().includes(term) ||
        user.date?.includes(term);

      const matchesOperator =
        !this.operatorName || user.operator_name === this.operatorName;

      let matchesMonth = true;

    if (this.selectedMonth) {
      const selectedMonthNumber = this.monthMap[this.selectedMonth]; // e.g. "05"
      const userMonth = user.date?.split('-')[1]; // "05"

      matchesMonth = userMonth === selectedMonthNumber;
    }

    return matchesSearch && matchesOperator && matchesMonth;
    });

    this.currentPage = 1;
    this.updateTotalPages();
    this.calculateTotals(this.filteredUsers);
  }

  openExpenseModal(userData?: any) {
    const modalRef = this.modalService.open(RecoveryDetailModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });

    if (userData) {
      modalRef.componentInstance.editMode = true;
      modalRef.componentInstance.userData = userData;
    }

    modalRef.closed.subscribe((result) => {
      if (result) {
        this.loadExpenses();
      }
    });
  }

  editUser(user: any) {
    this.openExpenseModal(user);
  }

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    const userRef = doc(
      this.firestore,
      'recoveryDetails',
      this.selectedDeleteId,
    );

    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.toastr.error('Recovery detail not found');
        return;
      }

      const logData = {
        ...userSnap.data(),
        type: 'recovery',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);
      await addDoc(collection(this.firestore, 'logs'), {
        type: 'users',
        action: 'delete',
        targetId: this.selectedDeleteId,
        deletedAt: new Date(),
      });
      await deleteDoc(
        doc(this.firestore, 'recoveryDetails', this.selectedDeleteId),
      );
      this.toastr.success('Recovery detail deleted');
      this.loadExpenses();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
  }

  fromDate: string = '';
  toDate: string = '';

  filterByDate() {
    if (!this.selectedDate) {
      // agar date select nahi hai to sab ka total dikhao
      this.calculateTotals(this.users);
      this.filteredUsers = this.users;
      return;
    }

    // ✅ Filter by selected date
    this.filteredUsers = this.users.filter((user: any) => {
      return user.date === this.selectedDate;
    });

    // ✅ Calculate totals for filtered data
    this.calculateTotals(this.filteredUsers);
  }

  filterByDateRange() {
    if (!this.fromDate && !this.toDate) {
      this.filteredUsers = this.users;
      this.calculateTotals(this.users);
      return;
    }

    this.filteredUsers = this.users.filter((user: any) => {
      const userDate = new Date(user.date);

      const from = this.fromDate ? new Date(this.fromDate) : null;
      const to = this.toDate ? new Date(this.toDate) : null;

      if (from && to) {
        return userDate >= from && userDate <= to;
      }

      if (from) {
        return userDate >= from;
      }

      if (to) {
        return userDate <= to;
      }

      return true;
    });

    this.calculateTotals(this.filteredUsers);
  }

  calculateTotals(data: any[]) {
    this.totalRecovery = data.reduce(
      (sum, item) => sum + (item.total_recovery || 0),
      0,
    );

    this.totalExpenses = data.reduce(
      (sum, item) => sum + (item.total_expenses || 0),
      0,
    );

    this.remainingAmount = data.reduce(
      (sum, item) => sum + (item.remaining_amount || 0),
      0,
    );
  }
}
