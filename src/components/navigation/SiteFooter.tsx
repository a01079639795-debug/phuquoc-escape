import { Icon } from '../shared/Icon';

export function SiteFooter() {
  return (
    <footer className="bg-[var(--color-teal)] pb-[clamp(2rem,4vw,3rem)] pt-[clamp(2.5rem,5vw,4rem)] text-[color-mix(in_srgb,var(--color-cream)_80%,transparent)]">
      <div className="shell">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[38ch]">
            <p className="m-0 flex items-center gap-2.5 text-[var(--color-cream)]">
              <Icon name="palm" size={26} className="text-[var(--color-gold)]" />
              <span className="font-[var(--font-display)] text-[1.15rem] font-[700] uppercase tracking-[0.06em]">
                Phú Quốc
              </span>
              <span className="script text-[1.1rem] opacity-85">escape</span>
            </p>
            <p className="m-0 mt-4 text-[0.9375rem] leading-[1.55]">
              Жильё и байки на острове. Демонстрационная версия: данные учебные,
              заявки обрабатываются вручную.
            </p>
          </div>

          <nav aria-label="Разделы" className="flex flex-wrap gap-x-8 gap-y-3">
            {[
              { href: '/#stays', label: 'Жильё' },
              { href: '/#rides', label: 'Байки' },
              { href: '/#island', label: 'Остров' },
            ].map((link) => (
              <a
                key={link.href}
                className="text-[0.9375rem] no-underline transition-colors duration-200 hover:text-[var(--color-cream)]"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <p className="m-0 mt-10 border-t border-[color-mix(in_srgb,var(--color-cream)_16%,transparent)] pt-6 text-[0.75rem] tracking-[0.08em] opacity-65">
          {new Date().getFullYear()} · Демо-версия
        </p>
      </div>
    </footer>
  );
}
