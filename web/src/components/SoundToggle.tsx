import { useSound } from '../lib/sound';

export function SoundToggle({ className }: { className?: string }) {
  const [muted, toggle] = useSound();
  return (
    <button
      type="button"
      className={className ?? 'theme-toggle'}
      onClick={toggle}
      aria-label={muted ? 'Ativar som' : 'Silenciar'}
      title={muted ? 'Ativar som' : 'Silenciar'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
