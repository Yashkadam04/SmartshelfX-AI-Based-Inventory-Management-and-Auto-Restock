const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    username: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('ADMIN', 'MANAGER', 'VENDOR'),
        allowNull: false,
        defaultValue: 'MANAGER'
    }
}, {
    tableName: 'users',
    timestamps: true
});

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    sku: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    category: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    vendor_id: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    reorder_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10
    },
    current_stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    }
}, {
    tableName: 'products',
    timestamps: true
});

const StockTransaction = sequelize.define('StockTransaction', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    product_id: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('IN', 'OUT'),
        allowNull: false
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    handled_by: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'stock_transactions',
    timestamps: false
});

const PurchaseOrder = sequelize.define('PurchaseOrder', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    product_id: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    vendor_id: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'purchase_orders',
    timestamps: false
});

const Alert = sequelize.define('Alert', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    product_id: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    vendor_id: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    type: {
        type: DataTypes.ENUM('LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRY', 'RESTOCK_SUGGESTED'),
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'alerts',
    timestamps: false   // created_at managed manually above
});

const ForecastResult = sequelize.define('ForecastResult', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    product_id: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    forecast_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    predicted_qty: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    risk_level: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        allowNull: false,
        defaultValue: 'LOW'
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'forecast_results',
    timestamps: false
});

Product.belongsTo(User, { foreignKey: 'vendor_id', as: 'vendor' });
User.hasMany(Product, { foreignKey: 'vendor_id', as: 'products' });

StockTransaction.belongsTo(Product, { foreignKey: 'product_id', as: 'Product' });
Product.hasMany(StockTransaction, { foreignKey: 'product_id', as: 'transactions' });

StockTransaction.belongsTo(User, { foreignKey: 'handled_by', as: 'handler' });
User.hasMany(StockTransaction, { foreignKey: 'handled_by', as: 'transactions' });

PurchaseOrder.belongsTo(Product, { foreignKey: 'product_id', as: 'Product' });
Product.hasMany(PurchaseOrder, { foreignKey: 'product_id', as: 'orders' });

PurchaseOrder.belongsTo(User, { foreignKey: 'vendor_id', as: 'vendor' });
User.hasMany(PurchaseOrder, { foreignKey: 'vendor_id', as: 'orders' });

Alert.belongsTo(Product, { foreignKey: 'product_id', as: 'Product' });
Product.hasMany(Alert, { foreignKey: 'product_id', as: 'alerts' });
Alert.belongsTo(User, { foreignKey: 'vendor_id', as: 'Vendor' });
User.hasMany(Alert, { foreignKey: 'vendor_id', as: 'vendorAlerts' });

ForecastResult.belongsTo(Product, { foreignKey: 'product_id', as: 'Product' });
Product.hasMany(ForecastResult, { foreignKey: 'product_id', as: 'forecasts' });

module.exports = {
    sequelize,
    User,
    Product,
    StockTransaction,
    PurchaseOrder,
    Alert,
    ForecastResult
};
