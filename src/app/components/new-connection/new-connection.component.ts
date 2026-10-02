import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component, ElementRef, TemplateRef, ViewChild } from '@angular/core';
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
  setDoc,
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { ToastService } from '../../shared/toast/toast.service';
import { NewConnectionModalComponent } from '../new-connection-modal/new-connection-modal.component';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import { openWhatsApp } from '../../shared/whatsapp';
import { toWhatsappNumber } from '../../shared/phone';
import { LoaderComponent } from '../../shared/loader/loader.component';

@Component({
  selector: 'app-new-connection',
  imports: [FormsModule, CommonModule, ReactiveFormsModule, SearchSelectComponent, LoaderComponent],
  templateUrl: './new-connection.component.html',
  styleUrl: './new-connection.component.scss',
})
export class NewConnectionComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  role: string = '';
  operatorSublocalities: string[] = [];
  sublocality: string = '';
  subArea: string = '';
  subInternetArea: any[] = [];
  internetAreas: any[] = [];
  operatorName: string = '';

  get areaOptions(): { sublocality: string }[] {
    if (this.role === 'admin') return this.internetAreas;
    return this.operatorSublocalities.map((s) => ({ sublocality: s }));
  }
  internetOperators: any[] = [];
  showReceiptModal = false;
  companyDetail: any = {};
  selectedDate: string = '';
  totalUsers: number = 0;
  totalRecovery: number = 0;
  totalExpenses: number = 0;
  totalProfit: number = 0;
  selectedStatus: 'all' | 'recieved' | 'pending' = 'all';
  customerStatus: '' | 'active' | 'inactive' = '';
  recievedByList: string[] = [];
  operatorList: string[] = [];
  selectOperator: string = '';
  selectedRecievedBy: string = '';
  selectedMonth: string | null = null;
  welcomeTemplate: any;

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

  paymentFields = [
    { label: 'Internet Package', key: 'package_label' },
    { label: 'Monthly Fee', key: 'monthly_fee' },
    { label: 'Installation Fee', key: 'installation_amount' },
    { label: 'Advance Paid', key: 'advance_paid' },
    { label: 'Balance', key: 'balance' },
    { label: 'Payment Method', key: 'payment_method' },
    { label: 'Connection Type', key: 'connection_payment' },
  ];

  installFields = [
    { label: 'Installation Date', key: 'installation_date' },
    { label: 'Technician Name', key: 'operator_name' },
    // { label: 'Router Serial No', key: 'router_no' },
    // { label: 'MAC Address', key: 'mac_address' },
    // { label: 'WiFi Name', key: 'wifi' },
    // { label: 'WiFi Password', key: 'wifi_password' },
  ];

  officeFields = [
    { label: 'Verified By', value: 'Saqib Ranjha' },
    { label: 'Approved By', value: 'Saqib Ranjha' },
    { label: 'Account No', key: 'internet_id' },
    { label: 'Customer ID', key: 'internet_id' },
  ];

  @ViewChild('msgModal') msgModal!: TemplateRef<any>;
  selectedMsgUser: any = null;

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastService,
    private templateMapper: TemplateMapperService,
  ) {}

  async ngOnInit() {
    this.role = localStorage.getItem('role') || '';
    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(localStorage.getItem('sublocality') || '[]');
    }
    this.loadExpenses();
    this.loadInternetAreas();
    this.loadSubInternetAreas();
    this.loadOperatorName();
    this.welcomeTemplate = await this.getTemplate('welcome');
  }

  async getTemplate(type: string): Promise<string> {
    const ref = doc(this.firestore, `messageTemplates/${type}`);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data()['message'] || '';
    }

    return '';
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
        this.subInternetArea.sort((a: any, b: any) => a.sub_area.localeCompare(b.sub_area));
      }
    } catch (error) {
      console.error('Error loading sub internet areas', error);
    }
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

  /**
   * Users marked inactive on the Users screen. Editing there only updates the
   * users doc (same id as the connection), so the connection's own copy can be stale.
   */
  inactiveUserIds = new Set<string>();

  async loadInactiveUserIds() {
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'users'), where('customer_status', '==', 'inactive')),
      );
      this.inactiveUserIds = new Set(snap.docs.map((d) => d.id));
    } catch (error) {
      console.error('Error loading inactive users', error);
    }
  }

  isInactive(user: any): boolean {
    return user?.customer_status === 'inactive' || this.inactiveUserIds.has(user?.id);
  }

  /** Received over the installation fee — the table shows it as a negative Remaining. */
  extraReceived(user: any): number {
    const extra = Number(user?.recieved_amount || 0) - Number(user?.installation_amount || 0);
    return user?.isRecieved && extra > 0 ? extra : 0;
  }

  async loadExpenses(keepFilter: boolean = false) {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'newConnection');
      const q = query(usersRef, orderBy('createdAt', 'desc'));

      const [snapshot] = await Promise.all([getDocs(q), this.loadInactiveUserIds()]);

      this.users = snapshot.docs.map((docSnap) => {
        const data: any = docSnap.data();

        const remaining_amount =
          Number(data.installation_amount) - Number(data.recieved_amount);

        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
          remaining_amount,
          // The packages picked in the form; older records only have the
          // typed-in package_name.
          package_label:
            [data.select_package, data.pkg_cable].filter(Boolean).join(' + ') ||
            data.package_name ||
            '',
        };
      });

      this.users.sort((a: any, b: any) => {
        return b.createdAt - a.createdAt;
      });

      this.recievedByList = [
        ...new Set(
          this.users
            .map((u: any) => u.recieved_by)
            .filter((name: string) => !!name), // remove null/undefined
        ),
      ];

      this.operatorList = [
        ...new Set(
          this.users
            .map((u: any) => u.operator_name)
            .filter((name: string) => !!name), // remove null/undefined
        ),
      ];

      if (keepFilter) {
        this.applyAllFilters();
      } else {
        this.filteredUsers = this.users;
      }
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
    this.applyAllFilters();
  }

  // onFilterChange() {
  //   const term = this.searchTerm.toLowerCase();

  //   this.filteredUsers = this.users.filter((user) => {
  //     const matchesSearch =
  //       user.user_name?.toLowerCase().includes(term) ||
  //       user.sublocality?.toLowerCase().includes(term) ||
  //       user.date?.includes(term);

  //     const matchesSublocality =
  //       !this.sublocality || user.sublocality === this.sublocality;

  //     const matchesRecievedBy =
  //       !this.selectedRecievedBy ||
  //       user.recieved_by === this.selectedRecievedBy;

  //     const matchesOperator =
  //       !this.selectOperator || user.operator_name === this.selectOperator;

  //     let matchesStatus = true;

  //     if (this.selectedStatus === 'recieved') {
  //       matchesStatus = user.isRecieved === true;
  //     } else if (this.selectedStatus === 'pending') {
  //       matchesStatus = user.isRecieved === false;
  //     }

  //     return (
  //       matchesSearch &&
  //       matchesSublocality &&
  //       matchesStatus &&
  //       matchesRecievedBy &&
  //       matchesOperator
  //     );
  //   });

  //   this.currentPage = 1;
  //   this.updateTotalPages();
  //   this.calculateTotals(this.filteredUsers);
  // }

  openExpenseModal(userData?: any) {
    const modalRef = this.modalService.open(NewConnectionModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });

    if (userData) {
      modalRef.componentInstance.editMode = true;
      modalRef.componentInstance.userData = userData;
    }

    modalRef.closed.subscribe((result) => {
      if (result) {
        this.loadExpenses(true);
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

    const userRef = doc(this.firestore, 'newConnection', this.selectedDeleteId);

    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.toastr.error('new Connection not found');
        return;
      }

      const logData = {
        ...userSnap.data(),
        type: 'newConnection',
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
        doc(this.firestore, 'newConnection', this.selectedDeleteId),
      );
      this.toastr.success('new Connection deleted');
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
      this.calculateTotals(this.users);
      this.filteredUsers = this.users;
      return;
    }

    this.filteredUsers = this.users.filter((user: any) => {
      return user.installation_date === this.selectedDate;
    });

    this.calculateTotals(this.filteredUsers);
  }

  filterByDateRange() {
    this.applyAllFilters();
  }

  //   filterByDateRange() {
  //   if (!this.fromDate && !this.toDate) {
  //     this.filteredUsers = this.users;
  //     this.calculateTotals(this.users);
  //     return;
  //   }

  //   this.filteredUsers = this.users.filter((user: any) => {
  //     const userDate = new Date(user.installation_date);

  //     const from = this.fromDate ? new Date(this.fromDate) : null;
  //     const to = this.toDate ? new Date(this.toDate) : null;

  //     if (from && to) {
  //       return userDate >= from && userDate <= to;
  //     }

  //     if (from) {
  //       return userDate >= from;
  //     }

  //     if (to) {
  //       return userDate <= to;
  //     }

  //     return true;
  //   });

  //   this.calculateTotals(this.filteredUsers);
  // }

  calculateTotals(data: any[]) {
    this.totalUsers = data.length;
    this.totalRecovery = data.reduce(
      (sum, item) => sum + (Number(item.installation_amount) || 0),
      0,
    );

    this.totalExpenses = data.reduce(
      (sum, item) => sum + (Number(item.recieved_amount) || 0),
      0,
    );

    this.totalProfit = this.totalRecovery - this.totalExpenses;
  }

  applyAllFilters() {
    const term = this.searchTerm?.toLowerCase() || '';

    this.filteredUsers = this.users.filter((user: any) => {
      // 👷 Operator restriction: only show assigned sublocalities
      if (this.role === 'operator' && !this.operatorSublocalities.includes(user.sublocality)) {
        return false;
      }

      const userDate = user.installation_date
        ? new Date(user.installation_date)
        : null;

      const from = this.fromDate ? new Date(this.fromDate) : null;
      const to = this.toDate ? new Date(this.toDate) : null;

      // 🔍 Search
      const matchesSearch =
        user.internet_id?.toLowerCase().includes(term) ||
        user.user_name?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
        user.date?.includes(term);

      // 📍 Sublocality
      const matchesSublocality =
        !this.sublocality || user.sublocality === this.sublocality;

      // 📍 Sub Area
      const matchesSubArea = !this.subArea || user.sub_area === this.subArea;

      // 👤 Recieved By
      const matchesRecievedBy =
        !this.selectedRecievedBy ||
        user.recieved_by === this.selectedRecievedBy;

      // 🧑‍🔧 Operator
      const matchesOperator =
        !this.operatorName || user.operator_name === this.operatorName;

      // 📊 Status
      let matchesStatus = true;
      if (this.selectedStatus === 'recieved') {
        matchesStatus = user.isRecieved === true;
      } else if (this.selectedStatus === 'pending') {
        matchesStatus = user.isRecieved === false;
      }

      // 🟢 Customer Status (active / inactive)
      const matchesCustomerStatus =
        !this.customerStatus ||
        (this.customerStatus === 'inactive' ? this.isInactive(user) : !this.isInactive(user));

      // 📅 Date Filter
      let matchesDate = true;
      if (userDate) {
        if (from && to) {
          matchesDate = userDate >= from && userDate <= to;
        } else if (from) {
          matchesDate = userDate >= from;
        } else if (to) {
          matchesDate = userDate <= to;
        }
      }
      let matchesMonth = true;

      if (this.selectedMonth) {
        const selectedMonthNumber = this.monthMap[this.selectedMonth]; // e.g. "05"
        const userMonth = user.installation_date?.split('-')[1]; // "05"

        matchesMonth = userMonth === selectedMonthNumber;
      }

      return (
        matchesSearch &&
        matchesSublocality &&
        matchesSubArea &&
        matchesRecievedBy &&
        matchesOperator &&
        matchesStatus &&
        matchesCustomerStatus &&
        matchesDate &&
        matchesMonth
      );
    });

    this.currentPage = 1;
    this.updateTotalPages();
    this.calculateTotals(this.filteredUsers);
  }

  showPdfModal: boolean = false;
  selectedUser: any;
  openPdfModal(user: any) {
    this.selectedUser = user;
    this.showPdfModal = true;
  }

  closePdfModal() {
    this.showPdfModal = false;
  }

  @ViewChild('pdfContent') pdfContent!: ElementRef;

  pdfUser: any;

  // downloadPDF() {
  //   const element = this.pdfContent.nativeElement;

  //   const opt = {
  //     margin: 5,
  //     filename: `invoice_${this.selectedUser.user_name}.pdf`,
  //     image: { type: 'jpeg' as 'jpeg', quality: 1 },
  //     html2canvas: { scale: 2 },
  //     jsPDF: {
  //       unit: 'mm',
  //       format: 'a4',
  //       orientation: 'portrait' as 'portrait',
  //     },
  //   };

  //   html2pdf().set(opt).from(element).save();
  // }

  downloadPDF() {
    const element = this.pdfContent.nativeElement;

    const opt = {
      margin: 5,
      filename: `invoice_${this.selectedUser.user_name}.pdf`,
      image: { type: 'jpeg' as 'jpeg', quality: 1 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: {
        unit: 'mm',
        // ensure tuple type [number, number] to satisfy Html2PdfOptions typing
        format: [210, this.getContentHeightInMM(element)] as [number, number], // dynamic height, A4 width
        orientation: 'portrait' as 'portrait',
      },
      pagebreak: { mode: 'avoid-all' }, // prevents forced breaks
    };

    html2pdf().set(opt).from(element).save();
  }

  async downloadImage() {
    const original = this.pdfContent.nativeElement;

    // Clone the element so original UI isn't disturbed
    const clone = original.cloneNode(true) as HTMLElement;

    // Fixed-width off-screen wrapper (forces desktop layout, col-md-6 side by side)
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '-99999px';
    wrapper.style.width = '900px';
    wrapper.style.background = '#fff';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Let images/layout settle before capture
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        width: 900,
        windowWidth: 900,
        height: clone.scrollHeight,
        windowHeight: clone.scrollHeight,
      });

      const image = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = image;
      link.download = `invoice_${this.selectedUser.user_name}.png`;
      link.click();
    } catch (err) {
      console.error(err);
      alert('Error generating image');
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  getContentHeightInMM(element: HTMLElement): number {
    const pxToMm = 0.264583; // 1px = 0.264583mm at 96dpi
    const heightPx = element.scrollHeight;
    return heightPx * pxToMm + 10; // +10mm buffer for margins
  }
  /** International digits for WhatsApp - see toWhatsappNumber for the formats handled. */
  formatPhoneNumber(phone: string): string {
    return toWhatsappNumber(phone);
  }

  async sendPdfToWhatsApp() {
    try {
      const phone = this.formatPhoneNumber(this.selectedUser.mobile_no);

      // const fileUrl = await this.generateAndUploadPDF();
      const fileUrl = await this.generateAndUploadImage();

      const message = `Dear ${this.selectedUser.user_name},

Your installation form is ready.

Download Image:
${fileUrl}`;

      openWhatsApp(phone, message);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF');
    }
  }

  // async generateAndUploadPDF(): Promise<string> {
  //   const element = this.pdfContent.nativeElement;

  //   const opt = {
  //   margin: 5,
  //   filename: `invoice_${this.selectedUser.user_name}.pdf`,
  //   image: { type: 'jpeg' as 'jpeg', quality: 1 },
  //   html2canvas: { scale: 2, useCORS: true },
  //   jsPDF: {
  //     unit: 'mm',
  //     // ensure tuple type [number, number] to satisfy Html2PdfOptions typing
  //     format: [210, this.getContentHeightInMM(element)] as [number, number], // dynamic height, A4 width
  //     orientation: 'portrait' as 'portrait',
  //   },
  //   pagebreak: { mode: 'avoid-all' }, // prevents forced breaks
  // };

  //   // ✅ Generate PDF Blob
  //   const pdfBlob: Blob = await html2pdf()
  //     .set(opt)
  //     .from(element)
  //     .outputPdf('blob');

  //   // ✅ Upload to Cloudinary
  //   const formData = new FormData();
  //   formData.append('file', pdfBlob);
  //   formData.append('upload_preset', 'pdf_upload');
  //   formData.append('resource_type', 'raw');

  //   const res: any = await fetch(
  //     'https://api.cloudinary.com/v1_1/dfafasksu/raw/upload',
  //     {
  //       method: 'POST',
  //       body: formData,
  //     },
  //   ).then((r) => r.json());

  //   console.log('Cloudinary Response:', res);

  //   if (!res.secure_url) {
  //     throw new Error('Upload failed');
  //   }

  //   return res.secure_url; // ✅ FINAL LINK
  // }

  async generateAndUploadImage(): Promise<string> {
    const original = this.pdfContent.nativeElement;

    // Clone the element so original UI isn't disturbed
    const clone = original.cloneNode(true) as HTMLElement;

    // Fixed-width off-screen wrapper (forces desktop layout, col-md-6 side by side)
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '-99999px';
    wrapper.style.width = '900px';
    wrapper.style.background = '#fff';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      // Let images/layout settle before capture
      await new Promise((resolve) => setTimeout(resolve, 150));

      // ✅ Convert HTML to Canvas
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        width: 900,
        windowWidth: 900,
        height: clone.scrollHeight,
        windowHeight: clone.scrollHeight,
      });

      // ✅ Convert Canvas to Blob (Image)
      const blob: Blob = await new Promise((resolve) => {
        canvas.toBlob((b: any) => resolve(b), 'image/png', 1);
      });

      // ✅ Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', 'pdf_upload'); // same preset works
      formData.append('resource_type', 'image'); // 🔥 IMPORTANT

      const res: any = await fetch(
        'https://api.cloudinary.com/v1_1/mghs1aiu/image/upload',
        {
          method: 'POST',
          body: formData,
        },
      ).then((r) => r.json());

      console.log('Cloudinary Response:', res);

      if (!res.secure_url) {
        throw new Error('Upload failed');
      }

      // ✅ Force download instead of inline preview when opened from WhatsApp
      const downloadUrl = res.secure_url.replace(
        '/upload/',
        `/upload/fl_attachment:${this.selectedUser.user_name}_installation_form/`,
      );

      return downloadUrl; // ✅ Return this instead of res.secure_url
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  async migrateUsersToMatchConnectionIds() {
    try {
      const newConnSnap = await getDocs(
        collection(this.firestore, 'newConnection'),
      );

      for (const connDoc of newConnSnap.docs) {
        const connData: any = connDoc.data();
        const connectionId = connDoc.id;

        if (!connData.internet_id) continue;

        // 🔍 find matching user by internet_id
        const q = query(
          collection(this.firestore, 'users'),
          where('internet_id', '==', connData.internet_id),
        );

        const userSnap = await getDocs(q);

        if (userSnap.empty) {
          console.warn('No user found for:', connData.internet_id);
          continue;
        }

        for (const userDoc of userSnap.docs) {
          const userData = userDoc.data();
          const oldUserId = userDoc.id;

          // ✅ Skip if already correct
          if (oldUserId === connectionId) {
            console.log('Already correct:', connectionId);
            continue;
          }

          // 🔥 Create new doc with correct ID
          await setDoc(doc(this.firestore, 'users', connectionId), {
            ...userData,
            connectionId: connectionId,
          });

          // ❌ Delete old doc
          await deleteDoc(doc(this.firestore, 'users', oldUserId));

          console.log(`Migrated user ${oldUserId} → ${connectionId}`);
        }
      }

      console.log('✅ Migration completed successfully');
      this.toastr.success('Migration completed');
    } catch (error) {
      console.error(error);
      this.toastr.error('Migration failed');
    }
  }

  async sendWhatsapp(user: any) {
    const rawNumber =
      user?.phone_no && user.phone_no !== '0' ? user.phone_no : user?.mobile_no;
    const formattedPhone = this.formatPhoneNumber(rawNumber);
    const message = this.mapTemplate(this.welcomeTemplate, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }

    this.sendWelcomeMessage(formattedPhone, message);
  }

  mapTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      supportNumber: this.companyDetail?.complain_no1 || undefined,
    });
  }

  sendWelcomeMessage(phone: string, message: string) {
    openWhatsApp(phone, message);
  }

  openMsgModal(user: any) {
    this.selectedMsgUser = user;
    this.modalService.open(this.msgModal, { centered: true });
  }

  async sendSmsWelcome(user: any) {
    const raw = user?.phone_no && user.phone_no !== '0' ? user.phone_no : user?.mobile_no;
    const phone = this.formatPhoneForSms(raw);
    if (!phone) { this.toastr.error('No valid phone number'); return; }
    const message = this.mapTemplate(this.welcomeTemplate, user);
    if (!message) { this.toastr.error('Template not loaded'); return; }
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  private formatPhoneForSms(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }
}
