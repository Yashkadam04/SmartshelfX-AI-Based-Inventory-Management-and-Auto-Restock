import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface NavItem {
    label: string;
    icon: string;
    route: string;
    tag?: string;
    queryParams?: Record<string, string>;
};

interface NavGroup { section: string; roles: string[]; items: NavItem[]; }

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
    @Input() collapsed = false;
    @Output() toggle = new EventEmitter<void>();

    constructor(public auth: AuthService) { }

    navGroups: NavGroup[] = [
        { section: 'OVERVIEW', roles: ['ADMIN', 'MANAGER', 'VENDOR'], items: [{ label: 'Dashboard', icon: '📊', route: '/dashboard' }] },
        { section: 'USER MGMT', roles: ['ADMIN'], items: [{ label: 'Users Management', icon: '👥', route: '/users' }] },
        {
            section: 'INVENTORY', roles: ['ADMIN', 'MANAGER'], items: [
                { label: 'Products Catalog', icon: '🛍️', route: '/inventory' },
                { label: 'Stock Transactions', icon: '🔄', route: '/transactions' }
            ]
        },
        {
            section: 'STOCK OPS', roles: [], items: [
                { label: 'Stock In', icon: '📥', route: '/transactions', queryParams: { tab: 'IN' } },
                { label: 'Stock Out', icon: '📤', route: '/transactions', queryParams: { tab: 'OUT' } }
            ]
        },
        {
            section: 'AI & FORECAST', roles: ['ADMIN', 'MANAGER'], items: [
                { label: 'AI Forecasting', icon: '🤖', route: '/forecasting', tag: 'AI' },
                { label: 'Restock Suggestions', icon: '📋', route: '/orders' }
            ]
        },
        { section: 'PURCHASE ORDERS', roles: ['ADMIN', 'MANAGER', 'VENDOR'], items: [{ label: 'Purchase Orders', icon: '🛒', route: '/orders' }] },
        { section: 'VENDORS', roles: ['ADMIN'], items: [{ label: 'Vendor Management', icon: '🏭', route: '/vendors' }] },
        { section: 'REPORTS', roles: ['ADMIN', 'MANAGER'], items: [{ label: 'Reports & Analytics', icon: '📈', route: '/analytics' }] },
        { section: 'NOTIFICATIONS', roles: ['ADMIN', 'MANAGER', 'VENDOR'], items: [{ label: 'Notifications', icon: '🔔', route: '/alerts' }] },
        { section: 'SYSTEM', roles: ['ADMIN'], items: [{ label: 'Settings', icon: '⚙️', route: '/settings' }] }
    ];

    visibleGroups(): NavGroup[] { return this.navGroups.filter(g => g.roles.includes(this.auth.getRole())); }

    getRoleBadgeClass(): string {
        const r = this.auth.getRole();
        return r === 'ADMIN' ? 'role-admin' : r === 'MANAGER' ? 'role-manager' : 'role-vendor';
    }

    getRoleLabel(): string {
        const r = this.auth.getRole();
        return r === 'ADMIN' ? 'Administrator' : r === 'MANAGER' ? 'Warehouse Manager' : 'Vendor';
    }

    onToggle() { this.toggle.emit(); }
    logout() { this.auth.logout(); }
}