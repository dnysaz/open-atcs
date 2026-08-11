/*
 * ATCS TV — Plugin Vite: endpoint Analisis AI + proxy stream di dev/preview server Astro.
 * Dengan ini, `npm run dev` sudah menyertakan AI — tanpa terminal/server terpisah.
 *
 * Endpoint:
 *   GET  /api/analyze?cam=...  → mode VIDEO (ffmpeg, dev lokal)
 *   POST /api/analyze          → mode FRAMES (dipakai build produksi & preview)
 *   GET  /api/latest?cam=...   → hasil cache terakhir
 *   GET  /api/health
 *   GET  /stream/*             → proxy HLS (sertifikat SSL atcs kadaluarsa)
 */
import http from 'node:http';
import https from 'node:https';
import { analyze, analyzeFrames, latest, API_KEY, MODEL, isValidCam } from './ai-core.mjs';

const UPSTREAM = 'https://atcs.denpasarkota.go.id';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5e6) req.destroy(); // batas 5MB
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// Proxy HLS: same-origin /stream/* → atcs (TLS tidak diverifikasi)
function proxyStream(req, res) {
  const seg = (req.url || '').replace(/^\/stream\/?/, '');
  if (!seg || !/^[A-Za-z0-9./_-]+$/.test(seg)) return json(res, 400, { error: 'path stream tidak valid' });
  const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `${UPSTREAM}/stream/${seg}${qs}`;
  const up = https.request(target, { method: 'GET', rejectUnauthorized: false, timeout: 15000 }, (upRes) => {
    const ct = upRes.headers['content-type'] || 'application/octet-stream';
    res.statusCode = upRes.statusCode || 502;
    res.setHeader('Content-Type', ct);
    cors(res);
    res.setHeader('Cache-Control', ct.includes('mpegurl') || ct.includes('m3u') ? 'no-store' : 'public, max-age=30');
    upRes.on('error', () => {
      if (!res.headersSent) json(res, 502, { error: 'upstream error' });
      else res.end();
    });
    upRes.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('upstream timeout')));
  up.on('error', () => {
    if (!res.headersSent) json(res, 502, { error: 'gagal terhubung ke server stream' });
    else res.end();
  });
  up.end();
}

async function handle(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Proxy stream HLS (mount di root '/stream')
  if (req.url?.startsWith('/stream/')) {
    return proxyStream(req, res);
  }

  // ---- /api/* (prefix '/api' sudah dipotong connect) ----
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, keySet: !!API_KEY, model: MODEL });
  }

  const cam = url.searchParams.get('cam');
  if (url.pathname === '/latest') {
    if (!isValidCam(cam)) return json(res, 400, { error: 'cam tidak valid' });
    const c = latest(cam);
    return c ? json(res, 200, c) : json(res, 200, { belumAda: true });
  }

  if (url.pathname === '/analyze') {
    // Mode frames (POST, build produksi / preview)
    if (req.method === 'POST') {
      const body = await readBody(req);
      const frames = body.frames;
      const c = body.cam;
      if (!isValidCam(c)) return json(res, 400, { error: 'cam tidak valid' });
      if (!Array.isArray(frames) || frames.length < 2 || frames.length > 8) {
        return json(res, 400, { error: 'frames harus array 2-8 gambar' });
      }
      if (frames.some((f) => typeof f !== 'string' || f.length < 100 || f.length > 350000)) {
        return json(res, 400, { error: 'frame tidak valid (harus base64 JPEG)' });
      }
      if (!API_KEY) return json(res, 500, { error: 'GOOGLE_API_KEY belum diisi di server/.env' });
      try {
        const r = await analyzeFrames(c, frames, Number(body.durasiDetik) || frames.length);
        return json(res, 200, { ok: true, ...r });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }
    // Mode video (GET, dev lokal)
    if (req.method === 'GET') {
      if (!isValidCam(cam)) return json(res, 400, { error: 'cam tidak valid' });
      if (!API_KEY) return json(res, 500, { error: 'GOOGLE_API_KEY belum diisi di server/.env' });
      try {
        return json(res, 200, { ok: true, ...(await analyze(cam)) });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }
    return json(res, 405, { error: 'method tidak didukung' });
  }

  return json(res, 404, { error: 'not found' });
}

export default function atcsAiPlugin() {
  return {
    name: 'atcs-ai-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => handle(req, res));
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/stream/')) handle(req, res);
        else next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', (req, res) => handle(req, res));
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/stream/')) handle(req, res);
        else next();
      });
    },
  };
}
