import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Изображения демо-каталога раздаются со стороннего плейсхолдера;
  // при переходе на своё хранилище сюда добавляется его домен.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
    // Кадр первого экрана раздаётся качеством выше обычного: это фотография
    // во весь экран, и на ней видны артефакты сжатия.
    qualities: [75, 88],
  },
};

export default nextConfig;
