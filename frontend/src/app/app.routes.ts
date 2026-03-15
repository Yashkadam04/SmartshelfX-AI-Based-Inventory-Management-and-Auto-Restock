import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './shared/guards/auth.guard';
import { adminGuard, managerGuard } from './shared/guards/role.guard';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DOCUMENT } from '@angular/common';

/**
 * Port-based root guard.
 * Port 4201 → /auth/admin   (Admin portal)
 * Port 4200 → /auth/login   (Manager / Vendor portal)
 */
const portGuard: CanActivateFn = () => {
    const router = inject(Router);
    const doc = inject(DOCUMENT);
    const port = doc.defaultView?.location.port ?? '';
    return router.createUrlTree(port === '4201' ? ['/auth/admin'] : ['/auth/login']);
};

/**
 * Prevents admin-port users from ever landing on the regular login page.
 * If on port 4201 and visiting /auth/login → redirect to /auth/admin.
 */
const loginPageGuard: CanActivateFn = () => {
    const router = inject(Router);
    const doc = inject(DOCUMENT);
    const port = doc.defaultView?.location.port ?? '';
    if (port === '4201') {
        return router.createUrlTree(['/auth/admin']);
    }
    return true;
};

export const routes: Routes = [
    {
        path: 'auth',
        canActivate: [guestGuard],
        children: [
            { path: 'login', canActivate: [loginPageGuard], loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
            { path: 'register', loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent) },
            { path: 'forgot-password', loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
            { path: 'reset-password', loadComponent: () => import('./auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
            { path: 'admin', loadComponent: () => import('./auth/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
            { path: '', canActivate: [portGuard], component: class { } }
        ]
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
        children: [
            { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
            { path: 'inventory', canActivate: [managerGuard], loadComponent: () => import('./inventory/inventory.component').then(m => m.InventoryComponent) },
            { path: 'transactions', canActivate: [managerGuard], loadComponent: () => import('./transactions/transactions.component').then(m => m.TransactionsComponent) },
            { path: 'forecasting', canActivate: [managerGuard], loadComponent: () => import('./forecasting/forecasting.component').then(m => m.ForecastingComponent) },
            { path: 'orders', loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent) },
            { path: 'alerts', loadComponent: () => import('./alerts/alerts.component').then(m => m.AlertsComponent) },
            { path: 'analytics', canActivate: [managerGuard], loadComponent: () => import('./analytics/analytics.component').then(m => m.AnalyticsComponent) },
            { path: 'users', canActivate: [adminGuard], loadComponent: () => import('./users/users.component').then(m => m.UsersComponent) },
            { path: 'vendors', canActivate: [adminGuard], loadComponent: () => import('./vendors/vendors.component').then(m => m.VendorsComponent) },
            { path: 'settings', canActivate: [adminGuard], loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent) },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    { path: '**', canActivate: [portGuard], component: class { } }
];