import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { NgApexchartsModule } from 'ng-apexcharts';
import { UserModalComponent } from '../user-modal/user-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NewConnectionModalComponent } from '../new-connection-modal/new-connection-modal.component';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { RecoveryOfficerModalComponent } from '../recovery-officer-modal/recovery-officer-modal.component';
import { AreaModalComponent } from '../area-modal/area-modal.component';
import { CustomerStatusModalComponent } from '../customer-status-modal/customer-status-modal.component';
import { RouterLink } from '@angular/router';
import { MikrotikService, MikrotikServer } from '../../shared/mikrotik.service';
import { ZalDashboardCardComponent } from '../zal-dashboard-card/zal-dashboard-card.component';
import { CountUpDirective } from '../../shared/count-up.directive';
import { WarpFieldDirective } from '../../shared/warp-field.directive';

export interface MikrotikServerStat {
  id: MikrotikServer;
  label: string;
  ip: string;
  loading: boolean;
  error: string | null;
  total: number;
  active: number;
  disabled: number;
}

/** One row on the loading screen, ticked off when its data lands. */
interface BootStep {
  key: string;
  icon: string;
  label: string;
  detail: string;
  done: boolean;
  failed: boolean;
}

/** A line under the loading title: a joke, or (with an icon) a real fact. */
interface BootLine {
  icon?: string;
  text: string;
}

/** Facts from the last full load, shown straight away on the next visit. */
const BOOT_FACTS_KEY = 'dashBootFacts';

const BOOT_QUIPS = [
  'Untangling the fiber cables…',
  'Counting every rupee (twice)…',
  'Waking up the routers…',
  'Asking the packets to hurry up…',
  'Tightening the loose connectors…',
  'Checking who paid on time…',
  'Teaching the charts to stand tall…',
  'Polishing the numbers…',
];

/**
 * Chart palette in the brand colours, checked with the dataviz validator on the
 * white chart cards: slot 1 violet / slot 2 blue - colour-blind separation ΔE 9.2
 * (target 8), normal vision ΔE 19.8 (floor 15), both at least 3:1 on white.
 * One series = slot 1 only; a second series takes slot 2. Text never wears these.
 */
const CHART_COLORS = { series1: '#7c3aed', series2: '#0284c7' };
const CHART_INK = { primary: '#0f172a', secondary: '#475569', muted: '#64748b', grid: '#eef0f5' };
const CHART_FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Round an axis top up to a clean value (400, 600, 1.5M) so 4 steps read as round numbers. */
const niceCeil = (value: number): number => {
  if (!(value > 0)) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
};

interface ChartState {
  categories: string[];
  series: number[] | any[];
  currentPage: number;
  pageSize: number;
  chartOptions: any;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, NgApexchartsModule, RouterLink, ZalDashboardCardComponent, CountUpDirective, WarpFieldDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  readonly today = new Date();
  readonly greeting =
    this.today.getHours() < 12 ? 'Good morning'
    : this.today.getHours() < 17 ? 'Good afternoon'
    : 'Good evening';
  readonly userName = localStorage.getItem('name') || localStorage.getItem('username') || '';
  isOnline = navigator.onLine;

  @HostListener('window:online')
  onOnline() { this.isOnline = true; }

  @HostListener('window:offline')
  onOffline() { this.isOnline = false; }

  expandedChartId: string | null = null;
  charts: Record<string, ChartState> = {};

  mikrotikServers: MikrotikServerStat[] = [
    { id: 1, label: '194.1002', ip: '103.66.149.194', loading: true, error: null, total: 0, active: 0, disabled: 0 },
    { id: 2, label: '195.9998', ip: '103.66.149.195', loading: true, error: null, total: 0, active: 0, disabled: 0 },
  ];

