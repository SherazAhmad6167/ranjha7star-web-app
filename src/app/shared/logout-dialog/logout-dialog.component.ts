import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SyncService, SyncState } from '../sync/sync.service';

type Tone = 'ok' | 'busy' | 'idle' | 'warn';

/** What signing out means for this device's unsent changes, per sync state. */
const SYNC_VIEW: Record<SyncState, { icon: string; title: string; text: string; tone: Tone }> = {
  synced: {
    icon: 'ri-shield-check-line',
    title: 'Everything is saved',
    text: 'All your changes are on the server.',
    tone: 'ok',
  },
  syncing: {
    icon: 'ri-loader-4-line',
    title: 'Uploading your last changes…',
    text: 'Give it a moment before you sign out.',
    tone: 'busy',
  },
  offline: {
    icon: 'ri-wifi-off-line',
    title: 'You are offline',
    text: 'Nothing is waiting to upload.',
    tone: 'idle',
  },
  'offline-pending': {
    icon: 'ri-cloud-off-line',
    title: 'Changes waiting to upload',
    text: 'They are kept on this device and upload the next time it is online. Do not clear the browser data.',
    tone: 'warn',
  },
};

const LEAVE_MS = 450;

/**
 * Sign-out dialog. Before you go it shows whether this device's changes have
 * reached the server - collections are often saved offline in the field.
 * Closes with `true` to sign out.
 */
@Component({
  selector: 'app-logout-dialog',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './logout-dialog.component.html',
  styleUrl: './logout-dialog.component.scss',
})
export class LogoutDialogComponent {
  readonly modal = inject(NgbActiveModal);
  readonly sync = inject(SyncService);

  /** Set by the opener. */
  name = '';
  username = '';
  role = '';

  readonly leaving = signal(false);
  readonly syncView = computed(() => SYNC_VIEW[this.sync.state()]);
  readonly greeting = greetingFor(new Date());

  get firstName(): string {
    const first = (this.name || this.username).trim().split(/\s+/)[0] || '';
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  get initial(): string {
    return (this.name || this.username).trim().charAt(0).toUpperCase() || '?';
  }

  get roleLabel(): string {
    if (this.role === 'admin') return 'Admin';
    if (this.role === 'operator') return 'Operator';
    return this.role;
  }

  /** Plays the walk-out, then closes - at once for reduced motion. */
  signOut() {
    if (this.leaving()) return;
    this.leaving.set(true);

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => this.modal.close(true), still ? 0 : LEAVE_MS);
  }
}

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}
