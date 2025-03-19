import BillingInterface from '../components/BillingInterface';

export default function BillingPage() {
  return (
    <main className="min-h-screen py-10">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-6">Retail Billing System - Billing</h1>
        <BillingInterface />
      </div>
    </main>
  );
} 