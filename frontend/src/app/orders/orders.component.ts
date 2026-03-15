import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../shared/services/api.service';
import { AuthService } from '../shared/services/auth.service';
import { NotificationService } from '../shared/services/notification.service';
import { PurchaseOrder, ForecastResult, Product, User } from '../shared/models/interfaces';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-orders',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './orders.component.html',
    styleUrls: ['./orders.component.scss']
})
export class OrdersComponent implements OnInit {

    orders: PurchaseOrder[] = [];
    pendingPOs: PurchaseOrder[] = [];   // vendor: pending approvals only
    suggestions: ForecastResult[] = [];
    products: Product[] = [];
    vendors: User[] = [];
    loading = false;
    loadingPending = false;
    showCreate = false;
    actioningId: number | null = null;   // tracks which PO is being acted on

    filterStatus = '';
    page = 1;
    total = 0;

    form!: FormGroup;

    get role() { return this.auth.getRole(); }
    get isAdmin() { return this.role === 'ADMIN'; }
    get isManager() { return this.role === 'MANAGER'; }
    get isVendor() { return this.role === 'VENDOR'; }

    constructor(
        private api: ApiService,
        private auth: AuthService,
        private notify: NotificationService,
        private fb: FormBuilder,
        private http: HttpClient
    ) { }

    ngOnInit() {
        this.buildForm();
        this.loadOrders();
        this.loadSuggestions();
        if (this.isVendor) {
            this.loadPendingPOs();
        } else {
            this.loadProducts();
            this.loadVendors();
        }
    }

    buildForm() {
        this.form = this.fb.group({
            product_id: ['', Validators.required],
            vendor_id: ['', Validators.required],
            quantity: ['', [Validators.required, Validators.min(1)]],
            notes: ['']
        });
    }

    loadOrders() {
        this.loading = true;
        const filters: any = { page: this.page, limit: 50 };
        if (this.filterStatus) filters.status = this.filterStatus;
        this.api.getOrders(filters).subscribe({
            next: res => { this.orders = res.data; this.total = res.total; this.loading = false; },
            error: () => { this.loading = false; this.orders = []; }
        });
    }

    /** Load PENDING POs for the logged-in vendor — shown as approval cards */
    loadPendingPOs() {
        this.loadingPending = true;
        this.api.getOrders({ status: 'PENDING', limit: 50 }).subscribe({
            next: res => { this.pendingPOs = res.data; this.loadingPending = false; },
            error: () => { this.loadingPending = false; this.pendingPOs = []; }
        });
    }

    loadSuggestions() {
        if (this.isVendor) return;
        this.api.getOrderSuggestions().subscribe({
            next: res => this.suggestions = res,
            error: (err) => {
                this.suggestions = [];
                this.notify.error('Could not load AI suggestions: ' + (err?.error?.error || err?.message || 'Server error'));
            }
        });
    }

    loadProducts() {
        this.api.getProducts({ limit: 200 }).subscribe({
            next: res => this.products = res.data,
            error: () => { }
        });
    }

    loadVendors() {
        this.http.get<any>(environment.apiUrl + '/auth/users').subscribe({
            next: res => {
                const all = Array.isArray(res) ? res : (res.data || []);
                this.vendors = all.filter((u: any) => u.role === 'VENDOR');
            },
            error: () => { }
        });
    }


    createOrder() {
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        this.api.createOrder(this.form.value).subscribe({
            next: () => {
                this.notify.success('Purchase order created & vendor notified!');
                this.showCreate = false;
                this.form.reset();
                this.page = 1;              // always go back to page 1 to see new PO
                this.filterStatus = '';     // clear any status filter so new PO is visible
                this.loadOrders();
                this.loadSuggestions();     // refresh suggestions too
            },
            error: err => this.notify.error(err.error?.error || 'Failed to create order')
        });
    }

    generateFromSuggestion(s: ForecastResult) {
        if (!s.Product) return;
        this.form.patchValue({ product_id: s.product_id, vendor_id: s.Product.vendor_id, quantity: Math.ceil(s.predicted_qty * 1.2) });
        this.showCreate = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /** Vendor approves a PO */
    approveOrder(id: number) {
        this.actioningId = id;
        this.api.updateOrderStatus(id, 'APPROVED').subscribe({
            next: () => {
                this.actioningId = null;
                this.notify.success('✅ Order approved! Manager has been notified.');
                this.pendingPOs = this.pendingPOs.filter(p => p.id !== id);
                this.loadOrders();
            },
            error: err => {
                this.actioningId = null;
                this.notify.error(err.error?.error || 'Approval failed');
            }
        });
    }

    /** Vendor rejects a PO */
    rejectOrder(id: number) {
        this.actioningId = id;
        this.api.updateOrderStatus(id, 'CANCELLED').subscribe({
            next: () => {
                this.actioningId = null;
                this.notify.success('❌ Order rejected. Manager has been notified.');
                this.pendingPOs = this.pendingPOs.filter(p => p.id !== id);
                this.loadOrders();
            },
            error: err => {
                this.actioningId = null;
                this.notify.error(err.error?.error || 'Rejection failed');
            }
        });
    }

    updateStatus(id: number, status: string) {
        this.api.updateOrderStatus(id, status).subscribe({
            next: () => { this.notify.success(`Order marked as ${status}`); this.loadOrders(); },
            error: err => this.notify.error(err.error?.error || 'Update failed')
        });
    }

    getVendorName(id: number | null): string {
        if (!id) return '—';
        return this.vendors.find(v => v.id === id)?.name || `Vendor #${id}`;
    }

    statusClass(s: string) {
        return ({ PENDING: 'pend', APPROVED: 'appr', DISPATCHED: 'disp', DELIVERED: 'ok', CANCELLED: 'out' } as any)[s] || '';
    }
}