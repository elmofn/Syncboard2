import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '../lib/theme';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={className ?? 'theme-toggle'}
      onClick={toggle}
      aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={dark ? 'Tema claro' : 'Tema escuro'}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
