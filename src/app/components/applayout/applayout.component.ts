import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, TemplateRef, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { ThemeService } from '../../shared/theme.service';

@Component({
  selector: 'app-applayout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './applayout.component.html',
  styleUrl: './applayout.component.scss',
})
export class ApplayoutComponent {
  sidebarVisible = true;
  role: string | null = '';
  birthdayUsers: any[] = [];
  birthdayDismissed = false;
  // New material issue forms the admin hasn't ticked yet (adminSeen === false).
  materialAlerts: any[] = [];
  private materialUnsub: (() => void) | null = null;
  private readonly materialItemLabels: Record<string, string> = {
    modem: 'Modem', pigtail: 'Pectail', choti_dabi: 'Choti Dabi', bari_dabi: 'Bari Dabi',
    swab: 'Swab', splitter: 'Splitter', meter_bag: 'Meter Bag', cable_tie: 'Cable Tie',
    fiber_cable: 'Fiber Cable', sleeve: 'Sleeve', cutter: 'Cutter', paper_cutter: 'Paper Cutter',
    plass: 'Plass', passive_node: 'Passive Node', cable_node: 'Cable Node', adaptor: 'Adaptor',
    nito: 'Nito Tape', osaka: 'Osaka Tape', packingTape: 'Packing Tape',
  };
  @ViewChild('sidebar') sidebar!: ElementRef;
  @ViewChild('toggleBtn') toggleBtn!: ElementRef;
  isDashboard = false;
  userName = '';
  userInitial = '';
  currentPage: { title: string; section: string; icon: string } = {
    title: 'Ranjha7star',
    section: 'Portal',
    icon: 'ri-home-5-line',
  };

  // Drives the top bar's title / breadcrumb / icon.
  private readonly pageMeta: Record<string, { title: string; section: string; icon: string }> = {
    '/dashboard':        { title: 'Dashboard',         section: 'Overview',      icon: 'ri-dashboard-line' },
    '/user-details':     { title: 'User Details',      section: 'Customers',     icon: 'ri-user-line' },
    '/user-collections': { title: 'User Collections',  section: 'Customers',     icon: 'ri-folders-line' },
    '/new-connection':   { title: 'New Connection',    section: 'Customers',     icon: 'ri-add-circle-line' },
    '/customer-status':  { title: 'Customer Status',   section: 'Customers',     icon: 'ri-shield-check-line' },
    '/defaulter-users':  { title: 'Defaulter Users',   section: 'Customers',     icon: 'ri-error-warning-line' },
    '/complain-details': { title: 'Complaints',        section: 'Customers',     icon: 'ri-chat-delete-line' },
    '/bill-creator':     { title: 'Bill Creator',      section: 'Finance',       icon: 'ri-file-text-line' },
    '/recovery-details': { title: 'Recovery Details',  section: 'Finance',       icon: 'ri-refund-2-line' },
    '/recovery-officer': { title: 'Recovery Officer',  section: 'Finance',       icon: 'ri-user-star-line' },
    '/ro-reports':       { title: 'RO Reports',        section: 'Finance',       icon: 'ri-bar-chart-box-line' },
    '/expenses':         { title: 'Expenses',          section: 'Finance',       icon: 'ri-wallet-3-line' },
    '/borrow-details':   { title: 'Borrow Details',    section: 'Finance',       icon: 'ri-hand-coin-line' },
    '/payable-details':  { title: 'Payable Details',   section: 'Finance',       icon: 'ri-bank-card-line' },
    '/mikrotik-users':   { title: 'MikroTik Users',    section: 'Network',       icon: 'ri-router-line' },
    '/zal-subscribers':  { title: 'ZalUltra Subscribers', section: 'Network',  icon: 'ri-server-line' },
    '/area-details':     { title: 'Area Details',      section: 'Network',       icon: 'ri-map-pin-line' },
    '/sub-area-details': { title: 'Sub-Area Details',  section: 'Network',       icon: 'ri-map-2-line' },
    '/city-details':     { title: 'City Details',      section: 'Network',       icon: 'ri-building-line' },
    '/package-details':  { title: 'Package Details',   section: 'Network',       icon: 'ri-price-tag-3-line' },
    '/operator-details': { title: 'Operator Details',  section: 'Network',       icon: 'ri-user-settings-line' },
    '/router-details':   { title: 'Router Details',    section: 'Network',       icon: 'ri-router-fill' },
    '/material-details': { title: 'Material Details',  section: 'Management',    icon: 'ri-tools-line' },
    '/stock-details':    { title: 'Stock Details',     section: 'Management',    icon: 'ri-inbox-2-line' },
    '/company-detail':   { title: 'Company Detail',    section: 'Management',    icon: 'ri-building-4-line' },
    '/website-detail':   { title: 'Website Content',   section: 'Management',    icon: 'ri-global-line' },
    '/sms':              { title: 'Mobile SMS',        section: 'Communication', icon: 'ri-chat-forward-line' },
    '/logs':             { title: 'Logs',              section: 'System',        icon: 'ri-file-list-3-line' },
    '/upload-docs':      { title: 'Upload Docs',       section: 'System',        icon: 'ri-upload-cloud-line' },
    '/settings':         { title: 'Settings',          section: 'System',        icon: 'ri-equalizer-line' },
  };

