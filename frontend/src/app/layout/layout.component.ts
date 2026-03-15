import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from '../shared/sidebar/sidebar.component';
import { TopbarComponent } from '../shared/topbar/topbar.component';
import { filter, map } from 'rxjs';

const PAGE_TITLES: Record<string, string> = {
    dashboard: 'DASHBOARD OVERVIEW',
    inventory: 'INVENTORY CATALOG',
    transactions: 'STOCK TRANSACTIONS',
    forecasting: 'AI DEMAND FORECASTING',
    orders: 'PURCHASE ORDERS',
    alerts: 'ALERTS & NOTIFICATIONS',
    analytics: 'ANALYTICS & REPORTS',
};

@Component({
    selector: 'app-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet, RouterModule, SidebarComponent, TopbarComponent],
    templateUrl: './layout.component.html',
    styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
    sidebarCollapsed = signal(false);
    pageTitle = signal('DASHBOARD OVERVIEW');

    constructor(private router: Router) {
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map((e: any) => {
                const seg = e.urlAfterRedirects.split('/').filter(Boolean)[0] || 'dashboard';
                return PAGE_TITLES[seg] || seg.toUpperCase();
            })
        ).subscribe(title => this.pageTitle.set(title));
    }

    toggleSidebar() {
        this.sidebarCollapsed.update(v => !v);
    }
}