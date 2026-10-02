import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy } from '@angular/core';

/**
 * Rolls a number up from its previous value to the new one, formatted like
 * `| number: '1.0-0'`. Frames run outside Angular so they cost no change detection.
 *
 *   <span [countUp]="totalUsers"></span>
 */
@Directive({ selector: '[countUp]', standalone: true })
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input() countUp: number | null | undefined = 0;
  @Input() countUpDuration = 1200;

  private shown = 0;
  private frame = 0;

  constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngOnChanges() {
    const from = this.shown;
    const to = Number(this.countUp) || 0;
    cancelAnimationFrame(this.frame);

    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.render(to);
      return;
    }

    const start = performance.now();
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const t = Math.min((now - start) / this.countUpDuration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        this.render(from + (to - from) * eased);
        if (t < 1) this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
  }

  private render(value: number) {
    this.shown = value;
    this.el.nativeElement.textContent = Math.round(value).toLocaleString('en-US');
  }
}
