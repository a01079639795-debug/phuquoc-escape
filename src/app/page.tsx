import { Discovery } from '@/components/discovery/Discovery';
import { IslandSection } from '@/components/explore/IslandSection';
import { Hero } from '@/components/hero/Hero';
import { StaysSection } from '@/components/listings/hotels/StaysSection';
import { RidesSection } from '@/components/listings/motorbikes/RidesSection';
import { SiteFooter } from '@/components/navigation/SiteFooter';
import { SiteHeader } from '@/components/navigation/SiteHeader';
import { TrustBar } from '@/components/shared/TrustBar';
import { discoveryPhotos, heroPhoto } from '@/lib/assets.server';
import { liveHeroScene } from '@/lib/hero-scene.server';
import { catalog } from '@/server';

/**
 * Главная.
 *
 * Данные берутся прямо из service layer, а не через собственный HTTP API:
 * это один процесс, и сетевой круг к самому себе только добавил бы задержку.
 * Внешний API остаётся для клиентов, которые не живут внутри приложения.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [stays, bikes, areas] = await Promise.all([
    catalog.searchListings({ type: 'HOTEL', perPage: 50, sort: 'recommended' }),
    catalog.listBikes(12),
    catalog.listAreas(),
  ]);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <span id="top" />
        <Hero areas={areas} photo={heroPhoto()} scene={liveHeroScene()} />
        <Discovery hotels={stays.meta.total} bikes={bikes.length} photos={discoveryPhotos()} />
        <StaysSection hotels={stays.data} areas={areas} />
        <RidesSection bikes={bikes} />
        <IslandSection areas={areas} />
        <TrustBar />
      </main>

      <SiteFooter />
    </>
  );
}
