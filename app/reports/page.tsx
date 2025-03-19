'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartBarIcon, ChartPieIcon, UsersIcon, CubeIcon, ArrowPathIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ReportsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Redirect if not authorized
  if (!session || !['MANAGER', 'ADMIN'].includes(session?.user?.role as string)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
      </div>
      
      <Tabs defaultValue="dashboard" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReportCard
              title="Sales Dashboard"
              description="Overview of sales performance with key metrics and trends"
              icon={<ChartBarIcon className="h-8 w-8 text-blue-500" />}
              onClick={() => router.push('/reports/dashboard')}
            />
            <ReportCard
              title="Inventory Status"
              description="Current inventory levels, stock alerts, and valuation"
              icon={<CubeIcon className="h-8 w-8 text-green-500" />}
              onClick={() => router.push('/reports/inventory')}
            />
            <ReportCard
              title="Customer Insights"
              description="Customer demographics, loyalty, and spending patterns"
              icon={<UsersIcon className="h-8 w-8 text-purple-500" />}
              onClick={() => router.push('/reports/customers')}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="sales" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReportCard
              title="Sales by Time Period"
              description="Analyze sales trends over time intervals"
              icon={<ChartBarIcon className="h-8 w-8 text-blue-500" />}
              onClick={() => router.push('/reports/sales/time-period')}
            />
            <ReportCard
              title="Product Performance"
              description="Top selling products and category analysis"
              icon={<ChartPieIcon className="h-8 w-8 text-blue-500" />}
              onClick={() => router.push('/reports/sales/products')}
            />
            <ReportCard
              title="Payment Analysis"
              description="Sales breakdown by payment methods"
              icon={<ChartPieIcon className="h-8 w-8 text-blue-500" />}
              onClick={() => router.push('/reports/sales/payments')}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="inventory" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReportCard
              title="Stock Status"
              description="Current inventory levels and alerts"
              icon={<CubeIcon className="h-8 w-8 text-green-500" />}
              onClick={() => router.push('/reports/inventory/status')}
            />
            <ReportCard
              title="Inventory Valuation"
              description="Cost, retail value and profit margin analysis"
              icon={<CubeIcon className="h-8 w-8 text-green-500" />}
              onClick={() => router.push('/reports/inventory/valuation')}
            />
            <ReportCard
              title="Stock Movement"
              description="Track inventory changes over time"
              icon={<ArrowPathIcon className="h-8 w-8 text-green-500" />}
              onClick={() => router.push('/reports/inventory/movement')}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="customers" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReportCard
              title="Customer Segments"
              description="Analysis of customer groups and spending patterns"
              icon={<UsersIcon className="h-8 w-8 text-purple-500" />}
              onClick={() => router.push('/reports/customers/segments')}
            />
            <ReportCard
              title="Loyalty Program"
              description="Loyalty points usage and customer retention"
              icon={<UsersIcon className="h-8 w-8 text-purple-500" />}
              onClick={() => router.push('/reports/customers/loyalty')}
            />
            <ReportCard
              title="Purchase Frequency"
              description="Customer purchasing behavior and frequency"
              icon={<ChartBarIcon className="h-8 w-8 text-purple-500" />}
              onClick={() => router.push('/reports/customers/frequency')}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="export" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ReportCard
              title="Export Sales Data"
              description="Download sales reports in CSV or JSON format"
              icon={<DocumentTextIcon className="h-8 w-8 text-gray-500" />}
              onClick={() => router.push('/reports/export?type=sales')}
            />
            <ReportCard
              title="Export Inventory Data"
              description="Download inventory reports in CSV or JSON format"
              icon={<DocumentTextIcon className="h-8 w-8 text-gray-500" />}
              onClick={() => router.push('/reports/export?type=inventory')}
            />
            <ReportCard
              title="Export Customer Data"
              description="Download customer reports in CSV or JSON format"
              icon={<DocumentTextIcon className="h-8 w-8 text-gray-500" />}
              onClick={() => router.push('/reports/export?type=customers')}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Report Settings</CardTitle>
              <CardDescription>Configure your reporting preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Report configuration options will be available here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportCard({ title, description, icon, onClick }) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {icon}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full">
          View Report
        </Button>
      </CardContent>
    </Card>
  );
} 