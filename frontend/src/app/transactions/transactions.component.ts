import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../shared/services/api.service';
import { NotificationService } from '../shared/services/notification.service';
import { StockTransaction, Product } from '../shared/models/interfaces';

// Returns local datetime string in format required by <input type="datetime-local">
function toLocalDateTimeString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
    selector: 'app-transactions',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './transactions.component.html',
    styleUrls: ['./transactions.component.scss']
})
export class TransactionsComponent implements OnInit {

    activeTab: 'IN' | 'OUT' | 'HISTORY' = 'IN';
    transactions: StockTransaction[] = [];
    products: Product[] = [];
    loading = false;
    submitting = false;

    inForm!: FormGroup;
    outForm!: FormGroup;

    filterType = '';
    page = 1;
    limit = 15;
    total = 0;

    get totalPages() { return Math.max(1, Math.ceil(this.total / this.limit)); }
    prevPage() { if (this.page > 1) { this.page--; this.loadTransactions(); } }
    nextPage() { if (this.page < this.totalPages) { this.page++; this.loadTransactions(); } }

    constructor(
        private api: ApiService,
        private notify: NotificationService,
        private fb: FormBuilder
    ) { }

    ngOnInit() {
        this.buildForms();
        this.loadProducts();
        this.loadTransactions();
    }

    buildForms() {
        const now = toLocalDateTimeString(new Date());
        this.inForm = this.fb.group({
            product_id: ['', Validators.required],
            quantity: ['', [Validators.required, Validators.min(1)]],
            notes: [''],
            timestamp: [now]
        });
        this.outForm = this.fb.group({
            product_id: ['', Validators.required],
            quantity: ['', [Validators.required, Validators.min(1)]],
            notes: [''],
            timestamp: [now]
        });
    }

    loadProducts() {
        this.api.getProducts({ limit: 200 }).subscribe({
            next: res => this.products = res.data,
            error: () => { }
        });
    }

    loadTransactions() {
        this.loading = true;
        const filters: any = { page: this.page, limit: this.limit };
        if (this.filterType) filters.type = this.filterType;

        this.api.getTransactions(filters).subscribe({
            next: res => {
                this.transactions = res.data;
                this.total = res.total;
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.transactions = [];
                this.total = 0;
            }
        });
    }

    submitIn() {
        if (this.inForm.invalid) { this.inForm.markAllAsTouched(); return; }
        this.submitting = true;
        this.api.createTransaction({ ...this.inForm.value, type: 'IN' }).subscribe({
            next: res => {
                this.notify.success(`✅ Stock-In recorded! Updated stock: ${res.updatedStock}`);
                this.inForm.reset({ timestamp: toLocalDateTimeString(new Date()) });
                this.loadTransactions();
                this.submitting = false;
            },
            error: err => {
                this.notify.error(err.error?.error || 'Failed to record Stock-In');
                this.submitting = false;
            }
        });
    }

    submitOut() {
        if (this.outForm.invalid) { this.outForm.markAllAsTouched(); return; }
        this.submitting = true;
        this.api.createTransaction({ ...this.outForm.value, type: 'OUT' }).subscribe({
            next: res => {
                this.notify.success(`📤 Stock-Out recorded! Remaining: ${res.updatedStock}`);
                this.outForm.reset({ timestamp: toLocalDateTimeString(new Date()) });
                this.loadTransactions();
                this.submitting = false;
            },
            error: err => {
                this.notify.error(err.error?.error || 'Failed to record Stock-Out');
                this.submitting = false;
            }
        });
    }

    switchTab(tab: 'IN' | 'OUT' | 'HISTORY') {
        this.activeTab = tab;
        if (tab === 'HISTORY') { this.page = 1; this.loadTransactions(); }
    }
}