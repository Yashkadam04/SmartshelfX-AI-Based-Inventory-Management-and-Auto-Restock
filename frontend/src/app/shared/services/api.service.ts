import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
    Product, ProductListResponse, ProductFilterParams,
    StockTransaction, TransactionPayload,
    PurchaseOrder, OrderPayload,
    Alert, AlertListResponse,
    ForecastResult, AnalyticsSummary,
    StockTrendItem, TopRestockedItem, CategoryBreakdown
} from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly API = environment.apiUrl;

    constructor(private http: HttpClient) { }

    // ─── Helper ────────────────────────────────────────────────────
    private params(obj: Record<string, any>): HttpParams {
        let p = new HttpParams();
        Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '') p = p.set(k, String(v)); });
        return p;
    }

    // ─── Products ──────────────────────────────────────────────────
    getCategories(): Observable<string[]> {
        return this.http.get<string[]>(`${this.API}/products/categories`);
    }

    getProducts(filters: ProductFilterParams = {}): Observable<ProductListResponse> {
        return this.http.get<ProductListResponse>(`${this.API}/products`, { params: this.params(filters) });
    }
    getProduct(id: number): Observable<Product> {
        return this.http.get<Product>(`${this.API}/products/${id}`);
    }
    createProduct(data: Partial<Product>): Observable<Product> {
        return this.http.post<Product>(`${this.API}/products`, data);
    }
    updateProduct(id: number, data: Partial<Product>): Observable<Product> {
        return this.http.put<Product>(`${this.API}/products/${id}`, data);
    }
    deleteProduct(id: number): Observable<{ success: boolean }> {
        return this.http.delete<{ success: boolean }>(`${this.API}/products/${id}`);
    }
    importProductsCsv(file: File): Observable<{ success: boolean; imported: number; skipped: number; total: number }> {
        const fd = new FormData();
        fd.append('file', file);
        return this.http.post<{ success: boolean; imported: number; skipped: number; total: number }>(`${this.API}/products/import-sheet`, fd);
    }
    importProductsSheet(file: File): Observable<{ success: boolean; imported: number; skipped: number; total: number }> {
        const fd = new FormData();
        fd.append('file', file);
        return this.http.post<{ success: boolean; imported: number; skipped: number; total: number }>(`${this.API}/products/import-sheet`, fd);
    }

    // ─── Transactions ──────────────────────────────────────────────
    getTransactions(filters: Record<string, any> = {}): Observable<{ total: number; data: StockTransaction[] }> {
        return this.http.get<{ total: number; data: StockTransaction[] }>(`${this.API}/transactions`, { params: this.params(filters) });
    }
    createTransaction(data: TransactionPayload): Observable<{ transaction: StockTransaction; updatedStock: number }> {
        return this.http.post<{ transaction: StockTransaction; updatedStock: number }>(`${this.API}/transactions`, data);
    }

    // ─── Forecast ──────────────────────────────────────────────────
    getForecasts(): Observable<ForecastResult[]> {
        return this.http.get<ForecastResult[]>(`${this.API}/forecast?_=${Date.now()}`);
    }
    runForecast(): Observable<{ success: boolean; message: string; forecasts: ForecastResult[] }> {
        return this.http.post<any>(`${this.API}/forecast/run`, {});
    }
    triggerVendorAlerts(): Observable<any> {
        return this.http.post<any>(`${this.API}/forecast/trigger-alerts`, {});
    }
    post(path: string, body: any): Observable<any> {
        return this.http.post<any>(`${this.API}/${path}`, body);
    }
    getProductForecast(productId: number): Observable<ForecastResult[]> {
        return this.http.get<ForecastResult[]>(`${this.API}/forecast/${productId}`);
    }

    // ─── Purchase Orders ───────────────────────────────────────────
    getOrders(filters: Record<string, any> = {}): Observable<{ total: number; data: PurchaseOrder[] }> {
        return this.http.get<any>(`${this.API}/orders`, { params: this.params(filters) });
    }
    createOrder(data: OrderPayload): Observable<PurchaseOrder> {
        return this.http.post<PurchaseOrder>(`${this.API}/orders`, data);
    }
    updateOrderStatus(id: number, status: string): Observable<PurchaseOrder> {
        return this.http.put<PurchaseOrder>(`${this.API}/orders/${id}/status`, { status });
    }
    getOrderSuggestions(): Observable<ForecastResult[]> {
        return this.http.get<ForecastResult[]>(`${this.API}/orders/suggestions`);
    }

    // ─── Alerts ────────────────────────────────────────────────────
    getAlerts(filters: Record<string, any> = {}): Observable<AlertListResponse> {
        return this.http.get<AlertListResponse>(`${this.API}/alerts`, { params: this.params(filters) });
    }
    markAlertRead(id: number): Observable<{ success: boolean }> {
        return this.http.put<{ success: boolean }>(`${this.API}/alerts/${id}/read`, {});
    }
    markAllAlertsRead(): Observable<{ success: boolean }> {
        return this.http.put<{ success: boolean }>(`${this.API}/alerts/read-all`, {});
    }
    dismissAlert(id: number): Observable<{ success: boolean }> {
        return this.http.delete<{ success: boolean }>(`${this.API}/alerts/${id}`);
    }

    // ─── Analytics ─────────────────────────────────────────────────
    getAnalyticsSummary(): Observable<AnalyticsSummary> {
        return this.http.get<AnalyticsSummary>(`${this.API}/analytics/summary`);
    }
    getStockTrend(): Observable<StockTrendItem[]> {
        return this.http.get<StockTrendItem[]>(`${this.API}/analytics/stock-trend`);
    }
    getTopRestocked(): Observable<TopRestockedItem[]> {
        return this.http.get<TopRestockedItem[]>(`${this.API}/analytics/top-restocked`);
    }
    getCategoryBreakdown(): Observable<CategoryBreakdown[]> {
        return this.http.get<CategoryBreakdown[]>(`${this.API}/analytics/category-breakdown`);
    }

    getUsers(): Observable<any[]> {
        return this.http.get<any[]>(`${this.API}/auth/users`);
    }
}