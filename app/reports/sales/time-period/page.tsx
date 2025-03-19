'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar
} from 'recharts';
import { 
  ArrowPathIcon, 
  CalendarDaysIcon,
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

// Period options for grouping data
const periodOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly', value: 'yearly' },
];

// Time range options
const timeRangeOptions = [
  { label: 'Last 7 days', value: 'last_7_days' },
  { label: 'Last 30 days', value: 'last_30_days' },
  { label: 'Last 90 days', value: 'last_90_days' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'This quarter', value: 'this_quarter' },
  { label: 'Last quarter', value: 'last_quarter' },
  { label: 'This year', value: 'this_year' },
  { label: 'Last year', value: 'last_year' },
  { label: 'Custom range', value: 'custom' },
];

export default function SalesTimePeriodPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [period, setPeriod] = useState('daily');
  const [timeRange, setTimeRange] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [viewMode, setViewMode] = useState('line'); // 'line' or 'bar'

  useEffect(() => {
    // If timeRange is custom, show custom date inputs
    setShowCustomRange(timeRange === 'custom');
    
    // Set default dates for custom range if not already set
    if (timeRange === 'custom' && (!startDate || !endDate)) {
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      setStartDate(formatDateForInput(thirtyDaysAgo));
      setEndDate(formatDateForInput(today));
    }
  }, [timeRange]);

  useEffect(() => {
    // Only fetch if we have valid date ranges (either from preset or custom input)
    if ((timeRange !== 'custom') || (timeRange === 'custom' && startDate && endDate)) {
      fetchSalesData();
    }
  }, [period, timeRange, startDate, endDate]);

  const fetchSalesData = async () => {
    try {
      setLoading(true);
      
      // Construct query parameters
      let queryParams = `type=time-period&period=${period}&timeRange=${timeRange}`;
      
      if (timeRange === 'custom' && startDate && endDate) {
        queryParams += `&startDate=${startDate}&endDate=${endDate}`;
      }
      
      const response = await fetch(`/api/reports/sales?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch sales data');
      }
      
      const data = await response.json();
      setSalesData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching sales data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format date for input field
  const formatDateForInput = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Helper function to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Redirect if not authorized
  if (!session || !['MANAGER', 'ADMIN'].includes(session?.user?.role as string)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-[400px]">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You do not have permission to access sales reports.</p>
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
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <h1 className="text-3xl font-bold mb-4 md:mb-0">Sales by Time Period</h1>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setViewMode('line')}
            className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'line' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-700'}`}
          >
            Line Chart
          </button>
          <button 
            onClick={() => setViewMode('bar')}
            className={`px-3 py-2 text-sm font-medium rounded-md ${viewMode === 'bar' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-700'}`}
          >
            Bar Chart
          </button>
          <button
            onClick={fetchSalesData}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Filters/Controls */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Time Range Selector */}
          <div>
            <label htmlFor="timeRange" className="block text-sm font-medium text-gray-700 mb-1">
              Time Range
            </label>
            <select
              id="timeRange"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {timeRangeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Period Group By */}
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
              Group By
            </label>
            <select
              id="period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {periodOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Custom Date Range */}
          {showCustomRange && (
            <>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="block w-full pl-10 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block w-full pl-10 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Summary Cards */}
      {salesData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Total Sales"
            value={formatCurrency(salesData.summary.totalSales)}
            change={salesData.summary.salesGrowth}
            isPositive={salesData.summary.salesGrowth >= 0}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-blue-500" />}
          />
          <SummaryCard
            title="Average Sale"
            value={formatCurrency(salesData.summary.averageSale)}
            change={salesData.summary.averageSaleGrowth}
            isPositive={salesData.summary.averageSaleGrowth >= 0}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-green-500" />}
          />
          <SummaryCard
            title="Total Orders"
            value={salesData.summary.orderCount}
            change={salesData.summary.orderCountGrowth}
            isPositive={salesData.summary.orderCountGrowth >= 0}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-purple-500" />}
          />
          <SummaryCard
            title="Items Sold"
            value={salesData.summary.totalItemsSold}
            change={salesData.summary.itemsSoldGrowth}
            isPositive={salesData.summary.itemsSoldGrowth >= 0}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-orange-500" />}
          />
        </div>
      )}
      
      {/* Chart */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Sales Trend</h2>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-4">
            <p>{error}</p>
          </div>
        ) : salesData ? (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'line' ? (
                <AreaChart
                  data={salesData.data}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
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
              ) : (
                <BarChart
                  data={salesData.data}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="sales" fill="#8884d8" name="Sales" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500">No data available</p>
          </div>
        )}
      </div>
      
      {/* Data Table */}
      {salesData && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <h2 className="text-xl font-semibold p-6 pb-3">Sales Data</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sales
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orders
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items Sold
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg. Sale
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {salesData.data.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.period}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(row.sales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.orders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.itemsSold}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(row.sales / (row.orders || 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, change, isPositive, icon }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {change !== undefined && (
        <div className={`flex items-center mt-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? (
            <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
          ) : (
            <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
          )}
          <span className="text-sm font-medium">
            {isPositive ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
} 