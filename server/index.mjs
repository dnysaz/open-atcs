/*
 * ATCS TV — Server standalone Analisis AI (opsional).
 *
 * Catatan: untuk MODE DEV cukup jalankan `npm run dev` saja —
 * endpoint AI sudah terpasang di dev server lewat vite-plugin-ai.mjs.
 * Server ini berguna untuk produksi / `npm run preview`.
 *
 * Jalankan:  node server/index.mjs   (baca API key dari server/.env)
 * Endpoint:  GET /api/analyze?cam=...  |  GET /api/latest?cam=...  |  GET /api/health
 */
import http from 'node:http';
import { analyze, latest, API_KEY, MODEL, isValidCam } from './ai-core.mjs';

const PORT = Number(process.env.PORT || 8787);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(data));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'method tidak didukung' });

    if (url.pathname === '/api/health') {
      return json(res, 200, { ok: true, keySet: !!API_KEY, model: MODEL });
    }

    const cam = url.searchParams.get('cam');
    if (url.pathname === '/api/analyze' || url.pathname === '/api/latest') {
      if (!cam) return json(res, 400, { error: 'parameter cam wajib diisi' });
      if (!isValidCam(cam)) return json(res, 400, { error: 'cam tidak valid' });

      if (url.pathname === '/api/latest') {
        const c = latest(cam);
        return c ? json(res, 200, c) : json(res, 200, { belumAda: true });
      }

      if (!API_KEY) return json(res, 500, { error: 'GOOGLE_API_KEY belum diisi di server/.env' });

      try {
        return json(res, 200, { ok: true, ...(await analyze(cam)) });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }

    return json(res, 404, { error: 'not found' });
  })
  .listen(PORT, () => {
    console.log(`[ATCS AI] server jalan di http://localhost:${PORT}`);
    console.log(`[ATCS AI] model=${MODEL} apiKey=${API_KEY ? 'OK' : 'BELUM DIISI'}`);
  });
