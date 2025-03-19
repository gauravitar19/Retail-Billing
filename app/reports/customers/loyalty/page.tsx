'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  ArrowPathIcon,
  UserGroupIcon,
  ChartBarIcon,
  ChartPieIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export default function LoyaltyProgramPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('last_6_months');

  useEffect(() => {
    fetchLoyaltyData();
  }, [timeRange]);

  const fetchLoyaltyData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/customers?type=loyalty-program&timeRange=${timeRange}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch loyalty program data');
      }
      
      const data = await response.json();
      setLoyaltyData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching loyalty program data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Helper function to format number with commas
  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Helper function to format percent
  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Redirect if not authorized
  if (!session || !['MANAGER', 'ADMIN'].includes(session?.user?.role as string)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-[400px]">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You do not have permission to access customer reports.</p>
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
        <h1 className="text-3xl font-bold mb-4 md:mb-0">Loyalty Program Analysis</h1>
        
        <div className="flex items-center space-x-4">
          <div>
            <select
              id="timeRange"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="last_year">Last Year</option>
              <option value="all_time">All Time</option>
            </select>
          </div>
          
          <button
            onClick={fetchLoyaltyData}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
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
      ) : loyaltyData ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard 
              title="Total Loyalty Members" 
              value={formatNumber(loyaltyData.summary.totalMembers)}
              change={loyaltyData.summary.memberGrowth}
              icon={<UserGroupIcon className="h-7 w-7 text-blue-500" />}
            />
            <SummaryCard 
              title="Active Members" 
              value={formatNumber(loyaltyData.summary.activeMembers)}
              change={loyaltyData.summary.activeMemberGrowth}
              secondaryText={`${loyaltyData.summary.activeMemberPercentage.toFixed(1)}% of total`}
              icon={<UserGroupIcon className="h-7 w-7 text-green-500" />}
            />
            <SummaryCard 
              title="Total Points Issued" 
              value={formatNumber(loyaltyData.summary.totalPointsIssued)}
              change={loyaltyData.summary.pointsIssuedGrowth}
              icon={<ChartBarIcon className="h-7 w-7 text-purple-500" />}
            />
            <SummaryCard 
              title="Points Redeemed" 
              value={formatNumber(loyaltyData.summary.totalPointsRedeemed)}
              secondaryText={`${loyaltyData.summary.pointsRedeemedPercentage.toFixed(1)}% redemption rate`}
              icon={<ChartBarIcon className="h-7 w-7 text-amber-500" />}
            />
          </div>
          
          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Member Distribution by Tier */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Member Distribution by Tier</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={loyaltyData.tierDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="tier"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {loyaltyData.tierDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [formatNumber(value), props.payload.tier]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Points Earned vs Redeemed */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Points Earned vs Redeemed</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={loyaltyData.pointsHistory}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatNumber(value)} />
                    <Legend />
                    <Bar dataKey="earned" name="Points Earned" fill="#0088FE" />
                    <Bar dataKey="redeemed" name="Points Redeemed" fill="#FF8042" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Average Purchase Value by Tier */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Average Purchase Value by Tier</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={loyaltyData.tierPerformance}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="tier" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="averagePurchase" name="Average Purchase" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Points Redemption by Tier */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Redemption Rate by Tier</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={loyaltyData.tierPerformance}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="tier" />
                    <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Bar dataKey="redemptionRate" name="Redemption Rate (%)" fill="#00C49F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* Top Customers Table */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
            <h2 className="text-xl font-semibold p-6 pb-3">Top Loyalty Members</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tier
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Spend
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Points Balance
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Points Redeemed
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Active
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loyaltyData.topMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{member.name}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {member.tier}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(member.totalSpend)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNumber(member.pointsBalance)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNumber(member.pointsRedeemed)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(member.lastActive).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Loyalty Program Performance */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Loyalty Program Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard 
                title="Average Points per Transaction" 
                value={formatNumber(loyaltyData.summary.averagePointsPerTransaction)} 
              />
              <MetricCard 
                title="Average Spend for Loyal Customers" 
                value={formatCurrency(loyaltyData.summary.averageLoyalCustomerSpend)} 
              />
              <MetricCard 
                title="Loyalty vs Non-Loyalty Spend" 
                value={`${loyaltyData.summary.loyaltySpendRatio.toFixed(1)}x higher`} 
              />
              <MetricCard 
                title="Redemption Value" 
                value={formatCurrency(loyaltyData.summary.totalRedemptionValue)} 
              />
              <MetricCard 
                title="Average Redemption Value" 
                value={formatCurrency(loyaltyData.summary.averageRedemptionValue)} 
              />
              <MetricCard 
                title="Program ROI" 
                value={`${loyaltyData.summary.programROI.toFixed(1)}%`} 
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, change, secondaryText, icon }) {
  const isPositive = change > 0;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-5">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {change !== undefined && (
        <div className={`flex items-center mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
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
      {secondaryText && (
        <p className="text-sm text-gray-500 mt-1">{secondaryText}</p>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
} 