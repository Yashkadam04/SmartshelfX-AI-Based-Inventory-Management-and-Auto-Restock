import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginPayload, RegisterPayload, User } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly API = environment.apiUrl;

    currentUser = signal<User | null>(null);
    isLoggedIn = signal<boolean>(false);

    constructor(private http: HttpClient, private router: Router) {
        this.loadFromStorage();
    }

    /** Returns the correct login route based on which port the app is running on */
    getLoginRoute(): string {
        const port = window?.location?.port ?? '';
        return port === '4201' ? '/auth/admin' : '/auth/login';
    }

    login(payload: LoginPayload): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.API}/auth/login`, payload).pipe(
            tap(res => {
                localStorage.setItem('ssxToken', res.token);
                localStorage.setItem('ssxRole', res.role);
                localStorage.setItem('ssxName', res.name);
                localStorage.setItem('ssxUserId', String(res.userId));
                this.isLoggedIn.set(true);
                this.currentUser.set({
                    id: res.userId,
                    name: res.name,
                    username: '',
                    email: payload.email,
                    role: res.role as any
                });
            })
        );
    }

    register(payload: RegisterPayload): Observable<{ success: boolean; userId: number }> {
        return this.http.post<{ success: boolean; userId: number }>(`${this.API}/auth/register`, payload);
    }

    logout(): void {
        localStorage.removeItem('ssxToken');
        localStorage.removeItem('ssxRole');
        localStorage.removeItem('ssxName');
        localStorage.removeItem('ssxUserId');
        this.currentUser.set(null);
        this.isLoggedIn.set(false);
        // ✅ Port-aware redirect: admin port 4201 → admin login, others → regular login
        this.router.navigate([this.getLoginRoute()]);
    }

    getToken(): string | null {
        return localStorage.getItem('ssxToken');
    }

    getRole(): string {
        return localStorage.getItem('ssxRole') || '';
    }

    getName(): string {
        return localStorage.getItem('ssxName') || '';
    }

    getInitials(): string {
        const name = this.getName();
        if (!name) return 'U';
        return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }

    isAdmin(): boolean { return this.getRole() === 'ADMIN'; }
    isManager(): boolean { return ['ADMIN', 'MANAGER'].includes(this.getRole()); }
    isVendor(): boolean { return this.getRole() === 'VENDOR'; }

    getUserId(): number | null {
        try {
            const token = localStorage.getItem('ssxToken');
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id || payload.userId || null;
        } catch { return null; }
    }

    getMe(): Observable<User> {
        return this.http.get<User>(`${this.API}/auth/me`).pipe(
            tap(user => this.currentUser.set(user))
        );
    }

    private loadFromStorage(): void {
        const token = localStorage.getItem('ssxToken');
        if (token) {
            this.isLoggedIn.set(true);
            this.currentUser.set({
                id: Number(localStorage.getItem('ssxUserId')),
                name: localStorage.getItem('ssxName') || '',
                username: '',
                email: '',
                role: (localStorage.getItem('ssxRole') as any) || 'MANAGER'
            });
        }
    }
}