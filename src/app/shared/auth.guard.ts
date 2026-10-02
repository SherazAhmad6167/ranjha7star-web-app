import { Injectable } from '@angular/core';
import {
  CanActivate,
  CanActivateChild,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { ToastService } from './toast/toast.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(private router: Router, private toastr: ToastService) {}

  private checkRole(route: ActivatedRouteSnapshot): boolean {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');

    if (!username || !role) {
      this.toastr.error('Please login first');
      this.router.navigate(['/login']);
      return false;
    }

    const allowedRoles = route.data['roles'] as string[] | undefined;
    if (allowedRoles && !allowedRoles.includes(role)) {
      this.router.navigate(['/not-found']); // 👈 redirect to Page Not Found
      return false;
    }

    return true;
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    return this.checkRole(route);
  }

  canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    return this.checkRole(childRoute);
  }
}
