import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { ApiService } from '../shared/services/api.service';
import { AnalyticsSummary, TopRestockedItem, CategoryBreakdown } from '../shared/models/interfaces';

Chart.register(...registerables);

@Component({
    selector: 'app-analytics',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './analytics.component.html',
    styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild('stockTrendCanvas') stockTrendCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('categoryCanvas') categoryCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('poStatusCanvas') poStatusCanvas!: ElementRef<HTMLCanvasElement>;

    summary: AnalyticsSummary = { totalProducts: 0, lowStockItems: 0, outOfStockItems: 0, pendingOrders: 0 };
    topItems: TopRestockedItem[] = [];
    categories: CategoryBreakdown[] = [];
    lowStockProducts: any[] = [];
    loading = true;
    movementLoading = false;
    movementPeriod: 'day' | 'month' | 'year' = 'month';

    // Template aliases
    get selectedPeriod() { return this.movementPeriod; }
    set selectedPeriod(v: 'day' | 'month' | 'year') { this.movementPeriod = v; }
    get loadingChart() { return this.movementLoading; }

    poStatusData = { pending: 0, approved: 0, dispatched: 0, delivered: 0, cancelled: 0 };

    trendLabels: string[] = [];
    trendIn: number[] = [];
    trendOut: number[] = [];

    private trendChart?: Chart;
    private categoryChart?: Chart;
    private poChart?: Chart;
    private chartsReady = false;

    constructor(private api: ApiService, private cdr: ChangeDetectorRef) { }

    ngOnInit() { this.loadAll(); }
    ngAfterViewInit() { this.chartsReady = true; this.tryBuildCharts(); }
    ngOnDestroy() { this.trendChart?.destroy(); this.categoryChart?.destroy(); this.poChart?.destroy(); }

    loadAll() {
        this.loading = true;

        this.api.getAnalyticsSummary().subscribe({
            next: s => { this.summary = s; this.cdr.detectChanges(); },
            error: () => { }
        });

        this.loadMovement();

        this.api.getTopRestocked().subscribe({
            next: items => { this.topItems = items; this.cdr.detectChanges(); },
            error: () => { this.topItems = []; }
        });

        this.api.getCategoryBreakdown().subscribe({
            next: cats => { this.categories = cats; this.tryBuildCharts(); },
            error: () => { }
        });

        this.api.getProducts({ status: 'low', limit: 10 }).subscribe({
            next: res => { this.lowStockProducts = res.data; this.loading = false; this.cdr.detectChanges(); },
            error: () => { this.loading = false; }
        });

        this.api.getOrders({ limit: 200 }).subscribe({
            next: res => {
                const orders = res.data || [];
                this.poStatusData = {
                    pending: orders.filter((o: any) => o.status === 'PENDING').length,
                    approved: orders.filter((o: any) => o.status === 'APPROVED').length,
                    dispatched: orders.filter((o: any) => o.status === 'DISPATCHED').length,
                    delivered: orders.filter((o: any) => o.status === 'DELIVERED').length,
                    cancelled: orders.filter((o: any) => o.status === 'CANCELLED').length
                };
                this.tryBuildCharts();
            },
            error: () => { }
        });
    }

    loadMovement() {
        this.movementLoading = true;
        this.api.getStockMovement(this.movementPeriod).subscribe({
            next: (rows: any[]) => {
                this.trendLabels = rows.map((r: any) => r.label);
                this.trendIn = rows.map((r: any) => r.purchases);
                this.trendOut = rows.map((r: any) => r.sales);
                this.movementLoading = false;
                if (this.chartsReady) setTimeout(() => this.buildTrendChart(), 80);
            },
            error: () => { this.movementLoading = false; }
        });
    }

    onPeriodChange() { this.loadMovement(); }

    tryBuildCharts() {
        if (!this.chartsReady) return;
        setTimeout(() => {
            this.buildTrendChart();
            this.buildCategoryChart();
            this.buildPOChart();
        }, 100);
    }

    buildTrendChart() {
        if (!this.stockTrendCanvas?.nativeElement) return;
        this.trendChart?.destroy();
        this.trendChart = new Chart(this.stockTrendCanvas.nativeElement.getContext('2d')!, {
            type: 'bar',
            data: {
                labels: this.trendLabels.length ? this.trendLabels : ['No data'],
                datasets: [
                    {
                        label: 'Purchases (IN)',
                        data: this.trendIn,
                        backgroundColor: 'rgba(34,197,94,0.7)',
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Sales (OUT)',
                        data: this.trendOut,
                        backgroundColor: 'rgba(0,180,255,0.6)',
                        borderRadius: 6,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 12 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    buildCategoryChart() {
        if (!this.categoryCanvas?.nativeElement || !this.categories.length) return;
        this.categoryChart?.destroy();
        this.categoryChart = new Chart(this.categoryCanvas.nativeElement.getContext('2d')!, {
            type: 'doughnut',
            data: {
                labels: this.categories.map(c => c.category),
                datasets: [{
                    data: this.categories.map(c => Number(c.total_stock)),
                    backgroundColor: ['#00b4ff', '#00ffcc', '#ffaa00', '#ff4d6d', '#a855f7', '#22c55e', '#f97316'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.5)', font: { size: 12 }, padding: 12, boxWidth: 12 } }
                }
            }
        });
    }

    buildPOChart() {
        if (!this.poStatusCanvas?.nativeElement) return;
        this.poChart?.destroy();
        this.poChart = new Chart(this.poStatusCanvas.nativeElement.getContext('2d')!, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Approved', 'Dispatched', 'Delivered', 'Cancelled'],
                datasets: [{
                    data: [
                        this.poStatusData.pending, this.poStatusData.approved,
                        this.poStatusData.dispatched, this.poStatusData.delivered,
                        this.poStatusData.cancelled
                    ],
                    backgroundColor: ['#ffaa00', '#00b4ff', '#a855f7', '#00ffcc', '#ff4d6d'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.5)', font: { size: 12 }, padding: 12, boxWidth: 12 } }
                }
            }
        });
    }

    getBarWidth(val: number): string {
        const max = Math.max(...this.topItems.map(i => i.total_restocked), 1);
        return `${Math.round((val / max) * 100)}%`;
    }

    statusClass(p: any): string {
        if (p.current_stock === 0) return 'badge-out';
        if (p.current_stock <= p.reorder_level * 0.5) return 'badge-crit';
        if (p.current_stock <= p.reorder_level) return 'badge-low';
        return 'badge-ok';
    }

    statusLabel(p: any): string {
        if (p.current_stock === 0) return 'Out of Stock';
        if (p.current_stock <= p.reorder_level * 0.5) return 'Critical';
        if (p.current_stock <= p.reorder_level) return 'Low Stock';
        return 'In Stock';
    }

    get totalStock(): number {
        return this.categories.reduce((s, c) => s + Number(c.total_stock), 0);
    }
}