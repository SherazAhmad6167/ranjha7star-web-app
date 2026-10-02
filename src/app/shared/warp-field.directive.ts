import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy } from '@angular/core';

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
}

const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#c4b5fd', '#7dd3fc', '#f0abfc'];
const WARP_SPEED = 3.2;

/**
 * Hyperspace starfield on a <canvas>. Stars fly at `warpSpeed` (depth per second),
 * `warp` punches them to light speed, `boost()` gives a short kick, and the
 * vanishing point leans toward the pointer. Frames run outside Angular.
 *
 *   <canvas warpField #stars="warpField" [warpSpeed]="0.3" [warp]="leaving"></canvas>
 */
@Directive({ selector: 'canvas[warpField]', standalone: true, exportAs: 'warpField' })
export class WarpFieldDirective implements AfterViewInit, OnDestroy {
  @Input() warpSpeed = 0.2;
  @Input() warp = false;

  private ctx: CanvasRenderingContext2D | null = null;
  private stars: Star[] = [];
  private w = 0;
  private h = 0;
  private speed = 0.2;
  private kick = 0;
  private aimX = 0;
  private aimY = 0;
  private focusX = 0;
  private focusY = 0;
  private frame = 0;
  private last = 0;
  private still = false;
  private resizeObserver?: ResizeObserver;

  constructor(private el: ElementRef<HTMLCanvasElement>, private zone: NgZone) {}

  ngAfterViewInit() {
    this.ctx = this.el.nativeElement.getContext('2d');
    if (!this.ctx) return;
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.el.nativeElement);
      this.resize();
      if (this.still) return;
      window.addEventListener('pointermove', this.onPointer, { passive: true });
      this.frame = requestAnimationFrame(this.tick);
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
  }

  /** A short burst of speed that fades out over about a second. */
  boost() {
    this.kick = Math.min(this.kick + 1.6, 4);
  }

  private onPointer = (e: PointerEvent) => {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const nx = Math.max(-0.5, Math.min(0.5, (e.clientX - rect.left) / rect.width - 0.5));
    const ny = Math.max(-0.5, Math.min(0.5, (e.clientY - rect.top) / rect.height - 0.5));
    this.aimX = nx * this.w * 0.3;
    this.aimY = ny * this.h * 0.3;
  };

  private tick = (now: number) => {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0.016;
    this.last = now;
    this.draw(dt);
    this.frame = requestAnimationFrame(this.tick);
  };

  private resize() {
    const canvas = this.el.nativeElement;
    this.w = canvas.clientWidth;
    this.h = canvas.clientHeight;
    if (!this.w || !this.h) return;
    // sharp on phones, but capped near 2.5 MP so big screens stay light
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2_500_000 / (this.w * this.h)));
    canvas.width = Math.round(this.w * dpr);
    canvas.height = Math.round(this.h * dpr);
    this.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(90, Math.min(260, Math.round((this.w * this.h) / 4000)));
    while (this.stars.length < count) this.stars.push(this.spawn(Math.random()));
    this.stars.length = count;

    if (this.still) this.draw(0);
  }

  /** A new star at depth `z`, placed so that at the far plane it lands on screen. */
  private spawn(z = 1): Star {
    const fov = Math.max(this.w, this.h) / 2 || 1;
    return {
      x: (Math.random() * 2 - 1) * (this.w / 2 / fov),
      y: (Math.random() * 2 - 1) * (this.h / 2 / fov),
      z: Math.max(z, 0.05),
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  }

  private draw(dt: number) {
    const ctx = this.ctx!;
    const target = (this.warp ? WARP_SPEED : this.warpSpeed) + this.kick;
    this.speed += (target - this.speed) * Math.min(1, dt * (this.warp ? 2.5 : 4));
    this.kick *= Math.exp(-dt * 2.2);
    this.focusX += (this.aimX - this.focusX) * Math.min(1, dt * 2);
    this.focusY += (this.aimY - this.focusY) * Math.min(1, dt * 2);

    const cx = this.w / 2 + this.focusX;
    const cy = this.h / 2 + this.focusY;
    const fov = Math.max(this.w, this.h) / 2;
    const trail = this.speed * 0.08; // streak length, in depth

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = 'round';

    for (let i = 0; i < this.stars.length; i++) {
      let s = this.stars[i];
      s.z -= this.speed * dt;

      let sx = cx + (s.x / s.z) * fov;
      let sy = cy + (s.y / s.z) * fov;
      if (s.z <= 0.05 || sx < -20 || sx > this.w + 20 || sy < -20 || sy > this.h + 20) {
        s = this.stars[i] = this.spawn();
        sx = cx + (s.x / s.z) * fov;
        sy = cy + (s.y / s.z) * fov;
      }

      const tz = Math.min(1, s.z + trail);
      const tx = cx + (s.x / tz) * fov;
      const ty = cy + (s.y / tz) * fov;
      const near = 1 - s.z;
      const size = near * 2.4 + 0.5;

      ctx.globalAlpha = Math.min(1, near * 1.3 + 0.15);
      if ((sx - tx) ** 2 + (sy - ty) ** 2 < 1) {
        ctx.fillStyle = s.color;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      } else {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
