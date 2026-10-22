#!/usr/bin/env python3
"""Acquire source bytes privately; never called by normal check/build."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ('bag', 'https://www.bag.admin.ch/de/krankenversicherung-pflegeleistungen', 'bag.html'),
    ('products', 'https://besaqsys.ch/produkte', 'products.html'),
    ('besa', 'https://besaqsys.ch/besa-leistungen', 'besa.html'),
    ('klv', 'https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1995/4964_4964_4964/20260701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1995-4964_4964_4964-20260701-de-pdf-a.pdf', 'klv-jul.pdf'),
    ('kvg', 'https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1995/1328_1328_1328/20260701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1995-1328_1328_1328-20260701-de-pdf-a.pdf', 'kvg-jul.pdf'),
    ('usage', 'https://www.besaqsys.ch/sites/default/files/Downloads/BESA%20QSys-Richtlinien-BESA%20System.pdf', 'usage.pdf'),
]

def acquire(items=SOURCES):
    directory = ROOT / 'sources'
    directory.mkdir(exist_ok=True)
    manifest = []
    old_manifest = directory / 'acquisition.json'
    if old_manifest.exists():
        previous = old_manifest.read_bytes()
        archived = directory / 'archive' / hashlib.sha256(previous).hexdigest()
        archived.mkdir(parents=True, exist_ok=True)
        (archived / 'acquisition.json').write_bytes(previous)
    for identifier, url, filename in items:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (public source research)'})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
            resolved = response.url
        target = directory / filename
        if target.exists() and target.read_bytes() != data:
            previous = target.read_bytes()
            archived = directory / 'archive' / hashlib.sha256(previous).hexdigest()
            archived.mkdir(parents=True, exist_ok=True)
            (archived / filename).write_bytes(previous)
        target.write_bytes(data)
        entry = {'id': identifier, 'url': url, 'resolvedUrl': resolved, 'file': filename,
                 'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        manifest.append(entry)
        print(json.dumps(entry))
    (directory / 'acquisition.json').write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    acquire()
