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
    const timeframe = searchParams.get('timeframe') || 'today';
    
    // Calculate date ranges based on timeframe
    const { startDate, endDate, previousStartDate, previousEndDate } = getDateRanges(timeframe);
    
    // Fetch dashboard data concurrently
    const [
      salesData,
      inventoryData,
      customerData,
      performanceIndicators
    ] = await Promise.all([
      getSalesMetrics(startDate, endDate, previousStartDate, previousEndDate),
      getInventoryMetrics(),
      getCustomerMetrics(startDate, endDate, previousStartDate, previousEndDate),
      getPerformanceIndicators(startDate, endDate)
    ]);
    
    return NextResponse.json({
      timeframe,
      period: {
        start: startDate,
        end: endDate,
      },
      sales: salesData,
      inventory: inventoryData,
      customers: customerData,
      performance: performanceIndicators
    });
  } catch (error) {
    console.error('Error generating dashboard data:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Helper to get date ranges based on timeframe
function getDateRanges(timeframe: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate: Date;
  let endDate = new Date();
  
  switch (timeframe) {
    case 'today':
      startDate = today;
      break;
    case 'yesterday':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of week (Sunday)
      break;
    case 'last_week':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay() - 7); // Start of last week
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'last_month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_quarter':
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
      startDate = new Date(today.getFullYear(), quarterMonth, 1);
      break;
    case 'last_quarter':
      const lastQuarterMonth = Math.floor((today.getMonth() - 3) / 3) * 3;
      startDate = new Date(today.getFullYear(), lastQuarterMonth, 1);
      endDate = new Date(today.getFullYear(), lastQuarterMonth + 3, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_year':
      startDate = new Date(today.getFullYear(), 0, 1);
      break;
    case 'last_year':
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last_30_days':
    default:
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      break;
  }
  
  // Calculate previous period (for comparisons)
  const periodLength = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate);
  previousEndDate.setTime(previousEndDate.getTime() - 1); // 1ms before startDate
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setTime(previousStartDate.getTime() - periodLength);
  
  return { startDate, endDate, previousStartDate, previousEndDate };
}

// Get sales metrics
async function getSalesMetrics(
  startDate: Date, 
  endDate: Date,
  previousStartDate: Date,
  previousEndDate: Date
) {
  // Current period sales
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
    _avg: {
      totalAmount: true,
    },
  });
  
  // Previous period sales for comparison
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
  
  // Calculate growth percentages
  const totalSales = Number(salesStats._sum.totalAmount || 0);
  const previousTotalSales = Number(previousSalesStats._sum.totalAmount || 0);
  
  const salesGrowth = previousTotalSales > 0
    ? ((totalSales - previousTotalSales) / previousTotalSales) * 100
    : 0;
  
  const orderCount = salesStats._count;
  const previousOrderCount = previousSalesStats._count;
  
  const orderGrowth = previousOrderCount > 0
    ? ((orderCount - previousOrderCount) / previousOrderCount) * 100
    : 0;
  
  // Get sales by payment method
  const salesByPayment = await prisma.invoice.groupBy({
    by: ['paymentMethod'],
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
    },
    _count: true,
  });
  
  // Get hourly sales distribution (for today or recent periods)
  const hourlyDistribution = await getHourlySalesDistribution(startDate, endDate);
  
  // Get top selling products
  const topProducts = await prisma.invoiceItem.groupBy({
    by: ['productId'],
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
    _sum: {
      quantity: true,
      total: true,
    },
    orderBy: {
      _sum: {
        total: 'desc',
      },
    },
    take: 5,
  });
  
  // Get product details for top products
  const topProductDetails = await Promise.all(
    topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          name: true,
          sku: true,
          price: true,
        },
      });
      
      return {
        id: item.productId,
        name: product?.name || 'Unknown Product',
        sku: product?.sku || '',
        quantity: item._sum.quantity,
        sales: Number(item._sum.total),
      };
    })
  );
  
  return {
    totalSales,
    salesGrowth,
    orderCount,
    orderGrowth,
    averageOrderValue: Number(salesStats._avg.totalAmount || 0),
    totalTax: Number(salesStats._sum.taxAmount || 0),
    totalDiscounts: Number(salesStats._sum.discountAmount || 0),
    paymentMethods: salesByPayment.map(method => ({
      method: method.paymentMethod,
      amount: Number(method._sum.totalAmount),
      count: method._count,
      percentage: totalSales > 0 ? (Number(method._sum.totalAmount) / totalSales) * 100 : 0,
    })),
    hourlyDistribution,
    topProducts: topProductDetails,
  };
}

