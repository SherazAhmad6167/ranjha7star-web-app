import { booleanAttribute, Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

export type LoaderMode = 'fullscreen' | 'contained' | 'inline';

const LOADER_QUIPS = [
  'Untangling the fiber cables…',
  'Waking up the routers…',
  'Asking the packets to hurry up…',
  'Tightening the loose connectors…',
  'Counting every rupee (twice)…',
  'Dusting off the records…',
  'Warming up the servers…',
  'Polishing the numbers…',
];

/**
 * The app-wide loader, in the dashboard's look.
 *
 *   fullscreen - fixed over the whole app, blocks clicks (page loads, long actions)
 *   contained  - covers the nearest positioned parent (inside modals)
 *   inline     - sits in the flow (a table cell, a card section)
 *
 *   <app-loader [show]="isLoading" message="Loading expenses…"></app-loader>
 *
 * It fades in after a beat so quick loads don't flash, and fades out without
 * blocking clicks.
 *
 * `softRefresh`: only the first load gets the full loader. Later reloads (after a
 * save or delete) show a slim bar along the top and shimmer the table rows instead,
 * leaving the page usable:
 *
 *   <app-loader softRefresh [show]="isLoading" message="Loading expenses…"></app-loader>
 */
@Component({
  selector: 'app-loader',
  standalone: true,
  templateUrl: './loader.component.html',
  styleUrl: './loader.component.scss',
})
export class LoaderComponent implements OnChanges, OnDestroy {
  @Input() show = false;
  @Input() message = 'Loading…';
  @Input() mode: LoaderMode = 'fullscreen';
  @Input({ transform: booleanAttribute }) softRefresh = false;

  visible = false;
  leaving = false;
  refreshing = false;
  quip = '';

  private loadedOnce = false;
  private quipIndex = Math.floor(Math.random() * LOADER_QUIPS.length);
  private quipTimer?: ReturnType<typeof setInterval>;
  private leaveTimer?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  /** How many loaders are soft-refreshing right now (they share one body class). */
  private static activeRefreshes = 0;

  ngOnChanges(changes: SimpleChanges) {
    const change = changes['show'];
    if (!change) return;
    if (this.show) {
      if (this.softRefresh && this.loadedOnce) this.startRefresh();
      else this.enter();
    } else if (change.previousValue) {
      // a load just finished
      this.endRefresh();
      if (this.visible) this.leave();
      this.loadedOnce = true;
    }
  }

  ngOnDestroy() {
    clearInterval(this.quipTimer);
    clearTimeout(this.leaveTimer);
    this.endRefresh();
  }

  private startRefresh() {
    clearTimeout(this.refreshTimer);
    // the same short grace as the full loader, so a quick reload doesn't flicker
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refreshing = true;
      if (LoaderComponent.activeRefreshes++ === 0) document.body.classList.add('app-refreshing');
    }, 150);
  }

  private endRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    if (!this.refreshing) return;
    this.refreshing = false;
    if (--LoaderComponent.activeRefreshes === 0) document.body.classList.remove('app-refreshing');
  }

  private enter() {
    clearTimeout(this.leaveTimer);
    clearInterval(this.quipTimer);
    this.leaving = false;
    this.visible = true;
    this.quip = LOADER_QUIPS[this.quipIndex];
    this.quipTimer = setInterval(() => {
      this.quipIndex = (this.quipIndex + 1) % LOADER_QUIPS.length;
      this.quip = LOADER_QUIPS[this.quipIndex];
    }, 2400);
  }

  private leave() {
    clearInterval(this.quipTimer);
    // inline loaders make way for content straight away; overlays fade out
    if (this.mode === 'inline') {
      this.visible = false;
      return;
    }
    this.leaving = true;
    this.leaveTimer = setTimeout(() => {
      this.visible = false;
      this.leaving = false;
    }, 220);
  }
}
