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
        // Proxy stream CCTV Bali (transcode.baliprov.go.id): server memakai
        // sertifikat self-signed + mengirim header CORS ganda yang ditolak browser.
        // Path asli /bali-stream/cctv/{id}/... → upstream /cctv/{id}/... (prefix dibuang).
        '/bali-stream': {
          target: 'https://transcode.baliprov.go.id',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.path = proxyReq.path.replace(/^\/bali-stream/, '');
            });
            // Normalisasi CORS pada respons: ganti header ACAO (mungkin dobel "*, *"
            // dari upstream yang ditolak browser) dengan satu nilai "*".
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['access-control-allow-origin'] = '*'
                .split('\n')
                .join('');
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              delete proxyRes.headers['access-control-allow-origin']; // dedup case-insensitive
            });
          },
        },
      },
    },
  },
});
