import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP: anima o reflow dos filhos marcados com `data-flip="<id>"` dentro do
 * elemento referenciado. Quando a lista reordena (ou um item entra/sai), os
 * itens deslizam suavemente para a nova posição em vez de saltar. Itens novos
 * ganham uma entrada discreta. Respeita prefers-reduced-motion.
 */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const prev = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'));

    // Mede a posição real de layout (limpa transform/transition de FLIPs em voo).
    for (const n of nodes) {
      n.style.transition = 'none';
      n.style.transform = '';
    }
    const now = new Map<string, DOMRect>();
    for (const n of nodes) now.set(n.dataset.flip!, n.getBoundingClientRect());

    const olds = prev.current;
    const moved: HTMLElement[] = [];
    const entered: HTMLElement[] = [];
    for (const n of nodes) {
      const id = n.dataset.flip!;
      const old = olds.get(id);
      const rect = now.get(id)!;
      if (old) {
        const dx = old.left - rect.left;
        const dy = old.top - rect.top;
        if (dx || dy) {
          n.style.transform = `translate(${dx}px, ${dy}px)`;
          moved.push(n);
        }
      } else if (olds.size > 0) {
        // Item novo (não no primeiro render): entrada discreta.
        n.style.transform = 'translateY(10px) scale(0.985)';
        n.style.opacity = '0';
        entered.push(n);
      }
    }

    if (moved.length || entered.length) {
      requestAnimationFrame(() => {
        for (const n of moved) {
          n.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
          n.style.transform = '';
        }
        for (const n of entered) {
          n.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease';
          n.style.transform = '';
          n.style.opacity = '';
        }
      });
    }

    prev.current = now;
  });

  return ref;
}
