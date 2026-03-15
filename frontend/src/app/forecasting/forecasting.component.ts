import {
    Component, OnInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { ApiService } from '../shared/services/api.service';
import { NotificationService } from '../shared/services/notification.service';
import { ForecastResult } from '../shared/models/interfaces';

Chart.register(...registerables);

@Component({
    selector: 'app-forecasting',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './forecasting.component.html',
    styleUrls: ['./forecasting.component.scss']
})
export class ForecastingComponent implements OnInit, OnDestroy {

    private barChart?: Chart;
    private doughnutChart?: Chart;

    forecasts: ForecastResult[] = [];
    loading = false;
    running = false;
    triggering = false;
    selectedHorizon = '7';
    lastRunTime = '';

    riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    totalAtRisk = 0;

    visibleCount = 10;
    totalBars = 0;
    _scrollIndex = 0;

    allLabels: string[] = [];
    private allDemand: number[] = [];
    private allStock: number[] = [];
    private allBgColor: string[] = [];
    private allBdColor: string[] = [];

    get scrollIndex() { return this._scrollIndex; }
    set scrollIndex(v: number) { this._scrollIndex = v; this.updateBarChart(); }
    get scrollMax() { return Math.max(0, this.totalBars - this.visibleCount); }
    get scrollPercent() { return this.scrollMax > 0 ? Math.round((this._scrollIndex / this.scrollMax) * 100) : 0; }
    get visibleFrom() { return this.totalBars > 0 ? this._scrollIndex + 1 : 0; }
    get visibleTo() { return Math.min(this._scrollIndex + this.visibleCount, this.totalBars); }

    constructor(
        private api: ApiService,
        private notify: NotificationService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() { this.loadForecasts(); }
    ngOnDestroy() { this.barChart?.destroy(); this.doughnutChart?.destroy(); }

    loadForecasts() {
        this.loading = true;
        this.api.getForecasts().subscribe({
            next: (res: any[]) => {
                if (!Array.isArray(res)) { this.forecasts = []; this.afterLoad(); return; }
                const seen = new Set<number>();
                this.forecasts = res.filter(f => {
                    const pid = Number(f.product_id);
                    if (seen.has(pid)) return false;
                    seen.add(pid);
                    return true;
                });
                this.afterLoad();
            },
            error: () => { this.forecasts = []; this.afterLoad(); }
        });
    }

    afterLoad() {
        this.loading = false;
        this.cdr.detectChanges();
        // Wait for Angular to update the DOM, then build charts
        setTimeout(() => this.buildCharts(), 200);
    }

    buildCharts() {
        this.prepareAllData();
        this.buildBar();
        this.buildDoughnut();
    }

    prepareAllData() {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const sorted = [...this.forecasts].sort((a, b) => {
            const rDiff = (order[a.risk_level] ?? 4) - (order[b.risk_level] ?? 4);
            return rDiff !== 0 ? rDiff : b.predicted_qty - a.predicted_qty;
        });

        this.allLabels = sorted.map(f => f.Product?.name || `Product #${f.product_id}`);
        this.allDemand = sorted.map(f => Math.round(f.predicted_qty));
        this.allStock = sorted.map(f => f.Product?.current_stock ?? 0);
        this.allBgColor = sorted.map(f => this.riskBg(f.risk_level));
        this.allBdColor = sorted.map(f => this.riskFg(f.risk_level));
        this.totalBars = sorted.length;
        this._scrollIndex = 0;

        const seen = new Set<number>();
        this.riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        this.forecasts.forEach(f => {
            if (seen.has(f.product_id)) return;
            seen.add(f.product_id);
            const k = f.risk_level as keyof typeof this.riskCounts;
            if (k in this.riskCounts) this.riskCounts[k]++;
        });
        this.totalAtRisk = this.riskCounts.CRITICAL + this.riskCounts.HIGH;
    }

    buildBar() {
        this.barChart?.destroy();
        this.barChart = undefined;

        const canvas = document.getElementById('ssx-bar-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const slice = this.getVisibleSlice();

        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: slice.labels,
                datasets: [
                    {
                        label: 'Predicted Demand (7d)',
                        data: slice.demand,
                        backgroundColor: slice.bgColor,
                        borderColor: slice.bdColor,
                        borderWidth: 1,
                        borderRadius: 5,
                        order: 1
                    },
                    {
                        label: 'Current Stock',
                        data: slice.stock,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderColor: 'rgba(255,255,255,0.3)',
                        borderWidth: 1,
                        borderRadius: 5,
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 12, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = this._scrollIndex + items[0].dataIndex;
                                return this.allLabels[idx] || items[0].label as string;
                            },
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.y} units`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255,255,255,0.55)',
                            maxRotation: 35,
                            font: { size: 11 },
                            callback: (_: any, i: number) => {
                                const labels = this.barChart?.data?.labels as string[] || [];
                                const name = labels[i] || '';
                                return name.length > 12 ? name.slice(0, 11) + '…' : name;
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: 'rgba(255,255,255,0.55)' },
                        grid: { color: 'rgba(255,255,255,0.07)' }
                    }
                }
            }
        });
    }

    buildDoughnut() {
        this.doughnutChart?.destroy();
        this.doughnutChart = undefined;

        const canvas = document.getElementById('ssx-donut-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        this.doughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High Risk', 'Medium', 'Low Risk'],
                datasets: [{
                    data: [this.riskCounts.CRITICAL, this.riskCounts.HIGH, this.riskCounts.MEDIUM, this.riskCounts.LOW],
                    backgroundColor: ['#ff4d6d', '#ff8c00', '#ffaa00', '#00ffcc'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: { legend: { display: false } }
            }
        });
    }

    onScroll(val: number) {
        this._scrollIndex = Number(val);
        this.updateBarChart();
        this.cdr.detectChanges();
    }

    updateBarChart() {
        if (!this.barChart) return;
        const slice = this.getVisibleSlice();
        this.barChart.data.labels = [...slice.labels];
        this.barChart.data.datasets[0] = { ...this.barChart.data.datasets[0], data: [...slice.demand], backgroundColor: [...slice.bgColor], borderColor: [...slice.bdColor] };
        this.barChart.data.datasets[1] = { ...this.barChart.data.datasets[1], data: [...slice.stock] };
        this.barChart.update();
    }

    private getVisibleSlice() {
        const start = this._scrollIndex;
        const end = start + this.visibleCount;
        return {
            labels: this.allLabels.slice(start, end),
            demand: this.allDemand.slice(start, end),
            stock: this.allStock.slice(start, end),
            bgColor: this.allBgColor.slice(start, end),
            bdColor: this.allBdColor.slice(start, end),
        };
    }

    runForecast() {
        this.running = true;
        this.api.runForecast().subscribe({
            next: res => {
                const count = res.forecasts?.length || 0;
                this.notify.success(`✅ Forecast complete! ${count} products analysed.`);
                this.lastRunTime = new Date().toLocaleTimeString();
                this.running = false;
                setTimeout(() => this.loadForecasts(), 800);
            },
            error: () => {
                this.notify.error('❌ ML Service unavailable — run: python ml-service/main.py');
                this.running = false;
            }
        });
    }

    triggerAlerts() {
        this.triggering = true;
        this.api.triggerVendorAlerts().subscribe({
            next: (res: any) => {
                this.triggering = false;
                this.notify.success(`✅ ${res.alerts_created} vendor alert(s) sent for HIGH/CRITICAL products`);
            },
            error: () => { this.triggering = false; this.notify.error('Failed to send alerts'); }
        });
    }

    getRiskClass(l: string) { return ({ CRITICAL: 'risk-crit', HIGH: 'risk-high', MEDIUM: 'risk-med', LOW: 'risk-low' } as any)[l] || 'risk-low'; }
    getConfidencePct(c: number) { return `${Math.round(c * 100)}%`; }
    riskBg(l: string) { return ({ CRITICAL: 'rgba(255,77,109,0.65)', HIGH: 'rgba(255,140,0,0.65)', MEDIUM: 'rgba(255,170,0,0.65)', LOW: 'rgba(0,255,204,0.55)' } as any)[l] || 'rgba(0,180,255,0.6)'; }
    riskFg(l: string) { return ({ CRITICAL: '#ff4d6d', HIGH: '#ff8c00', MEDIUM: '#ffaa00', LOW: '#00ffcc' } as any)[l] || '#00b4ff'; }

    sortedForecasts() {
        const o: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return [...this.forecasts].sort((a, b) => (o[a.risk_level] ?? 4) - (o[b.risk_level] ?? 4));
    }
}