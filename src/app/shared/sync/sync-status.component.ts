import { Component, computed } from '@angular/core';
import { SyncService, SyncState } from './sync.service';

const VIEW: Record<SyncState, { icon: string; label: string; hint: string }> = {
  synced: {
    icon: 'ri-checkbox-circle-fill',
    label: 'Synced',
    hint: 'All changes are saved to the server.',
  },
  syncing: {
    icon: 'ri-refresh-line',
    label: 'Syncing…',
    hint: 'Uploading your latest changes to the server.',
  },
  offline: {
    icon: 'ri-wifi-off-line',
    label: 'Offline',
    hint: 'No internet. You can keep working - changes are saved on this device.',
  },
  'offline-pending': {
    icon: 'ri-cloud-off-line',
    label: 'Saved offline',
    hint: 'No internet. Your changes are saved on this device and will upload automatically when you are back online.',
  },
};

/** Top-bar pill: synced / syncing / offline / offline with changes waiting. */
@Component({
  selector: 'app-sync-status',
  standalone: true,
  templateUrl: './sync-status.component.html',
  styleUrl: './sync-status.component.scss',
})
export class SyncStatusComponent {
  readonly view = computed(() => VIEW[this.sync.state()]);

  constructor(public sync: SyncService) {}
}
