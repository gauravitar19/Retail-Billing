'use client';

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Item {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface CartItem extends Item {
  quantity: number;
}

interface Bill {
  billNumber: string;
  date: string;
  items: CartItem[];
  total: number;
}

export default function BillingInterface() {
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [billGenerated, setBillGenerated] = useState<Bill | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch('/api/items');
        if (!response.ok) {
          throw new Error('Failed to fetch items');
        }
        const data = await response.json();
        setItems(data);
      } catch (err) {
        setError('Error loading items');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const addToCart = (item: Item) => {
    // First check if we have enough stock
    const stockItem = items.find(i => i.id === item.id);
    if (!stockItem || stockItem.quantity <= 0) {
      setError('Item out of stock');
      return;
    }

    // Check if item already in cart
    const existingItemIndex = cart.findIndex(cartItem => cartItem.id === item.id);
    
    if (existingItemIndex >= 0) {
      // Check if we can add more of this item
      const currentQty = cart[existingItemIndex].quantity;
      if (currentQty >= stockItem.quantity) {
        setError('Cannot add more, not enough stock');
        return;
      }
      
      // Update quantity of existing item
      const updatedCart = [...cart];
      updatedCart[existingItemIndex] = {
        ...updatedCart[existingItemIndex],
        quantity: updatedCart[existingItemIndex].quantity + 1
      };
      setCart(updatedCart);
    } else {
      // Add new item to cart
      setCart([...cart, { ...item, quantity: 1 }]);
    }
    
    // Update available items
    setItems(prevItems => 
      prevItems.map(i => 
        i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i
      )
    );
    
    // Clear any error
    setError(null);
  };

  const removeFromCart = (itemId: number) => {
    // Find the item in the cart
    const cartItem = cart.find(item => item.id === itemId);
    if (!cartItem) return;
    
    // Remove one from cart or remove entirely if last one
    if (cartItem.quantity > 1) {
      setCart(cart.map(item => 
        item.id === itemId 
          ? { ...item, quantity: item.quantity - 1 } 
          : item
      ));
    } else {
      setCart(cart.filter(item => item.id !== itemId));
    }
    
    // Add back to available items
    setItems(items.map(item => 
      item.id === itemId 
        ? { ...item, quantity: item.quantity + 1 } 
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const generateBill = async () => {
    if (cart.length === 0) {
      setError('Cart is empty');
      return;
    }
    
    const bill = {
      billNumber: `BILL-${uuidv4().substring(0, 8)}`,
      date: new Date().toISOString(),
      items: cart,
      total: calculateTotal()
    };
    
    try {
      const response = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bill)
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate bill');
      }
      
      setBillGenerated(bill);
      setCart([]);
    } catch (err) {
      setError('Error generating bill');
      console.error(err);
    }
  };

  const printBill = () => {
    window.print();
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Billing Interface</h2>
      
      <div className="flex flex-col md:flex-row gap-4">
        {/* Available Items */}
        <div className="flex-1 p-4 bg-gray-100 rounded">
          <h3 className="text-xl mb-2">Available Items</h3>
          {items.filter(item => item.quantity > 0).length === 0 ? (
            <p>No items in stock</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {items.filter(item => item.quantity > 0).map(item => (
                <div key={item.id} className="border p-3 rounded bg-white flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{item.name}</div>
                    <div>₹{item.price} (In Stock: {item.quantity})</div>
                  </div>
                  <button 
                    className="bg-green-500 text-white p-2 rounded"
                    onClick={() => addToCart(item)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Cart */}
        <div className="flex-1 p-4 bg-gray-100 rounded">
          <h3 className="text-xl mb-2">Cart</h3>
          {cart.length === 0 ? (
            <p>Cart is empty</p>
          ) : (
            <div>
              <ul className="space-y-2 mb-4">
                {cart.map(item => (
                  <li key={item.id} className="border p-3 rounded bg-white flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div>{item.quantity} x ₹{item.price} = ₹{item.price * item.quantity}</div>
                    </div>
                    <button 
                      className="bg-red-500 text-white p-1 rounded"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="text-xl font-bold mb-4">Total: ₹{calculateTotal()}</div>
              <button
                className="w-full bg-blue-500 text-white p-2 rounded"
                onClick={generateBill}
              >
                Generate Bill
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Bill Preview */}
      {billGenerated && (
        <div className="mt-6 p-4 border rounded">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Bill #{billGenerated.billNumber}</h3>
            <button 
              className="bg-gray-500 text-white p-2 rounded"
              onClick={printBill}
            >
              Print
            </button>
          </div>
          <div className="mb-2">Date: {new Date(billGenerated.date).toLocaleString()}</div>
          <table className="w-full mb-4">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2">Item</th>
                <th className="text-right p-2">Price</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {billGenerated.items.map(item => (
                <tr key={item.id} className="border-b">
                  <td className="p-2">{item.name}</td>
                  <td className="text-right p-2">₹{item.price}</td>
                  <td className="text-right p-2">{item.quantity}</td>
                  <td className="text-right p-2">₹{item.price * item.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="p-2" colSpan={3}>Total</td>
                <td className="text-right p-2">₹{billGenerated.total}</td>
              </tr>
            </tfoot>
          </table>
          <div className="text-center text-gray-500">Thank you for your purchase!</div>
        </div>
      )}
    </div>
  );
} 