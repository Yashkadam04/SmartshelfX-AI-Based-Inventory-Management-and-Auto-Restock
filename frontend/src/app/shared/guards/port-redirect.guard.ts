import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DOCUMENT } from '@angular/common';

/**
 * Port-based login redirect guard.
 *  - Port 4201  →  /auth/admin   (Admin Portal)
 *  - Any other  →  /auth/login   (Manager / Vendor Portal)
 */
export const portRedirectGuard: CanActivateFn = () => {
    const router = inject(Router);
    const document = inject(DOCUMENT);
    const port = document.defaultView?.location.port ?? '';

    if (port === '4201') {
        return router.createUrlTree(['/auth/admin']);
    }
    return router.createUrlTree(['/auth/login']);
};