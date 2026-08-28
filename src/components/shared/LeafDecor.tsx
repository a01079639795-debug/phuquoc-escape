import Image from 'next/image';

/**
 * Тропический лист как декоративный слой.
 *
 * Референс ставит листья в углы крупных блоков — они задают тропический
 * контекст, не занимая места в раскладке. Слой не участвует в потоке и
 * не перехватывает нажатия.
 */
export function LeafDecor({
  kind,
  className = '',
  width = 420,
  opacity = 1,
  rotate = 0,
  flip = false,
}: {
  kind: 'monstera' | 'palm';
  className?: string;
  width?: number;
  opacity?: number;
  rotate?: number;
  flip?: boolean;
}) {
  // Исходники сняты горизонтально в одинаковой высоте.
  const ratio = kind === 'monstera' ? 480 / 366 : 532 / 366;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute select-none ${className}`}
      style={{
        width,
        height: width / ratio,
        opacity,
        transform: `rotate(${rotate}deg)${flip ? ' scaleX(-1)' : ''}`,
      }}
    >
      <Image
        src={`/images/decor/${kind}.webp`}
        alt=""
        width={kind === 'monstera' ? 480 : 532}
        height={366}
        sizes={`${width}px`}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
