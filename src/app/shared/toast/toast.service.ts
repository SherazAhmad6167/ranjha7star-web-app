import { Injectable, signal } from '@angular/core';
import { WRITE_FAILED_EVENT } from '../offline-write';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Same shape as the old ngx-toastr options, so existing calls keep working. */
export interface ToastOptions {
  timeOut?: number;
  /** Accepted for compatibility; hovering pauses the countdown instead. */
  extendedTimeOut?: number;
  /** Accepted for compatibility; every toast has a close button now. */
  closeButton?: boolean;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  /** How many times this same toast fired while it was on screen. */
  count: number;
  /** Bumped on each repeat, to restart the countdown bar. */
  cycle: number;
  paused: boolean;
  leaving: boolean;
}

interface Countdown {
  handle?: ReturnType<typeof setTimeout>;
  startedAt: number;
  remaining: number;
}

const MAX_VISIBLE = 5;
const LEAVE_MS = 320;

/**
 * App-wide toasts, drop-in for the old ToastrService:
 *
 *   this.toastr.success('Saved successfully');
 *   this.toastr.error(detail, 'Duplicate Barcode', { timeOut: 7000 });
 *
 * Rendered by <app-toast-host> in the app root.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);

  private countdowns = new Map<number, Countdown>();
  private nextId = 1;

  constructor() {
    // a write started with writeInBackground() was rejected by the server
    window.addEventListener(WRITE_FAILED_EVENT, (event) => {
      const code = (event as CustomEvent).detail?.code;
      this.error(
        code === 'permission-denied'
          ? 'You do not have permission to make this change.'
          : 'A change could not be saved to the server. Please try again.',
        'Not saved',
      );
    });
  }

  success(message?: string, title?: string, options?: ToastOptions) {
    this.show('success', message, title, options);
  }

  error(message?: string, title?: string, options?: ToastOptions) {
    this.show('error', message, title, options);
  }

  warning(message?: string, title?: string, options?: ToastOptions) {
    this.show('warning', message, title, options);
  }

  info(message?: string, title?: string, options?: ToastOptions) {
    this.show('info', message, title, options);
  }

  show(type: ToastType, message?: string, title?: string, options?: ToastOptions) {
    const text = String(message ?? '');

    // the same toast again: count it up and restart its clock instead of stacking
    const twin = this.toasts().find(
      (t) => !t.leaving && t.type === type && t.message === text && t.title === title,
    );
    if (twin) {
      this.patch(twin.id, { count: twin.count + 1, cycle: twin.cycle + 1, paused: false });
      this.startCountdown(twin.id, twin.duration);
      return;
    }

    const toast: ToastItem = {
      id: this.nextId++,
      type,
      title: title || undefined,
      message: text,
      duration: options?.timeOut ?? this.readingTime(text + (title ?? '')),
      count: 1,
      cycle: 0,
      paused: false,
      leaving: false,
    };

    this.toasts.update((list) => [toast, ...list]);
    this.startCountdown(toast.id, toast.duration);

    // too many on screen: let the oldest go
    const live = this.toasts().filter((t) => !t.leaving);
    live.slice(MAX_VISIBLE).forEach((t) => this.dismiss(t.id));
  }

  dismiss(id: number) {
    const countdown = this.countdowns.get(id);
    clearTimeout(countdown?.handle);
    this.countdowns.delete(id);
    this.patch(id, { leaving: true });
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
  }

  pause(id: number) {
    const countdown = this.countdowns.get(id);
    if (!countdown?.handle) return;
    clearTimeout(countdown.handle);
    countdown.handle = undefined;
    countdown.remaining -= Date.now() - countdown.startedAt;
    this.patch(id, { paused: true });
  }

  resume(id: number) {
    const countdown = this.countdowns.get(id);
    if (!countdown || countdown.handle) return;
    countdown.startedAt = Date.now();
    countdown.handle = setTimeout(() => this.dismiss(id), Math.max(countdown.remaining, 600));
    this.patch(id, { paused: false });
  }

  private startCountdown(id: number, ms: number) {
    clearTimeout(this.countdowns.get(id)?.handle);
    this.countdowns.set(id, {
      startedAt: Date.now(),
      remaining: ms,
      handle: setTimeout(() => this.dismiss(id), ms),
    });
  }

  /** Long messages stay up long enough to read: 3s minimum, 7s cap. */
  private readingTime(text: string): number {
    return Math.min(7000, Math.max(3000, 1500 + text.length * 45));
  }

  private patch(id: number, change: Partial<ToastItem>) {
    this.toasts.update((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }
}
