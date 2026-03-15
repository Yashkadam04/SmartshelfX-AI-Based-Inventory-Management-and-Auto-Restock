import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const doc = inject(DOCUMENT);
    const port = doc.defaultView?.location.port ?? '';

    if (auth.getToken()) return true;

    // ✅ Port-aware: 4201 → admin login, anything else → regular login
    return router.createUrlTree(port === '4201' ? ['/auth/admin'] : ['/auth/login']);
};

export const guestGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.getToken()) return true;

    return router.createUrlTree(['/dashboard']);
};