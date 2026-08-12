/*
 * ATCS TV — Proxy stream HLS di Vercel (fungsi serverless).
 * Browser TIDAK bisa fetch langsung ke atcs.denpasarkota.go.id karena sertifikat SSL-nya
 * kadaluarsa, jadi semua permintaan /stream/* diteruskan lewat sini dengan verifikasi
 * TLS dimatikan (rejectUnauthorized:false), lalu respons di-pipe kembali ke klien.
 *
 * Routing: vercel.json me-rewrite /stream/:path* → /api/stream?path=:path*
 * (pendekatan query param — lebih andal daripada catch-all folder di Vercel).
 *
 * Playlist memakai segmen RELATIF (b2f1467d83cb_seg0.ts), jadi tanpa rewrite konten —
 * hls.js otomatis meminta segmen ke path yang sama (same-origin).
 */
import https from 'node:https';

const UPSTREAM = 'https://atcs.denpasarkota.go.id';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

export default function handler(req, res) {
  // query.path = bagian setelah /stream/ (mis. 'A038TOHPATIPTZ/stream.m3u8')
  let seg = String(req.query?.path || '').replace(/^\/+/, '');
  if (!seg) {
    // fallback: ambil dari req.url bila rewrite tidak mengisi query (mis. tes lokal)
    seg = (req.url || '').replace(/^\/api\/stream\/?/, '').split('?')[0];
  }
  if (!seg || !/^[A-Za-z0-9./_-]+$/.test(seg)) {
    return json(res, 400, { error: 'path stream tidak valid' });
  }
  // Pertahankan query string lain selain 'path' (hls.js jarang memakainya)
  const params = new URL(req.url || '', 'http://localhost').searchParams;
  params.delete('path');
  const qs = params.toString();
  const target = `${UPSTREAM}/stream/${seg}${qs ? '?' + qs : ''}`;

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const headers = { 'User-Agent': UA };
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;
  if (req.headers.referer) headers.Referer = req.headers.referer;

  const up = https.request(
    target,
    {
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 15000,
      headers,
    },
    (upRes) => {
      const ct = upRes.headers['content-type'] || 'application/octet-stream';
      res.statusCode = upRes.statusCode || 502;
      res.setHeader('Content-Type', ct);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      // Playlist live harus selalu segar; segmen .ts boleh di-cache singkat oleh browser
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
