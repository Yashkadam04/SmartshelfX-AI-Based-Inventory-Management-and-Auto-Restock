import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface UserRecord {
    id: number; name: string; email: string; role: string;
    created_at: string; createdAt?: string; password_hash?: string;
}

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './users.component.html',
    styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
    users: UserRecord[] = [];
    loading = false;
    search = '';
    filterRole = '';

    // Password visibility toggle per user id
    showPw: Record<number, boolean> = {};

    // Reset password modal
    resetModal = false;
    resetTarget: UserRecord | null = null;
    newPassword = '';
    confirmPassword = '';
    resetError = '';
    resetSuccess = false;

    constructor(private http: HttpClient) { }

    ngOnInit() { this.loadUsers(); }

    loadUsers() {
        this.loading = true;
        this.http.get<any>(environment.apiUrl + '/auth/users').subscribe({
            next: (res: any) => { this.users = Array.isArray(res) ? res : (res.data || []); this.loading = false; },
            error: () => { this.loading = false; this.users = []; }
        });
    }

    get filtered(): UserRecord[] {
        const s = this.search.toLowerCase();
        return this.users.filter(u => {
            const matchSearch = !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
            const matchRole = !this.filterRole || u.role === this.filterRole;
            return matchSearch && matchRole;
        });
    }

    togglePw(id: number) { this.showPw[id] = !this.showPw[id]; }

    openReset(u: UserRecord) {
        this.resetTarget = u;
        this.newPassword = '';
        this.confirmPassword = '';
        this.resetError = '';
        this.resetSuccess = false;
        this.resetModal = true;
    }

    closeReset() { this.resetModal = false; this.resetTarget = null; }

    submitReset() {
        this.resetError = '';
        this.resetSuccess = false;
        const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@#_]).{8,}$/;
        if (!PW_REGEX.test(this.newPassword)) {
            this.resetError = 'Password must be 8+ chars with uppercase, lowercase, number and @#_';
            return;
        }
        if (this.newPassword !== this.confirmPassword) {
            this.resetError = 'Passwords do not match';
            return;
        }
        this.http.post(`${environment.apiUrl}/auth/admin-reset-password`, {
            userId: this.resetTarget!.id,
            newPassword: this.newPassword
        }).subscribe({
            next: () => { this.resetSuccess = true; setTimeout(() => this.closeReset(), 1500); },
            error: (err) => { this.resetError = err?.error?.message || 'Reset failed. Check backend.'; }
        });
    }

    deleteUser(u: UserRecord) {
        if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
        this.http.delete(`${environment.apiUrl}/auth/users/${u.id}`).subscribe({
            next: () => { this.users = this.users.filter(x => x.id !== u.id); },
            error: (err) => { alert(err?.error?.message || 'Delete failed.'); }
        });
    }

    getRoleClass(role: string): string {
        return role === 'ADMIN' ? 'badge-admin' : role === 'MANAGER' ? 'badge-manager' : 'badge-vendor';
    }

    getInitials(name: string): string {
        return (name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
}