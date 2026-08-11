/*
 * ATCS TV — Fungsi serverless Vercel: cek kesehatan.
 */
import { API_KEY, MODEL } from '../server/ai-core.mjs';

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ ok: true, keySet: !!API_KEY, model: MODEL }));
}
