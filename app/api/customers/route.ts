import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isCashier } from "@/lib/auth";

// GET: Fetch all customers with optional filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isCashier(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const loyalOnly = searchParams.get('loyalOnly') === 'true';
    
    // Build filter conditions
    const where: any = {};
    
    if (query) {
      where.OR = [
        { name: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
      ];
    }
    
    if (loyalOnly) {
      where.loyaltyPoints = {
        gt: 0,
      };
    }
    
    const customers = await prisma.customer.findMany({
      where,
      orderBy: {
        totalPurchases: 'desc',
      },
      include: {
        loyaltyHistory: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
    });
    
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST: Create a new customer
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isCashier(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const data = await request.json();
    
    // Validate required fields
    if (!data.name) {
      return NextResponse.json(
        { error: 'Customer name is required' },
        { status: 400 }
      );
    }
    
    // Check if customer with same email or phone already exists
    if (data.email || data.phone) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          OR: [
            { email: data.email },
            { phone: data.phone },
          ],
        },
      });
      
      if (existingCustomer) {
        return NextResponse.json(
          { error: 'Customer with same email or phone already exists', existingCustomer },
          { status: 409 }
        );
      }
    }
    
    // Create the customer
    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        loyaltyPoints: data.loyaltyPoints ? parseInt(data.loyaltyPoints) : 0,
      },
    });
    
    // If initial loyalty points, create history entry
    if (data.loyaltyPoints && parseInt(data.loyaltyPoints) > 0) {
      await prisma.loyaltyHistory.create({
        data: {
          customerId: customer.id,
          points: parseInt(data.loyaltyPoints),
          description: 'Initial loyalty points',
        },
      });
    }
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_CUSTOMER',
        details: `Created customer: ${customer.name}`,
      },
    });
    
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 