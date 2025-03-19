import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isManager } from "@/lib/auth";

// GET: Fetch all products
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get('categoryId');
    const query = searchParams.get('query');
    const lowStock = searchParams.get('lowStock') === 'true';
    
    // Build filter conditions
    const where: any = {};
    
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    if (query) {
      where.OR = [
        { name: { contains: query } },
        { description: { contains: query } },
        { sku: { contains: query } },
        { barcode: { contains: query } },
      ];
    }
    
    if (lowStock) {
      where.stock = {
        lte: prisma.product.fields.minStock,
      };
    }
    
    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST: Create a new product
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
    if (!data.name || !data.price) {
      return NextResponse.json(
        { error: 'Name and price are required' },
        { status: 400 }
      );
    }
    
    // Create the product
    const product = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        price: parseFloat(data.price),
        cost: data.cost ? parseFloat(data.cost) : 0,
        taxRate: data.taxRate ? parseFloat(data.taxRate) : 0,
        stock: data.stock ? parseInt(data.stock) : 0,
        minStock: data.minStock ? parseInt(data.minStock) : 0,
        categoryId: data.categoryId,
      },
      include: {
        category: true,
      },
    });

    // Create stock history entry
    if (data.stock && parseInt(data.stock) > 0) {
      await prisma.stockHistory.create({
        data: {
          productId: product.id,
          quantity: parseInt(data.stock),
          type: 'purchase',
          note: 'Initial stock',
        },
      });
    }
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_PRODUCT',
        details: `Created product: ${product.name}`,
      },
    });
    
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PATCH: Update multiple products (bulk update)
export async function PATCH(request: NextRequest) {
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
    
    if (!data.products || !Array.isArray(data.products)) {
      return NextResponse.json(
        { error: 'Invalid data format' },
        { status: 400 }
      );
    }
    
    // Process each product update
    const results = await Promise.all(
      data.products.map(async (item: any) => {
        if (!item.id) return { error: 'Product ID is required', id: null };
        
        try {
          const product = await prisma.product.update({
            where: { id: item.id },
            data: {
              ...item,
              price: item.price ? parseFloat(item.price) : undefined,
              cost: item.cost ? parseFloat(item.cost) : undefined,
              taxRate: item.taxRate ? parseFloat(item.taxRate) : undefined,
              stock: item.stock ? parseInt(item.stock) : undefined,
              minStock: item.minStock ? parseInt(item.minStock) : undefined,
            },
          });
          
          return { success: true, id: product.id };
        } catch (err) {
          return { error: 'Failed to update', id: item.id };
        }
      })
    );
    
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error updating products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 