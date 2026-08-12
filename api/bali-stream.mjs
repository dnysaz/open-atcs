/*
 * CCTV Bali — Proxy stream HLS/MP4 di Vercel (fungsi serverless).
 *
 * Kenapa perlu proxy: server transcode.baliprov.go.id mengirim header
 * `Access-Control-Allow-Origin` DUPLIKAT ("*, *") yang ditolak browser (CORS
 * policy: multiple values tidak diizinkan). Dengan melewati proxy ini, header
 * CORS ditulis ulang menjadi satu nilai "*", dan sertifikat self-signed
 * diabaikan (rejectUnauthorized:false) — persis pola api/stream.mjs milik ATCS.
 *
 * Routing: vercel.json me-rewrite /bali-stream/:path* → /api/bali-stream?path=:path*
 * Playlist memakai segmen RELATIF (video1_stream.m3u8, *.mp4, *.m4s), jadi
 * hls.js otomatis meminta segmen ke path yang sama (same-origin).
 */
import https from 'node:https';

const UPSTREAM = 'https://transcode.baliprov.go.id';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

export default function handler(req, res) {
  let seg = String(req.query?.path || '').replace(/^\/+/, '');
  if (!seg) {
    seg = (req.url || '').replace(/^\/api\/bali-stream\/?/, '').split('?')[0];
  }
  if (!seg || !/^[A-Za-z0-9./_-]+$/.test(seg)) {
    return json(res, 400, { error: 'path stream tidak valid' });
  }
  const params = new URL(req.url || '', 'http://localhost').searchParams;
  params.delete('path');
  const qs = params.toString();
  const target = `${UPSTREAM}/${seg}${qs ? '?' + qs : ''}`;

  const up = https.request(
    target,
    {
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 20000,
      headers: { 'User-Agent': 'ATCS-TV-Bali/1.0' },
    },
    (upRes) => {
      const ct = upRes.headers['content-type'] || 'application/octet-stream';
      res.statusCode = upRes.statusCode || 502;
      res.setHeader('Content-Type', ct);
      // Satu header CORS saja — ini inti perbaikan (server upstream mengirim dobel)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cache-Control', ct.includes('mpegurl') || ct.includes('m3u') ? 'no-store' : 'public, max-age=30');
      upRes.on('error', () => {
        if (!res.headersSent) json(res, 502, { error: 'upstream error' });
        else res.end();
      });
      upRes.pipe(res);
    }
  );
  up.on('timeout', () => up.destroy(new Error('upstream timeout')));
  up.on('error', () => {
    if (!res.headersSent) json(res, 502, { error: 'gagal terhubung ke server stream' });
    else res.end();
  });
  up.end();
}
