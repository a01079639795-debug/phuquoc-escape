import { Icon, type IconName } from './Icon';

/**
 * Полоса обещаний под каталогом.
 *
 * Формулировки описывают то, что действительно так и работает на этом этапе:
 * заявку обрабатывает человек, отмена до подтверждения ничего не стоит,
 * подборку делают на месте. Обещаний вроде «лучшая цена гарантирована» здесь
 * нет — их нечем подкрепить.
 */
const ITEMS: { icon: IconName; title: string; note: string }[] = [
  { icon: 'shield', title: 'Проверенные объекты', note: 'Каждый добавлен вручную' },
  { icon: 'calendar-check', title: 'Отмена без штрафа', note: 'До подтверждения брони' },
  { icon: 'support', title: 'Ответ в мессенджере', note: 'Telegram, WhatsApp, Zalo' },
  { icon: 'compass', title: 'Знаем остров', note: 'Подскажем район под маршрут' },
];

export function TrustBar() {
  return (
    <section id="about" className="bg-[var(--color-shell)]" aria-label="Как мы работаем">
      <div className="shell">
        <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-6 border-t border-[color-mix(in_srgb,var(--color-ink)_10%,transparent)] py-[clamp(1.75rem,3vw,2.5rem)] p-0 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-11 w-11 flex-none place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-teal)_28%,transparent)] text-[var(--color-teal)]">
                <Icon name={item.icon} size={20} />
              </span>
              <span className="flex flex-col">
                <span className="text-[0.9375rem] font-[600] leading-tight">{item.title}</span>
                <span className="mt-1 text-[0.8125rem] leading-[1.4] text-[var(--color-ink-soft)]">
                  {item.note}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
