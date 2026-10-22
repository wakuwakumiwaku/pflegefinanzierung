# Daten, Quellen und Grenzen

## Vollständiger öffentlicher Umfang

`public/data/catalog.json` enthält **15** quellenbelegte Beitragspositionen: sämtliche drei Stundensätze des Art. 7a Abs. 1 und sämtliche zwölf Tagesbeiträge des Art. 7a Abs. 3 KLV. Die Tagesbeiträge reichen von CHF 9.60 (Pflegebedarf bis 20 Minuten) bis CHF 115.20 (mehr als 220 Minuten). Für Tages-/Nachtstrukturen verweist Abs. 4 auf dieselben Beiträge; der Rechner modelliert keine separaten Tages-/Nachtfälle.[4]

Spitex: Abklärung/Beratung/Koordination CHF 76.90, Untersuchung/Behandlung CHF 63.00 und Grundpflege CHF 52.60 pro Stunde. Art. 7a Abs. 2 nennt Fünfminuteneinheiten und mindestens zehn Minuten.[4]

Jede Position hat eine stabile ID (`heim-01` bis `heim-12`, `spitex-a` bis `spitex-c`), Rappenbetrag, Einheit, Normstelle, Quellen-ID und einen kurzen wörtlichen Beleg. Die zwölf Intervalle werden vollständig aus der Norm ausgelesen, nicht aus einem BESA-/RAI-Mapping erfunden. `maxMinutes: null` der höchsten Stufe bedeutet **offenes oberes Ende**, nicht unbekannten Beitrag. `minMinutes: 1` bei der ersten Stufe ist die rechnerische Abgrenzung gegen ausdrücklich keine Pflegeleistung; der Normtext lautet unverändert „bis 20 Minuten“.[4]

## Datumshierarchie

- **Beitragsbeginn 01.01.2020:** Fussnoten 79/80 zur Fassung vom 02.07.2019, AS 2019 2145.[4]
- **Rechtsstand 01.07.2026:** Titelblatt der hier gepinnten konsolidierten KLV-/KVG-PDF-Fassungen; kein behaupteter neuer Tarifbeginn.[4][5]
- **Abruf 22.10.2026 UTC:** private Akquisitionsmetadaten und öffentliche Provenienz. Abrufzeit ist weder Publikations- noch Inkrafttretedatum.
- Publikationsdatum der BAG-Produkt-/Finanzierungsseiten ist nicht eindeutig ausgewiesen und bleibt `null`. Bei BESA Leistungen ist der sichtbare Seitenzeitpunkt 04.03.2022 erfasst; das ist keine KLV-Gültigkeit.[3]

## Patientenbeteiligung: Widerspruch nicht verstecken

BAG nennt maximal **15.35 CHF pro Tag zu Hause** und **23 CHF im Pflegeheim** und weist auf häufig tiefere kantonale Beteiligungen hin.[1]

Art. 25a Abs. 5 KVG beschränkt die Überwälzung auf höchstens 20 Prozent des höchsten Bundesbeitrags und überträgt den Kantonen die Restfinanzierung. Mit CHF 115.20 / 76.90 aus Art. 7a ergeben 20 Prozent rechnerisch CHF 23.04 / 15.38. Dies stimmt nicht rappengetreu mit den BAG-Seitenangaben überein.[4][5]

Zusätzlich verlinkt BAG auf Art. 7c KLV. In der gesicherten KLV-Fassung vom 01.07.2026 folgt auf Art. 7a/7b Art. 8; ein Art. 7c ist dort nicht enthalten. Ein späterer anderer Normstand wird hier nicht vorgetäuscht. Die Anwendung zeigt die Abweichung an, übernimmt BAG **nur quellenattribuiert als konservative Eingabegrenze**, berechnet den Patientenanteil nie automatisch und behauptet keine kantonalen Ansätze.[1][4]

## Getrennte Finanzierung und Rechnersemantik

Die OKP leistet einen Beitrag, nicht pauschal den gesamten Heimpreis. Restfinanzierung regeln die Kantone; Betreuung, Hauswirtschaft/Pension und ordentliche Kostenbeteiligung sind getrennt zu betrachten.[1][5]

Der Rechner behandelt gleiche Pflegetage mit gleicher Dauer/gleichen Kosten. Heim: 0 Minuten = 0 Beitrag, 1–20 erste Stufe, danach gesetzliche Intervalle bis zur offenen letzten Stufe. Spitex: schon abrechenbare Fünfminuteneinheiten; Summe 0 oder mindestens 10, maximal 1440 Minuten/Tag. Keine automatische Aufrundung von Rohzeit. Mehrere Einsätze/Mindestzeiten und lokale Abrechnungsvereinbarungen sind nicht rekonstruiert. Kein Akut-/Übergangspflege-Modell.

