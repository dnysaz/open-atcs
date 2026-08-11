/*
 * ATCS TV — Inti logika Analisis AI (dipakai bersama)
 * Dipakai oleh: server/index.mjs (server standalone) & vite-plugin-ai.mjs (dev server Astro)
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- env (.env di folder server, tanpa dependency) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
export const CAPTURE_SECONDS = Number(process.env.CAPTURE_SECONDS || 30);

const CACHE_MS = 60000; // jangan analisis ulang < 60 detik (hemat kuota Gemini gratis)
const STREAM_BASE = 'https://atcs.denpasarkota.go.id/stream';

const cache = new Map(); // cam -> { at, result }
const busy = new Map(); // cam -> Promise (cegah duplikat bersamaan)

// ---------- capture clip via ffmpeg ----------
function captureClip(cam, url) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `atcs-${cam}-${Date.now()}.mp4`);
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-rw_timeout', '15000000', '-fflags', 'nobuffer',
      '-i', url,
      '-t', String(CAPTURE_SECONDS),
      '-vf', 'scale=640:-2', '-r', '5',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
      '-an', '-movflags', '+faststart',
      tmp,
    ];
    execFile('ffmpeg', args, { timeout: 60000 }, (err) => {
      if (err) {
        fs.rmSync(tmp, { force: true });
        return reject(new Error('ffmpeg gagal: ' + (err.message || err)));
      }
      if (!fs.existsSync(tmp)) return reject(new Error('clip tidak dibuat'));
      resolve(tmp);
    });
  });
}

// Panggil Gemini dengan retry TUNGGAL saat gagal yang bisa dipulihkan: kuota habis (429)
// atau respons terpotong oleh batas token (MAX_TOKENS). Setiap retry = 1 request kuota,
// jadi total dibatasi 2 percobaan.
async function askGeminiWithRetry(clipPath) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await askGemini(clipPath);
    } catch (e) {
      const retryable = e?.status === 429 || e?.truncated;
      if (!retryable) throw e;
      if (attempt === 1) throw e; // 2 percobaan cukup; biarkan error tampil
      const waitMs = Math.min(35000, Math.max(5000, (e.retryAfter || 10) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// ---------- panggil Gemini ----------
async function askGemini(clipPath) {
  const b64 = fs.readFileSync(clipPath).toString('base64');
  const body = {
    // Aturan & skema JSON dipisah ke systemInstruction (peran system),
    // user prompt hanya berisi perintah singkat — model lebih patuh pada struktur ini.
    systemInstruction: {
      role: 'system',
      parts: [
        {
          text:
            'Kamu adalah sistem analis lalu lintas berbantuan kecerdasan buatan yang teliti dan singkat.\n' +
            'ATURAN KETAT (HARUS DIIKUTI):\n' +
            '1. Output HANYA satu objek JSON yang valid — TANPA markdown, TANPA penjelasan, TANPA narasi ' +
            'frame-by-frame, TANPA teks tambahan apa pun di luar JSON.\n' +
            '2. Hitung kendaraan per jenis (mobil, motor, truk, bus, pickup, sepeda, pejalan kaki); ' +
            'total = jumlah seluruh kendaraan.\n' +
            '3. Jika pandangan terhalang, perkirakan jumlah yang wajar; jangan mengarang angka ekstrem.\n' +
            '4. Tulis JSON dalam SATU BARIS (tanpa indentasi/baris baru) agar hemat token.\n' +
            '5. Mulai langsung dari karakter { — TANPA teks pembuka apa pun (mis. jangan tulis "Berikut hasilnya:").\n' +
            '6. kesimpulan, proyeksi, dan rekomendasi masing-masing TEPAT 1 kalimat pendek (kesimpulan maks 180 karakter; proyeksi & rekomendasi maks 150 karakter).\n' +
            'Format JSON (persis, semua kunci wajib):\n' +
            '{"mobil":0,"motor":0,"truk":0,"bus":0,"pickup":0,"sepeda":0,"pejalan_kaki":0,"total":0,' +
            '"kepadatan":"rendah","kecepatanRata":30,"keyakinan":85,' +
            '"kesimpulan":"kesimpulan formal/akademik dalam Bahasa Indonesia, 1-2 kalimat, TANPA kata AI",' +
            '"prediksi":{"tren":"stabil","probNaik":50,"probMacet":20,' +
            '"proyeksi":"prediksi singkat 30 menit","rekomendasi":"saran singkat untuk pengendara"}}.\n' +
            'Aturan nilai: kepadatan "rendah" jika sedikit kendaraan, "sedang", "tinggi", atau "macet" ' +
            'jika padat/berhenti. kecepatanRata: 0-80 km/jam. keyakinan: 0-100. ' +
            'prediksi.tren: "naik"/"stabil"/"turun". probNaik: probabilitas (0-100) volume lalu lintas ' +
            'meningkat dalam 30 menit. probMacet: probabilitas (0-100) terjadi kemacetan/antrean panjang dalam 30 menit. ' +
            'kesimpulan harus berbahasa Indonesia ragam akademik, diawali "Berdasarkan observasi...".',
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Tonton video CCTV ini selama durasinya. Hitung kendaraan per jenis yang lewat, lalu keluarkan ' +
              'JSON sesuai format yang ditentukan di instruksi sistem.',
          },
          { inline_data: { mime_type: 'video/mp4', data: b64 } },
        ],
      },
    ],
    // maxOutputTokens = hard limit terhadap teks "bandel" (cegah runaway ribuan token),
    // tapi cukup lebar: JSON kita ±400-600 token; cap 2000 menoleransi model yang menulis
    // teks pembuka singkat tanpa membuat pengguna melihat error terpotong.
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2000 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const json = await res.json();
  if (!res.ok) {
    const errMsg = json?.error?.message || res.statusText;
    const e = new Error('Gemini error ' + res.status + ': ' + errMsg);
    if (res.status === 429) {
      // Detail error Google memuat retryDelay (format "4.316142143s") → dipakai untuk menunggu.
      const raw = json?.error?.details?.[0]?.retryDelay;
      const sec = typeof raw === 'string' ? parseFloat(raw) : NaN;
      e.status = 429;
      e.retryAfter = Number.isFinite(sec) && sec > 0 ? sec : 5;
    }
    throw e;
  }
  const text =
    json?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '';
  // finishReason 'MAX_TOKENS' = respons dipotong paksa oleh maxOutputTokens → pesan khusus.
  const truncated = json?.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  // Hapus pembungkus code-fence (```json ... ```) jika ada.
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: ambil dari '{' pertama hingga '}' terakhir — tahan terhadap teks
    // tambahan/penutup yang ikut dalam respons (penyebab 502 kemarin).
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    const prefix = truncated
      ? 'Respons Gemini terpotong (batas token): '
      : 'Respons Gemini tidak valid: ';
    const makeErr = (msg) => {
      const e = new Error(msg);
      if (truncated) e.truncated = true; // dipakai retry otomatis
      return e;
    };
    if (first !== -1 && last > first) {
      try {
        parsed = JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        throw makeErr(prefix + cleaned.slice(0, 200) + '…');
      }
    } else {
      throw makeErr(prefix + cleaned.slice(0, 200));
    }
  }
  return normalize(parsed);
}

function normalize(p) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const mobil = num(p.mobil);
  const motor = num(p.motor);
  const truk = num(p.truk);
  const bus = num(p.bus);
  const pickup = num(p.pickup);
  const sepeda = num(p.sepeda);
  const pejalanKaki = num(p.pejalan_kaki);
  const total = num(p.total) || mobil + motor + truk + bus + pickup + sepeda + pejalanKaki;
  const kepadatan = ['rendah', 'sedang', 'tinggi', 'macet'].includes(String(p.kepadatan).toLowerCase())
    ? String(p.kepadatan).toLowerCase()
    : 'sedang';
  const pred = p.prediksi && typeof p.prediksi === 'object' ? p.prediksi : {};
  const tren = ['naik', 'stabil', 'turun'].includes(String(pred.tren).toLowerCase())
    ? String(pred.tren).toLowerCase()
    : 'stabil';
  const perMenit = (n) => Math.round((n * 60) / CAPTURE_SECONDS);
  return {
    mobil, motor, truk, bus, pickup, sepeda, pejalanKaki,
    total,
    kepadatan,
    kecepatanRata: Math.round(clamp(p.kecepatanRata, 0, 80)),
    keyakinan: Math.round(clamp(p.keyakinan, 0, 100)),
    kesimpulan: String(p.kesimpulan || p.deskripsi || '').slice(0, 400),
    durasiDetik: CAPTURE_SECONDS,
    perMenit: {
      mobil: perMenit(mobil),
      motor: perMenit(motor),
      truk: perMenit(truk),
      bus: perMenit(bus),
      pickup: perMenit(pickup),
      sepeda: perMenit(sepeda),
      pejalanKaki: perMenit(pejalanKaki),
      total: perMenit(total),
    },
    prediksi: {
      tren,
      probNaik: Math.round(clamp(pred.probNaik, 0, 100)),
      probMacet: Math.round(clamp(pred.probMacet, 0, 100)),
      proyeksi: String(pred.proyeksi || '').slice(0, 300),
      rekomendasi: String(pred.rekomendasi || '').slice(0, 300),
    },
  };
}

export function latest(cam) {
  const c = cache.get(cam);
  return c ? { ...c.result, at: c.at } : null;
}

export async function analyze(cam) {
  if (busy.has(cam)) return busy.get(cam);
  const p = (async () => {
    const cached = cache.get(cam);
    if (cached && Date.now() - cached.at < CACHE_MS) return { ...cached.result, cache: true, at: cached.at };
    const url = `${STREAM_BASE}/${cam}/stream.m3u8`;
    const clip = await captureClip(cam, url);
    try {
      const result = await askGeminiWithRetry(clip);
      const at = Date.now();
      cache.set(cam, { at, result });
      return { ...result, cache: false, at };
    } finally {
      fs.rmSync(clip, { force: true });
    }
  })().finally(() => busy.delete(cam));
  busy.set(cam, p);
  return p;
}

export function isValidCam(cam) {
  return typeof cam === 'string' && /^[A-Za-z0-9-]+$/.test(cam);
}
