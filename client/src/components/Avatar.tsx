export function Avatar({ preset, name, size = 40 }: { preset: number; name: string; size?: number }) {
  const index = ((preset % 12) + 12) % 12;
  return (
    <span
      className={`avatar avatar-${index}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {[...name][0] || '拾'}
    </span>
  );
}
