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
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setDate(new Date().getDate() - 90)); // Default to last 90 days
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();
    
    let result;
    
    switch (type) {
      case 'loyalty':
        // Loyalty program analysis
        result = await getLoyaltyAnalysis();
        break;
        
      case 'purchase-frequency':
        // Purchase frequency analysis
        result = await getPurchaseFrequencyAnalysis(startDate, endDate);
        break;
        
      case 'retention':
        // Customer retention analysis
        result = await getRetentionAnalysis(startDate, endDate);
        break;
        
      case 'spending-tiers':
        // Customer spending tiers
        result = await getSpendingTiersAnalysis(startDate, endDate);
        break;
        
      case 'overview':
      default:
        // General customer overview
        result = await getCustomerOverview(startDate, endDate);
        break;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating customer report:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Get customer overview
async function getCustomerOverview(startDate: Date, endDate: Date) {
  // Total customer count
  const totalCustomers = await prisma.customer.count();
  
  // New customers in period
  const newCustomers = await prisma.customer.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
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
  
  // Customers with loyalty points
  const loyalCustomers = await prisma.customer.count({
    where: {
      loyaltyPoints: {
        gt: 0,
      },
    },
  });
  
  // Top customers in period
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
    take: 10,
  });
  
  // Get customer details for top customers
  const topCustomerDetails = await Promise.all(
    topCustomers.map(async (customer) => {
      if (!customer.customerId) return null;
      
      const details = await prisma.customer.findUnique({
        where: { id: customer.customerId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          loyaltyPoints: true,
        },
      });
      
      const invoiceCount = await prisma.invoice.count({
        where: {
          customerId: customer.customerId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            not: 'VOIDED',
          },
        },
      });
      
      return {
        ...details,
        totalSpent: Number(customer._sum.totalAmount),
        invoiceCount,
        averageSpent: Number(customer._sum.totalAmount) / invoiceCount,
      };
    })
  );
  
  // Filter out null values
  const validTopCustomers = topCustomerDetails.filter(Boolean);
  
  // Customer growth over time (monthly)
  const customerGrowth = await getCustomerGrowthByMonth(startDate, endDate);
  
  return {
    type: 'customer_overview',
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalCustomers,
      newCustomers,
      activeCustomers: activeCustomers.length,
      inactiveCustomers: totalCustomers - activeCustomers.length,
      loyalCustomers,
      loyaltyRate: totalCustomers > 0 ? (loyalCustomers / totalCustomers) * 100 : 0,
      activationRate: totalCustomers > 0 ? (activeCustomers.length / totalCustomers) * 100 : 0,
    },
    topCustomers: validTopCustomers,
    customerGrowth,
  };
}

// Get loyalty program analysis
async function getLoyaltyAnalysis() {
  // Get all customers with loyalty data
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      loyaltyPoints: true,
      totalPurchases: true,
      loyaltyHistory: {
        select: {
          points: true,
          description: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      invoices: {
        where: {
          status: {
            not: 'VOIDED',
          },
        },
        select: {
          createdAt: true,
          totalAmount: true,
        },
      },
    },
  });
  
  // Process loyalty data
  const loyaltyData = customers.map(customer => {
    const totalInvoices = customer.invoices.length;
    
    // Calculate points per dollar spent
    const pointsPerDollar = Number(customer.totalPurchases) > 0 
      ? customer.loyaltyPoints / Number(customer.totalPurchases) 
      : 0;
    
    // Check if points have been redeemed
    const hasRedeemed = customer.loyaltyHistory.some(h => h.points < 0 && h.description.includes('Redeemed'));
    
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      loyaltyPoints: customer.loyaltyPoints,
      totalPurchases: Number(customer.totalPurchases),
      totalInvoices,
      averagePurchase: totalInvoices > 0 ? Number(customer.totalPurchases) / totalInvoices : 0,
      pointsPerDollar,
      hasRedeemed,
    };
  });
  
  // Group customers by loyalty tier
  const loyaltyTiers = [
    { name: 'No Points', range: [0, 0], count: 0 },
    { name: 'Bronze', range: [1, 100], count: 0 },
    { name: 'Silver', range: [101, 500], count: 0 },
    { name: 'Gold', range: [501, 1000], count: 0 },
    { name: 'Platinum', range: [1001, Infinity], count: 0 },
  ];
  
  for (const customer of loyaltyData) {
    for (const tier of loyaltyTiers) {
      if (customer.loyaltyPoints >= tier.range[0] && customer.loyaltyPoints <= tier.range[1]) {
        tier.count += 1;
        break;
      }
    }
  }
  
  // Calculate overall statistics
  const totalLoyaltyPoints = loyaltyData.reduce((sum, customer) => sum + customer.loyaltyPoints, 0);
  const customersWithPoints = loyaltyData.filter(c => c.loyaltyPoints > 0);
  const avgPointsPerCustomer = customersWithPoints.length > 0 
    ? totalLoyaltyPoints / customersWithPoints.length 
    : 0;
  
  // Recent loyalty activities
  const recentActivities = await prisma.loyaltyHistory.findMany({
    take: 10,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      customer: {
        select: {
          name: true,
        },
      },
    },
  });
  
  return {
    type: 'loyalty_analysis',
    summary: {
      totalCustomers: loyaltyData.length,
      customersWithPoints: customersWithPoints.length,
      totalLoyaltyPoints,
      avgPointsPerCustomer,
      pointsUtilizationRate: loyaltyData.filter(c => c.hasRedeemed).length / customersWithPoints.length,
    },
    loyaltyTiers,
    topLoyaltyCustomers: loyaltyData
      .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints)
      .slice(0, 10),
    recentActivities: recentActivities.map(activity => ({
      customerName: activity.customer.name,
      points: activity.points,
      description: activity.description,
      date: activity.createdAt,
    })),
  };
}

