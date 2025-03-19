import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isManager } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check - only managers and above can access reports
    if (!session || !isManager(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'overview';
    const categoryId = searchParams.get('categoryId');
    const lowStockOnly = searchParams.get('lowStockOnly') === 'true';
    const outOfStockOnly = searchParams.get('outOfStockOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100');
    
    let result;
    
    switch (type) {
      case 'stock-status':
        // Stock status report
        result = await getStockStatusReport(categoryId, lowStockOnly, outOfStockOnly, limit);
        break;
        
      case 'movement':
        // Stock movement report
        const startDate = searchParams.get('startDate') 
          ? new Date(searchParams.get('startDate')!) 
          : new Date(new Date().setDate(new Date().getDate() - 30)); // Default to last 30 days
        const endDate = searchParams.get('endDate') 
          ? new Date(searchParams.get('endDate')!) 
          : new Date();
        const productId = searchParams.get('productId');
        
        result = await getStockMovementReport(startDate, endDate, productId, limit);
        break;
        
      case 'valuation':
        // Inventory valuation report
        result = await getInventoryValuationReport(categoryId);
        break;
        
      case 'turnover':
        // Inventory turnover report
        const turnoverStartDate = searchParams.get('startDate') 
          ? new Date(searchParams.get('startDate')!) 
          : new Date(new Date().setDate(new Date().getDate() - 90)); // Default to last 90 days
        const turnoverEndDate = searchParams.get('endDate') 
          ? new Date(searchParams.get('endDate')!) 
          : new Date();
          
        result = await getInventoryTurnoverReport(turnoverStartDate, turnoverEndDate, categoryId);
        break;
        
      case 'overview':
      default:
        // General inventory overview
        result = await getInventoryOverview();
        break;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating inventory report:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Get inventory overview
async function getInventoryOverview() {
  // Get total product count
  const totalProducts = await prisma.product.count();
  
  // Get category counts
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          products: true,
        }
      }
    }
  });
  
  // Get total stock value
  const products = await prisma.product.findMany({
    select: {
      stock: true,
      cost: true,
      price: true,
    }
  });
  
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  
  for (const product of products) {
    totalCostValue += Number(product.cost) * product.stock;
    totalRetailValue += Number(product.price) * product.stock;
    
    if (product.stock === 0) {
      outOfStockCount += 1;
    } else if (product.stock <= 5) { // Using a fixed threshold for low stock for overview
      lowStockCount += 1;
    }
  }
  
  // Recent stock movements
  const recentMovements = await prisma.stockHistory.findMany({
    take: 5,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      product: {
        select: {
          name: true,
          sku: true,
        }
      }
    }
  });
  
  return {
    type: 'inventory_overview',
    summary: {
      totalProducts,
      totalCategories: categories.length,
      totalCostValue,
      totalRetailValue,
      potentialProfit: totalRetailValue - totalCostValue,
      profitMargin: totalCostValue > 0 ? ((totalRetailValue - totalCostValue) / totalRetailValue) * 100 : 0,
      outOfStockCount,
      lowStockCount,
    },
    categoryBreakdown: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      productCount: cat._count.products,
    })),
    recentMovements: recentMovements.map(movement => ({
      id: movement.id,
      productId: movement.productId,
      productName: movement.product.name,
      productSku: movement.product.sku,
      quantity: movement.quantity,
      type: movement.type,
      date: movement.createdAt,
    })),
  };
}

// Get stock status report
async function getStockStatusReport(
  categoryId: string | null,
  lowStockOnly: boolean,
  outOfStockOnly: boolean,
  limit: number
) {
  // Build filter conditions
  const where: any = {};
  
  if (categoryId) {
    where.categoryId = categoryId;
  }
  
  if (outOfStockOnly) {
    where.stock = 0;
  } else if (lowStockOnly) {
    where.stock = {
      lte: prisma.product.fields.minStock,
      gt: 0, // Ensure not out of stock
    };
  }
  
  // Get products with their stock status
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      stock: true,
      minStock: true,
      price: true,
      cost: true,
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{
      stock: 'asc',
    }, {
      name: 'asc',
    }],
    take: limit,
  });
  
  // Process and categorize products
  const productList = products.map(product => {
    const stockStatus = 
      product.stock === 0 ? 'out_of_stock' :
      product.stock <= product.minStock ? 'low_stock' : 'in_stock';
    
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category?.name || 'Uncategorized',
      stock: product.stock,
      minStock: product.minStock,
      stockValue: Number(product.cost) * product.stock,
      retailValue: Number(product.price) * product.stock,
      stockStatus,
    };
  });
  
  // Count totals
  const outOfStockCount = productList.filter(p => p.stockStatus === 'out_of_stock').length;
  const lowStockCount = productList.filter(p => p.stockStatus === 'low_stock').length;
  const inStockCount = productList.filter(p => p.stockStatus === 'in_stock').length;
  
  // Calculate total values
  const totalStockValue = productList.reduce((sum, product) => sum + product.stockValue, 0);
  const totalRetailValue = productList.reduce((sum, product) => sum + product.retailValue, 0);
  
  return {
    type: 'stock_status',
    data: productList,
    summary: {
      totalProducts: productList.length,
      outOfStockCount,
      lowStockCount,
      inStockCount,
      totalStockValue,
      totalRetailValue,
    },
  };
}

