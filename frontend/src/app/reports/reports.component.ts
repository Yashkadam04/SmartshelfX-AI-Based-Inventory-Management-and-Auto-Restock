import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterUrgencyPipe } from './filter-urgency.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../shared/services/api.service';
import { NotificationService } from '../shared/services/notification.service';

@Component({
    selector: 'app-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, FilterUrgencyPipe],
    templateUrl: './reports.component.html',
    styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit {

    activeTab: 'reorder' | 'valuation' | 'vendor' = 'reorder';

    // ── Reorder Suggestions ──────────────────────────────────────
    reorderData:       any   = null;
    reorderLoading     = false;

    // ── Inventory Valuation ──────────────────────────────────────
    valuationData:     any   = null;
    valuationLoading   = false;

    // ── Vendor Performance ───────────────────────────────────────
    vendorData:        any   = null;
    vendorLoading      = false;

    constructor(private api: ApiService, private notify: NotificationService) { }

    ngOnInit() { this.loadReorder(); }

    switchTab(tab: 'reorder' | 'valuation' | 'vendor') {
        this.activeTab = tab;
        if (tab === 'reorder'   && !this.reorderData)   this.loadReorder();
        if (tab === 'valuation' && !this.valuationData) this.loadValuation();
        if (tab === 'vendor'    && !this.vendorData)    this.loadVendorPerformance();
    }

    // ── Load Reorder Suggestions ─────────────────────────────────
    loadReorder() {
        this.reorderLoading = true;
        this.api.getReorderSuggestions().subscribe({
            next: res => { this.reorderData = res; this.reorderLoading = false; },
            error: () => { this.reorderLoading = false; this.notify.error('Failed to load reorder suggestions'); }
        });
    }

    // ── Load Inventory Valuation ─────────────────────────────────
    loadValuation() {
        this.valuationLoading = true;
        this.api.getValuation().subscribe({
            next: res => { this.valuationData = res; this.valuationLoading = false; },
            error: () => { this.valuationLoading = false; this.notify.error('Failed to load valuation data'); }
        });
    }

    // ── Load Vendor Performance ──────────────────────────────────
    loadVendorPerformance() {
        this.vendorLoading = true;
        this.api.getVendorPerformance().subscribe({
            next: res => { this.vendorData = res; this.vendorLoading = false; },
            error: () => { this.vendorLoading = false; this.notify.error('Failed to load vendor performance'); }
        });
    }

    // ── Create PO from reorder suggestion ───────────────────────
    createPO(suggestion: any) {
        if (suggestion.has_open_po) {
            this.notify.success('A Purchase Order already exists for this product.');
            return;
        }
        const payload = {
            product_id: suggestion.product_id,
            vendor_id:  suggestion.vendor?._id || suggestion.vendor?.id || null,
            quantity:   suggestion.recommended_qty,
            notes:      `Auto-reorder: ${suggestion.product_name}. ` +
                        `Avg daily usage: ${suggestion.avg_daily_usage} units. ` +
                        `Lead time: ${suggestion.lead_time_days} days. ` +
                        `Safety stock: ${suggestion.safety_stock} units.`
        };
        this.api.createOrder(payload).subscribe({
            next: () => {
                this.notify.success(`✅ Purchase Order created for ${suggestion.product_name}!`);
                suggestion.has_open_po = true;
            },
            error: err => this.notify.error(err.error?.error || 'Failed to create PO')
        });
    }

    // ── Export reorder suggestions to CSV ────────────────────────
    exportReorderCSV() {
        if (!this.reorderData?.suggestions?.length) return;
        const headers = ['Product','SKU','Category','Current Stock','Reorder Level','Avg Daily Usage','Lead Time (Days)','Safety Stock','Recommended Qty','Estimated Cost (₹)','Urgency','Days Until Stockout'];
        const rows = this.reorderData.suggestions.map((s: any) => [
            s.product_name, s.sku, s.category, s.current_stock, s.reorder_level,
            s.avg_daily_usage, s.lead_time_days, s.safety_stock, s.recommended_qty,
            s.estimated_cost, s.urgency, s.days_until_stockout ?? 'N/A'
        ]);
        this.downloadCSV('reorder_suggestions.csv', headers, rows);
    }

    // ── Export valuation to CSV ──────────────────────────────────
    exportValuationCSV() {
        if (!this.valuationData?.category_valuation?.length) return;
        const headers = ['Category', 'Products', 'Total Units', 'Category Value (₹)'];
        const rows = this.valuationData.category_valuation.map((c: any) => [
            c.category, c.product_count, c.total_units, c.category_value.toFixed(2)
        ]);
        this.downloadCSV('inventory_valuation.csv', headers, rows);
    }

    // ── Export vendor performance to CSV ─────────────────────────
    exportVendorCSV() {
        if (!this.vendorData?.vendors?.length) return;
        const headers = ['Vendor','Email','Assigned Products','Total Orders','Delivered','Cancelled','Fulfillment Rate (%)','Rejection Rate (%)','Avg Response (hrs)','Total Qty Supplied','Total Value Supplied (₹)','Performance Score','Rating'];
        const rows = this.vendorData.vendors.map((v: any) => [
            v.vendor_name, v.vendor_email, v.assigned_products, v.total_orders,
            v.delivered_orders, v.cancelled_orders, v.fulfillment_rate, v.rejection_rate,
            v.avg_response_hours ?? 'N/A', v.total_qty_supplied, v.total_value_supplied,
            v.performance_score, v.rating
        ]);
        this.downloadCSV('vendor_performance.csv', headers, rows);
    }

    private downloadCSV(filename: string, headers: string[], rows: any[]) {
        const content = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([content], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Helpers ──────────────────────────────────────────────────
    urgencyClass(u: string): string {
        return ({ CRITICAL: 'badge-crit', HIGH: 'badge-high', MEDIUM: 'badge-med', LOW: 'badge-low' } as any)[u] || 'badge-low';
    }

    scoreClass(score: number): string {
        if (score >= 80) return 'score-excellent';
        if (score >= 60) return 'score-good';
        if (score >= 40) return 'score-average';
        return 'score-poor';
    }

    scoreBarWidth(score: number): string { return `${score}%`; }

    getTotalEstimatedCost(): number {
        return (this.reorderData?.suggestions || []).reduce((sum: number, s: any) => sum + (s.estimated_cost || 0), 0);
    }

    valuePct(value: number): string {
        const total = this.valuationData?.total_inventory_value || 1;
        return `${Math.round((value / total) * 100)}%`;
    }
}