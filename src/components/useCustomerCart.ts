import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { CartItem, Product } from '../types';
import { getProductUnitPrice } from '../utils/format';
import { requiresShopSwitchConfirmation } from '../utils/cart';

const ACTIVE_CART_STORAGE_KEY = 'matable_active_cart';

type CartState = { shopSlug: string; items: CartItem[] };

function validCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CartItem =>
    Boolean(item && typeof item === 'object' && item.product && typeof item.product.id === 'number' && Number.isInteger(item.quantity) && item.quantity > 0)
  );
}

function readStoredCart(shopSlug: string): CartState {
  try {
    const activeCart = sessionStorage.getItem(ACTIVE_CART_STORAGE_KEY);
    if (activeCart) {
      const parsed: unknown = JSON.parse(activeCart);
      if (parsed && typeof parsed === 'object' && 'shopSlug' in parsed && 'items' in parsed) {
        const saved = parsed as { shopSlug: unknown; items: unknown };
        if (typeof saved.shopSlug === 'string') return { shopSlug: saved.shopSlug, items: validCartItems(saved.items) };
      }
    }

    const legacyCart = sessionStorage.getItem(`matable_cart_${shopSlug}`);
    return { shopSlug, items: legacyCart ? validCartItems(JSON.parse(legacyCart)) : [] };
  } catch {
    return { shopSlug, items: [] };
  }
}

export function useCustomerCart(
  shopSlug: string,
  selectedSizes: Record<number, string>,
  selectedColors: Record<number, string>,
  selectedModifiers: Record<number, string[]>,
) {
  const [cartState, setCartState] = useState<CartState>(() => readStoredCart(shopSlug));
  const cart = cartState.shopSlug === shopSlug ? cartState.items : [];
  const setCart: Dispatch<SetStateAction<CartItem[]>> = (update) => {
    setCartState((previous) => {
      const currentItems = previous.shopSlug === shopSlug ? previous.items : [];
      return {
        shopSlug,
        items: typeof update === 'function' ? update(currentItems) : update,
      };
    });
  };
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartHistoryEntry = useRef(false);
  const [pendingShopSwitchProduct, setPendingShopSwitchProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!isCartOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCartOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isCartOpen]);

  useEffect(() => {
    const restoreCartDrawer = () => {
      const drawerIsInHistory = Boolean(window.history.state?.matableCartDrawer);
      cartHistoryEntry.current = drawerIsInHistory;
      setIsCartOpen(drawerIsInHistory);
    };
    window.addEventListener('popstate', restoreCartDrawer);
    return () => window.removeEventListener('popstate', restoreCartDrawer);
  }, []);

  useEffect(() => {
    if (isCartOpen) {
      if (!window.history.state?.matableCartDrawer) {
        window.history.pushState({ ...(window.history.state || {}), matableCartDrawer: true }, '', window.location.href);
      }
      cartHistoryEntry.current = true;
      return;
    }

    if (cartHistoryEntry.current && window.history.state?.matableCartDrawer) {
      cartHistoryEntry.current = false;
      window.history.back();
    }
  }, [isCartOpen]);

  useEffect(() => {
    if (cartState.shopSlug !== shopSlug) return;
    try {
      if (cartState.items.length > 0) sessionStorage.setItem(ACTIVE_CART_STORAGE_KEY, JSON.stringify(cartState));
      else sessionStorage.removeItem(ACTIVE_CART_STORAGE_KEY);
    } catch {
      // The in-memory cart remains available when browser storage is disabled.
    }
  }, [cartState, shopSlug]);

  const addToCart = (product: Product, replaceOtherShop = false) => {
    if (product.stock <= 0) return;
    const currentSize = selectedSizes[product.id];
    const currentColor = selectedColors[product.id];
    const currentMods = selectedModifiers[product.id] || [];
    const addProduct = (items: CartItem[]) => {
      const existingIndex = items.findIndex((item) =>
        item.product.id === product.id
        && item.selected_size === currentSize
        && item.selected_color === currentColor
        && JSON.stringify(item.selected_modifiers || []) === JSON.stringify(currentMods)
      );
      if (existingIndex > -1) {
        const existing = items[existingIndex];
        if (existing.quantity >= product.stock) return items;
        const updated = [...items];
        updated[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        return updated;
      }
      return [...items, { product, quantity: 1, selected_size: currentSize, selected_color: currentColor, selected_modifiers: currentMods }];
    };

    if (requiresShopSwitchConfirmation(cartState.shopSlug, shopSlug, cartState.items.length)) {
      if (!replaceOtherShop) {
        setPendingShopSwitchProduct(product);
        return;
      }
      setCartState({ shopSlug, items: addProduct([]) });
      return;
    }

    setCart(addProduct);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const item = prev[index];
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== index);
      if (newQty > item.product.stock) return prev;
      const copy = [...prev];
      copy[index] = { ...item, quantity: newQty };
      return copy;
    });
  };

  const getProductQuantityInCart = (productId: number): number => cart
    .filter(item => item.product.id === productId)
    .reduce((sum, item) => sum + item.quantity, 0);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce((sum, item) =>
    sum + item.quantity * getProductUnitPrice(item.product, item.selected_modifiers), 0);

  return {
    cart,
    cartShopSlug: cartState.shopSlug,
    requiresShopSwitch: requiresShopSwitchConfirmation(cartState.shopSlug, shopSlug, cartState.items.length),
    setCart,
    isCartOpen,
    setIsCartOpen,
    pendingShopSwitchProduct,
    setPendingShopSwitchProduct,
    addToCart,
    updateQuantity,
    getProductQuantityInCart,
    totalCartCount,
    totalCartAmount,
  };
}
