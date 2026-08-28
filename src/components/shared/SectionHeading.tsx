import type { ReactNode } from 'react';

/**
 * Заголовок раздела по референсу: надзаголовок, затем заголовок антиквой с
 * рукописным словом-акцентом. Рукописное слово несёт смысл, а не украшает:
 * оно называет адресата или суть («для вас», «острова»).
 */
export function SectionHeading({
  eyebrow,
  title,
  accent,
  lede,
  action,
  tone = 'light',
  id,
}: {
  eyebrow: string;
  title: string;
  /** Рукописное продолжение заголовка. */
  accent?: string;
  lede?: string;
  action?: ReactNode;
  /** light — тёмный текст на кремовом, dark — светлый на бирюзе. */
  tone?: 'light' | 'dark';
  id?: string;
}) {
  const muted = tone === 'dark' ? 'text-[color-mix(in_srgb,var(--color-cream)_78%,transparent)]' : '';

  return (
    <header className="mb-[clamp(1.75rem,3.5vw,2.75rem)] flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className={`eyebrow ${muted}`} style={tone === 'dark' ? { color: 'inherit' } : undefined}>
          {eyebrow}
        </p>
        <h2 id={id} className="h-section">
          {title}
          {accent ? (
            <>
              {' '}
              <span className="script text-[var(--color-ember)]" style={{ fontSize: '1.15em' }}>
                {accent}
              </span>
            </>
          ) : null}
        </h2>
        {lede ? <p className={`lede mt-3 ${muted}`}>{lede}</p> : null}
      </div>

      {action ? <div className="flex-none">{action}</div> : null}
    </header>
  );
}
