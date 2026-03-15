import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { ApiService } from '../shared/services/api.service';
import { AnalyticsSummary, TopRestockedItem, CategoryBreakdown } from '../shared/models/interfaces';

@Component({
    selector: 'app-analytics',
    standalone: true,
    imports: [CommonModule, BaseChartDirective],
    templateUrl: './analytics.component.html',
    styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit {

    summary: AnalyticsSummary = { totalProducts: 0, lowStockItems: 0, outOfStockItems: 0, pendingOrders: 0 };
    topItems: TopRestockedItem[] = [];
    categories: CategoryBreakdown[] = [];


    barData: ChartConfiguration<'bar'>['data'] = {
        labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
        datasets: [
            { label: 'Purchases', data: [42000, 51000, 48000, 62000, 58000, 71000], backgroundColor: 'rgba(0,180,255,0.5)', borderRadius: 6, borderSkipped: false },
            { label: 'Sales', data: [38000, 46000, 42000, 59000, 52000, 64000], backgroundColor: 'rgba(0,255,200,0.4)', borderRadius: 6, borderSkipped: false }
        ]
    };
    barOptions: ChartConfiguration<'bar'>['options'] = {
        responsive: true,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { family: 'Rajdhani', size: 12 } } } },
        scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
    };


    catData: ChartConfiguration<'doughnut'>['data'] = {
        labels: ['Electronics', 'Furniture', 'Supplies', 'Perishables', 'Other'],
        datasets: [{ data: [35, 20, 25, 12, 8], backgroundColor: ['#00b4ff', '#00ffcc', '#ffaa00', '#ff4d6d', '#a855f7'], borderWidth: 0 }]
    };
    catOptions: ChartConfiguration<'doughnut'>['options'] = {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.5)', font: { family: 'Rajdhani', size: 12 }, padding: 12, boxWidth: 12 } } }
    };


    invData: ChartConfiguration<'line'>['data'] = {
        labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6'],
        datasets: [{
            label: 'Inventory Level', data: [12000, 11500, 12800, 11200, 13100, 12486],
            borderColor: '#00b4ff', backgroundColor: 'rgba(0,180,255,0.07)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 4
        }]
    };
    invOptions: ChartConfiguration<'line'>['options'] = {
        responsive: true,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { family: 'Rajdhani', size: 12 } } } },
        scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
    };

    constructor(private api: ApiService) { }

    ngOnInit() {
        this.api.getAnalyticsSummary().subscribe({ next: s => this.summary = s, error: () => { } });
        this.api.getTopRestocked().subscribe({ next: items => this.topItems = items, error: () => this.topItems = this.demoTop() });
        this.api.getCategoryBreakdown().subscribe({ next: c => this.categories = c, error: () => { } });
    }

    getBarWidth(val: number): string {
        const max = Math.max(...this.topItems.map(i => i.total_restocked), 1);
        return `${Math.round((val / max) * 100)}%`;
    }

    private demoTop(): TopRestockedItem[] {
        return [
            { name: 'Laptop Stand Pro', sku: 'SKU-001', total_restocked: 240 },
            { name: 'USB-C Hub 7-in-1', sku: 'SKU-042', total_restocked: 206 },
            { name: 'A4 Paper 500pk', sku: 'SKU-120', total_restocked: 190 },
            { name: 'Wireless Keyboard', sku: 'SKU-087', total_restocked: 150 },
            { name: 'Mechanical Mouse', sku: 'SKU-156', total_restocked: 120 },
        ];
    }
}