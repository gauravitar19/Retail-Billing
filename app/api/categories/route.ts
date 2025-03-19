import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isManager } from "@/lib/auth";

// GET: Fetch all categories
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
    
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST: Create a new category
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
    if (!data.name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }
    
    // Check if category with same name already exists
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: data.name,
      },
    });
    
    if (existingCategory) {
      return NextResponse.json(
        { error: 'Category with this name already exists' },
        { status: 409 }
      );
    }
    
    // Create the category
    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
      },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_CATEGORY',
        details: `Created category: ${category.name}`,
      },
    });
    
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a category (only admins and with confirmation the client knows what they're doing)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Authorization check - only admin can delete categories
    if (!session || !isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const force = searchParams.get('force') === 'true';
    
    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }
    
    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }
    
    // Check if category has products and force is not true
    if (category._count.products > 0 && !force) {
      return NextResponse.json(
        {
          error: 'Category has products associated with it',
          productCount: category._count.products,
          message: 'Set force=true to remove anyway - products will be uncategorized'
        },
        { status: 400 }
      );
    }
    
    // If force is true and category has products, first remove category from products
    if (category._count.products > 0 && force) {
      await prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
    }
    
    // Delete the category
    await prisma.category.delete({
      where: { id },
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_CATEGORY',
        details: `Deleted category: ${category.name}${force ? ' (forced)' : ''}`,
      },
    });
    
    return NextResponse.json(
      { message: 'Category deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 