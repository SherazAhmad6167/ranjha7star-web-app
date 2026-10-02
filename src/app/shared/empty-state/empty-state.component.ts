import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Friendly "nothing to show" block for lists and tables.
 *
 * With a search typed in, it says so and offers to clear it; otherwise it shows
 * the page's own title and hint, plus any projected action (e.g. an Add button).
 *
 *   <app-empty-state icon="ri-map-pin-line" title="No areas found"
 *     message="Add your first area to get started"
 *     [searchTerm]="searchTerm" (clear)="searchTerm = ''; onSearch()">
 *   </app-empty-state>
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  @Input() icon = 'ri-inbox-2-line';
  @Input() title = 'Nothing here yet';
  @Input() message = '';
  /** The page's current search text; when set, the search-specific message shows. */
  @Input() searchTerm: string | null | undefined = '';
  @Output() clear = new EventEmitter<void>();

  get searching(): boolean {
    return !!this.searchTerm?.trim();
  }
}
