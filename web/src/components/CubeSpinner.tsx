import type { CSSProperties } from 'react';

/** Cubo mágico 3D girando — motivo da marca Syncboard. */
export function CubeSpinner({ size = 48, label }: { size?: number; label?: string }) {
  const style = { ['--cube-size' as string]: `${size}px` } as CSSProperties;
  return (
    <div className="cube" style={style} role="img" aria-label={label ?? 'Carregando'}>
      <div className="cube__box">
        <span className="cube__face cube__face--front" />
        <span className="cube__face cube__face--back" />
        <span className="cube__face cube__face--right" />
        <span className="cube__face cube__face--left" />
        <span className="cube__face cube__face--top" />
        <span className="cube__face cube__face--bottom" />
      </div>
    </div>
  );
}
