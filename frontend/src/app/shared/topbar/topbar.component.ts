import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { Alert } from '../models/interfaces';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './topbar.component.html',
    styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent implements OnInit {
    @Input() pageTitle = 'Dashboard';
    @Output() sidebarToggle = new EventEmitter<void>();

    alerts: Alert[] = [];
    unreadCount = 0;
    showDropdown = false;

    constructor(private api: ApiService, public auth: AuthService) { }

    ngOnInit() { this.loadAlerts(); }

    loadAlerts() {
        this.api.getAlerts({ is_read: false, limit: 5 }).subscribe({
            next: res => { this.alerts = res.data; this.unreadCount = res.unread; },
            error: () => { }
        });
    }

    toggleDropdown(event: Event) {
        event.stopPropagation();
        this.showDropdown = !this.showDropdown;
    }

    markRead(id: number) {
        this.api.markAlertRead(id).subscribe(() => this.loadAlerts());
    }

    get alertTypeIcon(): Record<string, string> {
        return {
            LOW_STOCK: '📦',
            OUT_OF_STOCK: '🚨',
            EXPIRY: '📅',
            RESTOCK_SUGGESTED: '🤖'
        };
    }
}