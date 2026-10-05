import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { collection, Firestore, getDocs } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { LoaderComponent } from '../../../shared/loader/loader.component';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  checkBillingHealth,
  HEALTH_CHECKS,
  HealthCode,
  HealthIssue,
  HealthSeverity,
} from '../../../shared/billing-health';
import { lastLedgerEntryAt } from '../../../shared/ledger';
import { UserCollectionModalComponent } from '../../user-collection-modal/user-collection-modal.component';

const SEVERITY_ORDER: Record<HealthSeverity, number> = { error: 0, warn: 1, info: 2 };
const PAGE = 50;

/** Read-only scan of every customer's bills - lists what looks wrong. */
@Component({
  selector: 'app-billing-health',
  imports: [CommonModule, FormsModule, LoaderComponent],
  templateUrl: './billing-health.component.html',
  styleUrl: './billing-health.component.scss',
})
export class BillingHealthComponent {
  readonly checks = HEALTH_CHECKS;
  readonly codes = Object.keys(HEALTH_CHECKS) as HealthCode[];

  isLoading = false;
  issues: HealthIssue[] = [];
  filtered: HealthIssue[] = [];
  areas: string[] = [];
  usersScanned = 0;
  scannedAt: Date | null = null;

  /** Last history entry from any device: undefined while unknown, null if none yet. */
  historyAt: Date | null | undefined = undefined;
  historyError = false;

  code: HealthCode | '' = '';
  severity: HealthSeverity | '' = '';
  area = '';
  search = '';
  limit = PAGE;

  constructor(
    private firestore: Firestore,
    private modalService: NgbModal,
    private toastr: ToastService,
  ) {}

  ngOnInit() {
    this.scan();
  }

  async scan() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const snap = await getDocs(collection(this.firestore, 'users'));
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      this.usersScanned = users.length;
      this.issues = checkBillingHealth(users).sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          this.codes.indexOf(a.code) - this.codes.indexOf(b.code) ||
          a.internet_id.localeCompare(b.internet_id, undefined, { numeric: true }),
      );
      this.areas = [...new Set(this.issues.map((i) => i.sublocality).filter(Boolean))].sort();
      this.scannedAt = new Date();
      this.applyFilters();
    } catch (err) {
      console.error('Billing health scan failed', err);
      this.toastr.error('Could not load customers for the check');
    } finally {
      this.isLoading = false;
    }

    this.loadHistoryStatus();
  }

  private async loadHistoryStatus() {
    try {
      this.historyAt = await lastLedgerEntryAt(this.firestore);
      this.historyError = false;
    } catch (err) {
      console.error('Could not read history', err);
      this.historyError = true;
    }
  }

  countFor(code: HealthCode): number {
    return this.issues.filter((i) => i.code === code).length;
  }

  countSeverity(severity: HealthSeverity): number {
    return this.issues.filter((i) => i.severity === severity).length;
  }

  pickCode(code: HealthCode) {
    this.code = this.code === code ? '' : code;
    this.applyFilters();
  }

  applyFilters() {
    const term = this.search.trim().toLowerCase();
    this.filtered = this.issues.filter(
      (i) =>
        (!this.code || i.code === this.code) &&
        (!this.severity || i.severity === this.severity) &&
        (!this.area || i.sublocality === this.area) &&
        (!term ||
          i.internet_id.toLowerCase().includes(term) ||
          i.user_name.toLowerCase().includes(term) ||
          i.message.toLowerCase().includes(term)),
    );
    this.limit = PAGE;
  }

  get visible(): HealthIssue[] {
    return this.filtered.slice(0, this.limit);
  }

  showMore() {
    this.limit += PAGE;
  }

  monthLabel(issue: HealthIssue): string {
    if (!issue.month) return '—';
    const m = issue.month;
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${issue.year || ''}`.trim();
  }

  openCustomer(issue: HealthIssue) {
    const ref = this.modalService.open(UserCollectionModalComponent, {
      size: 'xl',
      scrollable: true,
    });
    ref.componentInstance.docId = issue.user_id;
  }

  /** The current list as a CSV file, to work through it offline. */
  exportCsv() {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Severity', 'Check', 'Internet ID', 'Name', 'Area', 'Month', 'Type', 'Details'],
      ...this.filtered.map((i) => [
        i.severity,
        this.checks[i.code].title,
        i.internet_id,
        i.user_name,
        i.sublocality,
        this.monthLabel(i),
        i.bill_type || '',
        i.message,
      ]),
    ];
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');

    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `billing-health-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
