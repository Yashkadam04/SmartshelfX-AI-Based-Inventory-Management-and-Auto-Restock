import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-vendors',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './vendors.component.html',
    styleUrls: ['./vendors.component.scss']
})
export class VendorsComponent implements OnInit {
    vendors: any[] = [];
    loading = false;
    search = '';

    constructor(private http: HttpClient) { }

    ngOnInit() { this.loadVendors(); }

    loadVendors() {
        this.loading = true;
        this.http.get<any>(environment.apiUrl + '/auth/users').subscribe({
            next: (res: any) => {
                const all = Array.isArray(res) ? res : (res.data || []);
                this.vendors = all.filter((u: any) => u.role === 'VENDOR');
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    get filtered(): any[] {
        const s = this.search.toLowerCase();
        return this.vendors.filter(v => !s || v.name.toLowerCase().includes(s) || v.email.toLowerCase().includes(s));
    }

    getInitials(name: string): string {
        return (name || 'V').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
}