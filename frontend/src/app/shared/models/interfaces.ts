/* ================================================================
   SmartShelfX — All TypeScript Interfaces & Enums
   ================================================================ */

export interface User {
    id: number;
    name: string;
    username: string;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'VENDOR';
    createdAt?: string;
}

export interface AuthResponse {
    token: string;
    role: string;
    name: string;
    userId: number;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegisterPayload {
    name: string;
    username: string;
    email: string;
    password: string;
    role: string;
}

export interface Product {
    id: number;
    name: string;
    sku: string;
    category: string;
    vendor_id: number | null;
    vendor?: User;
    reorder_level: number;
    current_stock: number;
    unit_price: number;
    expiry_date?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductListResponse {
    total: number;
    page: number;
    data: Product[];
}

export type TransactionType = 'IN' | 'OUT';

export interface StockTransaction {
    id: number;
    product_id: number;
    Product?: Product;
    quantity: number;
    type: TransactionType;
    timestamp: string;
    handled_by: number;
    handler?: User;
    notes?: string;
}

export interface TransactionPayload {
    product_id: number;
    quantity: number;
    type: TransactionType;
    notes?: string;
}

export type OrderStatus = 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface PurchaseOrder {
    id: number;
    product_id: number;
    Product?: Product;
    vendor_id: number | null;
    vendor?: User;
    quantity: number;
    status: OrderStatus;
    created_at: string;
    notes?: string;
}

export interface OrderPayload {
    product_id: number;
    vendor_id: number;
    quantity: number;
    notes?: string;
}

export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRY' | 'RESTOCK_SUGGESTED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Alert {
    id: number;
    product_id: number | null;
    Product?: Product;
    type: AlertType;
    message: string;
    is_read: boolean;
    created_at: string;
}

export interface AlertListResponse {
    total: number;
    unread: number;
    data: Alert[];
}

export interface ForecastResult {
    id: number;
    product_id: number;
    Product?: Product;
    forecast_date: string;
    predicted_qty: number;
    confidence: number;
    risk_level: RiskLevel;
    created_at: string;
}

export interface AnalyticsSummary {
    totalProducts: number;
    lowStockItems: number;
    outOfStockItems: number;
    pendingOrders: number;
}

export interface StockTrendItem {
    month: string;
    type: TransactionType;
    total: number;
}

export interface TopRestockedItem {
    name: string;
    sku: string;
    total_restocked: number;
}

export interface CategoryBreakdown {
    category: string;
    count: number;
    total_stock: number;
}

export interface ApiError {
    error: string;
    message?: string;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface ProductFilterParams extends PaginationParams {
    category?: string;
    vendor_id?: number;
    status?: string;
    search?: string;
}