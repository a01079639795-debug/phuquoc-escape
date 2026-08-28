import { notFound } from 'next/navigation';

import { ListingDetail } from '@/components/listings/ListingDetail';
import { SiteFooter } from '@/components/navigation/SiteFooter';
import { SiteHeader } from '@/components/navigation/SiteHeader';
import { catalog, NotFoundError } from '@/server';

// Каталог меняется из админки, поэтому страница собирается по запросу.
export const dynamic = 'force-dynamic';

/** Заголовок вкладки и описание для выдачи берутся из самого объекта. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const listing = await catalog.getListingBySlug(slug);
    return {
      title: listing.metaTitle ?? listing.title,
      description: listing.metaDescription ?? listing.shortDescription ?? undefined,
    };
  } catch {
    return { title: 'Объект не найден' };
  }
}


export default async function HotelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const listing = await catalog.getListingBySlug(slug);
    if (listing.type !== 'HOTEL') notFound();

    return (
      <>
        <SiteHeader />
        <main id="main">
          <ListingDetail listing={listing} />
        </main>
        <SiteFooter />
      </>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
