import AdminPanel from '../components/AdminPanel';

export default function AdminPage() {
  return (
    <main className="min-h-screen py-10">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-6">Retail Billing System - Admin</h1>
        <AdminPanel />
      </div>
    </main>
  );
} 