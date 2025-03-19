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
    const type = searchParams.get('type') || 'sales';
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setDate(new Date().getDate() - 30)); // Default to last 30 days
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();
    
    let result;
    
    // Time period for grouping
    const period = searchParams.get('period') || 'day';
    
    switch (type) {
      case 'sales':
        // Sales by time period
        result = await getSalesByTimePeriod(period, startDate, endDate);
        break;
        
      case 'products':
        // Top selling products
        result = await getTopSellingProducts(startDate, endDate);
        break;
        
      case 'customers':
        // Top customers
        result = await getTopCustomers(startDate, endDate);
        break;
        
      case 'categories':
        // Sales by category
        result = await getSalesByCategory(startDate, endDate);
        break;
        
      case 'payments':
        // Sales by payment method
        result = await getSalesByPaymentMethod(startDate, endDate);
        break;
        
      case 'overview':
      default:
        // General overview
        result = await getOverview(startDate, endDate);
        break;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Helper to format date based on period
function formatDateByPeriod(date: Date, period: string): string {
  switch (period) {
    case 'month':
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    case 'year':
      return `${date.getFullYear()}`;
    case 'week':
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      return `${startOfWeek.getFullYear()}-${(startOfWeek.getMonth() + 1).toString().padStart(2, '0')}-${startOfWeek.getDate().toString().padStart(2, '0')}`;
    case 'day':
    default:
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  }
}

// Get sales by time period
async function getSalesByTimePeriod(period: string, startDate: Date, endDate: Date) {
  const invoices = await prisma.invoice.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
    select: {
      totalAmount: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
  
  // Group by the selected period
  const salesByPeriod: Record<string, { total: number, count: number }> = {};
  
  for (const invoice of invoices) {
    const periodKey = formatDateByPeriod(invoice.createdAt, period);
    
    if (!salesByPeriod[periodKey]) {
      salesByPeriod[periodKey] = { total: 0, count: 0 };
    }
    
    salesByPeriod[periodKey].total += Number(invoice.totalAmount);
    salesByPeriod[periodKey].count += 1;
  }
  
  // Convert to array for easier consumption by charts
  const result = Object.entries(salesByPeriod).map(([period, data]) => ({
    period,
    total: data.total,
    count: data.count,
    average: data.total / data.count,
  }));
  
  return {
    type: 'sales_by_time',
    period,
    data: result,
    summary: {
      totalSales: result.reduce((sum, item) => sum + item.total, 0),
      totalInvoices: result.reduce((sum, item) => sum + item.count, 0),
      averageSale: result.reduce((sum, item) => sum + item.total, 0) / result.reduce((sum, item) => sum + item.count, 0) || 0,
    },
  };
}

// Get top selling products
async function getTopSellingProducts(startDate: Date, endDate: Date) {
  const productSales = await prisma.invoiceItem.findMany({
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
      product: {
        select: {
          name: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      },
      quantity: true,
      total: true,
    },
  });
  
  // Group by product
  const productMap: Record<string, { 
    name: string, 
    category: string | null,
    totalQuantity: number, 
    totalSales: number 
  }> = {};
  
  for (const item of productSales) {
    if (!productMap[item.productId]) {
      productMap[item.productId] = {
        name: item.product.name,
        category: item.product.category?.name || null,
        totalQuantity: 0,
        totalSales: 0,
      };
    }
    
    productMap[item.productId].totalQuantity += item.quantity;
    productMap[item.productId].totalSales += Number(item.total);
  }
  
  // Convert to array and sort by sales
  const result = Object.entries(productMap)
    .map(([id, data]) => ({
      id,
      name: data.name,
      category: data.category,
      totalQuantity: data.totalQuantity,
      totalSales: data.totalSales,
      averagePrice: data.totalSales / data.totalQuantity,
    }))
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 10); // Top 10
  
  return {
    type: 'top_products',
    data: result,
    summary: {
      totalProducts: result.length,
      totalQuantitySold: result.reduce((sum, item) => sum + item.totalQuantity, 0),
      totalSales: result.reduce((sum, item) => sum + item.totalSales, 0),
    },
  };
}

// Get top customers
async function getTopCustomers(startDate: Date, endDate: Date) {
  const customerPurchases = await prisma.invoice.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
      customerId: {
        not: null,
      },
    },
    select: {
      customerId: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
          loyaltyPoints: true,
        },
      },
      totalAmount: true,
    },
  });
  
  // Group by customer
  const customerMap: Record<string, { 
    name: string, 
    email: string | null,
    phone: string | null,
    loyaltyPoints: number,
    totalPurchases: number, 
    invoiceCount: number 
  }> = {};
  
  for (const invoice of customerPurchases) {
    if (invoice.customerId && invoice.customer) {
      if (!customerMap[invoice.customerId]) {
        customerMap[invoice.customerId] = {
          name: invoice.customer.name,
          email: invoice.customer.email,
          phone: invoice.customer.phone,
          loyaltyPoints: invoice.customer.loyaltyPoints,
          totalPurchases: 0,
          invoiceCount: 0,
        };
      }
      
      customerMap[invoice.customerId].totalPurchases += Number(invoice.totalAmount);
      customerMap[invoice.customerId].invoiceCount += 1;
    }
  }
  
  // Convert to array and sort by total purchases
  const result = Object.entries(customerMap)
    .map(([id, data]) => ({
      id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      loyaltyPoints: data.loyaltyPoints,
      totalPurchases: data.totalPurchases,
      invoiceCount: data.invoiceCount,
      averagePurchase: data.totalPurchases / data.invoiceCount,
    }))
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, 10); // Top 10
  
  return {
    type: 'top_customers',
    data: result,
    summary: {
      totalCustomers: result.length,
      totalRevenue: result.reduce((sum, item) => sum + item.totalPurchases, 0),
      totalInvoices: result.reduce((sum, item) => sum + item.invoiceCount, 0),
    },
  };
}

