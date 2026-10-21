/** Cubo mágico sendo montado — GIF oficial da marca SyncBOARD, usado em qualquer loading. */
export function CubeSpinner({ size = 48, label }: { size?: number; label?: string }) {
  return (
    <img
      className="cube-gif"
      src="/brand/cube-assembly-128.gif"
      width={size}
      height={size}
      alt=""
      role="img"
      aria-label={label ?? 'Carregando'}
      draggable={false}
    />
  );
}
