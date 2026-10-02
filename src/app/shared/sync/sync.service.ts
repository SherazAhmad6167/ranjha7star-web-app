import { computed, Injectable, NgZone, signal } from '@angular/core';
import { Firestore, waitForPendingWrites } from '@angular/fire/firestore';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'offline-pending';

const CHECK_EVERY_MS = 4000;
/** If the queue hasn't drained within this long, there are writes waiting. */
const PENDING_AFTER_MS = 600;

/**
 * Whether this device's changes have reached the server.
 *
 * Firestore keeps writes made offline in its local cache and uploads them when
 * the connection returns; waitForPendingWrites() resolves once everything queued
 * so far is acknowledged. We poll it - if it doesn't settle almost at once,
 * something is waiting to upload. (Firestore doesn't expose a count, only this.)
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly online = signal(navigator.onLine);
  readonly pending = signal(false);
  readonly lastSynced = signal<Date | null>(null);

  readonly state = computed<SyncState>(() => {
    if (this.online()) return this.pending() ? 'syncing' : 'synced';
    return this.pending() ? 'offline-pending' : 'offline';
  });

  private checking = false;

  constructor(private firestore: Firestore, zone: NgZone) {
    // timers and listeners stay outside Angular; the signals tell views when to update
    zone.runOutsideAngular(() => {
      window.addEventListener('online', () => {
        this.online.set(true);
        this.check();
      });
      window.addEventListener('offline', () => this.online.set(false));
      setInterval(() => this.check(), CHECK_EVERY_MS);
    });
    this.check();
  }

  private check() {
    if (this.checking) return; // one wait at a time; offline it simply stays open
    this.checking = true;
    const slow = setTimeout(() => this.pending.set(true), PENDING_AFTER_MS);

    waitForPendingWrites(this.firestore)
      .then(() => {
        this.pending.set(false);
        this.lastSynced.set(new Date());
      })
      .catch((err) => console.warn('Sync check failed', err))
      .finally(() => {
        clearTimeout(slow);
        this.checking = false;
      });
  }
}
