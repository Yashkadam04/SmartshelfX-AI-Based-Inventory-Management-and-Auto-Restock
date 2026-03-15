import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../shared/services/api.service';
import { NotificationService } from '../shared/services/notification.service';
import { Alert, AlertType } from '../shared/models/interfaces';

@Component({
    selector: 'app-alerts',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './alerts.component.html',
    styleUrls: ['./alerts.component.scss']
})
export class AlertsComponent implements OnInit {

    alerts: Alert[] = [];
    unread = 0;
    loading = false;

    filterType = '';
    filterRead = '';

    constructor(private api: ApiService, private notify: NotificationService) { }

    ngOnInit() { this.loadAlerts(); }

    loadAlerts() {
        this.loading = true;
        const filters: any = {};
        if (this.filterType) filters.type = this.filterType;
        if (this.filterRead) filters.is_read = this.filterRead;

        this.api.getAlerts(filters).subscribe({
            next: res => {
                this.alerts = res.data;
                this.unread = res.unread;
                this.loading = false;
            },
            // Show empty state gracefully — backend may have no alerts yet
            error: (err) => {
                this.loading = false;
                this.alerts = [];
                this.unread = 0;
                // Only show error if it's not a 404/empty — real connection failure
                if (err?.status === 0 || err?.status >= 500) {
                    this.notify.error('Backend connection failed. Is the server running on port 3000?');
                }
            }
        });
    }

    markRead(a: Alert) {
        if (a.is_read) return;
        this.api.markAlertRead(a.id).subscribe({
            next: () => { a.is_read = true; this.unread = Math.max(0, this.unread - 1); },
            error: () => { }
        });
    }

    markAllRead() {
        this.api.markAllAlertsRead().subscribe({
            next: () => {
                this.alerts.forEach(a => a.is_read = true);
                this.unread = 0;
                this.notify.success('All alerts marked as read');
            },
            error: () => { }
        });
    }

    dismiss(a: Alert) {
        this.api.dismissAlert(a.id).subscribe({
            next: () => { this.removeAlert(a); },
            error: () => { this.removeAlert(a); }   // remove locally even if backend fails
        });
    }

    private removeAlert(a: Alert) {
        this.alerts = this.alerts.filter(x => x.id !== a.id);
        if (!a.is_read) this.unread = Math.max(0, this.unread - 1);
    }

    getIcon(type: AlertType): string {
        const icons: Record<AlertType, string> = {
            LOW_STOCK: '📦', OUT_OF_STOCK: '🚨', EXPIRY: '📅', RESTOCK_SUGGESTED: '🤖'
        };
        return icons[type] || '🔔';
    }
}