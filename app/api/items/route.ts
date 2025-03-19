import { NextRequest, NextResponse } from 'next/server';

// In-memory storage (would be replaced with a database in production)
let items = [
  { id: 1, name: "Item 1", price: 100, quantity: 10 },
  { id: 2, name: "Item 2", price: 200, quantity: 5 }
];

export async function GET() {
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const newItem = await request.json();
  
  // Add ID if not provided
  if (!newItem.id) {
    newItem.id = Date.now();
  }
  
  items.push(newItem);
  return NextResponse.json(items, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }
  
  items = items.filter(item => item.id !== parseInt(id));
  return NextResponse.json(items);
} 