// Get purchase frequency analysis
async function getPurchaseFrequencyAnalysis(startDate: Date, endDate: Date) {
  // Get all customers with their invoices in the period
  const customers = await prisma.customer.findMany({
    where: {
      invoices: {
        some: {
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
    select: {
      id: true,
      name: true,
      createdAt: true,
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
        select: {
          id: true,
          createdAt: true,
          totalAmount: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });
  
  // Calculate frequency data
  const frequencyData = customers.map(customer => {
    const invoices = customer.invoices;
    const invoiceCount = invoices.length;
    
    // Skip if less than 2 invoices
    if (invoiceCount < 2) {
      return {
        id: customer.id,
        name: customer.name,
        invoiceCount,
        totalSpent: invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0),
        avgPurchaseValue: invoiceCount > 0 
          ? invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0) / invoiceCount 
          : 0,
        daysBetweenPurchases: 0,
        isRepeatCustomer: false,
      };
    }
    
    // Calculate average days between purchases
    let totalDays = 0;
    for (let i = 1; i < invoices.length; i++) {
      const daysDiff = Math.round(
        (invoices[i].createdAt.getTime() - invoices[i - 1].createdAt.getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      totalDays += daysDiff;
    }
    
    const avgDaysBetween = totalDays / (invoiceCount - 1);
    
    return {
      id: customer.id,
      name: customer.name,
      invoiceCount,
      totalSpent: invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0),
      avgPurchaseValue: invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0) / invoiceCount,
      daysBetweenPurchases: avgDaysBetween,
      isRepeatCustomer: true,
    };
  });
  
  // Group by frequency
  const frequencyGroups = [
    { name: 'One-time', count: 0, totalSpent: 0 },
    { name: 'Occasional (15+ days)', count: 0, totalSpent: 0 },
    { name: 'Regular (7-14 days)', count: 0, totalSpent: 0 },
    { name: 'Frequent (< 7 days)', count: 0, totalSpent: 0 },
  ];
  
  for (const customer of frequencyData) {
    if (!customer.isRepeatCustomer) {
      frequencyGroups[0].count += 1;
      frequencyGroups[0].totalSpent += customer.totalSpent;
    } else if (customer.daysBetweenPurchases >= 15) {
      frequencyGroups[1].count += 1;
      frequencyGroups[1].totalSpent += customer.totalSpent;
    } else if (customer.daysBetweenPurchases >= 7) {
      frequencyGroups[2].count += 1;
      frequencyGroups[2].totalSpent += customer.totalSpent;
    } else {
      frequencyGroups[3].count += 1;
      frequencyGroups[3].totalSpent += customer.totalSpent;
    }
  }
  
  // Calculate repeat purchase rate
  const repeatCustomers = frequencyData.filter(c => c.isRepeatCustomer);
  const repeatRate = frequencyData.length > 0 
    ? (repeatCustomers.length / frequencyData.length) * 100 
    : 0;
  
  return {
    type: 'purchase_frequency',
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalCustomers: frequencyData.length,
      repeatCustomers: repeatCustomers.length,
      repeatRate,
      avgPurchaseFrequency: repeatCustomers.length > 0 
        ? repeatCustomers.reduce((sum, c) => sum + c.daysBetweenPurchases, 0) / repeatCustomers.length 
        : 0,
    },
    frequencyGroups: frequencyGroups.map(group => ({
      ...group,
      percentage: frequencyData.length > 0 ? (group.count / frequencyData.length) * 100 : 0,
    })),
    mostFrequentCustomers: frequencyData
      .filter(c => c.isRepeatCustomer)
      .sort((a, b) => a.daysBetweenPurchases - b.daysBetweenPurchases)
      .slice(0, 10),
  };
}

// Get retention analysis
async function getRetentionAnalysis(startDate: Date, endDate: Date) {
  // Calculate month range
  const months: string[] = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    months.push(`${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`);
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Get all customers with their first purchase date
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      createdAt: true,
      invoices: {
        where: {
          status: {
            not: 'VOIDED',
          },
        },
        select: {
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });
  
  // Calculate first purchase month and all purchase months for each customer
  const customerData = customers.map(customer => {
    if (customer.invoices.length === 0) {
      return {
        id: customer.id,
        firstPurchaseMonth: null,
        allPurchaseMonths: [],
      };
    }
    
    const firstPurchase = customer.invoices[0].createdAt;
    const firstPurchaseMonth = `${firstPurchase.getFullYear()}-${(firstPurchase.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Get all unique months with purchases
    const allMonths = new Set(
      customer.invoices.map(inv => {
        const date = inv.createdAt;
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      })
    );
    
    return {
      id: customer.id,
      firstPurchaseMonth,
      allPurchaseMonths: Array.from(allMonths),
    };
  });
  
  // Filter customers with at least one purchase
  const activeCustomers = customerData.filter(c => c.firstPurchaseMonth !== null);
  
  // Calculate cohort data
  const cohorts: Record<string, {
    newCustomers: number;
    retentionByMonth: Record<string, { count: number; rate: number }>;
  }> = {};
  
  // Initialize cohorts
  for (const month of months) {
    cohorts[month] = {
      newCustomers: 0,
      retentionByMonth: {},
    };
    
    // Initialize retention for each subsequent month
    for (const retentionMonth of months) {
      // Only track retention for months after the cohort month
      if (retentionMonth >= month) {
        cohorts[month].retentionByMonth[retentionMonth] = {
          count: 0,
          rate: 0,
        };
      }
    }
  }
  
  // Fill cohort data
  for (const customer of activeCustomers) {
    if (!customer.firstPurchaseMonth) continue;
    
    // If first purchase is within our date range
    if (months.includes(customer.firstPurchaseMonth)) {
      // Increment new customers for this cohort
      cohorts[customer.firstPurchaseMonth].newCustomers += 1;
      
      // For each month they made a purchase, increment the retention count
      for (const purchaseMonth of customer.allPurchaseMonths) {
        // Only count months in our range
        if (months.includes(purchaseMonth) && purchaseMonth >= customer.firstPurchaseMonth) {
          cohorts[customer.firstPurchaseMonth].retentionByMonth[purchaseMonth].count += 1;
        }
      }
    }
  }
  
  // Calculate retention rates
  for (const cohortMonth in cohorts) {
    const cohort = cohorts[cohortMonth];
    
    if (cohort.newCustomers > 0) {
      for (const retentionMonth in cohort.retentionByMonth) {
        cohort.retentionByMonth[retentionMonth].rate = 
          (cohort.retentionByMonth[retentionMonth].count / cohort.newCustomers) * 100;
      }
    }
  }
  
  // Assemble the report data
  const cohortData = Object.entries(cohorts).map(([month, data]) => ({
    month,
    newCustomers: data.newCustomers,
    retention: Object.entries(data.retentionByMonth).map(([retentionMonth, retentionData]) => ({
      month: retentionMonth,
      count: retentionData.count,
      rate: retentionData.rate,
    })),
  })).filter(cohort => cohort.newCustomers > 0); // Only include cohorts with customers
  
  // Calculate overall retention rates
  const monthlyRetention = months.map((month, index) => {
    if (index === 0) return { month, rate: 100 }; // First month is always 100%
    
    let totalRetained = 0;
    let totalEligible = 0;
    
    // Loop through all cohorts that started before this month
    for (const cohortMonth in cohorts) {
      if (cohortMonth < month) {
        const cohort = cohorts[cohortMonth];
        if (cohort.newCustomers > 0) {
          totalEligible += cohort.newCustomers;
          totalRetained += cohort.retentionByMonth[month]?.count || 0;
        }
      }
    }
    
    return {
      month,
      rate: totalEligible > 0 ? (totalRetained / totalEligible) * 100 : 0,
    };
  });
  
  return {
    type: 'retention_analysis',
    period: {
      start: startDate,
      end: endDate,
      months,
    },
    cohorts: cohortData,
    overallRetention: monthlyRetention,
    summary: {
      totalCohorts: cohortData.length,
      totalNewCustomers: cohortData.reduce((sum, cohort) => sum + cohort.newCustomers, 0),
      avgRetentionRate: monthlyRetention.length > 1 
        ? monthlyRetention.slice(1).reduce((sum, month) => sum + month.rate, 0) / (monthlyRetention.length - 1)
        : 0,
    },
  };
}

// Get spending tiers analysis
async function getSpendingTiersAnalysis(startDate: Date, endDate: Date) {
  // Get all customers with their purchases in the period
  const customers = await prisma.invoice.groupBy({
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
    _count: true,
  });
  
  // Get customer details
  const customerDetails = await Promise.all(
    customers.map(async (c) => {
      if (!c.customerId) return null;
      
      const customer = await prisma.customer.findUnique({
        where: { id: c.customerId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          loyaltyPoints: true,
          createdAt: true,
        },
      });
      
      if (!customer) return null;
      
      return {
        ...customer,
        totalSpent: Number(c._sum.totalAmount),
        invoiceCount: c._count,
        averageSpent: Number(c._sum.totalAmount) / c._count,
      };
    })
  );
  
  // Filter out null values
  const validCustomers = customerDetails.filter(Boolean);
  
  // Define spending tiers
  const spendingTiers = [
    { name: 'Low ($0-$100)', range: [0, 100], count: 0, totalSpent: 0 },
    { name: 'Medium ($101-$500)', range: [101, 500], count: 0, totalSpent: 0 },
    { name: 'High ($501-$1000)', range: [501, 1000], count: 0, totalSpent: 0 },
    { name: 'VIP ($1001+)', range: [1001, Infinity], count: 0, totalSpent: 0 },
  ];
  
  // Group customers by spending tier
  for (const customer of validCustomers) {
    if (!customer) continue;
    
    for (const tier of spendingTiers) {
      if (customer.totalSpent >= tier.range[0] && customer.totalSpent <= tier.range[1]) {
        tier.count += 1;
        tier.totalSpent += customer.totalSpent;
        break;
      }
    }
  }
  
  // Calculate average spending
  const totalSpent = validCustomers.reduce((sum, c) => sum + (c?.totalSpent || 0), 0);
  const avgSpending = validCustomers.length > 0 ? totalSpent / validCustomers.length : 0;
  
  // Find top spenders
  const topSpenders = validCustomers
    .sort((a, b) => (b?.totalSpent || 0) - (a?.totalSpent || 0))
    .slice(0, 10);
  
  return {
    type: 'spending_tiers',
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalCustomers: validCustomers.length,
      totalSpent,
      avgSpending,
    },
    spendingTiers: spendingTiers.map(tier => ({
      ...tier,
      percentage: validCustomers.length > 0 ? (tier.count / validCustomers.length) * 100 : 0,
      avgSpending: tier.count > 0 ? tier.totalSpent / tier.count : 0,
    })),
    topSpenders,
  };
}

// Helper function to get customer growth by month
async function getCustomerGrowthByMonth(startDate: Date, endDate: Date) {
  // Generate months between start and end dates
  const months: string[] = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    months.push(`${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`);
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Get new customers per month
  const newCustomersByMonth: Record<string, number> = {};
  
  // Initialize with 0
  for (const month of months) {
    newCustomersByMonth[month] = 0;
  }
  
  // Count new customers by month
  const customers = await prisma.customer.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      createdAt: true,
    },
  });
  
  for (const customer of customers) {
    const month = `${customer.createdAt.getFullYear()}-${(customer.createdAt.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (newCustomersByMonth[month] !== undefined) {
      newCustomersByMonth[month] += 1;
    }
  }
  
  // Count active customers by month
  const activeCustomersByMonth: Record<string, number> = {};
  
  // Initialize with 0
  for (const month of months) {
    activeCustomersByMonth[month] = 0;
  }
  
  // Get invoice data grouped by month and customer
  for (const month of months) {
    const [year, monthNum] = month.split('-');
    const startOfMonth = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const endOfMonth = new Date(parseInt(year), parseInt(monthNum), 0);
    
    const activeCustomers = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        status: {
          not: 'VOIDED',
        },
        customerId: {
          not: null,
        },
      },
    });
    
    activeCustomersByMonth[month] = activeCustomers.length;
  }
  
  // Combine the data
  return months.map(month => ({
    month,
    newCustomers: newCustomersByMonth[month],
    activeCustomers: activeCustomersByMonth[month],
  }));
} 