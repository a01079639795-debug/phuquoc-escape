/**
 * Набор иконок.
 *
 * Все нарисованы в одной сетке 24×24 с одинаковой толщиной обводки, поэтому
 * стоят рядом ровно. Юникодные стрелки и эмодзи в интерфейсе не используются:
 * у них своя метрика в каждом шрифте, и в наборе они выглядят чужими.
 */

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  /** Толщина обводки; у заливаемых иконок не применяется. */
  stroke?: number;
};

export type IconName =
  | 'arrow-right'
  | 'arrow-left'
  | 'star'
  | 'heart'
  | 'pin'
  | 'globe'
  | 'user'
  | 'calendar'
  | 'search'
  | 'guests'
  | 'bed'
  | 'scooter'
  | 'ticket'
  | 'shield'
  | 'calendar-check'
  | 'support'
  | 'compass'
  | 'wave'
  | 'temple'
  | 'camera'
  | 'bowl'
  | 'menu'
  | 'close'
  | 'palm';

const FILLED: IconName[] = ['star', 'heart'];

const PATHS: Record<IconName, React.ReactNode> = {
  'arrow-right': (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M20 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  heart: (
    <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z" />
  ),
  pin: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  guests: (
    <>
      <circle cx="9" cy="8.4" r="3.3" />
      <path d="M3 19.6a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.3 3.3 0 0 1 0 6.4" />
      <path d="M17.6 14.4a6 6 0 0 1 3.4 5.2" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18v-8a2 2 0 0 1 2-2h9a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2v4" />
      <path d="M3 14h18M3 18h18" />
      <circle cx="7.5" cy="11.5" r="1.6" />
    </>
  ),
  scooter: (
    <>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18.5" cy="17" r="3" />
      <path d="M9 17h6.5" />
      <path d="M15.5 17 13 8H9.5" />
      <path d="M13 8h4l2 6" />
      <path d="M6 14V11h4" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-1a2.5 2.5 0 0 0 0-5Z" />
      <path d="M13 6v12" strokeDasharray="2 2.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v6c0 4.3-3 7.5-7 8.8-4-1.3-7-4.5-7-8.8V6Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  'calendar-check': (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
      <path d="m9 14.6 2 2 4-4" />
    </>
  ),
  support: (
    <>
      <path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" />
      <path d="M4.5 14h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
      <path d="M19.5 14h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.7 4.7-4.7 1.7 1.7-4.7Z" />
    </>
  ),
  wave: (
    <>
      <path d="M2.5 9.5c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 3-2" />
      <path d="M2.5 14.5c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 3-2" />
    </>
  ),
  temple: (
    <>
      <path d="M12 3 4 7.5h16Z" />
      <path d="M6 7.5V17M18 7.5V17M10 7.5V17M14 7.5V17" />
      <path d="M3 17h18M4.5 20.5h15" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.4-2.2h7.2L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9Z" />
      <path d="M9 7.5c0-1.5 1-1.8 1-3M13 7.5c0-1.5 1-1.8 1-3" />
    </>
  ),
  menu: <path d="M4 8h16M4 16h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  palm: (
    <>
      <path d="M12 21c0-5 .6-8.5 1.6-11.4" />
      <path d="M13.6 9.6C11.4 7.4 8 7 5.4 8.6" />
      <path d="M13.6 9.6c.6-3 3-5.2 6-5.6" />
      <path d="M13.6 9.6c2.6-.9 5.4-.2 7 1.7" />
      <path d="M13.6 9.6C12 6.9 9.4 5.3 6.6 5.2" />
    </>
  ),
};

export function Icon({ name, size = 20, className = '', stroke = 1.6 }: IconProps) {
  const filled = FILLED.includes(name);

  return (
    <svg
      className={`ico ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
