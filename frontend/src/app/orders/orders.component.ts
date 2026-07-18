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
    pendingPOs: PurchaseOrder[] = [];
    suggestions: ForecastResult[] = [];
    products: Product[] = [];
    vendors: User[] = [];
    loading = false;
    loadingPending = false;
    showCreate = false;
    actioningId: string | null = null;

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
            vendor_id:  ['', Validators.required],
            quantity:   ['', [Validators.required, Validators.min(1)]],
            notes:      ['']
        });
    }

    // Helper: get MongoDB _id or fallback id from any document
    getId(obj: any): string {
        return obj?._id || obj?.id || '';
    }

    // Helper: get product name from populated or non-populated field
    getProductName(o: PurchaseOrder): string {
        const p = o.product_id;
        if (p && typeof p === 'object' && p.name) return p.name;
        return (o as any).Product?.name || '—';
    }

    // Helper: get product SKU
    getProductSku(o: PurchaseOrder): string {
        const p = o.product_id;
        if (p && typeof p === 'object' && p.sku) return p.sku;
        return (o as any).Product?.sku || '';
    }

    // Helper: get vendor name from populated or non-populated field
    getVendorNameFromOrder(o: PurchaseOrder): string {
        const v = o.vendor_id;
        if (v && typeof v === 'object' && (v as any).name) return (v as any).name;
        return (o as any).vendor?.name || `Vendor #${o.vendor_id}`;
    }

    // Helper: get order date (MongoDB uses createdAt, old schema used created_at)
    getOrderDate(o: PurchaseOrder): string {
        return (o as any).createdAt || o.created_at || '';
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
            error: err => {
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
                this.page = 1;
                this.filterStatus = '';
                this.loadOrders();
                this.loadSuggestions();
            },
            error: err => this.notify.error(err.error?.error || 'Failed to create order')
        });
    }

    generateFromSuggestion(s: ForecastResult) {
        if (!s.Product) return;
        const productId = this.getId(s.Product);
        const vendorId  = this.getId((s.Product as any).vendor_id) || this.getId(s.Product.vendor);
        this.form.patchValue({
            product_id: productId,
            vendor_id:  vendorId,
            quantity:   Math.ceil(s.predicted_qty * 1.2)
        });
        this.showCreate = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    approveOrder(id: string) {
        this.actioningId = id;
        this.api.updateOrderStatus(id as any, 'APPROVED').subscribe({
            next: () => {
                this.actioningId = null;
                this.notify.success('✅ Order approved! Manager has been notified.');
                this.pendingPOs = this.pendingPOs.filter(p => this.getId(p) !== id);
                this.loadOrders();
            },
            error: err => { this.actioningId = null; this.notify.error(err.error?.error || 'Approval failed'); }
        });
    }

    rejectOrder(id: string) {
        this.actioningId = id;
        this.api.updateOrderStatus(id as any, 'CANCELLED').subscribe({
            next: () => {
                this.actioningId = null;
                this.notify.success('❌ Order rejected. Manager has been notified.');
                this.pendingPOs = this.pendingPOs.filter(p => this.getId(p) !== id);
                this.loadOrders();
            },
            error: err => { this.actioningId = null; this.notify.error(err.error?.error || 'Rejection failed'); }
        });
    }

    updateStatus(id: string, status: string) {
        this.api.updateOrderStatus(id as any, status).subscribe({
            next: () => { this.notify.success(`Order marked as ${status}`); this.loadOrders(); },
            error: err => this.notify.error(err.error?.error || 'Update failed')
        });
    }

    getVendorName(id: string | null): string {
        if (!id) return '—';
        return this.vendors.find(v => this.getId(v) === id)?.name || `Vendor #${id}`;
    }

    statusClass(s: string) {
        return ({ PENDING: 'pend', APPROVED: 'appr', DISPATCHED: 'disp', DELIVERED: 'ok', CANCELLED: 'out' } as any)[s] || '';
    }
}