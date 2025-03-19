'use client';

import { useState, useEffect } from 'react';

interface Item {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export default function AdminPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [newItem, setNewItem] = useState<Partial<Item>>({ name: '', price: 0, quantity: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const addItem = async () => {
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, id: Date.now() })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add item');
      }
      
      const data = await response.json();
      setItems(data);
      setNewItem({ name: '', price: 0, quantity: 0 });
    } catch (err) {
      setError('Error adding item');
      console.error(err);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      const response = await fetch(`/api/items?id=${id}`, { method: 'DELETE' });
      
      if (!response.ok) {
        throw new Error('Failed to delete item');
      }
      
      const data = await response.json();
      setItems(data);
    } catch (err) {
      setError('Error deleting item');
      console.error(err);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Admin Panel</h2>
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h3 className="text-xl mb-2">Add New Item</h3>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            className="border p-2 rounded"
            placeholder="Item Name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <input
            className="border p-2 rounded"
            placeholder="Price"
            type="number"
            value={newItem.price}
            onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
          />
          <input
            className="border p-2 rounded"
            placeholder="Quantity"
            type="number"
            value={newItem.quantity}
            onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
          />
          <button 
            className="bg-blue-500 text-white p-2 rounded"
            onClick={addItem}
          >
            Add Item
          </button>
        </div>
      </div>
      
      <h3 className="text-xl mb-2">Inventory Items</h3>
      {items.length === 0 ? (
        <p>No items available</p>
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <li key={item.id} className="border p-3 rounded flex justify-between items-center">
              <div>
                <span className="font-semibold">{item.name}</span> - ₹{item.price} (Qty: {item.quantity})
              </div>
              <button 
                className="bg-red-500 text-white p-1 rounded"
                onClick={() => deleteItem(item.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 