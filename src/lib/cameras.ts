import raw from './cameras.json';

export interface Camera {
  id: number;
  namaLokasi: string;
  ketLokasi: string;
  namaAlias: string;
  cam: string;
  url: string;
  status: 'ok' | 'offline';
  type: 'ptz' | 'panoramic';
  lat: number | null;
  lon: number | null;
  kategori: string;
  deskripsi: string;
  tahun: number | null;
}

export interface Category {
  name: string;
  count: number;
}

const data = raw as { generatedAt: string; cameras: Camera[] };

export const cameras: Camera[] = data.cameras;

export function cameraByCam(cam: string): Camera | undefined {
  return cameras.find((c) => c.cam === cam);
}

export function onlineCount(): number {
  return cameras.filter((c) => c.status === 'ok').length;
}

export function offlineCount(): number {
  return cameras.length - onlineCount();
}

export function typeLabel(c: Camera): string {
  return c.type === 'panoramic' ? '360°' : 'PTZ';
}

export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

const CATEGORY_ORDER = [
  'Simpang',
  'Ruas Jalan',
  'Pasar',
  'Terminal',
  'Pelabuhan',
  'Bundaran',
  'Patung',
  'Banjar',
  'Lapangan',
  'Taman',
  'Instansi Publik',
  'Jalan Lain',
];

export function categories(): Category[] {
  const counts = new Map<string, number>();
  for (const c of cameras) counts.set(c.kategori, (counts.get(c.kategori) || 0) + 1);
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

export function categoryIcon(name: string): string {
  const map: Record<string, string> = {
    Simpang: 'route',
    'Ruas Jalan': 'map',
    Pasar: 'store',
    Terminal: 'bus',
    Pelabuhan: 'anchor',
    Bundaran: 'disc',
    Patung: 'landmark',
    Banjar: 'users',
    Lapangan: 'flag',
    Taman: 'tree',
    'Instansi Publik': 'landmark',
    'Jalan Lain': 'more',
  };
  return map[name] || 'more';
}

export function relatedCams(cam: string, n = 24): Camera[] {
  const self = cameraByCam(cam);
  if (!self) return [];
  const same = cameras.filter((c) => c.cam !== cam && c.kategori === self.kategori);
  const other = cameras.filter((c) => c.cam !== cam && c.kategori !== self.kategori);
  const sortFn = (a: Camera, b: Camera) =>
    Number(b.status === 'ok') - Number(a.status === 'ok') || a.id - b.id;
  return [...same.sort(sortFn), ...other.sort(sortFn)].slice(0, n);
}

export function searchText(c: Camera): string {
  return `${c.namaAlias} ${c.namaLokasi} ${c.cam}`.toLowerCase();
}
