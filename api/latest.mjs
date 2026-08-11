/*
 * ATCS TV — Fungsi serverless Vercel: hasil analisis terbaru dari cache dalam proses.
 * Catatan: di serverless, cache hanya hidup per-instance & per-invocation — hasil dari
 * analisis baru mungkin tidak tersedia di instance lain. Frontend tetap memakai
 * localStorage sebagai sumber utama, endpoint ini hanya bonus.
 */
import { latest, isValidCam } from '../server/ai-core.mjs';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'gunakan metode GET' }));
  }
  const cam = req.query?.cam;
  if (!isValidCam(cam)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'cam tidak valid' }));
  }
  const c = latest(cam);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(c ? c : { belumAda: true }));
}
