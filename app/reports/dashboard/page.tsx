'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, 
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  ArrowTrendingUpIcon, ArrowTrendingDownIcon, 
  CurrencyDollarIcon, ShoppingCartIcon, UsersIcon, 
  ArchiveBoxIcon, ExclamationTriangleIcon, ChartBarIcon 
} from '@heroicons/react/24/outline';

// Define the timeframe options
const timeframeOptions = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This week', value: 'this_week' },
  { label: 'Last week', value: 'last_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Last 30 days', value: 'last_30_days' },
  { label: 'This quarter', value: 'this_quarter' },
  { label: 'Last quarter', value: 'last_quarter' },
  { label: 'This year', value: 'this_year' },
  { label: 'Last year', value: 'last_year' },
];

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [timeframe, setTimeframe] = useState('today');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/reports/dashboard?timeframe=${timeframe}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        
        const data = await response.json();
        setDashboardData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, [timeframe]);

  // Redirect if not authorized
  if (!session || !['MANAGER', 'ADMIN'].includes(session?.user?.role as string)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-[400px]">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You do not have permission to access the dashboard.</p>
          <button 
            onClick={() => router.push('/')} 
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Business Dashboard</h1>
        
        <div className="flex items-center">
          <label htmlFor="timeframe" className="mr-2 text-sm font-medium">Time Period:</label>
          <select
            id="timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {timeframeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-4">
          <p>{error}</p>
        </div>
      ) : dashboardData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Key Performance Indicators */}
          <KpiCard 
            title="Total Sales" 
            value={formatCurrency(dashboardData.sales.totalSales)} 
            trend={dashboardData.sales.salesGrowth} 
            icon={<CurrencyDollarIcon className="h-8 w-8 text-green-500" />} 
          />
          
          <KpiCard 
            title="Orders" 
            value={dashboardData.sales.orderCount} 
            trend={dashboardData.sales.orderGrowth} 
            icon={<ShoppingCartIcon className="h-8 w-8 text-blue-500" />} 
          />
          
          <KpiCard 
            title="Customers" 
            value={dashboardData.customers.activeCustomers} 
            trend={dashboardData.customers.engagementGrowth} 
            icon={<UsersIcon className="h-8 w-8 text-purple-500" />} 
          />
          
          <KpiCard 
            title="Inventory Alerts" 
            value={dashboardData.inventory.lowStockCount + dashboardData.inventory.outOfStockCount} 
            trend={null}
            icon={<ExclamationTriangleIcon className="h-8 w-8 text-yellow-500" />} 
          />
          
          {/* Sales Charts */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Sales Trend</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dashboardData.sales.hourlyDistribution}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.3} 
                    name="Sales" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Top Products */}
          <div className="col-span-1 md:col-span-2 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Top Products</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboardData.sales.topProducts}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="sales" fill="#0088FE" name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Payment Methods */}
          <div className="col-span-1 md:col-span-2 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Payment Methods</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboardData.sales.paymentMethods}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                    nameKey="method"
                  >
                    {dashboardData.sales.paymentMethods.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Employee Performance */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Employee Performance</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboardData.performance.employeePerformance}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                  <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                  <Tooltip formatter={(value, name) => {
                    if (name === 'totalSales') return formatCurrency(value);
                    return value;
                  }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="totalSales" fill="#8884d8" name="Sales" />
                  <Bar yAxisId="right" dataKey="transactionCount" fill="#82ca9d" name="Transactions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Inventory Value */}
          <div className="col-span-1 md:col-span-2 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Inventory Value</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">Cost Value</p>
                <p className="text-2xl font-bold">{formatCurrency(dashboardData.inventory.totalInventoryValue)}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-800 font-medium">Retail Value</p>
                <p className="text-2xl font-bold">{formatCurrency(dashboardData.inventory.totalRetailValue)}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-800 font-medium">Potential Profit</p>
                <p className="text-2xl font-bold">{formatCurrency(dashboardData.inventory.potentialProfit)}</p>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <p className="text-sm text-indigo-800 font-medium">Profit Margin</p>
                <p className="text-2xl font-bold">{dashboardData.inventory.profitMargin.toFixed(1)}%</p>
              </div>
            </div>
          </div>
          
          {/* Customer Insights */}
          <div className="col-span-1 md:col-span-2 bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold mb-4">Customer Insights</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-amber-50 p-4 rounded-lg">
                <p className="text-sm text-amber-800 font-medium">Total Customers</p>
                <p className="text-2xl font-bold">{dashboardData.customers.totalCustomers}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg">
                <p className="text-sm text-emerald-800 font-medium">New Customers</p>
                <p className="text-2xl font-bold">{dashboardData.customers.newCustomers}</p>
                <p className="text-sm text-emerald-600">
                  {dashboardData.customers.customerGrowth > 0 ? '+' : ''}
                  {dashboardData.customers.customerGrowth.toFixed(1)}%
                </p>
              </div>
              <div className="bg-sky-50 p-4 rounded-lg">
                <p className="text-sm text-sky-800 font-medium">Engagement Rate</p>
                <p className="text-2xl font-bold">{dashboardData.customers.engagementRate.toFixed(1)}%</p>
              </div>
              <div className="bg-rose-50 p-4 rounded-lg">
                <p className="text-sm text-rose-800 font-medium">Loyalty Points</p>
                <p className="text-2xl font-bold">{dashboardData.customers.totalLoyaltyPoints.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Render customized label for pie chart
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
  
  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// Helper function to format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// KPI Card Component
function KpiCard({ title, value, trend, icon }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium text-gray-800">{title}</h3>
        {icon}
      </div>
      <div className="flex items-end">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {trend !== null && (
          <div className={`flex items-center ml-2 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? (
              <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
            ) : (
              <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
            )}
            <span className="text-sm font-medium">
              {trend >= 0 ? '+' : ''}{trend?.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
} 