import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { ChangeDetectorRef, Component, ElementRef, TemplateRef, ViewChild, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast/toast.service';
import {
  NgbActiveModal,
  NgbModal,
  NgbModule,
} from '@ng-bootstrap/ng-bootstrap';
import { UserModalComponent } from '../user-modal/user-modal.component';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { openWhatsApp } from '../../shared/whatsapp';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { archiveAndDelete, writeInBackground } from '../../shared/offline-write';
import { ConfirmService } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-user-details',
  imports: [CommonModule, FormsModule, SearchSelectComponent, LoaderComponent, EmptyStateComponent],
  templateUrl: './user-details.component.html',
  styleUrl: './user-details.component.scss',
})
export class UserDetailsComponent {
  private readonly confirmDialog = inject(ConfirmService);
  @ViewChild('whatsappModal') whatsappModal!: TemplateRef<any>;
  selectedWhatsappUser: any = null;
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  sublocality: string = '';
  subArea: string = '';
  customerStatus: '' | 'active' | 'inactive' = '';
  subInternetArea: any[] = [];
  internetAreas: any[] = [];
  role: string = '';
  operatorSublocalities: string[] = [];

  get areaOptions(): { sublocality: string }[] {
    if (this.role === 'admin') return this.internetAreas;
    return this.operatorSublocalities.map((s) => ({ sublocality: s }));
  }
  showReceiptModal = false;
  companyDetail: any = {};
  welcomeTemplate: any;
  upgradePlan: any;
  maintanancesPlan: any;
  servicesPlan: any;

