'use client';

import { useEffect, useState } from 'react';

import { Icon } from '../shared/Icon';
import styles from './header.module.css';

const LINKS = [
  { href: '/#stays', label: 'Жильё' },
  { href: '/#rides', label: 'Байки' },
  { href: '/#discovery', label: 'Впечатления' },
  { href: '/#island', label: 'Остров' },
  { href: '/#about', label: 'О сервисе' },
];

/** Пальма из логотипа: тот же мотив, что в марке референса. */
function Wordmark() {
  return (
    <span className={styles.brandInner}>
      <svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M16 29c0-7 .8-11.6 2.2-15.4" />
          <path d="M18.2 13.6C15.2 10.6 10.6 10 7 12.2" />
          <path d="M18.2 13.6c.8-4.1 4.1-7.1 8.2-7.6" />
          <path d="M18.2 13.6c3.5-1.2 7.4-.3 9.6 2.3" />
          <path d="M18.2 13.6C16 9.9 12.5 7.7 8.7 7.6" />
        </g>
      </svg>
      <span className={styles.brandText}>
        <span className={styles.brandName}>Phú Quốc</span>
        <span className={styles.brandSub}>escape</span>
      </span>
    </span>
  );
}

export function SiteHeader() {
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const write = () => {
      frame = 0;
      setSolid(window.scrollY > 80);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(write);
    };
    write();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className={`${styles.header} ${solid ? styles.solid : ''}`}>
      <div className={`shell ${styles.bar}`}>
        <a className={styles.brand} href="/#top" aria-label="Фукуок, на главную">
          <Wordmark />
        </a>

        <nav className={styles.nav} aria-label="Разделы сайта">
          {LINKS.map((link) => (
            <a key={link.href} className={styles.navLink} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className={styles.tail}>
          <button type="button" className={styles.lang} aria-label="Язык интерфейса: русский">
            <Icon name="globe" size={17} />
            <span>RU</span>
          </button>

          <a className={styles.signIn} href="/#stays">
            <Icon name="user" size={17} />
            <span>Войти</span>
          </a>

          {/*
            Размещение объектов владельцами — следующий этап, интерфейса пока
            нет. Пока его нет, это не кнопка: нажимать не на что, и обещать
            нажатие нечестно. Останется объявлением до появления кабинета.
          */}
          <span className={`btn btn-white ${styles.cta}`} data-soon="true">
            Разместить объект
            <span className={styles.soon}>скоро</span>
          </span>

          <button
            type="button"
            className={styles.burger}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? 'Закрыть меню' : 'Открыть меню'}</span>
            <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      <div id="mobile-menu" className={styles.sheet} data-open={menuOpen} hidden={!menuOpen}>
        <nav className={styles.sheetNav} aria-label="Меню">
          {LINKS.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.sheetLink}
              style={{ transitionDelay: `${60 + index * 55}ms` }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
              <Icon name="arrow-right" size={20} />
            </a>
          ))}
        </nav>
        <div className={styles.sheetFoot}>
          <a className="btn btn-gold" href="/#stays" onClick={() => setMenuOpen(false)}>
            Смотреть жильё
          </a>
          <a className="btn btn-line" href="/#stays" onClick={() => setMenuOpen(false)}>
            Войти
          </a>
        </div>
      </div>
    </header>
  );
}
