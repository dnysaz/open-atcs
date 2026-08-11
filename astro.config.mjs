// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import atcsAi from './server/vite-plugin-ai.mjs';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss(), atcsAi()],
    server: {
      proxy: {
        // Proxy stream HLS melewati server dev kita sendiri (hanya saat `npm run dev`).
        // Server atcs.denpasarkota.go.id memakai sertifikat SSL yang kadaluarsa sehingga
        // browser menolak fetch langsung; lewat proxy ini TLS diverifikasi server (secure:false)
        // dan hls.js memuat playlist + segmen dari asal yang sama (tanpa masalah CORS).
        '/stream': {
          target: 'https://atcs.denpasarkota.go.id',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  },
});
