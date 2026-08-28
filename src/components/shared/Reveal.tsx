'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Появление блока при попадании в кадр.
 *
 * Наблюдатель отключается сразу после срабатывания: повторное появление при
 * прокрутке вверх выглядит как сбой, а не как эффект.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Задержка в миллисекундах — для лесенки внутри одной группы. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.dataset.visible = 'true';
          observer.disconnect();
        }
      },
      // Небольшой отступ снизу: блок проявляется чуть раньше, чем упрётся
      // в край экрана, иначе движение замечают уже после того, как прочли.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
