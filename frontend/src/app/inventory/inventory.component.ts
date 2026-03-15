import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../shared/services/api.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { NotificationService } from '../shared/services/notification.service';
import { Product, User } from '../shared/models/interfaces';

@Component({
    selector: 'app-inventory',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './inventory.component.html',
    styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent implements OnInit {

    products: Product[] = [];
    total = 0;
    page = 1;
    limit = 10;
    loading = false;
    showForm = false;
    importing = false;
    importError = '';
    editing: Product | null = null;

    searchTerm = '';
    filterCategory = '';
    filterStatus = '';

    form!: FormGroup;
    categories: string[] = [];
    vendors: User[] = [];

    constructor(
        private api: ApiService,
        private notify: NotificationService,
        private fb: FormBuilder,
        private http: HttpClient
    ) { }

    ngOnInit() {
        this.buildForm();
        this.loadProducts();
        this.loadCategories();
        this.loadVendors();
    }

    buildForm(product?: Product) {
        this.form = this.fb.group({
            name: [product?.name || '', Validators.required],
            sku: [product?.sku || '', Validators.required],
            category: [product?.category || '', Validators.required],
            vendor_id: [product?.vendor_id || null],
            current_stock: [product?.current_stock ?? 0, [Validators.required, Validators.min(0)]],
            reorder_level: [product?.reorder_level ?? 10, [Validators.required, Validators.min(1)]],
            unit_price: [product?.unit_price ?? 0, Validators.min(0)],
            expiry_date: [product?.expiry_date || '']
        });
    }

    loadCategories() {
        this.api.getCategories().subscribe({
            next: (cats: string[]) => { this.categories = cats; },
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

    getVendorName(id: number | null): string {
        if (!id) return '—';
        const v = this.vendors.find(v => v.id === id);
        return v ? v.name : `V-${id}`;
    }

    loadProducts() {
        this.loading = true;
        this.api.getProducts({
            page: this.page,
            limit: this.limit,
            search: this.searchTerm,
            category: this.filterCategory,
            status: this.filterStatus
        }).subscribe({
            next: res => {
                this.products = res.data;
                this.total = res.total;
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.products = [];
                this.total = 0;
            }
        });
    }

    openAdd() { this.editing = null; this.buildForm(); this.showForm = true; }
    openEdit(p: Product) { this.editing = p; this.buildForm(p); this.showForm = true; }
    closeForm() { this.showForm = false; this.editing = null; }

    saveProduct() {
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }

        const data = { ...this.form.value };
        if (!data.vendor_id) data.vendor_id = null;
        if (!data.expiry_date) data.expiry_date = null;

        const req = this.editing
            ? this.api.updateProduct(this.editing.id, data)
            : this.api.createProduct(data);

        req.subscribe({
            next: () => {
                this.notify.success(this.editing ? 'Product updated!' : 'Product added!');
                this.closeForm();
                this.loadProducts();
            },
            error: err => this.notify.error(err.error?.error || 'Save failed')
        });
    }

    deleteProduct(p: Product) {
        if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        this.api.deleteProduct(p.id).subscribe({
            next: () => { this.notify.success('Product deleted'); this.loadProducts(); },
            error: err => this.notify.error(err.error?.error || 'Delete failed')
        });
    }

    onFileImport(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase();
        const allowed = ['csv', 'xlsx', 'xls', 'tsv', 'ods', 'txt'];

        if (!ext || !allowed.includes(ext)) {
            this.notify.error(`Unsupported file type ".${ext}". Allowed: ${allowed.join(', ')}`);
            input.value = '';
            return;
        }

        this.importing = true;
        this.api.importProductsSheet(file).subscribe({
            next: res => {
                this.importing = false;
                this.importError = '';
                this.notify.success(`✅ Imported ${res.imported} products${res.skipped ? '. Skipped: ' + res.skipped : ''}`);
                this.loadProducts();
                input.value = '';
            },
            error: err => {
                this.importing = false;
                input.value = '';
                const body = err.error;
                if (body?.detected_columns?.length > 0) {
                    this.importError = `Your file columns: [${body.detected_columns.join(', ')}]. ${body.hint || 'Could not map to name, sku, category.'}`;
                } else {
                    this.importError = body?.error || body?.message || 'Import failed. Check file format.';
                }
                this.notify.error('Import failed — see details below');
            }
        });
    }

    downloadTemplate() {
        const header = 'name,sku,category,current_stock,reorder_level,unit_price,expiry_date';
        const rows = [
            'Laptop Stand Pro,SKU-NEW1,Electronics,50,15,29.99,',
            'Ergonomic Chair,SKU-NEW2,Furniture,20,5,299.00,',
            'A4 Paper 500pk,SKU-NEW3,Supplies,100,30,12.99,2026-12-31'
        ];
        const content = [header, ...rows].join('\n');
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'smartshelfx_products_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    onSearch() { this.page = 1; this.loadProducts(); }
    prevPage() { if (this.page > 1) { this.page--; this.loadProducts(); } }
    nextPage() { if (this.page * this.limit < this.total) { this.page++; this.loadProducts(); } }
    get totalPages() { return Math.max(1, Math.ceil(this.total / this.limit)); }

    statusClass(p: Product): string {
        if (p.current_stock === 0) return 'badge-out';
        if (p.current_stock <= p.reorder_level * 0.5) return 'badge-crit';
        if (p.current_stock <= p.reorder_level) return 'badge-low';
        return 'badge-ok';
    }

    statusLabel(p: Product): string {
        if (p.current_stock === 0) return 'Out of Stock';
        if (p.current_stock <= p.reorder_level * 0.5) return 'Critical';
        if (p.current_stock <= p.reorder_level) return 'Low Stock';
        return 'In Stock';
    }
}