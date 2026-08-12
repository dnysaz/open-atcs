import raw from './cameras-bali.json';

export interface BaliCamera {
  id: number;
  cam: string; // route id unik
  ch_id: string;
  namaAlias: string;
  namaLokasi: string;
  ketLokasi: string;
  kategori: string;
  lat: number | null;
  lon: number | null;
  kind: 'hls' | 'mp4';
  codec: string;
  status: 'ok' | 'offline';
  stream: string; // path same-origin (/bali-stream/...) atau URL mp4 langsung
  url: string; // tautan asli upstream
  playerUrl: string; // tautan player resmi
}

export interface BaliCategory {
  name: string;
  count: number;
}

const data = raw as { source: string; generatedAt: string; cameras: BaliCamera[] };

export const baliCameras: BaliCamera[] = data.cameras;

export function baliCameraByCam(cam: string): BaliCamera | undefined {
  return baliCameras.find((c) => c.cam === cam);
}

export function baliCodecLabel(c: BaliCamera): string {
  if (c.kind === 'mp4') return 'MP4';
  const codec = c.codec.toLowerCase();
  if (codec.startsWith('hvc1') || codec.startsWith('hev1')) return 'HEVC';
  if (codec.startsWith('avc1')) return 'H.264';
  return 'Live';
}

export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

const CATEGORY_ORDER = [
  'Pantai',
  'Pura & Tempat Suci',
  'Simpang',
  'Pasar',
  'Taman',
  'Underpass',
  'Terminal',
  'Ruas Jalan',
  'Instansi & Fasilitas',
  'Lokasi Umum',
];

export function baliCategories(): BaliCategory[] {
  const counts = new Map<string, number>();
  for (const c of baliCameras) counts.set(c.kategori, (counts.get(c.kategori) || 0) + 1);
  const names = [...counts.keys()];
  names.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return (counts.get(b) || 0) - (counts.get(a) || 0);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return names.map((name) => ({ name, count: counts.get(name) || 0 }));
}

export function baliCategoryIcon(name: string): string {
  const map: Record<string, string> = {
    Pantai: 'anchor',
    'Pura & Tempat Suci': 'landmark',
    Simpang: 'route',
    Pasar: 'store',
    Taman: 'tree',
    Underpass: 'route',
    Terminal: 'bus',
    'Ruas Jalan': 'map',
    'Instansi & Fasilitas': 'users',
    'Lokasi Umum': 'more',
  };
  return map[name] || 'more';
}

export function baliRelated(cam: string, n = 48): BaliCamera[] {
  const self = baliCameraByCam(cam);
  if (!self) return [];
  const same = baliCameras.filter((c) => c.cam !== cam && c.kategori === self.kategori);
  const other = baliCameras.filter((c) => c.cam !== cam && c.kategori !== self.kategori);
  const sortFn = (a: BaliCamera, b: BaliCamera) => a.id - b.id;
  return [...same.sort(sortFn), ...other.sort(sortFn)].slice(0, n);
}

export function baliSearchText(c: BaliCamera): string {
  return `${c.namaAlias} ${c.namaLokasi} ${c.kategori} ${c.ch_id}`.toLowerCase();
}
