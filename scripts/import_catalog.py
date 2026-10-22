#!/usr/bin/env python3
"""Rebuild the complete federal rate set from verified private pinned sources."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'klv-2026-07-01-r1'

class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip-1)
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def verify_bag(html):
    parser = PageText()
    parser.feed(html)
    text = ' '.join(' '.join(parser.parts).split())
    claims = [
        'maximal 15.35 Franken pro Tag',
        'maximal 23 Franken pro Tag',
        'für Abklärung, Beratung und Koordination: 76.90 Franken pro Stunde',
        'für Behandlungspflege: 63 Franken pro Stunde',
        'für Grundpflege: 52.60 Franken pro Stunde',
    ]
    if any(claim not in text for claim in claims):
        raise ValueError('Pinned BAG page no longer supports attributed values')
    return True

def parse_rates(text):
    section = text.split('Art. 7a', 1)[1].split('Art. 7b', 1)[0]
    hourly = re.findall(r'für Leistungen nach Artikel 7 Absatz 2 Buchstabe ([abc]):\s*(\d+\.\d{2}) Franken', section)
    daily = re.findall(r'bei einem Pflegebedarf (bis 20 Minuten|von \d+ bis \d+ Minuten|von mehr als 220 Minuten):\s*(\d+\.\d{2}) Franken', section)
    if len(hourly) != 3 or len(daily) != 12:
        raise ValueError('Expected complete 3 hourly / 12 daily statutory rates')
    names = ['Abklärung, Beratung und Koordination', 'Untersuchung und Behandlung', 'Grundpflege']
    rows = []
    for i, (letter, value) in enumerate(hourly):
        if letter != 'abc'[i]: raise ValueError('Unexpected hourly order')
        rows.append({'id': f'spitex-{letter}', 'kind': 'spitex', 'title': names[i],
                     'rateCents': int(value.replace('.', '')), 'unit': 'Stunde', 'stage': None,
                     'minMinutes': None, 'maxMinutes': None, 'sourceId': 'klv',
                     'legalRef': f'Art. 7a Abs. 1 Bst. {letter} KLV',
                     'evidence': f'für Leistungen nach Artikel 7 Absatz 2 Buchstabe {letter}: {value} Franken'})
    for i, (interval, value) in enumerate(daily, 1):
        expected = 'bis 20 Minuten' if i == 1 else ('von mehr als 220 Minuten' if i == 12 else f'von {(i-1)*20+1} bis {i*20} Minuten')
        if interval != expected: raise ValueError('Unexpected daily interval')
        rows.append({'id': f'heim-{i:02}', 'kind': 'heim', 'title': f'Pflegebedarfsstufe {i}',
                     'rateCents': int(value.replace('.', '')), 'unit': 'Tag', 'stage': i,
                     'minMinutes': 1 if i == 1 else (221 if i == 12 else (i-1)*20+1),
                     'maxMinutes': None if i == 12 else i*20, 'sourceId': 'klv',
                     'legalRef': f'Art. 7a Abs. 3 Bst. {chr(96+i)} KLV',
                     'evidence': f'bei einem Pflegebedarf {interval}: {value} Franken'})
    if [r['rateCents'] for r in rows[:3]] != [7690,6300,5260] or [r['rateCents'] for r in rows[3:]] != list(range(960,11521,960)):
        raise ValueError('Pinned legal rates differ; requires explicit version review')
    return rows

def generate(sources, text):
    return {'schemaVersion': 1, 'version': VERSION, 'currency': 'CHF', 'legalAsOf': '2026-07-01',
            'ratesEffectiveFrom': '2020-01-01', 'sources': sources, 'rows': parse_rates(text),
            'patientCaps': {'sourceId': 'bag', 'heimCents': 2300, 'spitexCents': 1535,
                            'status': 'BAG-Seitenangaben; keine kantonalen Ansätze'},
            'limits': ['Keine BESA-/RAI-Einstufung und kein Herstellerkatalog.',
                       'Keine kantonalen Beitragstabellen; Patientenanteile nur manuell.',
                       'Keine Akut- und Übergangspflege, keine Rechnungs- oder Erstattungszusage.',
                       'BAG nennt 23.00 / 15.35 CHF, während 20% der Art.-7a-Beiträge 23.04 / 15.38 CHF ergeben. Keine stille Gleichsetzung.'],
            'evidence': {
                'rounding': 'Die Vergütung der Beiträge nach Absatz 1 erfolgt in Zeiteinheiten von 5 Minuten. Zu vergüten sind mindestens 10 Minuten.',
                'effectiveDate': 'Fassung gemäss Ziff. I der V des EDI vom 2. Juli 2019, in Kraft seit 1. Jan. 2020',
                'assessment': 'Die Bedarfsermittlung in Pflegeheimen muss sich auf ein Instrument stützen',
                'residual': 'Die Kantone regeln die Restfinanzierung.'}}

def main():
    pinned = json.loads((ROOT/'scripts/source-pins.json').read_text())
    for entry in pinned:
        data = (ROOT/'sources'/entry['file']).read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f"Source pin mismatch: {entry['id']}")
    verify_bag((ROOT/'sources/bag.html').read_text())
    result = subprocess.run(['pdftotext', '-layout', str(ROOT/'sources/klv-jul.pdf'), '-'], check=True, capture_output=True, text=True)
    text = result.stdout
    if 'Stand am 1. Juli 2026' not in text: raise ValueError('Unexpected legal consolidation')
    catalog = generate(pinned, text)
    out = ROOT/'public/data/catalog.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n')
    print(f'Imported {len(catalog["rows"])} complete federal rate rows → {out}')

if __name__ == '__main__': main()