// Get stock movement report
async function getStockMovementReport(
  startDate: Date,
  endDate: Date,
  productId: string | null,
  limit: number
) {
  // Build filter conditions
  const where: any = {
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
  };
  
  if (productId) {
    where.productId = productId;
  }
  
  // Get stock movements
  const movements = await prisma.stockHistory.findMany({
    where,
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          barcode: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
  
  // Process movements
  const movementList = movements.map(movement => ({
    id: movement.id,
    date: movement.createdAt,
    productId: movement.productId,
    productName: movement.product.name,
    productSku: movement.product.sku,
    categoryName: movement.product.category?.name || 'Uncategorized',
    quantity: movement.quantity,
    type: movement.type,
    note: movement.note,
    invoiceId: movement.invoiceId,
  }));
  
  // Group by movement type
  const typeGroups = movementList.reduce((acc, movement) => {
    const type = movement.type;
    if (!acc[type]) {
      acc[type] = {
        count: 0,
        totalQuantity: 0,
      };
    }
    
    acc[type].count += 1;
    acc[type].totalQuantity += movement.quantity;
    
    return acc;
  }, {} as Record<string, { count: number; totalQuantity: number }>);
  
  // Calculate daily movement
  const dailyMovements: Record<string, { inflow: number; outflow: number }> = {};
  
  for (const movement of movementList) {
    const dateStr = movement.date.toISOString().split('T')[0];
    
    if (!dailyMovements[dateStr]) {
      dailyMovements[dateStr] = { inflow: 0, outflow: 0 };
    }
    
    if (['purchase', 'return', 'adjustment'].includes(movement.type)) {
      dailyMovements[dateStr].inflow += movement.quantity;
    } else if (['sale'].includes(movement.type)) {
      dailyMovements[dateStr].outflow += movement.quantity;
    }
  }
  
  // Convert to array
  const dailyMovementData = Object.entries(dailyMovements).map(([date, data]) => ({
    date,
    inflow: data.inflow,
    outflow: data.outflow,
    net: data.inflow - data.outflow,
  })).sort((a, b) => a.date.localeCompare(b.date));
  
  return {
    type: 'stock_movement',
    period: {
      start: startDate,
      end: endDate,
    },
    data: movementList,
    summary: {
      totalMovements: movementList.length,
      byType: Object.entries(typeGroups).map(([type, data]) => ({
        type,
        count: data.count,
        totalQuantity: data.totalQuantity,
      })),
    },
    dailyMovements: dailyMovementData,
  };
}

// Get inventory valuation report
async function getInventoryValuationReport(categoryId: string | null) {
  // Build filter conditions
  const where: any = {};
  
  if (categoryId) {
    where.categoryId = categoryId;
  }
  
  // Get products with their valuation
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      cost: true,
      price: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  
  // Process products
  const productValuations = products.map(product => {
    const costValue = Number(product.cost) * product.stock;
    const retailValue = Number(product.price) * product.stock;
    const potentialProfit = retailValue - costValue;
    const marginPercentage = costValue > 0 ? (potentialProfit / retailValue) * 100 : 0;
    
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.category?.id || null,
      categoryName: product.category?.name || 'Uncategorized',
      stock: product.stock,
      costPerUnit: Number(product.cost),
      retailPerUnit: Number(product.price),
      costValue,
      retailValue,
      potentialProfit,
      marginPercentage,
    };
  });
  
  // Group by category
  const categoryValuations: Record<string, {
    id: string | null;
    name: string;
    productCount: number;
    totalStock: number;
    costValue: number;
    retailValue: number;
    potentialProfit: number;
  }> = {};
  
  for (const product of productValuations) {
    const categoryId = product.categoryId || 'uncategorized';
    const categoryName = product.categoryName;
    
    if (!categoryValuations[categoryId]) {
      categoryValuations[categoryId] = {
        id: product.categoryId,
        name: categoryName,
        productCount: 0,
        totalStock: 0,
        costValue: 0,
        retailValue: 0,
        potentialProfit: 0,
      };
    }
    
    categoryValuations[categoryId].productCount += 1;
    categoryValuations[categoryId].totalStock += product.stock;
    categoryValuations[categoryId].costValue += product.costValue;
    categoryValuations[categoryId].retailValue += product.retailValue;
    categoryValuations[categoryId].potentialProfit += product.potentialProfit;
  }
  
  // Convert to array
  const categoryValuationList = Object.values(categoryValuations).map(category => ({
    ...category,
    marginPercentage: category.retailValue > 0 
      ? (category.potentialProfit / category.retailValue) * 100 
      : 0,
  })).sort((a, b) => b.retailValue - a.retailValue);
  
  // Calculate totals
  const totalCostValue = productValuations.reduce((sum, product) => sum + product.costValue, 0);
  const totalRetailValue = productValuations.reduce((sum, product) => sum + product.retailValue, 0);
  const totalPotentialProfit = productValuations.reduce((sum, product) => sum + product.potentialProfit, 0);
  
  return {
    type: 'inventory_valuation',
    data: {
      products: productValuations.sort((a, b) => b.retailValue - a.retailValue),
      categories: categoryValuationList,
    },
    summary: {
      totalProducts: productValuations.length,
      totalCategories: categoryValuationList.length,
      totalCostValue,
      totalRetailValue,
      totalPotentialProfit,
      overallMarginPercentage: totalRetailValue > 0 
        ? (totalPotentialProfit / totalRetailValue) * 100 
        : 0,
    },
  };
}

// Get inventory turnover report
async function getInventoryTurnoverReport(
  startDate: Date,
  endDate: Date,
  categoryId: string | null
) {
  // Build filter conditions for products
  const whereProduct: any = {};
  if (categoryId) {
    whereProduct.categoryId = categoryId;
  }
  
  // Get all products
  const products = await prisma.product.findMany({
    where: whereProduct,
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      cost: true,
      category: {
        select: {
          name: true,
        },
      },
    },
  });
  
  // Get sold quantities within date range
  const invoiceItems = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: 'VOIDED',
        },
      },
    },
    select: {
      productId: true,
      quantity: true,
    },
  });
  
  // Group sales by product
  const salesByProduct: Record<string, number> = {};
  
  for (const item of invoiceItems) {
    if (!salesByProduct[item.productId]) {
      salesByProduct[item.productId] = 0;
    }
    
    salesByProduct[item.productId] += item.quantity;
  }
  
  // Calculate turnover metrics
  const turnoverData = products.map(product => {
    const soldQuantity = salesByProduct[product.id] || 0;
    const currentStock = product.stock;
    
    // Average inventory calculation (simplified)
    // For a more accurate calculation, you'd need historical stock data
    const averageInventory = currentStock / 2; // Simple approximation
    
    // Turnover ratio = Sold quantity / Average inventory
    const turnoverRatio = averageInventory > 0 ? soldQuantity / averageInventory : 0;
    
    // Days on hand = Days in period / Turnover ratio
    const daysInPeriod = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysOnHand = turnoverRatio > 0 ? daysInPeriod / turnoverRatio : daysInPeriod;
    
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category?.name || 'Uncategorized',
      currentStock,
      soldQuantity,
      inventoryCost: Number(product.cost) * currentStock,
      turnoverRatio,
      daysOnHand: Math.round(daysOnHand),
      isActive: soldQuantity > 0,
    };
  });
  
  // Sort by turnover ratio (highest first)
  turnoverData.sort((a, b) => b.turnoverRatio - a.turnoverRatio);
  
  // Calculate average turnover and group by category
  const activeTurnoverItems = turnoverData.filter(item => item.isActive);
  const avgTurnoverRatio = activeTurnoverItems.length > 0 
    ? activeTurnoverItems.reduce((sum, item) => sum + item.turnoverRatio, 0) / activeTurnoverItems.length 
    : 0;
  
  // Group by category
  const categoryTurnover: Record<string, {
    name: string;
    productCount: number;
    activeProductCount: number;
    avgTurnoverRatio: number;
    totalSoldQuantity: number;
  }> = {};
  
  for (const product of turnoverData) {
    const categoryName = product.category;
    
    if (!categoryTurnover[categoryName]) {
      categoryTurnover[categoryName] = {
        name: categoryName,
        productCount: 0,
        activeProductCount: 0,
        avgTurnoverRatio: 0,
        totalSoldQuantity: 0,
      };
    }
    
    categoryTurnover[categoryName].productCount += 1;
    categoryTurnover[categoryName].totalSoldQuantity += product.soldQuantity;
    
    if (product.isActive) {
      categoryTurnover[categoryName].activeProductCount += 1;
      categoryTurnover[categoryName].avgTurnoverRatio += product.turnoverRatio;
    }
  }
  
  // Calculate average turnover ratio per category
  Object.values(categoryTurnover).forEach(category => {
    if (category.activeProductCount > 0) {
      category.avgTurnoverRatio = category.avgTurnoverRatio / category.activeProductCount;
    }
  });
  
  // Convert to array and sort
  const categoryTurnoverList = Object.values(categoryTurnover)
    .sort((a, b) => b.avgTurnoverRatio - a.avgTurnoverRatio);
  
  return {
    type: 'inventory_turnover',
    period: {
      start: startDate,
      end: endDate,
      days: Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    },
    data: turnoverData,
    summary: {
      totalProducts: turnoverData.length,
      activeProducts: activeTurnoverItems.length,
      inactiveProducts: turnoverData.length - activeTurnoverItems.length,
      avgTurnoverRatio,
      categories: categoryTurnoverList,
    },
  };
} 