import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isCashier } from "@/lib/auth";

// GET: Fetch a single invoice by ID
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
    
    const invoiceId = params.id;
    
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        returns: {
          include: {
            items: true,
          },
        },
      },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PUT: Update an invoice (limited fields like status or payment details)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const invoiceId = params.id;
    const data = await request.json();
    
    // Check if invoice exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    
    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    // Update limited fields only
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: data.status,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
        note: data.note,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_INVOICE',
        details: `Updated invoice #${existingInvoice.invoiceNumber}`,
      },
    });
    
    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Cancel/void an invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check - only admin can void invoices
    if (!session || !isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const invoiceId = params.id;
    
    // Check if invoice exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
      },
    });
    
    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    // Check if it's already voided
    if (existingInvoice.status === 'VOIDED') {
      return NextResponse.json(
        { error: 'Invoice is already voided' },
        { status: 400 }
      );
    }
    
    // Check if there are any returns
    const hasReturns = await prisma.returnOrder.findFirst({
      where: { invoiceId },
    });
    
    if (hasReturns) {
      return NextResponse.json(
        { error: 'Cannot void invoice with returns' },
        { status: 400 }
      );
    }
    
    // Begin transaction
    await prisma.$transaction(async (tx) => {
      // 1. Return stock to inventory
      for (const item of existingInvoice.items) {
        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
        
        // Create stock history entry
        await tx.stockHistory.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            type: 'adjustment',
            note: `Voided invoice #${existingInvoice.invoiceNumber}`,
            invoiceId: invoiceId,
          },
        });
      }
      
      // 2. Update invoice status to VOIDED
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'VOIDED',
        },
      });
      
      // 3. Revert customer loyalty points and purchases if applicable
      if (existingInvoice.customerId) {
        const pointsEarned = Math.floor(Number(existingInvoice.totalAmount) / 10);
        
        if (pointsEarned > 0) {
          await tx.customer.update({
            where: { id: existingInvoice.customerId },
            data: {
              totalPurchases: {
                decrement: Number(existingInvoice.totalAmount),
              },
              loyaltyPoints: {
                decrement: pointsEarned,
              },
            },
          });
          
          await tx.loyaltyHistory.create({
            data: {
              customerId: existingInvoice.customerId,
              points: -pointsEarned,
              description: `Points reversed from voided invoice #${existingInvoice.invoiceNumber}`,
            },
          });
        }
      }
      
      // 4. Log activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: 'VOID_INVOICE',
          details: `Voided invoice #${existingInvoice.invoiceNumber}`,
        },
      });
    });
    
    return NextResponse.json(
      { message: 'Invoice voided successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error voiding invoice:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 