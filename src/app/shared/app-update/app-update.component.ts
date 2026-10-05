import { Component, NgZone, signal } from '@angular/core';
import {
  clearIndexedDbPersistence,
  Firestore,
  terminate,
  waitForPendingWrites,
} from '@angular/fire/firestore';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ToastService } from '../toast/toast.service';

const CHECK_EVERY_MS = 30 * 60 * 1000;
/** How long a hard refresh waits for unsent changes to reach the server. */
const UPLOAD_WAIT_MS = 8000;
/** localStorage copies kept only to open screens faster - login and settings are not here. */
const LOCAL_CACHE_KEYS = [/^messageTemplate_/, /^dashBootFacts$/];

/**
 * Top-bar controls for getting the latest build:
 *
 * - "Update ready" pill once a newer build has downloaded. The service worker
 *   keeps serving the old build to an open tab until it reloads - and an old
 *   build keeps saving bills by its old rules - so offer the reload. Never
 *   forced: someone may be halfway through a form.
 * - Hard refresh button: for a device stuck on an old version or old data.
 *   Clears the service worker's copy of the app, the localStorage copies and
 *   Firestore's offline data, then loads everything fresh from the server.
 *   Nobody is signed out, and unsent changes are never thrown away - the
 *   offline data is only cleared once they have all reached the server.
 */
@Component({
  selector: 'app-update',
  standalone: true,
  templateUrl: './app-update.component.html',
  styleUrl: './app-update.component.scss',
})
export class AppUpdateComponent {
  readonly ready = signal(false);
  readonly refreshing = signal(false);

  constructor(
    private sw: SwUpdate,
    private toastr: ToastService,
    private firestore: Firestore,
    zone: NgZone,
  ) {
    if (!sw.isEnabled) return;

    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.ready.set(true));
    sw.unrecoverable.subscribe(() => this.ready.set(true));

    // Look for a new build now and then, and whenever the app is reopened
    zone.runOutsideAngular(() => {
      setInterval(() => this.check(), CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.check();
      });
    });
  }

  private check() {
    if (!navigator.onLine) return;
    this.sw.checkForUpdate().catch((err) => console.warn('Update check failed', err));
  }

  async reload() {
    try {
      await this.sw.activateUpdate();
    } catch (err) {
      console.warn('Could not activate update', err);
    }
    location.reload();
  }

  async hardRefresh() {
    if (this.refreshing()) return;

    // Without internet the fresh copy can't be fetched - and with the cached
    // one gone the app would not open offline at all.
    if (!navigator.onLine) {
      this.toastr.warning(
        'You are offline. Connect to the internet to load the latest version.',
        'Hard refresh',
      );
      return;
    }

    this.refreshing.set(true);

    await this.clearAppFiles();
    this.clearLocalCopies();
    const dataKept = await this.clearSavedData();

    if (dataKept) {
      // Say why before the page goes
      this.toastr.warning(dataKept, 'Hard refresh', { timeOut: 4000 });
      setTimeout(() => location.reload(), 2500);
    } else {
      location.reload();
    }
  }

  /** The service worker and its copy of the app's files. */
  private async clearAppFiles() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn('Hard refresh could not clear the app files', err);
    }
  }

  private clearLocalCopies() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (LOCAL_CACHE_KEYS.some((pattern) => pattern.test(key))) localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn('Hard refresh could not clear local copies', err);
    }
  }

  /**
   * Firestore's offline copy of the data. Its queue of unsent changes lives in
   * the same store, so it is cleared only after every change has reached the
   * server. Returns why it was kept, or '' when cleared.
   */
  private async clearSavedData(): Promise<string> {
    const uploaded = await Promise.race([
      waitForPendingWrites(this.firestore).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), UPLOAD_WAIT_MS)),
    ]).catch(() => false);

    if (!uploaded) {
      return 'Some changes are still uploading, so saved data was kept. The app itself was refreshed.';
    }

    try {
      await terminate(this.firestore);
      await clearIndexedDbPersistence(this.firestore);
      return '';
    } catch (err: any) {
      console.warn('Hard refresh could not clear saved data', err);
      return err?.code === 'failed-precondition'
        ? 'The app is open in another tab, so saved data was kept. Close the other tabs and try again.'
        : 'Saved data could not be cleared. The app itself was refreshed.';
    }
  }
}
