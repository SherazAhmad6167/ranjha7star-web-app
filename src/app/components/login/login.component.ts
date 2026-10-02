import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import {
  collection,
  Firestore,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { WarpFieldDirective } from '../../shared/warp-field.directive';

const TAGLINES = [
  'Every subscriber, every rupee — in one place.',
  'Billing, recovery & routers at a glance.',
  'Built for the field — keeps working offline.',
  'Keeping Ranjha7star connected.',
];

/** What the signal meter says at each level (0-4). */
const SIGNAL_TEXT = [
  'Waiting for you',
  'Picking up a signal…',
  'Signal found',
  'Almost there',
  'Ready to connect',
];

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule, WarpFieldDirective],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit, OnDestroy {
  username = '';
  password = '';
  loading = false;
  errorMessage = '';
  showPassword = false;

  /* ── Look & feel ── */
  readonly greeting =
    new Date().getHours() < 12 ? 'Good morning'
    : new Date().getHours() < 17 ? 'Good afternoon'
    : 'Good evening';
  isOnline = navigator.onLine;
  capsLock = false;
  shake = false;
  success = false;
  tagline = TAGLINES[0];
  private taglineIndex = 0;
  private taglineTimer?: ReturnType<typeof setInterval>;

  constructor(
    private firestore: Firestore,
    private router: Router,
    private toastr: ToastService,
  ) {}

  @HostListener('window:online')
  onOnline() { this.isOnline = true; }

  @HostListener('window:offline')
  onOffline() { this.isOnline = false; }

  ngOnInit() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (username && role) {
      if (role === 'operator') {
        this.router.navigate(['/user-details']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    }

    this.taglineTimer = setInterval(() => {
      this.taglineIndex = (this.taglineIndex + 1) % TAGLINES.length;
      this.tagline = TAGLINES[this.taglineIndex];
    }, 3500);
  }

  ngOnDestroy() {
    clearInterval(this.taglineTimer);
  }

  /** How complete the form is, as signal bars (0-4). */
  get signalLevel(): number {
    if (this.success) return 4;
    const name = this.username.trim();
    const level = (name ? (name.length >= 3 ? 2 : 1) : 0) + (this.password ? 2 : 0);
    return Math.min(level, 4);
  }

  get signalText(): string {
    return this.success ? 'Connected' : SIGNAL_TEXT[this.signalLevel];
  }

  /** The stars cruise a little faster as the form fills in. */
  get starSpeed(): number {
    return 0.12 + this.signalLevel * 0.07;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  checkCapsLock(event: KeyboardEvent) {
    this.capsLock = event.getModifierState?.('CapsLock') ?? false;
  }

  /** Clears the shake once the card's own shake ends (not a child's animation). */
  onCardAnimationEnd(event: AnimationEvent) {
    if (event.target === event.currentTarget) this.shake = false;
  }

  async login() {
    if (!this.username || !this.password) {
      this.toastr.error('Username aur password required hai');
      this.shake = true;
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const ref = collection(this.firestore, 'recoveryOfficer');

      const q = query(
        ref,
        where('user_name', '==', this.username),
        where('password', '==', this.password),
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.toastr.error('Invalid username or password');
        this.errorMessage = 'Invalid username or password';
        this.shake = true;
        this.loading = false;
        return;
      }

      const user = snapshot.docs[0].data();

      if (user['status'] !== 'activated') {
        this.toastr.error('Account is not activated, please contact admin');
        this.errorMessage = 'Account is not activated, please contact admin';
        this.shake = true;
        this.loading = false;
        return;
      }

      localStorage.setItem('username', user['user_name']);
      localStorage.setItem('name', user['name'] || '');
      localStorage.setItem('role', user['role']);
      localStorage.setItem('userId', snapshot.docs[0].id);
      localStorage.setItem('sublocality', JSON.stringify(user['sublocality'] || []));

      this.toastr.success('Login successful');
      this.launch(user['role'] === 'operator' ? '/user-details' : '/dashboard');
    } catch (err) {
      console.error(err);
      this.toastr.error('Something went wrong');
      this.errorMessage = 'Something went wrong';
      this.shake = true;
    } finally {
      this.loading = false;
    }
  }

  /** "Connected", a jump to light speed, then into the app. */
  private launch(path: string) {
    this.success = true;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => this.router.navigate([path]), still ? 0 : 700);
  }
}
