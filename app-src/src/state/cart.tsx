// Local cart (works for guests, persisted on the device).
// Prices shown here are for display only — the checkout function re-prices
// everything from the database, so a tampered cart cannot change what is charged.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartItem = {
  variantId: string; productId: string; title: string; variantLabel: string;
  price: number; image: string | null; qty: number; stock: number; shopName: string;
};
type Ctx = {
  items: CartItem[]; count: number; subtotal: number;
  add: (i: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};
const KEY = 'cart_v1';
const CartCtx = createContext<Ctx>(null as any);
export const useCart = () => useContext(CartCtx);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setItems(JSON.parse(v)); setReady(true); });
  }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(items)); }, [items, ready]);

  const value = useMemo<Ctx>(() => ({
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((n, i) => n + i.qty * i.price, 0),
    add: (i, qty = 1) => setItems((cur) => {
      const ex = cur.find((c) => c.variantId === i.variantId);
      if (ex) return cur.map((c) => c.variantId === i.variantId ? { ...c, qty: Math.min(c.qty + qty, i.stock || 99) } : c);
      return [...cur, { ...i, qty: Math.min(qty, i.stock || 99) }];
    }),
    setQty: (id, qty) => setItems((cur) => cur.map((c) => c.variantId === id ? { ...c, qty: Math.max(1, Math.min(qty, c.stock || 99)) } : c)),
    remove: (id) => setItems((cur) => cur.filter((c) => c.variantId !== id)),
    clear: () => setItems([]),
  }), [items]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
