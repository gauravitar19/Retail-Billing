import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isCashier } from "@/lib/auth";

// GET: Fetch all invoices with filtering options
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
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    
    // Build filter conditions
    const where: any = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.createdAt = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      where.createdAt = {
        lte: new Date(endDate),
      };
    }
    
    if (customerId) {
      where.customerId = customerId;
    }
    
    if (status) {
      where.status = status;
    }
    
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
    
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST: Create a new invoice
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
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return NextResponse.json(
        { error: 'Invoice must have at least one item' },
        { status: 400 }
      );
    }
    
    // Generate invoice number (format: INV-YYYYMMDD-XXXX)
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceNumber = `INV-${dateStr}-${randomPart}`;
    
    // Begin transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: data.customerId || null,
          userId: session.user.id,
          subtotal: parseFloat(data.subtotal),
          taxAmount: parseFloat(data.taxAmount),
          discountAmount: data.discountAmount ? parseFloat(data.discountAmount) : 0,
          totalAmount: parseFloat(data.totalAmount),
          status: data.status || 'PAID',
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference,
          note: data.note,
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              quantity: parseInt(item.quantity),
              unitPrice: parseFloat(item.unitPrice),
              taxRate: item.taxRate ? parseFloat(item.taxRate) : 0,
              taxAmount: item.taxAmount ? parseFloat(item.taxAmount) : 0,
              discount: item.discount ? parseFloat(item.discount) : 0,
              total: parseFloat(item.total),
            })),
          },
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
      
      // 2. Update product stock and create stock history entries
      for (const item of data.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }
        
        // Update stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: parseInt(item.quantity),
            },
          },
        });
        
        // Create stock history
        await tx.stockHistory.create({
          data: {
            productId: item.productId,
            quantity: parseInt(item.quantity),
            type: 'sale',
            note: `Invoice #${invoiceNumber}`,
            invoiceId: invoice.id,
          },
        });
      }
      
      // 3. If there's a customer, update their total purchases and loyalty points
      if (data.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: data.customerId },
        });
        
        if (customer) {
          // Calculate loyalty points (e.g., 1 point per $10 spent)
          const pointsEarned = Math.floor(parseFloat(data.totalAmount) / 10);
          
          await tx.customer.update({
            where: { id: data.customerId },
            data: {
              totalPurchases: {
                increment: parseFloat(data.totalAmount),
              },
              loyaltyPoints: {
                increment: pointsEarned,
              },
            },
          });
          
          if (pointsEarned > 0) {
            await tx.loyaltyHistory.create({
              data: {
                customerId: data.customerId,
                points: pointsEarned,
                description: `Points earned from invoice #${invoiceNumber}`,
              },
            });
          }
        }
      }
      
      // 4. Create activity log
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_INVOICE',
          details: `Created invoice #${invoiceNumber} with total amount ${data.totalAmount}`,
        },
      });
      
      return invoice;
    });
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 