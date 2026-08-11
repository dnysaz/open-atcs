/*
 * ATCS TV — Fungsi serverless Vercel: analisis AI mode FRAMES.
 * Browser mengirim deretan gambar JPEG (base64) dari video yang sedang diputar,
 * fungsi ini meneruskan ke Gemini. Tanpa ffmpeg — cocok untuk limit Hobby (10 dtk).
 *
 * POST /api/analyze
 * body: { cam, frames: [base64jpeg,...], durasiDetik }
 */
import { analyzeFrames, isValidCam, API_KEY, MODEL } from '../server/ai-core.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'gunakan metode POST' }));
  }

  const body = req.body || {};
  const cam = body.cam;
  const frames = body.frames;
  const durasiDetik = Number(body.durasiDetik) || 0;

  if (!isValidCam(cam)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'cam tidak valid' }));
  }
  // Maks 8 frame × ~350KB base64 ≈ 2.8MB — masih jauh di bawah limit body 4.5MB Vercel
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 8) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'frames harus array 2-8 gambar' }));
  }
  if (frames.some((f) => typeof f !== 'string' || f.length < 100 || f.length > 350000)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'frame tidak valid (harus base64 JPEG)' }));
  }
  if (!API_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'GOOGLE_API_KEY belum diisi di environment Vercel' }));
  }

  try {
    const result = await analyzeFrames(cam, frames, durasiDetik);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, ...result, model: MODEL }));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e.message }));
  }
}