  // Maintenance notice schedule, entered in the messaging modal.
  maintenanceDate = '';
  maintenanceStart = '';
  maintenanceEnd = '';

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastService,
    private cdr: ChangeDetectorRef,
    private templateMapper: TemplateMapperService,
  ) {}

  async ngOnInit() {
    this.role = localStorage.getItem('role') || '';
    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
    }
    this.loadUsers();
    this.loadInternetAreas();
    this.loadSubInternetAreas();
    this.loadCompanyDetails();
    this.welcomeTemplate = await this.getTemplate('welcome');
    this.upgradePlan = await this.getTemplate('upgrade');
    this.maintanancesPlan = await this.getTemplate('maintenance');
    this.servicesPlan = await this.getTemplate('restoration');
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

  async loadSubInternetAreas() {
    try {
      const ref = doc(this.firestore, 'internetSubArea', 'internetSubAreaDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.subInternetArea = snap.data()?.['internetSubAreas'] || [];

        this.subInternetArea.sort((a: any, b: any) => {
          return a.sub_area.localeCompare(b.sub_area);
        });
      }
      console.log('Loaded sub internet areas:', this.subInternetArea);
    } catch (error) {
      console.error('Error loading internet areas', error);
    }
  }

  async loadCompanyDetails() {
    try {
      const ref = doc(this.firestore, 'companyDetail', 'companyDetail');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.companyDetail = snap.data();
      }
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load company details');
    }
  }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  async loadUsers() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'users');
      const snapshot = await getDocs(usersRef);

      this.users = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      this.users.sort((a, b) => {
        const getNumericPrefix = (id: string) => {
          if (!id) return 0;
          const match = id.match(/^0*(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };

        const numA = getNumericPrefix(a.internet_id);
        const numB = getNumericPrefix(b.internet_id);

        return numA - numB;
      });

      // this.filteredUsers = this.users;
      this.onFilterChange();
      this.updateTotalPages();

      console.log('Fetched users:', this.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      this.toastr.error('Failed to load users');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
         user.phone_no?.includes(term) || 
         user.mobile_no?.includes(term)
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  get filteredSubAreas(): { sub_area: string }[] {
    const baseUsers = this.role === 'operator'
      ? this.users.filter((u) => this.operatorSublocalities.includes(u.sublocality))
      : this.users;

    const filterByArea = this.sublocality
      ? baseUsers.filter((u) => u.sublocality === this.sublocality)
      : baseUsers;

    const subAreasInArea = new Set(
      filterByArea.filter((u) => u.sub_area).map((u) => u.sub_area as string),
    );

    return this.subInternetArea.filter((s) => subAreasInArea.has(s.sub_area));
  }

  onAreaChange() {
    this.subArea = '';
    this.onFilterChange();
  }

  onFilterChange() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter((user) => {
      const matchesSearch =
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.address?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
        user.phone_no?.includes(term) || 
         user.mobile_no?.includes(term)

      const matchesSubArea = !this.subArea || user.sub_area === this.subArea;

      const matchesCustomerStatus =
        !this.customerStatus ||
        (this.customerStatus === 'inactive' ? this.isInactive(user) : !this.isInactive(user));

      let matchesSublocality = true;

      if (this.role === 'operator') {
        if (!this.operatorSublocalities.includes(user.sublocality)) return false;
        matchesSublocality = !this.sublocality || user.sublocality === this.sublocality;
      } else {
        matchesSublocality = !this.sublocality || user.sublocality === this.sublocality;
      }

      return matchesSearch && matchesSublocality && matchesSubArea && matchesCustomerStatus;
    });

    this.currentPage = 1;
    this.updateTotalPages();
  }

  openUserModal(userData?: any) {
    const modalRef = this.modalService.open(UserModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });

    if (userData) {
      modalRef.componentInstance.editMode = true;
      modalRef.componentInstance.userData = userData;
    }

    modalRef.closed.subscribe((result) => {
      if (result) {
        const prevPage = this.currentPage;

        this.loadUsers().then(() => {
          this.currentPage = prevPage;
        });
      }
    });
  }

  editUser(user: any) {
    this.openUserModal(user);
  }

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    const userRef = doc(this.firestore, 'users', this.selectedDeleteId);

    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.toastr.error('User not found');
        return;
      }

      const logData = {
        ...userSnap.data(),
        type: 'users',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      archiveAndDelete(this.firestore, doc(this.firestore, 'users', this.selectedDeleteId),
        logData,
        {
        type: 'users',
        action: 'delete',
        targetId: this.selectedDeleteId,
        deletedAt: new Date(),
      });
      this.toastr.success('User deleted');
      this.loadUsers();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
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

  async deleteMotaUsers() {
    const confirmDelete = await this.confirmDialog.ask({
      title: 'Delete all Mota users?',
      message: 'Every matching user will be deleted. This cannot be undone.',
      confirmText: 'Delete all',
    });
    if (!confirmDelete) return;

    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('sublocality', '==', 'Lakhanwal'));

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        this.toastr.info('No users found with sublocality Mota');
        return;
      }

      const deletePromises: Promise<any>[] = [];

      querySnapshot.forEach((docSnap) => {
        deletePromises.push(
          deleteDoc(doc(this.firestore, 'users', docSnap.id)),
        );
      });

      await Promise.all(deletePromises);

      this.toastr.success(
        `${deletePromises.length} Mota users deleted successfully`,
      );
      this.loadUsers();
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to delete Mota users');
    }
  }

  receiptData: any = null;

  /**
   * Monthly fee, internet + cable. The fees can be saved as text, and "1500"
   * + 0 in a template reads as "15000" - so convert before adding. The saved
   * fees already have the discount applied.
   */
  userFee(user: any): number {
    return (Number(user?.internet_package_fee) || 0) + (Number(user?.cable_package_fee) || 0);
  }

  openReceiptModal(user: any) {
    this.showReceiptModal = true;

    this.receiptData = {
      name: user.user_name,
      month: user.month,
      year: user.year,
      address: user.address,
      installationDate: user.installation_date,
      totalAmount: user.amount,
      internet_package_fee: user.internet_package_fee,
      pkg_cable: user.pkg_cable,
      cable_package_fee: user.cable_package_fee,
      internetId: user.internet_id,
      installation_amount: user.installation_amount,
      select_package: user.select_package,
      // Paid over the bill, carried as advance
      advanceBalance: Number(user.extra_advance) || 0,
    };
  }

  saveReceiptImage() {
    const receipt = document.getElementById('receipt');

    if (!receipt) return;

    html2canvas(receipt, { scale: 2 }).then((canvas) => {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `receipt_${Date.now()}.png`;
      link.click();
    });
  }

  printReceipt() {
    // Make sure modal is visible
    if (!this.showReceiptModal) {
      console.warn('Receipt modal is not visible');
      return;
    }

    // Target the modal body
    const receipt = document.getElementById('receipt');
    if (!receipt) {
      console.warn('Receipt element not found');
      return;
    }

    // Use html2canvas with proper options
    html2canvas(receipt, {
      scale: 2, // Higher resolution
      useCORS: true, // For external images, if any
      backgroundColor: '#fff', // Force white background
    })
      .then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');

        const printWindow = window.open('', '', 'height=600,width=400');
        if (!printWindow) return;

        printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { margin: 0; padding: 0; text-align: center; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" />
        </body>
      </html>
    `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 200);
      })
      .catch((err) => {
        console.error('Error printing receipt:', err);
      });
  }

  shareReceiptImage() {
    const receipt = document.getElementById('receipt');

    if (!receipt) return;

    html2canvas(receipt, { scale: 2 }).then((canvas) => {
      canvas.toBlob((blob) => {
        if (!blob) return;

        const file = new File([blob], 'receipt.png', { type: 'image/png' });

        if ((navigator as any).share) {
          (navigator as any).share({
            files: [file],
            title: 'Payment Receipt',
          });
        } else {
          const url = URL.createObjectURL(blob);
          window.open(`https://wa.me/?text=Payment Receipt`, '_blank');
          URL.revokeObjectURL(url);
        }
      });
    });
  }

  @ViewChild('pdfContent') pdfContent!: ElementRef;

  showPdfModal = false;
  pdfUser: any;

  openPdfModal(user: any) {
    this.pdfUser = user;
    this.showPdfModal = true;
  }

  closePdfModal() {
    this.showPdfModal = false;
  }

  downloadPDF() {
    const element = this.pdfContent.nativeElement;

    const opt = {
      margin: 5,
      filename: `invoice_${this.pdfUser.user_name}.pdf`,
      image: { type: 'jpeg' as 'jpeg', quality: 1 },
      html2canvas: { scale: 2 },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait' as 'portrait',
      },
    };

    html2pdf().set(opt).from(element).save();
  }

  async getTemplate(type: string): Promise<string> {
    const ref = doc(this.firestore, `messageTemplates/${type}`);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data()['message'] || '';
    }

    return '';
  }

  updratePlan(user: any) {
    const formattedPhone = this.whatsappNumber(user);
    if (!formattedPhone) {
      this.toastr.error('No valid phone number');
      return;
    }
    const message = this.mapUpgradeTemplate(this.upgradePlan, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }
    this.sendWelcomeMessage(formattedPhone, message);
  }

  /** Returns true when the notice was sent, so the modal only closes on success. */
  maintanancePlan(user: any): boolean {
    if (!this.hasMaintenanceSchedule()) return false;
    const formattedPhone = this.whatsappNumber(user);
    if (!formattedPhone) {
      this.toastr.error('No valid phone number');
      return false;
    }
    const message = this.mapMaintananceTemplate(this.maintanancesPlan, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return false;
    }
    this.sendWelcomeMessage(formattedPhone, message);
    return true;
  }

  servicePlan(user: any) {
    const formattedPhone = this.whatsappNumber(user);
    if (!formattedPhone) {
      this.toastr.error('No valid phone number');
      return;
    }
    const message = this.mapServicesTemplate(this.servicesPlan, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }
    this.sendWelcomeMessage(formattedPhone, message);
  }

  /** Contact shown in the users table. Empty string renders as an em dash. */
  getContact(user: any): string {
    return this.resolvePhone(user);
  }

  get totalUsersCount(): number { return this.users.length; }

  connectionBadgeClass(type: string): string {
    if (type === 'internet') return 'conn-internet';
    if (type === 'tv_cable') return 'conn-cable';
    if (type === 'both') return 'conn-both';
    return '';
  }

  connectionLabel(type: string): string {
    if (type === 'internet') return 'Internet';
    if (type === 'tv_cable') return 'Cable';
    if (type === 'both') return 'Both';
    return type || '—';
  }

  packageDisplay(user: any): string {
    if (user?.select_package) {
      return user.select_package.replace('_', '-').replace('mbps', 'Mbps').toUpperCase();
    }
    return user?.pkg_cable || '—';
  }

  userInitial(user: any): string {
    return (user?.user_name || '?').charAt(0).toUpperCase();
  }

  /** Blank status counts as active, matching the bill creator. */
  isInactive(user: any): boolean {
    return user?.customer_status === 'inactive';
  }

  async sendWhatsapp(user: any) {
    const formattedPhone = this.whatsappNumber(user);
    if (!formattedPhone) {
      this.toastr.error('No valid phone number');
      return;
    }
    // const hasWhatsApp = await this.checkWhatsAppNumber(formattedPhone);

    // console.log('Has WhatsApp:', hasWhatsApp);

    // if (!hasWhatsApp) {
    //   this.toastr.error('This number is not available on WhatsApp');
    // }
    const message = this.mapTemplate(this.welcomeTemplate, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }

    // const message = this.generateWelcomeMessage(user);

    this.sendWelcomeMessage(formattedPhone, message);
  }

  /** Context shared by every template sent from this screen. */
  private templateCtx() {
    return {
      supportNumber: this.companyDetail?.complain_no1 || undefined,
    };
  }

  mapMaintananceTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      ...this.templateCtx(),
      areaName: data?.sublocality || data?.sub_area || data?.area || '',
      maintenanceDate: this.maintenanceDate || new Date(),
      startTime: this.to12Hour(this.maintenanceStart),
      endTime: this.to12Hour(this.maintenanceEnd),
    });
  }

  /** Converts a 24h "HH:mm" input value to "h:mm AM/PM" for the message. */
  private to12Hour(val: string): string {
    if (!val) return '';
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return val;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  mapServicesTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, this.templateCtx());
  }

  mapUpgradeTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      ...this.templateCtx(),
      amount: data?.internet_package_fee,
    });
  }

  mapTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, this.templateCtx());
  }

  /**
   * Resolves a customer's real number to the canonical local form 03XXXXXXXXX.
   *
   * `mobile_no` is the field the user form marks required, so it wins. `phone_no`
   * is legacy: usually missing, the string '0', or dirty imported text such as
   * "03026283373 - 0", so it is only used when it actually parses as a number.
   * Returns '' when neither field yields a usable number.
   */
  private resolvePhone(user: any): string {
    for (const candidate of [user?.mobile_no, user?.phone_no]) {
      const digits = (candidate ?? '').toString().replace(/\D/g, '');
      if (!digits) continue;

      if (digits.length === 11 && digits.startsWith('03')) return digits;
      if (digits.length === 12 && digits.startsWith('92')) return '0' + digits.slice(2);
      if (digits.length === 10 && digits.startsWith('3')) return '0' + digits;

      // Dirty import ("03026283373 - 0") — keep the leading 11-digit number.
      if (digits.length > 11 && digits.startsWith('03')) return digits.slice(0, 11);
    }

    return '';
  }

  /** wa.me format (92XXXXXXXXXX), or '' when the customer has no usable number. */
  private whatsappNumber(user: any): string {
    const local = this.resolvePhone(user);
    return local ? '92' + local.slice(1) : '';
  }

  /** Matches the search box against either phone field, ignoring separators. */
  private phoneMatches(user: any, term: string): boolean {
    const digits = term.replace(/\D/g, '');
    if (!digits) return false;

    return [user?.mobile_no, user?.phone_no].some((value) =>
      (value ?? '').toString().replace(/\D/g, '').includes(digits),
    );
  }

  async checkWhatsAppNumber(phone: string): Promise<boolean> {
    try {
      const res = await fetch(`https://wa.me/${phone}`);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  generateWelcomeMessage(data: any): string {
    return `👋 Assalam-o-Alaikum ${data.user_name},

🎉 Welcome to Ranjha7star!

📶 Package: ${data.select_package}
💰 Fee: ${data.internet_package_fee}
📅 Installation Date: ${data.installation_date}

If there is any complain please contact us ${this.companyDetail.complain_no1} 😊

Thank you!`;
  }

  sendWelcomeMessage(phone: string, message: string) {
    openWhatsApp(phone, message);
  }


  openWhatsappModal(user: any) {
    this.selectedWhatsappUser = user;
    this.modalService.open(this.whatsappModal, { centered: true });
  }

  /** SMS gateway format (+92XXXXXXXXXX), or null when there is no usable number. */
  formatPhoneForSms(user: any): string | null {
    const local = this.resolvePhone(user);
    return local ? '+92' + local.slice(1) : null;
  }

  sendSmsWelcome(user: any) {
    this.sendSmsWithTemplate(user, this.welcomeTemplate, 'mapTemplate');
  }

  sendSmsUpgrade(user: any) {
    this.sendSmsWithTemplate(user, this.upgradePlan, 'mapUpgradeTemplate');
  }

  /** Returns true when the notice was queued, so the modal only closes on success. */
  sendSmsMaintenance(user: any): boolean {
    if (!this.hasMaintenanceSchedule()) return false;
    this.sendSmsWithTemplate(user, this.maintanancesPlan, 'mapMaintananceTemplate');
    return true;
  }

  /** Blocks sending a maintenance notice with blank date/time placeholders. */
  private hasMaintenanceSchedule(): boolean {
    if (this.maintenanceDate && this.maintenanceStart && this.maintenanceEnd) {
      return true;
    }
    this.toastr.error('Set the maintenance date, from and to time first');
    return false;
  }

  sendSmsService(user: any) {
    this.sendSmsWithTemplate(user, this.servicesPlan, 'mapServicesTemplate');
  }

  private async sendSmsWithTemplate(user: any, template: any, mapMethod: string) {
    const phone = this.formatPhoneForSms(user);
    if (!phone) {
      this.toastr.error('No valid phone number');
      return;
    }
    const message = (this as any)[mapMethod](template, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }
    try {
      writeInBackground(addDoc(collection(this.firestore, 'sms'), {
        phone,
        message,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }));
      this.toastr.success('SMS queued successfully');
    } catch {
      this.toastr.error('Failed to queue SMS');
    }
  }
}
