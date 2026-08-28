import Image from 'next/image';

import type { DiscoveryPhotos } from '@/lib/assets.server';
import { Icon, type IconName } from '../shared/Icon';
import { LeafDecor } from '../shared/LeafDecor';
import { Reveal } from '../shared/Reveal';
import { SectionHeading } from '../shared/SectionHeading';

/**
 * Три направления, с которых начинается поездка.
 *
 * Плитки крупные и фотографические: на этом экране человек ещё не выбирает
 * объект, он выбирает, о чём вообще думать. Третья плитка обозначена как
 * готовящаяся и не притворяется работающей ссылкой.
 */
type Tile = {
  href?: string;
  icon: IconName;
  title: string;
  note: string;
  photo: string;
  ready: boolean;
};

export function Discovery({
  hotels,
  bikes,
  photos,
}: {
  hotels: number;
  bikes: number;
  photos: DiscoveryPhotos;
}) {
  const tiles: Tile[] = [
    {
      href: '#stays',
      icon: 'bed',
      title: 'Жильё',
      note: `${hotels} мест: от койки в хостеле до виллы с бассейном`,
      photo: photos.stays,
      ready: true,
    },
    {
      href: '#rides',
      icon: 'scooter',
      title: 'Байки',
      note: `${bikes} моделей с доставкой в отель`,
      photo: photos.bikes,
      ready: true,
    },
    {
      icon: 'ticket',
      title: 'Впечатления',
      note: 'Морские выходы к архипелагу, снорклинг, перечные фермы',
      photo: photos.experiences,
      ready: false,
    },
  ];

  return (
    <section id="discovery" className="section relative overflow-hidden" aria-labelledby="discovery-title">
      <LeafDecor kind="palm" className="-right-24 top-4 hidden lg:block" width={520} opacity={0.14} rotate={-18} />
      <div className="shell">
        <SectionHeading
          id="discovery-title"
          eyebrow="С чего начать"
          title="Соберите поездку"
          accent="целиком"
        />

        <ul className="m-0 grid list-none grid-cols-1 gap-[clamp(1rem,2vw,1.5rem)] p-0 md:grid-cols-3">
          {tiles.map((tile, index) => {
            const body = (
              <>
                <div className="photo absolute inset-0">
                  <Image
                    src={tile.photo}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 92vw, 31vw"
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>

                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgb(11 48 64 / 0.82) 0%, rgb(11 48 64 / 0.25) 45%, transparent 72%)',
                  }}
                />

                <div className="relative flex h-full flex-col justify-end p-6 text-[var(--color-shell)]">
                  <span
                    className="mb-4 grid h-12 w-12 place-items-center rounded-full text-[var(--color-teal)]"
                    style={{ background: 'color-mix(in srgb, var(--color-cream) 92%, transparent)' }}
                  >
                    <Icon name={tile.icon} size={22} />
                  </span>

                  <h3 className="m-0 font-[var(--font-display)] text-[1.5rem] font-[600] leading-tight">
                    {tile.title}
                  </h3>
                  <p className="m-0 mt-1.5 max-w-[28ch] text-[0.875rem] leading-[1.45] opacity-85">
                    {tile.note}
                  </p>

                  <span
                    className={`absolute bottom-6 right-6 grid h-10 w-10 place-items-center rounded-full transition-colors duration-300 ${
                      tile.ready
                        ? 'bg-[var(--color-shell)] text-[var(--color-teal)] group-hover:bg-[var(--color-gold)]'
                        : 'border border-[color-mix(in_srgb,var(--color-cream)_45%,transparent)]'
                    }`}
                  >
                    {tile.ready ? (
                      <Icon name="arrow-right" size={18} />
                    ) : (
                      <span className="text-[0.625rem] font-[600] uppercase tracking-wide">скоро</span>
                    )}
                  </span>
                </div>
              </>
            );

            const shell =
              'group relative block aspect-[4/3] overflow-hidden rounded-[16px] no-underline sm:aspect-[3/2]';

            return (
              <Reveal as="li" key={tile.title} delay={index * 90}>
                {tile.ready ? (
                  <a href={tile.href} className={shell}>
                    {body}
                  </a>
                ) : (
                  <div className={shell} aria-disabled="true">
                    {body}
                  </div>
                )}
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