// Get hourly sales distribution
async function getHourlySalesDistribution(startDate: Date, endDate: Date) {
  const sales = await prisma.invoice.findMany({
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
      createdAt: true,
      totalAmount: true,
    },
  });
  
  // Initialize hours array (0-23)
  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sales: 0,
    orders: 0,
  }));
  
  // Group sales by hour
  for (const invoice of sales) {
    const hour = invoice.createdAt.getHours();
    hourlyData[hour].sales += Number(invoice.totalAmount);
    hourlyData[hour].orders += 1;
  }
  
  return hourlyData;
}

// Get inventory metrics
async function getInventoryMetrics() {
  // Get inventory status
  const products = await prisma.product.findMany({
    select: {
      stock: true,
      minStock: true,
      cost: true,
      price: true,
    },
  });
  
  let totalInventoryValue = 0;
  let totalRetailValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalProducts = products.length;
  
  for (const product of products) {
    totalInventoryValue += Number(product.cost) * product.stock;
    totalRetailValue += Number(product.price) * product.stock;
    
    if (product.stock === 0) {
      outOfStockCount++;
    } else if (product.stock <= product.minStock) {
      lowStockCount++;
    }
  }
  
  // Calculate potential profit
  const potentialProfit = totalRetailValue - totalInventoryValue;
  const profitMargin = totalInventoryValue > 0 
    ? (potentialProfit / totalRetailValue) * 100 
    : 0;
  
  // Get recent stock movements
  const recentMovements = await prisma.stockHistory.findMany({
    take: 5,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      product: {
        select: {
          name: true,
          sku: true,
        },
      },
    },
  });
  
  return {
    totalProducts,
    totalInventoryValue,
    totalRetailValue,
    potentialProfit,
    profitMargin,
    lowStockCount,
    outOfStockCount,
    stockAlertPercentage: totalProducts > 0 
      ? ((lowStockCount + outOfStockCount) / totalProducts) * 100 
      : 0,
    recentMovements: recentMovements.map(movement => ({
      id: movement.id,
      product: movement.product.name,
      sku: movement.product.sku,
      quantity: movement.quantity,
      type: movement.type,
      date: movement.createdAt,
    })),
  };
}

