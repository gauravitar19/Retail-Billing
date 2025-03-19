import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isManager } from "@/lib/auth";

// GET: Fetch a single product by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;
    
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        stockHistory: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });
    
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PUT: Update a product
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check
    if (!session || !isManager(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const productId = params.id;
    const data = await request.json();
    
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    
    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }
    
    // Handle stock change
    let stockChange = 0;
    if (data.stock !== undefined) {
      const newStock = parseInt(data.stock);
      stockChange = newStock - existingProduct.stock;
      
      // Create stock history entry if stock changed
      if (stockChange !== 0) {
        await prisma.stockHistory.create({
          data: {
            productId: productId,
            quantity: Math.abs(stockChange),
            type: stockChange > 0 ? 'purchase' : 'adjustment',
            note: data.stockNote || 'Manual adjustment',
          },
        });
      }
    }
    
    // Update the product
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        price: data.price ? parseFloat(data.price) : undefined,
        cost: data.cost ? parseFloat(data.cost) : undefined,
        taxRate: data.taxRate ? parseFloat(data.taxRate) : undefined,
        stock: data.stock ? parseInt(data.stock) : undefined,
        minStock: data.minStock ? parseInt(data.minStock) : undefined,
        categoryId: data.categoryId,
      },
      include: {
        category: true,
      },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_PRODUCT',
        details: `Updated product: ${updatedProduct.name}`,
      },
    });
    
    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check - only admin can delete products
    if (!session || !isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const productId = params.id;
    
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    
    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }
    
    // Check if product is used in any invoices
    const invoiceItem = await prisma.invoiceItem.findFirst({
      where: { productId },
    });
    
    if (invoiceItem) {
      return NextResponse.json(
        { 
          error: 'Cannot delete product that has been used in invoices',
          suggestion: 'Consider setting stock to 0 instead'
        },
        { status: 400 }
      );
    }
    
    // Delete product
    await prisma.product.delete({
      where: { id: productId },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_PRODUCT',
        details: `Deleted product: ${existingProduct.name}`,
      },
    });
    
    return NextResponse.json(
      { message: 'Product deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 