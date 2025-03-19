import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Retail Billing System</h1>
      <div className="flex flex-col gap-4">
        <Link 
          href="/admin" 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded text-center text-xl"
        >
          Admin Panel
        </Link>
        <Link 
          href="/billing" 
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-4 px-6 rounded text-center text-xl"
        >
          Billing Interface
        </Link>
      </div>
    </main>
  );
}
