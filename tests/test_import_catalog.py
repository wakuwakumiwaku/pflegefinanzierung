import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('importer', ROOT/'scripts/import_catalog.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
CATALOG = json.loads((ROOT/'public/data/catalog.json').read_text())
TEXT = 'Art. 7a\n' + '\n'.join(row['evidence'] for row in CATALOG['rows']) + '\nArt. 7b'

class ImportTests(unittest.TestCase):
    def test_offline_exact_reproduction_from_public_statutory_excerpts(self):
        self.assertEqual(importer.parse_rates(TEXT), CATALOG['rows'])
        self.assertEqual(importer.generate(CATALOG['sources'], TEXT), CATALOG)
    def test_all_twelve_rows_and_open_ended_tail(self):
        rows = importer.parse_rates(TEXT)
        self.assertEqual(len(rows), 15)
        self.assertEqual(rows[3]['minMinutes'], 1)
        self.assertEqual(rows[-1]['minMinutes'], 221)
        self.assertIsNone(rows[-1]['maxMinutes'])
        self.assertEqual(rows[-1]['rateCents'], 11520)
    def test_missing_row_does_not_silently_publish_subset(self):
        with self.assertRaises(ValueError): importer.parse_rates(TEXT.replace(CATALOG['rows'][4]['evidence'], ''))
    def test_changed_amount_requires_explicit_new_version(self):
        with self.assertRaises(ValueError): importer.parse_rates(TEXT.replace('76.90 Franken', '76.95 Franken'))
    def test_changed_interval_is_not_reconstructed_from_formula(self):
        with self.assertRaises(ValueError): importer.parse_rates(TEXT.replace('von 21 bis 40', 'von 22 bis 40'))
    def test_bag_numbers_verified_without_executing_scripts(self):
        html = '<script>ignore 999</script><p>' + '</p><p>'.join([
            'maximal 15.35 Franken pro Tag', 'maximal 23 Franken pro Tag',
            'für Abklärung, Beratung und Koordination: 76.90 Franken pro Stunde',
            'für Behandlungspflege: 63 Franken pro Stunde',
            'für Grundpflege: 52.60 Franken pro Stunde']) + '</p>'
        self.assertTrue(importer.verify_bag(html))
        with self.assertRaises(ValueError): importer.verify_bag(html.replace('15.35', '15.38'))
    def test_bag_script_only_claim_is_not_page_evidence(self):
        with self.assertRaises(ValueError): importer.verify_bag('<script>maximal 15.35 Franken pro Tag</script>')
    def test_pins_match_public_metadata(self):
        pins = json.loads((ROOT/'scripts/source-pins.json').read_text())
        self.assertEqual(pins, CATALOG['sources'])
        self.assertEqual({p['id'] for p in pins}, {'bag','products','besa','klv','kvg','usage'})
    def test_no_manufacturer_or_cantonal_catalog_published(self):
        self.assertEqual({r['sourceId'] for r in CATALOG['rows']}, {'klv'})
        self.assertEqual(CATALOG['patientCaps']['sourceId'], 'bag')
        self.assertFalse(any('canton' in r for r in CATALOG['rows']))

if __name__ == '__main__': unittest.main()
