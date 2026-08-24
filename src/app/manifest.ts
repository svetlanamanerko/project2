import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Мастерская уроков',
    short_name: 'Мастерская',
    description: 'Единый центр подготовки уроков и памяти курсов',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f7fc',
    theme_color: '#6f65f6',
    lang: 'ru',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
