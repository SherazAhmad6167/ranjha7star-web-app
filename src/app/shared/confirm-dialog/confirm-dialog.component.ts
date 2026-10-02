import { Component, Injectable } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** danger = red (deletes); warn = amber (reversible but important). */
  tone?: 'danger' | 'warn';
  icon?: string;
}

/**
 * The app's "Are you sure?" dialog - same look as the delete modals (`gdm-*`
 * styles in styles.scss). Open it through ConfirmService.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="gdm-wrap" [class.warn]="tone === 'warn'">
      <button class="gdm-close" type="button" aria-label="Close" (click)="modal.dismiss()">
        <i class="ri-close-line"></i>
      </button>
      <div class="gdm-icon"><i [class]="icon"></i></div>
      <h5 class="gdm-title">{{ title }}</h5>
      @if (message) {
        <p class="gdm-text">{{ message }}</p>
      }
      <div class="gdm-actions">
        <button class="gdm-btn gdm-cancel" type="button" ngbAutofocus (click)="modal.dismiss()">{{ cancelText }}</button>
        <button class="gdm-btn gdm-confirm" type="button" (click)="modal.close(true)">
          <i [class]="icon"></i> {{ confirmText }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent implements Required<Omit<ConfirmOptions, 'message'>> {
  title = 'Are you sure?';
  message = '';
  confirmText = 'Confirm';
  cancelText = 'Cancel';
  tone: 'danger' | 'warn' = 'danger';
  icon = 'ri-delete-bin-6-line';

  constructor(public modal: NgbActiveModal) {}
}

/**
 * Branded replacement for window.confirm():
 *
 *   if (!(await this.confirmDialog.ask({ title: 'Delete this template?', confirmText: 'Delete' }))) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private modals: NgbModal) {}

  ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.modals.open(ConfirmDialogComponent, { centered: true });
    const dialog = ref.componentInstance as ConfirmDialogComponent;
    Object.assign(dialog, {
      ...options,
      icon: options.icon ?? (options.tone === 'warn' ? 'ri-error-warning-line' : 'ri-delete-bin-6-line'),
    });
    return ref.result.then(() => true, () => false);
  }
}
