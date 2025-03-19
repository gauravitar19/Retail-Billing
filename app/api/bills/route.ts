import { NextRequest, NextResponse } from 'next/server';

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface Bill {
  billNumber: string;
  date: string;
  items: CartItem[];
  total: number;
}

// In-memory storage (would be replaced with a database in production)
const bills: Bill[] = [];

export async function GET() {
  return NextResponse.json(bills);
}

export async function POST(request: NextRequest) {
  const newBill = await request.json() as Bill;
  
  // Add timestamp if not provided
  if (!newBill.date) {
    newBill.date = new Date().toISOString();
  }
  
  // Add bill number if not provided
  if (!newBill.billNumber) {
    newBill.billNumber = `BILL-${Date.now()}`;
  }
  
  bills.push(newBill);
  return NextResponse.json(bills, { status: 201 });
} 