// Get customer metrics
async function getCustomerMetrics(
  startDate: Date, 
  endDate: Date,
  previousStartDate: Date,
  previousEndDate: Date
) {
  // Total customer count
  const totalCustomers = await prisma.customer.count();
  
  // New customers in current period
  const newCustomers = await prisma.customer.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
  // New customers in previous period
  const previousNewCustomers = await prisma.customer.count({
    where: {
      createdAt: {
        gte: previousStartDate,
        lte: previousEndDate,
      },
    },
  });
  
  // Calculate growth
  const customerGrowth = previousNewCustomers > 0
    ? ((newCustomers - previousNewCustomers) / previousNewCustomers) * 100
    : 0;
  
  // Active customers (made a purchase in period)
  const activeCustomers = await prisma.invoice.groupBy({
    by: ['customerId'],
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
  });
  
  // Active customers in previous period
  const previousActiveCustomers = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: {
      createdAt: {
        gte: previousStartDate,
        lte: previousEndDate,
      },
      status: {
        not: 'VOIDED',
      },
      customerId: {
        not: null,
      },
    },
  });
  
  // Calculate engagement growth
  const engagementGrowth = previousActiveCustomers.length > 0
    ? ((activeCustomers.length - previousActiveCustomers.length) / previousActiveCustomers.length) * 100
    : 0;
  
  // Loyalty stats
  const loyaltyStats = await prisma.customer.aggregate({
    _sum: {
      loyaltyPoints: true,
    },
    _avg: {
      loyaltyPoints: true,
    },
  });
  
  // Get top 5 customers by spending in period
  const topCustomers = await prisma.invoice.groupBy({
    by: ['customerId'],
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
    _sum: {
      totalAmount: true,
    },
    orderBy: {
      _sum: {
        totalAmount: 'desc',
      },
    },
    take: 5,
  });
  
  // Get customer details for top customers
  const topCustomerDetails = await Promise.all(
    topCustomers.map(async (customer) => {
      if (!customer.customerId) return null;
      
      const details = await prisma.customer.findUnique({
        where: { id: customer.customerId },
        select: {
          name: true,
          email: true,
          phone: true,
          loyaltyPoints: true,
        },
      });
      
      return {
        id: customer.customerId,
        name: details?.name || 'Unknown Customer',
        email: details?.email || '',
        phone: details?.phone || '',
        loyaltyPoints: details?.loyaltyPoints || 0,
        spent: Number(customer._sum.totalAmount),
      };
    })
  );
  
  // Filter out nulls
  const validTopCustomers = topCustomerDetails.filter(Boolean);
  
  return {
    totalCustomers,
    newCustomers,
    customerGrowth,
    activeCustomers: activeCustomers.length,
    engagementRate: totalCustomers > 0 ? (activeCustomers.length / totalCustomers) * 100 : 0,
    engagementGrowth,
    totalLoyaltyPoints: loyaltyStats._sum.loyaltyPoints || 0,
    averageLoyaltyPoints: Number(loyaltyStats._avg.loyaltyPoints || 0),
    topCustomers: validTopCustomers,
  };
}

// Get performance indicators
async function getPerformanceIndicators(startDate: Date, endDate: Date) {
  // Sales per employee
  const salesByEmployee = await prisma.invoice.groupBy({
    by: ['userId'],
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
    },
    _count: true,
  });
  
  // Get employee details
  const employeePerformance = await Promise.all(
    salesByEmployee.map(async (employee) => {
      const user = await prisma.user.findUnique({
        where: { id: employee.userId },
        select: {
          name: true,
          role: true,
        },
      });
      
      return {
        userId: employee.userId,
        name: user?.name || 'Unknown',
        role: user?.role || 'Unknown',
        totalSales: Number(employee._sum.totalAmount),
        transactionCount: employee._count,
        averageTransaction: employee._count > 0 
          ? Number(employee._sum.totalAmount) / employee._count 
          : 0,
      };
    })
  );
  
  // Sort by total sales
  employeePerformance.sort((a, b) => b.totalSales - a.totalSales);
  
  // Overall conversion rate (number of sales / number of unique customers)
  const totalTransactions = await prisma.invoice.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
  });
  
  const uniqueCustomers = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'VOIDED',
      },
    },
  });
  
  const conversionRate = uniqueCustomers.length > 0 
    ? (totalTransactions / uniqueCustomers.length) 
    : 0;
  
  // Returns data
  const returnsData = await prisma.returnOrder.aggregate({
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
  
  // Sales data for calculating returns rate
  const totalSales = await prisma.invoice.aggregate({
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
    },
  });
  
  const returnRate = Number(totalSales._sum.totalAmount) > 0 
    ? (Number(returnsData._sum.totalAmount || 0) / Number(totalSales._sum.totalAmount)) * 100 
    : 0;
  
  return {
    employeePerformance,
    transactionsPerCustomer: conversionRate,
    returnRate,
    totalReturns: Number(returnsData._sum.totalAmount || 0),
    returnCount: returnsData._count,
  };
}