  expandedSections: Record<string, boolean> = {
    customers: true,
    finance: false,
    network: false,
    management: false,
    communication: false,
    system: false,
  };

  @ViewChild('logoutModal') logoutModal!: TemplateRef<any>;

  constructor(
    private route: Router,
    private modalService: NgbModal,
    private firestore: Firestore,
    public themeService: ThemeService,
  ) {
    this.route.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.isDashboard = this.route.url === '/dashboard';
        this.autoExpandSection(this.route.url);
        this.setCurrentPage(this.route.url);
      }
    });
  }

  ngOnInit() {
    this.role = localStorage.getItem('role');
    this.userName =
      localStorage.getItem('name') || localStorage.getItem('username') || '';
    this.userInitial = (this.userName.trim().charAt(0) || '?').toUpperCase();
    this.setCurrentPage(this.route.url);
    this.checkBirthdays();
    if (this.role === 'admin') this.watchMaterialAlerts();
  }

  ngOnDestroy() {
    this.materialUnsub?.();
  }

  /** Live-listens so materials added by operators pop up without a reload. */
  watchMaterialAlerts() {
    const q = query(collection(this.firestore, 'materialDetails'), where('adminSeen', '==', false));
    this.materialUnsub = onSnapshot(
      q,
      (snap) => {
        const toTime = (v: any) => (v?.toDate ? v.toDate().getTime() : new Date(v || 0).getTime());
        this.materialAlerts = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
      },
      (err) => console.error('Material alerts listener failed', err),
    );
  }

  /** Issued items with a quantity, e.g. [{label:'Modem', qty:'1'}]. */
  materialItems(m: any): { label: string; qty: string }[] {
    return Object.keys(this.materialItemLabels)
      .filter((k) => {
        const v = m?.[k];
        return v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '0';
      })
      .map((k) => ({ label: this.materialItemLabels[k], qty: String(m[k]) }));
  }

  trackById(_: number, m: any) {
    return m.id;
  }

  openMaterial(m: any) {
    this.route.navigate(['/material-details'], { queryParams: { open: m.id } });
  }

  async markMaterialSeen(m: any) {
    // Hide right away; the listener drops it too once the write lands.
    this.materialAlerts = this.materialAlerts.filter((x) => x.id !== m.id);
    try {
      await updateDoc(doc(this.firestore, 'materialDetails', m.id), {
        adminSeen: true,
        adminSeenAt: new Date(),
      });
    } catch (err) {
      console.error('Failed to mark material as seen', err);
    }
  }

  private setCurrentPage(url: string) {
    const path = (url || '').split('?')[0];
    this.currentPage = this.pageMeta[path] || {
      title: 'Ranjha7star',
      section: 'Portal',
      icon: 'ri-home-5-line',
    };
  }

  async checkBirthdays() {
    try {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const snap = await getDocs(collection(this.firestore, 'users'));
      this.birthdayUsers = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(u => {
          const dob: string = u.date_of_birth || '';
          if (!dob) return false;
          const parts = dob.split('-');
          return parts.length === 3 && parts[1] === mm && parts[2] === dd;
        });
    } catch {}
  }

  goWishBirthdays() {
    this.route.navigate(['/sms'], { queryParams: { template: 'birthday' } });
  }

  toggleSection(key: string) {
    this.expandedSections[key] = !this.expandedSections[key];
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
  }

  refreshApp() {
    window.location.reload();
  }

  onMenuClick() {
    if (window.innerWidth < 768) {
      this.sidebarVisible = false;
    }
  }

  openLogoutModal() {
    this.modalService.open(this.logoutModal, { centered: true, windowClass: 'logout-modal-dialog' });
  }

  logout(modal: any) {
    modal.close();
    // The WhatsApp choice belongs to the device, not the account: keep it.
    const whatsappApp = localStorage.getItem('whatsappApp');
    localStorage.clear();
    if (whatsappApp) localStorage.setItem('whatsappApp', whatsappApp);
    this.route.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;

    if (window.innerWidth < 768 && this.sidebarVisible) {
      if (
        this.sidebar &&
        !this.sidebar.nativeElement.contains(target) &&
        this.toggleBtn &&
        !this.toggleBtn.nativeElement.contains(target)
      ) {
        this.sidebarVisible = false;
      }
    }
  }

  private autoExpandSection(url: string) {
    const sectionMap: Record<string, string[]> = {
      customers: ['/user-details', '/user-collections', '/new-connection', '/customer-status', '/defaulter-users', '/complain-details'],
      finance: ['/bill-creator', '/recovery-details', '/recovery-officer', '/ro-reports', '/expenses', '/borrow-details', '/payable-details'],
      network: ['/zal-subscribers', '/mikrotik-users', '/area-details', '/sub-area-details', '/city-details', '/package-details', '/operator-details', '/router-details'],
      management: ['/material-details', '/stock-details', '/company-detail', '/website-detail'],
      communication: ['/sms'],
      system: ['/logs', '/upload-docs', '/settings'],
    };

    for (const [section, routes] of Object.entries(sectionMap)) {
      if (routes.some(r => url.startsWith(r))) {
        this.expandedSections[section] = true;
        break;
      }
    }
  }
}
