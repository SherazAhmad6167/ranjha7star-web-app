import { Component } from '@angular/core';
import { ToastItem, ToastService, ToastType } from './toast.service';

const SWIPE_DISMISS_PX = 90;

/** The stroke drawn inside each icon's ring. */
const MARKS: Record<ToastType, string> = {
  success: 'M7.5 12.5l3 3 6-6.5',
  error: 'M8.5 8.5l7 7M15.5 8.5l-7 7',
  warning: 'M12 7v6.5M12 16.6v.4',
  info: 'M12 17v-6M12 7.4v.4',
};

/** Heading shown when a call doesn't pass its own title. */
const TITLES: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/** Renders the app's toasts. Lives once, in the app root. */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
})
export class ToastHostComponent {
  readonly marks = MARKS;
  readonly titles = TITLES;
  private drag?: { id: number; el: HTMLElement; startX: number; dx: number };

  constructor(public toast: ToastService) {}

  /* ── Swipe a toast sideways to dismiss it (touch and pen) ── */

  onPointerDown(event: PointerEvent, t: ToastItem) {
    if (event.pointerType === 'mouse' || (event.target as HTMLElement).closest('button')) return;
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    el.classList.add('is-dragging');
    this.drag = { id: t.id, el, startX: event.clientX, dx: 0 };
    this.toast.pause(t.id);
  }

  onPointerMove(event: PointerEvent) {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.startX;
    this.drag.dx = dx;
    this.drag.el.style.transform = `translateX(${dx}px)`;
    this.drag.el.style.opacity = String(1 - Math.min(Math.abs(dx) / 220, 0.7));
  }

  onPointerUp() {
    if (!this.drag) return;
    const { id, el, dx } = this.drag;
    this.drag = undefined;
    el.classList.remove('is-dragging');

    if (Math.abs(dx) > SWIPE_DISMISS_PX) {
      el.style.setProperty('--tst-fly', dx > 0 ? '120%' : '-120%');
      this.toast.dismiss(id);
    } else {
      el.style.transform = '';
      el.style.opacity = '';
      this.toast.resume(id);
    }
  }
}