  /* ── Loading screen ── */
  boot: 'running' | 'leaving' | 'done' = 'running';
  bootSteps: BootStep[] = [
    { key: 'users',       icon: 'fa-users',               label: 'Counting subscribers',     detail: '', done: false, failed: false },
    { key: 'packages',    icon: 'fa-gauge-high',          label: 'Lining up packages',       detail: '', done: false, failed: false },
    { key: 'bills',       icon: 'fa-file-invoice-dollar', label: 'Crunching the bills',      detail: '', done: false, failed: false },
    { key: 'recovery',    icon: 'fa-hand-holding-dollar', label: 'Totting up recovery',      detail: '', done: false, failed: false },
    { key: 'connections', icon: 'fa-user-plus',           label: 'Checking new connections', detail: '', done: false, failed: false },
  ];
  quip: BootLine = { text: '' };
  bootEnding = false;
  bootComplete = false;
  boosts = 0;
  bursts: number[] = [];
  private bootFacts = this.readBootFacts();
  private quipTick = 0;
  private quipIndex = Math.floor(Math.random() * BOOT_QUIPS.length);
  private factIndex = Math.floor(Math.random() * 4);
  private quipTimer?: ReturnType<typeof setInterval>;
  private bootCapTimer?: ReturnType<typeof setTimeout>;
  private bootExitTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private firestore: Firestore,
    private modalService: NgbModal,
    private mikrotikService: MikrotikService,
  ) {}

  async ngOnInit() {
    this.loadMikrotikStats();
    this.startBoot();

    // users and billCreator each feed several cards and charts - fetch them once and share
    const users = this.getCollection('users');
    const bills = this.getCollection('billCreator');
    const packageDoc = this.getDocument('internetPackage/internetPackageDoc');

    await Promise.all([
      this.bootStep('users', users.then((u) => {
        this.loadAreaUsersChart(u);
        return `${u.length.toLocaleString('en-US')} · ${this.getTotalAreas('areaUsers')} areas`;
      })),
      this.bootStep('packages', Promise.all([users, packageDoc]).then(([u, pkg]) => {
        this.loadPackageUsersChart(u, pkg);
        return `${this.getTotalAreas('packageUsers')} plans`;
      })),
      this.bootStep('bills', Promise.all([users, bills]).then(([u, b]) => {
        this.loadBills(b);
        this.loadBillCollectionChart(u);
        this.loadBillCreatorPieChart(u, b);
        return `Rs ${this.totalAmount.toLocaleString('en-US')}`;
      })),
      this.bootStep('recovery', this.loadRecoveryDetails().then(
        () => `Rs ${this.totalRecovery.toLocaleString('en-US')}`,
      )),
      this.bootStep('connections', this.loadNewConnections().then(
        () => `${this.totalNewConnections} new`,
      )),
    ]);

    // only a clean, un-skipped load earns "online" and refreshes the saved facts
    if (!this.bootEnding && this.bootSteps.every((s) => !s.failed)) {
      this.bootComplete = true;
      this.saveBootFacts();
    }
    this.finishBoot(650); // let "network online" land before lifting
  }

  ngOnDestroy() {
    clearInterval(this.quipTimer);
    clearTimeout(this.bootCapTimer);
    clearTimeout(this.bootExitTimer);
  }

  get bootProgress(): number {
    const done = this.bootSteps.filter((s) => s.done).length;
    return Math.round((done / this.bootSteps.length) * 100);
  }

  private startBoot() {
    this.showNextQuip();
    this.quipTimer = setInterval(() => this.showNextQuip(), 2600);
    // never hold the dashboard hostage on a slow or offline connection
    this.bootCapTimer = setTimeout(() => this.finishBoot(), 15000);
  }

  /** Alternates a real fact from the last sync with a joke (facts first). */
  private showNextQuip() {
    if (this.bootFacts.length && this.quipTick++ % 2 === 0) {
      this.quip = this.bootFacts[this.factIndex++ % this.bootFacts.length];
    } else {
      this.quipIndex = (this.quipIndex + 1) % BOOT_QUIPS.length;
      this.quip = { text: BOOT_QUIPS[this.quipIndex] };
    }
  }

  /** Tap on the logo: a shockwave and a burst of star speed. Just for fun. */
  boostSignal(stars: WarpFieldDirective) {
    stars.boost();
    const id = ++this.boosts;
    this.bursts = [...this.bursts, id];
    setTimeout(() => (this.bursts = this.bursts.filter((b) => b !== id)), 800);
  }

  private readBootFacts(): BootLine[] {
    try {
      const facts = JSON.parse(localStorage.getItem(BOOT_FACTS_KEY) || '[]');
      return Array.isArray(facts) ? facts.filter((f) => f && typeof f.text === 'string') : [];
    } catch {
      return [];
    }
  }

  private saveBootFacts() {
    const facts: BootLine[] = [];
    const subscribers = this.getTotalUsers('areaUsers');
    if (subscribers) {
      facts.push({
        icon: 'fa-tower-broadcast',
        text: `${subscribers.toLocaleString('en-US')} subscribers across ${this.getTotalAreas('areaUsers')} areas`,
      });
    }
    const area = this.topOf('areaUsers');
    if (area) {
      facts.push({ icon: 'fa-trophy', text: `Biggest area: ${area.name} · ${area.value.toLocaleString('en-US')} subscribers` });
    }
    const plan = this.topOf('packageUsers');
    if (plan && subscribers) {
      facts.push({ icon: 'fa-bolt', text: `Most popular plan: ${plan.name} · ${Math.round((plan.value / subscribers) * 100)}% of users` });
    }
    const month = this.topOf('billCollection');
    if (month) {
      const [m, y] = month.name.toLowerCase().split('-');
      const label = `${m.charAt(0).toUpperCase()}${m.slice(1)} ${y ?? ''}`.trim();
      facts.push({ icon: 'fa-sack-dollar', text: `Best collection month: ${label} · Rs ${month.value.toLocaleString('en-US')}` });
    }
    try {
      localStorage.setItem(BOOT_FACTS_KEY, JSON.stringify(facts));
    } catch {
      // storage full or blocked - the loader just shows jokes next time
    }
  }

  /** The largest bar in a chart, skipping blank / "undefined" categories. */
  private topOf(chartId: string): { name: string; value: number } | null {
    const chart = this.charts[chartId];
    if (!chart) return null;
    let best: { name: string; value: number } | null = null;
    for (let i = 0; i < chart.categories.length; i++) {
      const name = chart.categories[i];
      const value = Number(chart.series[i]) || 0;
      if (!name || name === 'undefined' || name === 'null') continue;
      if (value > 0 && (!best || value > best.value)) best = { name, value };
    }
    return best;
  }

  /** Awaits one load and ticks its row off; a failure is shown, never thrown. */
  private async bootStep(key: string, work: Promise<string>) {
    const step = this.bootSteps.find((s) => s.key === key)!;
    try {
      step.detail = await work;
    } catch (err) {
      console.error(`Dashboard: loading ${key} failed`, err);
      step.detail = 'Unavailable';
      step.failed = true;
    }
    step.done = true;
  }

  /** Lifts the loading screen: fade out, then drop it from the DOM. */
  finishBoot(holdMs = 0) {
    if (this.bootEnding) return;
    this.bootEnding = true;
    clearInterval(this.quipTimer);
    clearTimeout(this.bootCapTimer);
    this.bootExitTimer = setTimeout(() => {
      this.boot = 'leaving';
      this.bootExitTimer = setTimeout(() => (this.boot = 'done'), 700);
    }, holdMs);
  }

  loadMikrotikStats() {
    this.mikrotikServers.forEach((srv) => {
      srv.loading = true;
      srv.error = null;
      this.mikrotikService.getPppSecrets(srv.id).subscribe({
        next: (users) => {
          srv.total    = users.length;
          srv.active   = users.filter((u) => u.disabled !== 'true' && u.disabled !== 'yes').length;
          srv.disabled = users.filter((u) => u.disabled === 'true' || u.disabled === 'yes').length;
          srv.loading  = false;
        },
        error: (err) => {
          srv.error   = err.message || 'Cannot reach server';
          srv.loading = false;
        },
      });
    });
  }

  activePercent(srv: MikrotikServerStat): number {
    return srv.total ? Math.round((srv.active / srv.total) * 100) : 0;
  }

  /* ================================
      🔥 GENERIC FIRESTORE METHODS
  ================================= */

  async getDocument(path: string) {
    const docRef = doc(this.firestore, path);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  }

  async getCollection(collectionName: string) {
    const colRef = collection(this.firestore, collectionName);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => d.data());
  }

  getTotalAreas(chartId: string): number {
    return this.charts[chartId]?.categories?.length || 0;
  }

  getTotalUsers(chartId: string): number {
    return this.charts[chartId]?.series?.reduce((a, b) => a + b, 0) || 0;
  }

  /* ================================
      📊 GENERIC DATA PROCESSING
  ================================= */

  groupAndCount(data: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};

    data.forEach((item) => {
      const value = item[key];
      if (!result[value]) result[value] = 0;
      result[value]++;
    });

    return result;
  }

  convertToChartArrays(obj: Record<string, number>) {
    return {
      categories: Object.keys(obj),
      series: Object.values(obj),
    };
  }

  paginate(array: any[], page: number, pageSize: number) {
    const start = page * pageSize;
    return array.slice(start, start + pageSize);
  }

  /* ================================
      🎯 CHART INITIALIZER (GENERIC)
  ================================= */

  initializeChart(
    chartId: string,
    categories: string[],
    series: number[],
    title: string,
  ) {
    this.charts[chartId] = {
      categories,
      series,
      currentPage: 0,
      pageSize: 9,
      chartOptions: {},
    };

    this.updateChart(chartId, title);
  }

  /* ── Chart theme pieces ── */

  private chartBase(type: string, height: number) {
    return {
      type,
      height,
      fontFamily: CHART_FONT,
      foreColor: CHART_INK.muted,
      toolbar: { show: false },
      zoom: { enabled: false },
    };
  }

  private chartTitle(text: string) {
    return {
      text,
      style: { fontSize: '13px', fontWeight: '600', color: CHART_INK.primary, fontFamily: CHART_FONT },
    };
  }

  /** hairline, solid, horizontal only - the data stays the loud part */
  private readonly chartGrid = {
    borderColor: CHART_INK.grid,
    strokeDashArray: 0,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
  };

  private chartXAxis(categories: string[], extraLabels: object = {}) {
    return {
      categories,
      axisBorder: { color: CHART_INK.grid },
      axisTicks: { show: false },
      labels: { style: { colors: CHART_INK.secondary, fontSize: '11.5px' }, ...extraLabels },
    };
  }

  updateChart(chartId: string, title: string) {
    const chart = this.charts[chartId];

    const paginatedCategories = this.paginate(
      chart.categories,
      chart.currentPage,
      chart.pageSize,
    );

    const paginatedSeries = this.paginate(
      chart.series,
      chart.currentPage,
      chart.pageSize,
    );

    chart.chartOptions = {
      series: [
        {
          name: title,
          data: paginatedSeries,
        },
      ],
      chart: this.chartBase('bar', 350),
      // one measure across named categories: every bar the same brand violet
      colors: [CHART_COLORS.series1],
      plotOptions: {
        bar: {
          distributed: false,
          columnWidth: '40%',
          borderRadius: 4,
          borderRadiusApplication: 'end',
          dataLabels: { position: 'top' },
        },
      },
      stroke: { show: true, width: 2, colors: ['transparent'] },
      fill: { opacity: 1 },
      states: { hover: { filter: { type: 'darken', value: 0.88 } } },
      xaxis: this.chartXAxis(paginatedCategories),
      yaxis: {
        min: 0,
        max: (max: number) => niceCeil(max * 1.1), // clean top, with room for the value labels
        tickAmount: 4,
        labels: { style: { colors: CHART_INK.muted }, formatter: (v: number) => Math.round(v).toLocaleString('en-US') },
      },
      // value on each cap, in text ink
      dataLabels: {
        enabled: true,
        offsetY: -20,
        style: { fontSize: '11px', fontWeight: 600, colors: [CHART_INK.secondary] },
      },
      grid: this.chartGrid,
      legend: { show: false },
      markers: { size: 0 },
      tooltip: {
        theme: 'light',
        y: { formatter: (v: number) => `${(v || 0).toLocaleString('en-US')} users` },
      },
      title: this.chartTitle(title),
    };
  }

  nextPage(chartId: string, title: string) {
    const chart = this.charts[chartId];

    if ((chart.currentPage + 1) * chart.pageSize < chart.categories.length) {
      chart.currentPage++;
      this.updateChart(chartId, title);
    }
  }

  prevPage(chartId: string, title: string) {
    const chart = this.charts[chartId];

    if (chart.currentPage > 0) {
      chart.currentPage--;
      this.updateChart(chartId, title);
    }
  }

  /* ================================
      🚀 AREA USERS CHART
  ================================= */

  loadAreaUsersChart(users: any[]) {
    const grouped = this.groupAndCount(users, 'sublocality');

    const chartData = this.convertToChartArrays(grouped);

    this.initializeChart(
      'areaUsers',
      chartData.categories,
      chartData.series,
      'Users by Area',
    );
  }

  /* ================================
      🚀 LOAD PACKAGE USERS CHART
================================ */

  loadPackageUsersChart(users: any[], packageDoc: any) {
    // 1️⃣ All packages from internetPackageDoc
    const packages: string[] = packageDoc
      ? packageDoc.internetPackage.map((p: any) => p.package_name)
      : [];

    // 2️⃣ Count users per package
    const grouped: Record<string, number> = {};
    packages.forEach((pkg) => (grouped[pkg] = 0)); // initialize all packages with 0

    users.forEach((user) => {
      const pkg = user['select_package'];
      if (grouped[pkg] !== undefined) {
        grouped[pkg]++;
      }
    });

    const chartData = this.convertToChartArrays(grouped);

    // 3️⃣ Initialize chart (generic)
    this.initializeChart(
      'packageUsers',
      chartData.categories,
      chartData.series,
      'Users by Package',
    );
  }

  loadBillCollectionChart(users: any[]) {
    // 1️⃣ Prepare month-year sums
    const monthYearMap: Record<string, number> = {};

    users.forEach((user) => {
      if (Array.isArray(user['bills'])) {
        user['bills'].forEach((bill: any) => {
          if (bill.status === 'paid' && bill.collected_amount) {
            const key = `${bill.month}-${bill.year}`.toLowerCase();
            if (!monthYearMap[key]) monthYearMap[key] = 0;
            monthYearMap[key] += bill.collected_amount;
          }
        });
      }
    });

    // 2️⃣ Sort keys by year+month order
    const monthOrder = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];

    const sortedKeys = Object.keys(monthYearMap).sort((a, b) => {
      const [monthA, yearA] = a.split('-');
      const [monthB, yearB] = b.split('-');

      if (parseInt(yearA) !== parseInt(yearB)) {
        return parseInt(yearA) - parseInt(yearB);
      }
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });

    const series = sortedKeys.map((k) => monthYearMap[k]);

    // 3️⃣ Initialize Bill Collection chart (direct ApexCharts object)
    this.charts['billCollection'] = {
      categories: sortedKeys.map((k) => k.toUpperCase()),
      series: series,
      currentPage: 0,
      pageSize: 12,
      chartOptions: {
        series: [
          {
            name: 'Monthly Bill Collection',
            data: series,
          },
        ],
        chart: this.chartBase('area', 350),
        colors: [CHART_COLORS.series1],
        stroke: { curve: 'smooth', width: 2, lineCap: 'round' },
        // the brand hue as a faint wash under the line
        fill: {
          type: 'gradient',
          gradient: { shadeIntensity: 0, opacityFrom: 0.16, opacityTo: 0, stops: [0, 100] },
        },
        markers: {
          size: 4,
          colors: [CHART_COLORS.series1],
          strokeColors: '#fff',
          strokeWidth: 2,
          hover: { size: 6 },
        },
        xaxis: this.chartXAxis(sortedKeys.map((k) => k.toUpperCase())),
        yaxis: {
          min: 0,
          max: (max: number) => niceCeil(max * 1.08), // room for the value above the top point
          tickAmount: 4,
          labels: { style: { colors: CHART_INK.muted }, formatter: (v: number) => 'Rs ' + compact.format(v) },
        },
        // values stay on the points, short and in text ink rather than coloured badges
        dataLabels: {
          enabled: true,
          offsetY: -6,
          background: { enabled: false },
          style: { fontSize: '10.5px', fontWeight: 600, colors: [CHART_INK.secondary] },
          formatter: (v: number) => compact.format(v),
        },
        grid: this.chartGrid,
        legend: { show: false },
        title: this.chartTitle('Monthly Bill Collection'),
        tooltip: {
          theme: 'light',
          y: {
            formatter: (val: number) => 'Rs. ' + (val || 0).toLocaleString('en-US'),
          },
        },
      },
    };
  }

  loadBillCreatorPieChart(users: any[], bills: any[]) {
    const monthOrder = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];

    // 1️⃣ Bill amounts generated (billCreator collection)
    const generatedMap: Record<string, number> = {};
    bills.forEach((bill: any) => {
      const key = `${bill.month}-${bill.year}`.toLowerCase();
      if (!generatedMap[key]) generatedMap[key] = 0;
      generatedMap[key] += bill.amount || 0;
    });

    // 2️⃣ Bill amounts collected (paid bills inside users collection)
    const collectedMap: Record<string, number> = {};
    users.forEach((user: any) => {
      if (Array.isArray(user['bills'])) {
        user['bills'].forEach((bill: any) => {
          if (bill.status === 'paid' && bill.collected_amount) {
            const key = `${bill.month}-${bill.year}`.toLowerCase();
            if (!collectedMap[key]) collectedMap[key] = 0;
            collectedMap[key] += bill.collected_amount;
          }
        });
      }
    });

    // 3️⃣ Merge and sort all month keys
    const allKeys = Array.from(new Set([...Object.keys(generatedMap), ...Object.keys(collectedMap)]));
    const sortedKeys = allKeys.sort((a, b) => {
      const [monthA, yearA] = a.split('-');
      const [monthB, yearB] = b.split('-');
      if (parseInt(yearA) !== parseInt(yearB)) return parseInt(yearA) - parseInt(yearB);
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });

    const labels = sortedKeys.map((k) => k.toUpperCase());
    const generatedSeries = sortedKeys.map((k) => generatedMap[k] || 0);
    const collectedSeries = sortedKeys.map((k) => collectedMap[k] || 0);

    // 4️⃣ Mixed chart: bars = generated, line = collected
    this.charts['billCreatorPie'] = {
      categories: labels,
      series: generatedSeries,
      currentPage: 0,
      pageSize: 12,
      chartOptions: {
        series: [
          { name: 'Bills Generated', type: 'column', data: generatedSeries },
          { name: 'Amount Collected', type: 'line',   data: collectedSeries },
        ],
        chart: this.chartBase('line', 380),
        stroke: {
          width: [0, 2],
          curve: 'smooth',
          lineCap: 'round',
        },
        plotOptions: {
          bar: { columnWidth: '45%', borderRadius: 4, borderRadiusApplication: 'end' },
        },
        fill: {
          opacity: [0.9, 1],
        },
        // two series: brand slot 1 (generated) and slot 2 (collected)
        colors: [CHART_COLORS.series1, CHART_COLORS.series2],
        markers: {
          size: [0, 4],
          strokeColors: '#fff',
          strokeWidth: 2,
          hover: { size: 6 },
        },
        xaxis: this.chartXAxis(labels, { rotate: -35 }),
        yaxis: {
          min: 0,
          max: (max: number) => niceCeil(max),
          tickAmount: 4,
          title: { text: 'Amount (Rs.)', style: { color: CHART_INK.muted, fontWeight: 500, fontFamily: CHART_FONT } },
          labels: { style: { colors: CHART_INK.muted }, formatter: (v: number) => 'Rs ' + compact.format(v) },
        },
        dataLabels: { enabled: false },
        grid: this.chartGrid,
        legend: {
          position: 'top',
          horizontalAlign: 'left',
          fontWeight: 600,
          labels: { colors: CHART_INK.secondary },
          markers: { width: 10, height: 10, radius: 3 },
          itemMargin: { horizontal: 10 },
        },
        tooltip: {
          shared: true,
          intersect: false,
          theme: 'light',
          y: { formatter: (val: number) => 'Rs. ' + (val || 0).toLocaleString('en-US') },
        },
        title: this.chartTitle('Monthly Bill Generation vs Collection'),
      },
    };
  }

  toggleExpand(chartId: string): void {
    this.expandedChartId = this.expandedChartId === chartId ? null : chartId;
  }

  openUserModal() {
    const modalRef = this.modalService.open(UserModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openNewConnectionModal() {
    const modalRef = this.modalService.open(NewConnectionModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openExpensesModal() {
    const modalRef = this.modalService.open(ExpenseModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openRecoveryOfficerModal() {
    const modalRef = this.modalService.open(RecoveryOfficerModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openAreaDetailsModal() {
    const modalRef = this.modalService.open(AreaModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openCustomerStatusModal() {
    const modalRef = this.modalService.open(CustomerStatusModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  expenses: any[] = [];
  filteredUsers: any[] = [];


  async loadRecoveryDetails() {
  try {
    const usersRef = collection(this.firestore, 'recoveryDetails');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    this.expenses = snapshot.docs
      .map((docSnap) => {
        const data: any = docSnap.data();

        // 🔹 Convert Firestore timestamp to JS Date
        const createdAtDate = data.createdAt?.toDate();

        return {
          id: docSnap.id,
          ...data,
          createdAtDate,
        };
      })
      // ✅ FILTER CURRENT MONTH
      .filter((item) => {
        if (!item.createdAtDate) return false;

        return (
          item.createdAtDate.getMonth() === currentMonth &&
          item.createdAtDate.getFullYear() === currentYear
        );
      })
      // 🔥 AFTER FILTER → calculate values
      .map((data) => {
        const total_expenses =
          (data.total_expenses || 0)

        const profit = (data.total_recovery || 0) - (data.total_expenses || 0);

        return {
          ...data,
          total_expenses,
          profit,
        };
      });

    this.filteredUsers = this.expenses;
    this.calculateTotals(this.expenses);

    console.log('Filtered Monthly Data:', this.expenses);
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

  totalRecovery: number = 0;
  totalExpenses: number = 0;
  totalProfit: number = 0;

  calculateTotals(data: any[]) {
    this.totalRecovery = data.reduce(
      (sum, item) => sum + (item.total_recovery || 0),
      0,
    );

    this.totalExpenses = data.reduce(
      (sum, item) => sum + (item.total_expenses || 0),
      0,
    );

    this.totalProfit = data.reduce((sum, item) => sum + (item.profit || 0), 0);
  }

  totalNewConnections: number = 0;

 async loadNewConnections() {
  try {
    const usersRef = collection(this.firestore, 'newConnection');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    const connections = snapshot.docs.map((docSnap) => {
      const data: any = docSnap.data();

      return {
        id: docSnap.id,
        ...data,
        createdAtDate: data.createdAt?.toDate(),
      };
    });

    // ✅ Filter current month
    const currentMonthConnections = connections.filter((item) => {
      if (!item.createdAtDate) return false;

      return (
        item.createdAtDate.getMonth() === currentMonth &&
        item.createdAtDate.getFullYear() === currentYear
      );
    });

    // 🔥 COUNT
    this.totalNewConnections = currentMonthConnections.length;

    console.log('Current Month Connections:', this.totalNewConnections);

  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

filteredBills: any[] = [];
bills: any[] = [];        // ✅ array hona chahiye
totalAmount: number = 0;  // ✅ total amount ke liye

loadBills(bills: any[]) {
  const now = new Date();
  const currentMonth = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const currentYear = now.getFullYear().toString();

  // ✅ all bills
  this.bills = bills;

  // ✅ filter current month (e.g. July)
  this.filteredBills = this.bills.filter((bill: any) => {
    return (
      bill.month?.toLowerCase() === currentMonth &&
      bill.year === currentYear
    );
  });

  // ✅ total amount calculate
  this.totalAmount = this.filteredBills.reduce((sum, bill: any) => {
    return sum + (bill.amount || 0);
  }, 0);
}
}
