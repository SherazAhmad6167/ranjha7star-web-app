import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

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

  visible = false;
  leaving = false;
  quip = '';

  private quipIndex = Math.floor(Math.random() * LOADER_QUIPS.length);
  private quipTimer?: ReturnType<typeof setInterval>;
  private leaveTimer?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['show']) return;
    if (this.show) this.enter();
    else if (this.visible) this.leave();
  }

  ngOnDestroy() {
    clearInterval(this.quipTimer);
    clearTimeout(this.leaveTimer);
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
