import { useEffect } from 'react';

// Pilha global de handlers de Esc: só o modal mais recente (topo) responde,
// para que Esc feche apenas a camada de cima quando há modais aninhados.
const stack: Array<() => void> = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) {
    e.stopPropagation();
    top();
  }
}

/** Fecha a camada de cima ao pressionar Esc. `enabled=false` não registra o handler. */
export function useEscape(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (stack.length === 0) document.addEventListener('keydown', onKeyDown, true);
    stack.push(onEscape);
    return () => {
      const i = stack.lastIndexOf(onEscape);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onEscape, enabled]);
}
