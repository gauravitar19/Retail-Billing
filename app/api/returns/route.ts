import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isManager, isCashier } from "@/lib/auth";

// GET: Fetch all returns with optional filtering
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
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const invoiceId = searchParams.get('invoiceId');
    
    // Build filter conditions
    const where: any = {};
    
    if (startDate && endDate) {
      where.returnDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.returnDate = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      where.returnDate = {
        lte: new Date(endDate),
      };
    }
    
    if (status) {
      where.status = status;
    }
    
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }
    
    const returns = await prisma.returnOrder.findMany({
      where,
      include: {
        invoice: {
          include: {
            customer: true,
          },
        },
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return NextResponse.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST: Create a new return/refund
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isManager(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const data = await request.json();
    
    // Validate required fields
    if (!data.invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }
    
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return NextResponse.json(
        { error: 'Return must have at least one item' },
        { status: 400 }
      );
    }
    
    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: {
        items: true,
      },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    // Check if items being returned are valid
    for (const item of data.items) {
      const invoiceItem = invoice.items.find(i => i.productId === item.productId);
      
      if (!invoiceItem) {
        return NextResponse.json(
          { error: `Product ID ${item.productId} not found in the invoice` },
          { status: 400 }
        );
      }
      
      if (item.quantity > invoiceItem.quantity) {
        return NextResponse.json(
          { error: `Cannot return more than purchased quantity for product ${item.productId}` },
          { status: 400 }
        );
      }
    }
    
    // Begin transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the return order
      const returnOrder = await tx.returnOrder.create({
        data: {
          invoiceId: data.invoiceId,
          returnDate: new Date(),
          totalAmount: parseFloat(data.totalAmount),
          reason: data.reason,
          status: data.status || 'COMPLETED',
          note: data.note,
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              quantity: parseInt(item.quantity),
              unitPrice: parseFloat(item.unitPrice),
              total: parseFloat(item.total),
              reason: item.reason,
            })),
          },
        },
        include: {
          items: true,
        },
      });
      
      // 2. If status is COMPLETED, return stock to inventory
      if (returnOrder.status === 'COMPLETED') {
        for (const item of data.items) {
          // Update product stock
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: parseInt(item.quantity),
              },
            },
          });
          
          // Create stock history entry
          await tx.stockHistory.create({
            data: {
              productId: item.productId,
              quantity: parseInt(item.quantity),
              type: 'return',
              note: `Return from invoice #${invoice.invoiceNumber}`,
              invoiceId: data.invoiceId,
            },
          });
        }
        
        // 3. Update invoice status if all items are returned
        const allItemsReturned = invoice.items.every(invoiceItem => {
          const returnedItem = data.items.find((item: any) => item.productId === invoiceItem.productId);
          return returnedItem && returnedItem.quantity >= invoiceItem.quantity;
        });
        
        if (allItemsReturned) {
          await tx.invoice.update({
            where: { id: data.invoiceId },
            data: {
              status: 'REFUNDED',
            },
          });
        }
        
        // 4. If there's a customer, update their loyalty points
        if (invoice.customerId) {
          // Calculate loyalty points to deduct (e.g., 1 point per $10 spent)
          const pointsToDeduct = Math.floor(parseFloat(data.totalAmount) / 10);
          
          if (pointsToDeduct > 0) {
            await tx.customer.update({
              where: { id: invoice.customerId },
              data: {
                totalPurchases: {
                  decrement: parseFloat(data.totalAmount),
                },
                loyaltyPoints: {
                  decrement: pointsToDeduct,
                },
              },
            });
            
            await tx.loyaltyHistory.create({
              data: {
                customerId: invoice.customerId,
                points: -pointsToDeduct,
                description: `Points deducted for return from invoice #${invoice.invoiceNumber}`,
              },
            });
          }
        }
      }
      
      // 5. Log activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_RETURN',
          details: `Created return for invoice #${invoice.invoiceNumber} with total amount ${data.totalAmount}`,
        },
      });
      
      return returnOrder;
    });
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating return:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 