Intern Geld in BigInt-Rappen; Spitex exakt `sum(Minuten × Stundensatz-in-Rappen)/60`, einmal kaufmännisch zum Tagesbeitrag gerundet und danach mit den Tagen multipliziert. Keine Gleitkommarechnung und keine Fünfrappenrundung. Eine reale positionsbezogene Rechnungsrundung kann abweichen. Tage: 1–3660. Pflegeminuten Heim: ganze Werte 0–10080; oberhalb 1440 nur hypothetischer Instrument-Zeitwert, nicht reale Tagesdauer. Geldfelder: maximal CHF 1’000’000.00, maximal zwei Dezimalstellen, keine negativen Werte/Exponenten.

Tatsächliche Pflegekosten und Patientenanteil sind optional und bleiben leer **unbekannt**. Modellrest = Kosten − OKP − Patientenanteil, nur bei beiden bekannten Angaben. Kosten unter der Beitragssumme sind ein Eingabewiderspruch; keine negative öffentliche Finanzierung oder automatische Gesamtvergütung. Persönliche Modellbelastung nur bei bekanntem Patientenanteil, Pension/Hauswirtschaft, Betreuung und manuell eingegebener ordentlicher Franchise/Selbstbehalt. Letzterer ist ein Gesamtbetrag des Zeitraums und wird nicht vom Bundesbeitrag abgezogen.

## BESA-/RAI- und Lizenzgrenze

Die Herstellerseite führt BESA und RAI/interRAI als Bedarfsermittlungsinstrumente. BESA Leistungen nennt LK2010/LK2020 je nach Kanton und eine Einstufung in zwölf Pflegebedarfsstufen. Daraus wird **kein** öffentliches Instrument- oder Code-Mapping abgeleitet.[2][3]

Die gesicherten Nutzungsrichtlinien definieren Voraussetzungen und Kompetenzen geschulter BESA-Anwendender/Tutoren; sie sind keine hier nachgewiesene Freigabe zur Wiederveröffentlichung von Software, Fragebogen oder Leistungskatalog. Die Produktseite trägt „Alle Rechte vorbehalten“. Deshalb nur kurze eigene Orientierung und Originalverlinkung; keine Volltexte/Fragen/LK2010-/LK2020-Dateien im öffentlichen Runtime-Build.[2][6]

Art. 8b KLV verlangt unter anderem die Abgrenzung der Pflegeleistungen von anderen Leistungen sowie auf Zeitstudien gestützte Instrumente. Ein einfacher Minutenrechner erfüllt kein fachliches Bedarfsermittlungsverfahren und beansprucht dies nicht.[4]

Keine npm-Pakete oder Frontendbibliotheken werden ausgeliefert. Der eigenständige Quellcode ist MIT-lizenziert. Die MIT-Lizenz ist keine Nachlizenzierung amtlicher Originale, Herstellertexte oder Produktmarken. Veröffentlicht werden nur gesetzliche Beitragssätze, kurze Normbelege, eigene Erläuterungen und technische Provenienz; die Rohquellen bleiben privat/ignoriert.

## Reproduzierbarkeit

`source-pins.json` enthält die sechs tatsächlich gesicherten Quellen mit URL, finaler URL, Datei, Abrufzeit, Bytezahl, SHA-256 und unabhängigem Rechts-/Publikationsdatum. Die öffentliche Provenienz stimmt byteinhaltlich als JSON-Datenstruktur mit diesen Pins überein. `sources/` ist ignoriert; dort liegen Roh-HTML/PDF und Extraktionen. Fehlende historische Bytes können nicht durch ein heute neu geladenes, abweichendes HTML mit demselben Pin ersetzt werden.

`acquire_sources.py` nutzt ausschliesslich Python-stdlib und sichert Rohbytes vor Interpretation. `import_catalog.py` prüft alle Hashes/Bytezahlen, die BAG-Zahlenaussagen, den KLV-Rechtsstand und exakt alle 3+12 Werte/Intervalle. Bei jeder Abweichung bricht der Import ab, statt Daten zu erraten. `npm test` reproduziert die kanonischen Daten offline aus den öffentlichen kurzen Normbelegen und prüft unvollständige/geänderte Tabellen als Fehlerfälle. Norm-PDF-Reimport benötigt optional `pdftotext`; normale öffentliche Check/Test/Build-Läufe nicht.

## Sources

[1] https://www.bag.admin.ch/de/krankenversicherung-pflegeleistungen — BAG: Krankenversicherung – Pflegeleistungen
[2] https://besaqsys.ch/produkte — BESA QSys: Produkte
[3] https://besaqsys.ch/besa-leistungen — BESA QSys: BESA Leistungen
[4] https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1995/4964_4964_4964/20260701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1995-4964_4964_4964-20260701-de-pdf-a.pdf — KLV, SR 832.112.31, Rechtsstand 1. Juli 2026
[5] https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1995/1328_1328_1328/20260701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1995-1328_1328_1328-20260701-de-pdf-a.pdf — KVG, SR 832.10, Rechtsstand 1. Juli 2026
[6] https://www.besaqsys.ch/sites/default/files/Downloads/BESA%20QSys-Richtlinien-BESA%20System.pdf — BESA QSys: Richtlinien zur Nutzung des BESA Systems
