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
    const reportType = searchParams.get('type') || 'sales';
    const format = searchParams.get('format') || 'csv';
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setDate(new Date().getDate() - 30)); // Default to last 30 days
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();
    
    let reportData: any;
    let formattedData: string;
    let fileName: string;
    
    // Get report data based on type
    switch (reportType) {
      case 'sales':
        reportData = await getSalesReportData(startDate, endDate);
        fileName = `sales_report_${formatDateForFileName(startDate)}_to_${formatDateForFileName(endDate)}`;
        break;
        
      case 'inventory':
        reportData = await getInventoryReportData();
        fileName = `inventory_report_${formatDateForFileName(new Date())}`;
        break;
        
      case 'customers':
        reportData = await getCustomersReportData(startDate, endDate);
        fileName = `customers_report_${formatDateForFileName(startDate)}_to_${formatDateForFileName(endDate)}`;
        break;
        
      case 'products':
        reportData = await getProductsReportData(startDate, endDate);
        fileName = `products_report_${formatDateForFileName(startDate)}_to_${formatDateForFileName(endDate)}`;
        break;
        
      case 'returns':
        reportData = await getReturnsReportData(startDate, endDate);
        fileName = `returns_report_${formatDateForFileName(startDate)}_to_${formatDateForFileName(endDate)}`;
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
    }
    
    // Format data based on requested format
    switch (format) {
      case 'csv':
        formattedData = convertToCSV(reportData);
        return new NextResponse(formattedData, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${fileName}.csv"`,
          },
        });
        
      case 'json':
        return NextResponse.json(reportData, {
          headers: {
            'Content-Disposition': `attachment; filename="${fileName}.json"`,
          },
        });
        
      default:
        return NextResponse.json(
          { error: 'Invalid export format' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Helper function to format date for file names
function formatDateForFileName(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Convert data to CSV format
function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) {
    return '';
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV header row
  const headerRow = headers.join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if contains commas or quotes
        const escapedValue = value.replace(/"/g, '""');
        return /[",\n]/.test(value) ? `"${escapedValue}"` : escapedValue;
      } else if (value instanceof Date) {
        return value.toISOString();
      } else if (typeof value === 'object') {
        // Convert objects to JSON string and escape
        const jsonStr = JSON.stringify(value).replace(/"/g, '""');
        return `"${jsonStr}"`;
      }
      
      return String(value);
    }).join(',');
  });
  
  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
}

// Get sales report data
async function getSalesReportData(startDate: Date, endDate: Date) {
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
    include: {
      user: {
        select: {
          name: true,
        },
      },
      customer: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  
  return invoices.map(invoice => ({
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.createdAt.toISOString(),
    customerName: invoice.customer?.name || 'Walk-in Customer',
    customerEmail: invoice.customer?.email || '',
    cashierName: invoice.user.name,
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.taxAmount),
    discount: Number(invoice.discountAmount),
    total: Number(invoice.totalAmount),
    paymentMethod: invoice.paymentMethod,
    status: invoice.status,
  }));
}

// Get inventory report data
async function getInventoryReportData() {
  const products = await prisma.product.findMany({
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      {
        category: {
          name: 'asc',
        },
      },
      {
        name: 'asc',
      },
    ],
  });
  
  return products.map(product => ({
    sku: product.sku || '',
    barcode: product.barcode || '',
    name: product.name,
    category: product.category?.name || 'Uncategorized',
    price: Number(product.price),
    cost: Number(product.cost),
    stock: product.stock,
    minStock: product.minStock,
    value: Number(product.cost) * product.stock,
    retailValue: Number(product.price) * product.stock,
    profit: (Number(product.price) - Number(product.cost)) * product.stock,
    lowStock: product.stock <= product.minStock ? 'Yes' : 'No',
  }));
}

// Get customers report data
async function getCustomersReportData(startDate: Date, endDate: Date) {
  const customers = await prisma.customer.findMany({
    include: {
      invoices: {
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            not: 'VOIDED',
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
  
  return customers.map(customer => {
    const invoiceCount = customer.invoices.length;
    const totalSpent = customer.invoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount), 
      0
    );
    
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      loyaltyPoints: customer.loyaltyPoints,
      totalPurchases: Number(customer.totalPurchases),
      invoiceCount,
      purchasesInPeriod: totalSpent,
      averagePurchase: invoiceCount > 0 ? totalSpent / invoiceCount : 0,
      registrationDate: customer.createdAt.toISOString(),
      lastPurchaseDate: invoiceCount > 0 
        ? new Date(Math.max(...customer.invoices.map(i => i.createdAt.getTime()))).toISOString() 
        : '',
    };
  });
}

// Get products report data
async function getProductsReportData(startDate: Date, endDate: Date) {
  // Get all products
  const products = await prisma.product.findMany({
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
  });
  
  // Get sales data within date range
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
    include: {
      product: true,
    },
  });
  
  // Group sales by product
  const salesByProduct: Record<string, { 
    quantity: number; 
    revenue: number; 
    averagePrice: number;
  }> = {};
  
  for (const item of invoiceItems) {
    if (!salesByProduct[item.productId]) {
      salesByProduct[item.productId] = {
        quantity: 0,
        revenue: 0,
        averagePrice: 0,
      };
    }
    
    salesByProduct[item.productId].quantity += item.quantity;
    salesByProduct[item.productId].revenue += Number(item.total);
  }
  
  // Calculate average price
  for (const productId in salesByProduct) {
    const sales = salesByProduct[productId];
    sales.averagePrice = sales.quantity > 0 ? sales.revenue / sales.quantity : 0;
  }
  
  // Combine product and sales data
  return products.map(product => {
    const sales = salesByProduct[product.id] || { quantity: 0, revenue: 0, averagePrice: 0 };
    const costOfSold = Number(product.cost) * sales.quantity;
    const profit = sales.revenue - costOfSold;
    const profitMargin = sales.revenue > 0 ? (profit / sales.revenue) * 100 : 0;
    
    return {
      sku: product.sku || '',
      barcode: product.barcode || '',
      name: product.name,
      category: product.category?.name || 'Uncategorized',
      currentPrice: Number(product.price),
      currentCost: Number(product.cost),
      currentStock: product.stock,
      quantitySold: sales.quantity,
      revenue: sales.revenue,
      costOfSold,
      profit,
      profitMargin,
      averageSellPrice: sales.averagePrice,
    };
  });
}

// Get returns report data
async function getReturnsReportData(startDate: Date, endDate: Date) {
  const returns = await prisma.returnOrder.findMany({
    where: {
      returnDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          customerId: true,
          customer: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      items: {
        include: {
          returnOrder: true,
        },
      },
    },
    orderBy: {
      returnDate: 'desc',
    },
  });
  
  // Flatten return items for CSV export
  const returnItems: any[] = [];
  
  for (const returnOrder of returns) {
    for (const item of returnOrder.items) {
      returnItems.push({
        returnId: returnOrder.id,
        returnDate: returnOrder.returnDate.toISOString(),
        invoiceNumber: returnOrder.invoice.invoiceNumber,
        customerName: returnOrder.invoice.customer?.name || 'Walk-in Customer',
        customerEmail: returnOrder.invoice.customer?.email || '',
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        reason: item.reason || returnOrder.reason || '',
        status: returnOrder.status,
      });
    }
  }
  
  return returnItems;
} 