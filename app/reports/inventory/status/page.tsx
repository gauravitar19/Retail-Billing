'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  ArrowPathIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon 
} from '@heroicons/react/24/outline';

export default function InventoryStatusPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [inventoryData, setInventoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    const fetchInventoryData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/reports/inventory?type=stock-status');
        
        if (!response.ok) {
          throw new Error('Failed to fetch inventory data');
        }
        
        const data = await response.json();
        setInventoryData(data);
        
        // Extract unique categories for filtering
        if (data && data.data) {
          const uniqueCategories = [...new Set(data.data.map(item => item.category))];
          setCategories(uniqueCategories);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching inventory data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInventoryData();
  }, []);

  // Redirect if not authorized
  if (!session || !['MANAGER', 'ADMIN'].includes(session?.user?.role as string)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-[400px]">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You do not have permission to access inventory reports.</p>
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

  // Filter and sort inventory items
  const filteredItems = inventoryData?.data?.filter(item => {
    // Search filter
    const matchesSearch = 
      searchTerm === '' || 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Category filter
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    // Stock filter
    const matchesStock = 
      stockFilter === 'all' || 
      (stockFilter === 'in_stock' && item.stockStatus === 'in_stock') ||
      (stockFilter === 'low_stock' && item.stockStatus === 'low_stock') ||
      (stockFilter === 'out_of_stock' && item.stockStatus === 'out_of_stock');
    
    return matchesSearch && matchesCategory && matchesStock;
  });

  // Sort items
  const sortedItems = filteredItems?.sort((a, b) => {
    if (sortBy === 'name') {
      return sortOrder === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    } else if (sortBy === 'stock') {
      return sortOrder === 'asc'
        ? a.stock - b.stock
        : b.stock - a.stock;
    } else if (sortBy === 'value') {
      return sortOrder === 'asc'
        ? a.stockValue - b.stockValue
        : b.stockValue - a.stockValue;
    }
    return 0;
  });

  // Toggle sort order
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <h1 className="text-3xl font-bold mb-4 md:mb-0">Inventory Status</h1>
        
        <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by name, SKU, or barcode"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
            />
          </div>
          
          {/* Filters */}
          <div className="flex space-x-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Stock Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Summary Cards */}
      {inventoryData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Total Products"
            value={inventoryData.summary.totalProducts}
            color="blue"
          />
          <SummaryCard
            title="In Stock"
            value={inventoryData.summary.inStockCount}
            color="green"
          />
          <SummaryCard
            title="Low Stock"
            value={inventoryData.summary.lowStockCount}
            color="yellow"
          />
          <SummaryCard
            title="Out of Stock"
            value={inventoryData.summary.outOfStockCount}
            color="red"
          />
        </div>
      )}
      
      {/* Inventory Table */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-red-500">{error}</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center">
                        Product
                        <SortIndicator field="name" currentSort={sortBy} currentOrder={sortOrder} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU / Barcode
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => toggleSort('stock')}
                    >
                      <div className="flex items-center">
                        Stock
                        <SortIndicator field="stock" currentSort={sortBy} currentOrder={sortOrder} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Min. Stock
                    </th>
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => toggleSort('value')}
                    >
                      <div className="flex items-center">
                        Stock Value
                        <SortIndicator field="value" currentSort={sortBy} currentOrder={sortOrder} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedItems && sortedItems.length > 0 ? (
                    sortedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{item.sku || 'N/A'}</div>
                          {item.barcode && (
                            <div className="text-xs text-gray-400">{item.barcode}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{item.category}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{item.stock}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{item.minStock}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatCurrency(item.stockValue)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StockStatusBadge status={item.stockStatus} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        No inventory items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination controls would go here */}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, color }) {
  const bgColor = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
  }[color];
  
  const textColor = {
    blue: 'text-blue-800',
    green: 'text-green-800',
    yellow: 'text-yellow-800',
    red: 'text-red-800',
  }[color];
  
  return (
    <div className={`${bgColor} border rounded-lg p-4`}>
      <h3 className={`text-sm font-medium ${textColor}`}>{title}</h3>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}

function StockStatusBadge({ status }) {
  if (status === 'in_stock') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircleIcon className="h-4 w-4 mr-1" />
        In Stock
      </span>
    );
  } else if (status === 'low_stock') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
        Low Stock
      </span>
    );
  } else {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircleIcon className="h-4 w-4 mr-1" />
        Out of Stock
      </span>
    );
  }
}

function SortIndicator({ field, currentSort, currentOrder }) {
  if (currentSort !== field) {
    return null;
  }
  
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className={`ml-1 h-4 w-4 ${currentOrder === 'asc' ? 'transform rotate-180' : ''}`} 
      viewBox="0 0 20 20" 
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
} 