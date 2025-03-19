import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isCashier } from "@/lib/auth";

// GET: Fetch a single customer by ID with their purchase history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isCashier(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const customerId = params.id;
    
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        loyaltyHistory: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        invoices: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
          include: {
            items: {
              include: {
                product: true,
              }
            }
          }
        },
      },
    });
    
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PUT: Update a customer
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isCashier(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const customerId = params.id;
    const data = await request.json();
    
    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    
    if (!existingCustomer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
    
    // If email or phone is updated, check if it's already used by another customer
    if (data.email !== existingCustomer.email || data.phone !== existingCustomer.phone) {
      const duplicateCheck = await prisma.customer.findFirst({
        where: {
          id: { not: customerId },
          OR: [
            { email: data.email },
            { phone: data.phone },
          ],
        },
      });
      
      if (duplicateCheck) {
        return NextResponse.json(
          { error: 'Email or phone number already in use by another customer' },
          { status: 409 }
        );
      }
    }
    
    // Handle loyalty points change separately
    let loyaltyPointsChanged = false;
    let pointsDifference = 0;
    
    if (data.loyaltyPoints !== undefined) {
      const newPoints = parseInt(data.loyaltyPoints);
      pointsDifference = newPoints - existingCustomer.loyaltyPoints;
      loyaltyPointsChanged = pointsDifference !== 0;
    }
    
    // Update customer
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        loyaltyPoints: data.loyaltyPoints ? parseInt(data.loyaltyPoints) : undefined,
      },
    });
    
    // Create loyalty history entry if points changed
    if (loyaltyPointsChanged && pointsDifference !== 0) {
      await prisma.loyaltyHistory.create({
        data: {
          customerId: customerId,
          points: pointsDifference,
          description: data.pointsNote || 'Manual adjustment',
        },
      });
    }
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_CUSTOMER',
        details: `Updated customer: ${updatedCustomer.name}`,
      },
    });
    
    return NextResponse.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a customer (only if they have no purchase history)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check - only admin can delete customers
    if (!session || !isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const customerId = params.id;
    
    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    
    if (!existingCustomer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
    
    // Check if customer has any invoices
    const hasInvoices = await prisma.invoice.findFirst({
      where: { customerId },
    });
    
    if (hasInvoices) {
      return NextResponse.json(
        { 
          error: 'Cannot delete customer with purchase history',
          suggestion: 'Consider anonymizing their personal data instead'
        },
        { status: 400 }
      );
    }
    
    // Delete customer (this will cascade to loyalty history)
    await prisma.customer.delete({
      where: { id: customerId },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_CUSTOMER',
        details: `Deleted customer: ${existingCustomer.name}`,
      },
    });
    
    return NextResponse.json(
      { message: 'Customer deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 