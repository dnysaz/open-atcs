/*
 * ATCS TV — Plugin Vite: endpoint Analisis AI di dev server Astro.
 * Dengan ini, `npm run dev` sudah menyertakan AI — tanpa terminal/server terpisah.
 */
import { analyze, latest, API_KEY, MODEL, isValidCam } from './ai-core.mjs';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'method tidak didukung' });

  // Catatan: middleware ter-mount di '/api', jadi connect MEMOTONG prefix
  // '/api' dari req.url — pathname yang diterima di sini tanpa '/api'.
  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, keySet: !!API_KEY, model: MODEL });
  }

  const cam = url.searchParams.get('cam');
  if (url.pathname === '/analyze' || url.pathname === '/latest') {
    if (!cam) return json(res, 400, { error: 'parameter cam wajib diisi' });
    if (!isValidCam(cam)) return json(res, 400, { error: 'cam tidak valid' });

    // Pathname di sini sudah tanpa prefix '/api' (connect memotongnya).
    if (url.pathname === '/latest') {
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
}

export default function atcsAiPlugin() {
  return {
    name: 'atcs-ai-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => handle(req, res));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', (req, res) => handle(req, res));
    },
  };
}
