#!/usr/bin/env python3
"""
Generate thumbnail frames from each ATCS HLS stream into public/thumbs/{cam}.jpg

Usage:
    python3 scripts/generate-thumbs.py          # isi yang belum ada saja
    python3 scripts/generate-thumbs.py --force  # generate ulang semua kamera aktif
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "src", "lib", "cameras.json")
OUT = os.path.join(BASE, "public", "thumbs")

FORCE = "--force" in sys.argv


def grab(cam: str, url: str, out: str) -> bool:
    t0 = time.time()
    r = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-rw_timeout",
            "15000000",
            "-fflags",
            "nobuffer",
            "-i",
            url,
            "-ss",
            "1",
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            "-q:v",
            "6",
            out,
        ],
        capture_output=True,
        text=True,
    )
    dt = time.time() - t0
    ok = os.path.exists(out) and os.path.getsize(out) > 0
    status = "OK   " if ok else "GAGAL"
    extra = "" if ok else f" {r.stderr.strip()[-140:]}"
    print(f"{status} {cam:<24} ({dt:.1f}s){extra}", flush=True)
    return ok


def main() -> None:
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    cams = data["cameras"]
    os.makedirs(OUT, exist_ok=True)

    seen: set[str] = set()
    jobs: list[tuple[str, str, str]] = []
    for c in cams:
        if c.get("status") != "ok":
            continue
        cam = c["cam"]
        if cam in seen:
            continue
        seen.add(cam)
        url = c["url"]
        # Perbaiki typo double-slash pada beberapa URL
        url = url.replace(
            "https://atcs.denpasarkota.go.id//stream/",
            "https://atcs.denpasarkota.go.id/stream/",
        )
        out = os.path.join(OUT, f"{cam}.jpg")
        if not FORCE and os.path.exists(out):
            continue
        jobs.append((cam, url, out))

    print(f"{len(jobs)} thumbnail akan dibuat (kamera aktif: {len(seen)})", flush=True)
    if not jobs:
        print("Semua thumbnail sudah ada. Gunakan --force untuk generate ulang.")
        return

    t0 = time.time()
    ok = 0
    with ThreadPoolExecutor(max_workers=3) as ex:
        for res in ex.map(lambda j: grab(*j), jobs):
            if res:
                ok += 1
    print(
        f"\nSelesai: {ok}/{len(jobs)} berhasil dalam {time.time() - t0:.0f}s."
        " Thumbnail tersimpan di public/thumbs/",
        flush=True,
    )


if __name__ == "__main__":
    main()
