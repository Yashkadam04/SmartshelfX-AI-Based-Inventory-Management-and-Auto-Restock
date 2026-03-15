import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.getRole() === 'ADMIN') return true;
    router.navigate(['/dashboard']);
    return false;
};

export const managerGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (['ADMIN', 'MANAGER'].includes(auth.getRole())) return true;
    router.navigate(['/dashboard']);
    return false;
};