// Get sales by category
async function getSalesByCategory(startDate: Date, endDate: Date) {
  const categorySales = await prisma.invoiceItem.findMany({
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
      total: true,
      product: {
        select: {
          categoryId: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  
  // Group by category
  const categoryMap: Record<string, { 
    name: string, 
    total: number 
  }> = {
    'uncategorized': { name: 'Uncategorized', total: 0 }
  };
  
  for (const item of categorySales) {
    const categoryId = item.product.categoryId || 'uncategorized';
    const categoryName = item.product.category?.name || 'Uncategorized';
    
    if (!categoryMap[categoryId]) {
      categoryMap[categoryId] = {
        name: categoryName,
        total: 0,
      };
    }
    
    categoryMap[categoryId].total += Number(item.total);
  }
  
  // Convert to array and sort by total sales
  const result = Object.entries(categoryMap)
    .map(([id, data]) => ({
      id,
      name: data.name,
      total: data.total,
    }))
    .sort((a, b) => b.total - a.total);
  
  const totalSales = result.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate percentages
  const resultWithPercentage = result.map(item => ({
    ...item,
    percentage: totalSales > 0 ? (item.total / totalSales) * 100 : 0,
  }));
  
  return {
    type: 'sales_by_category',
    data: resultWithPercentage,
    summary: {
      totalCategories: result.length,
      totalSales,
    },
  };
}

// Get sales by payment method
async function getSalesByPaymentMethod(startDate: Date, endDate: Date) {
  const paymentMethodSales = await prisma.invoice.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
    select: {
      paymentMethod: true,
      totalAmount: true,
    },
  });
  
  // Group by payment method
  const paymentMethodMap: Record<string, { 
    total: number,
    count: number
  }> = {};
  
  for (const invoice of paymentMethodSales) {
    if (!paymentMethodMap[invoice.paymentMethod]) {
      paymentMethodMap[invoice.paymentMethod] = {
        total: 0,
        count: 0,
      };
    }
    
    paymentMethodMap[invoice.paymentMethod].total += Number(invoice.totalAmount);
    paymentMethodMap[invoice.paymentMethod].count += 1;
  }
  
  // Convert to array and sort by total sales
  const result = Object.entries(paymentMethodMap)
    .map(([method, data]) => ({
      method,
      total: data.total,
      count: data.count,
      average: data.total / data.count,
    }))
    .sort((a, b) => b.total - a.total);
  
  const totalSales = result.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate percentages
  const resultWithPercentage = result.map(item => ({
    ...item,
    percentage: totalSales > 0 ? (item.total / totalSales) * 100 : 0,
  }));
  
  return {
    type: 'sales_by_payment_method',
    data: resultWithPercentage,
    summary: {
      totalMethods: result.length,
      totalSales,
      totalTransactions: result.reduce((sum, item) => sum + item.count, 0),
    },
  };
}

// Get general overview
async function getOverview(startDate: Date, endDate: Date) {
  // Total sales
  const salesStats = await prisma.invoice.aggregate({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
    _sum: {
      totalAmount: true,
      taxAmount: true,
      discountAmount: true,
    },
    _count: true,
  });
  
  // Previous period for comparison
  const dateRange = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setTime(previousStartDate.getTime() - dateRange);
  
  const previousSalesStats = await prisma.invoice.aggregate({
    where: {
      createdAt: {
        gte: previousStartDate,
        lte: previousEndDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
    _sum: {
      totalAmount: true,
    },
    _count: true,
  });
  
  // New customers
  const newCustomers = await prisma.customer.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
  // Return counts
  const returnStats = await prisma.returnOrder.aggregate({
    where: {
      returnDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: {
      totalAmount: true,
    },
    _count: true,
  });
  
  // Top products (just a few for the overview)
  const topProducts = await getTopSellingProducts(startDate, endDate);
  
  // Low stock items
  const lowStockItems = await prisma.product.count({
    where: {
      stock: {
        lte: prisma.product.fields.minStock,
      },
    },
  });
  
  // Sales growth percentage
  const previousTotal = previousSalesStats._sum.totalAmount || 0;
  const currentTotal = salesStats._sum.totalAmount || 0;
  const salesGrowth = Number(previousTotal) > 0 
    ? ((Number(currentTotal) - Number(previousTotal)) / Number(previousTotal)) * 100 
    : 0;
  
  return {
    type: 'overview',
    period: {
      start: startDate,
      end: endDate,
    },
    salesStats: {
      totalSales: Number(salesStats._sum.totalAmount || 0),
      invoiceCount: salesStats._count,
      averageSale: salesStats._count > 0 ? Number(salesStats._sum.totalAmount || 0) / salesStats._count : 0,
      totalTax: Number(salesStats._sum.taxAmount || 0),
      totalDiscounts: Number(salesStats._sum.discountAmount || 0),
      salesGrowth,
    },
    customerStats: {
      newCustomers,
    },
    returnStats: {
      returnCount: returnStats._count,
      totalReturned: Number(returnStats._sum.totalAmount || 0),
    },
    inventoryStats: {
      lowStockItems,
    },
    // Include just the first 5 top products for the overview
    topProducts: topProducts.data.slice(0, 5),
  };
} 