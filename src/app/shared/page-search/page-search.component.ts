import { Component, ElementRef, HostListener, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

export interface PageLink {
  path: string;
  title: string;
  section: string;
  icon: string;
}

/**
 * Header quick-jump: a "Search pages…" pill that opens a palette (also on Ctrl/⌘+K).
 * Type to filter, arrows to move, Enter to open, Esc to close.
 */
@Component({
  selector: 'app-page-search',
  standalone: true,
  templateUrl: './page-search.component.html',
  styleUrl: './page-search.component.scss',
})
export class PageSearchComponent {
  /** Pages the signed-in role may open, in sidebar order. */
  @Input() pages: PageLink[] = [];
  @Input() currentPath = '';
  @ViewChild('box') box?: ElementRef<HTMLInputElement>;

  open = false;
  query = '';
  active = 0;
  results: PageLink[] = [];
  readonly shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

  constructor(private router: Router, private host: ElementRef<HTMLElement>) {}

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k') {
      e.preventDefault();
      this.open ? this.close() : this.show();
      return;
    }
    if (!this.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const page = this.results[this.active];
      if (page) this.go(page);
    }
  }

  show() {
    this.open = true;
    this.query = '';
    this.filter();
    setTimeout(() => this.box?.nativeElement.focus());
  }

  close() {
    this.open = false;
  }

  onInput(event: Event) {
    this.query = (event.target as HTMLInputElement).value;
    this.filter();
  }

  go(page: PageLink) {
    this.close();
    if (page.path !== this.currentPath) this.router.navigateByUrl(page.path);
  }

  /** Best matches first: title starts with it, a word starts with it, contains it, then section. */
  private filter() {
    const q = this.query.trim().toLowerCase();
    this.results = this.pages
      .map((page) => ({ page, score: this.score(page, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score) // stable: equal scores keep sidebar order
      .map((x) => x.page);
    this.active = 0;
  }

  private score(page: PageLink, q: string): number {
    if (!q) return 1;
    const title = page.title.toLowerCase();
    if (title.startsWith(q)) return 4;
    if (title.split(/[\s-]+/).some((word) => word.startsWith(q))) return 3;
    if (title.includes(q)) return 2;
    return page.section.toLowerCase().includes(q) ? 1 : 0;
  }

  private move(step: number) {
    const count = this.results.length;
    if (!count) return;
    this.active = (this.active + step + count) % count;
    setTimeout(() =>
      this.host.nativeElement.querySelector('.ps-item.is-active')?.scrollIntoView({ block: 'nearest' }),
    );
  }
}
