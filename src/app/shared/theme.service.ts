import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'ranjha-theme';

  isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(this.storageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    this.isDark.set(dark);
    this.applyTheme(dark);
  }

  toggle() {
    const next = !this.isDark();
    this.isDark.set(next);
    localStorage.setItem(this.storageKey, next ? 'dark' : 'light');
    this.applyTheme(next);
  }

  private applyTheme(dark: boolean) {
    document.body.classList.toggle('dark-mode', dark);
  }
}
