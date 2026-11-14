import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(message: string, options: { tone?: Toast['tone']; action?: Toast['action']; duration?: number } = {}) {
  const toast: Toast = { id: nextId++, message, tone: options.tone ?? 'default', action: options.action };
  toasts = [...toasts.slice(-2), toast];
  emit();
  window.setTimeout(() => dismissToast(toast.id), options.duration ?? (options.action ? 7000 : 4000));
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}
