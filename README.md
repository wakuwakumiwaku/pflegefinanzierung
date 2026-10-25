# Pflegefinanzierung

Unabhängiger deutschsprachiger Browser für die **vollständigen gesetzlichen Bundesbeiträge** an Pflegeleistungen: zwölf Pflegeheimstufen und drei Spitex-Stundensätze. Dazu ein exakter, bewusst begrenzter Szenariorechner und eine ausschliesslich lokale Merkliste.

**Kein BESA-/RAI-Assessment und kein Nachbau lizenzierter Instrumente.** Keine Herstellerfragebögen oder Leistungskataloge, keine kantonalen Fantasietarife, keine Patientenakten und keine Erstattungszusage.

## Lokal ausführen

Node **22 oder neuer**, Python **3.10 oder neuer**, keine Frontend- oder npm-Laufzeitabhängigkeiten. Die geprüfte Umgebung verwendet Node 22 und Python 3.14.

```sh
npm ci --ignore-scripts --offline
npm run check
npm test
npm run build
npm start
```

Danach `http://127.0.0.1:3011/` öffnen. `PORT` überschreibt den Port. Der Server läuft nur nach explizitem Start; Tests starten kurzlebige eigene Server und beenden sie wieder. Öffnen per `file://` ist nicht unterstützt, weil die JSON-Daten per Fetch geladen werden.

Alle drei Prüf-/Buildbefehle benötigen **keine Netzwerkverbindung, keine Rohquellen, kein vorhandenes dist und keine ignorierten Dateien**. `dist/` enthält nur sieben explizit erlaubte Runtime-Dateien. Private Canaries werden in Tests geprüft.

## Funktionen

- Suche über alle 15 Positionen, Bereichs-/Merklistenfilter; ausschliesslich DOM-Seiten zu 6 Positionen, echte Mehr-Anzeigen-/Reset-Aktionen.
- Details mit Normbeleg, Minutenintervall, Preisbasis und Originalquelle.
- Pflegeheim: 0 Minuten bedeutet kein Beitrag; oberhalb 220 Minuten bleibt die letzte gesetzliche Stufe offen. Ganze, bereits fachlich ermittelte Minuten sind eine Eingabeannahme, kein automatisches Assessment.
- Spitex: getrennte Minuten zu allen drei gesetzlichen Stundensätzen, valide 5-Minuten-Einheiten; Tagesmodell und Mindestzeitgrenzen offen bezeichnet.
- Exakte BigInt-Rappen-/Bruchrechnung; optionale tatsächliche Pflegekosten, manueller Patientenanteil, Modell-Restfinanzierung, Pension/Hauswirtschaft, Betreuung und ordentliche Kostenbeteiligung klar getrennt.
- Unbekannte Felder bleiben unbekannt. Keine fehlende Angabe wird still als 0 gerechnet. Widersprüchliche Kosten und ungültige Eingaben werden zurückgewiesen.
- Eigener Storage-Key `pflegefinanzierung.workspace.v1`, JSON-Export einschliesslich gültigem aktuellen Entwurf, vollständig validierter Import mit nichtmutierender Vorschau/Abbrechen. Nur die neueste Dateiauswahl darf Vorschau, Fehlermeldung oder Dateiinput verändern; Abbrechen/Escape und erfolgreiche Übernahme invalidieren ältere Leseantworten.
- Speicherfehler, beschädigte Rohwerte und Cross-tab-Änderungen sperren Schreibzugriff statt zu reparieren. Der aktuelle Formularentwurf bleibt erhalten und kann bei gültigen Werten als JSON gerettet werden.
- Violett/dunkel, Systemfonts, responsive Reflow und helle Druckregeln; keine Tracker, externen Skripte, Konten oder Upload-API.

## Rechts-/Datenstand und wichtige Grenze

Gepinnte KLV-/KVG-Fassung: **01.07.2026**. Beitragssätze des Art. 7a Abs. 1/3 KLV gelten seit **01.01.2020**. Abruf und Rechtsstand sind getrennt. Originale können inzwischen neuer sein.

Die BAG-Seite nennt Patientenobergrenzen von **23.00 / 15.35 CHF**. Die 20%-Formel mit den gesicherten Art.-7a-Beträgen ergibt **23.04 / 15.38 CHF**; der BAG-Verweis auf Art. 7c ist in der gepinnten KLV-Fassung nicht enthalten. Diese Abweichung wird **nicht** unsichtbar geglättet. Der Rechner verwendet ausschliesslich die klar beschrifteten BAG-Seitenangaben als konservative manuelle Eingabegrenzen; er liefert keine amtliche Auslegung oder kantonale Werte. Vor einer realen Abrechnung aktuelle Normen/Ansätze prüfen. Details und Originalquellen: [DATA.md](DATA.md).

## Registrierte native Browserabnahme (separat)

`npm run test:browser` registriert **106 native Firefox-/Camoufox-Akzeptanzfälle (95 v2-Fälle + 8 v3-Überlappungsfälle + 3 Exportregressionen)** in `tests/browser.mjs`; es gehört bewusst nicht zum Offline-Unitbefehl `npm test`. Vorher `npm run build` ausführen. Playwright ist ein **extern bereitgestelltes Prüfwerkzeug**, keine Produkt- oder versteckte npm-Abhängigkeit. `PLAYWRIGHT_MODULE` akzeptiert einen auflösbaren Modulnamen oder einen absoluten Pfad zur ESM-Einstiegsdatei mit `firefox.launch`; optional wählt `BROWSER_EXECUTABLE` das vorhandene kompatible Firefox-/Camoufox-Binary. Keine Browserinstallation und keine globalen Änderungen durch das Projekt.

```sh
# Browserfreie Vorbereitung; importiert/ startet keinen Browser:
npm run test:browser -- --list
npm run test:browser -- --self-test
npm run test:browser -- --preflight

# Erst in einer ausdrücklich freien nativen Prüflane, mit bereitgestelltem
# PLAYWRIGHT_MODULE und gegebenenfalls BROWSER_EXECUTABLE:
npm run test:browser
```

Der Runner startet seinen eigenen kurzlebigen Loopback-Server unter `/pflegefinanzierung/`, seinen eigenen Headless-Prozess und getrennte flüchtige Kontexte; keine vorhandene Sitzung, keine Profile und kein Asset-Mirror. Jeder Lauf erzeugt ein neues `.local/browser/RUN-…/` mit vollständigem `report.json`, tatsächlichen JSON-Downloads, Screenshots und DOM-/Schrift-/Zielgeometrie. Alle Seiten (auch Zweittabs) erfassen Pageerrors, sämtliche Konsolenmeldungen, fehlgeschlagene HTTP-/Transportanfragen und Requestmethoden. Warnungen/Fehler oder nicht ausgeführte Pflichtfälle verhindern einen Erfolg; Browser und Server werden in `finally` geschlossen. Modul-/Startfehler werden mit tatsächlich übersprungenen Fällen statt eines Scheinerfolgs dokumentiert.

Die unabhängige Dezimal-/Rappen-Erwartung verwendet die belegten 15 Normbeträge, **nicht** den Produktrechner. Geprüft werden unter anderem alle Details und Rechnerübernahmen, Such-/6er-DOM-Seiten, Grenzen und Geldtrennung, lokale Merkliste/Szenarien, echte Downloads, vollständige Importvorschau/Abbruch/Übernahme, beschädigter/blockierter/fremdgeänderter Speicher, echte Zweitab-Ereignisse, Tastatur/Navigation, 1440/768/390/320px und Druckdarstellung. Speicher-Failpoints liegen ausschliesslich an `Storage`-I/O; Geschäfts- und Importhandler werden nicht ersetzt. Keine CSV-Funktion vorhanden, daher kein CSV-Test. Die acht zusätzlichen Überlappungsfälle verzögern ausschliesslich die echte `File.text()`-I/O-Grenze nach Lesen der originalen Dateiinput-Bytes; alte Fehler werden an derselben Grenze injiziert. Sie prüfen neuere Vorschau/Übernahme, Abbrechen, natives Escape, späte Antworten nach Übernahme und den neueren noch lesenden Dateiinput. Echte Downloads, rohe Speicherbytes, ungesicherter Entwurf, Seitenmonitore und fremde Keys bleiben geprüft; keine Produktfunktion wird ersetzt.

Der Export erkennt identische gespeicherte Eingaben unabhängig von der JSON-Schlüsselreihenfolge; Original-IDs, Zeitpunkte und literale Werte bleiben erhalten. Drei zusätzliche registrierte Fälle prüfen den echten Import-/Vorschau-/Abbruch-/Übernahme-/Reload-/Laden-/Download-Pfad, einen literal abweichenden gültigen Entwurf und das 50-Szenarien-Limit. Sie ersetzen keine der bestehenden Speicherfehler-/Fremdänderungs- und Import-Intent-Kontrollen.

Der Drucktest beobachtet die tatsächliche Schaltfläche ausschliesslich an der nativen `window.print`-API-Grenze; `beforeprint`/`afterprint` werden dort ausdrücklich durch den Beobachter ausgelöst. Reale Ergebniswerte und Print-CSS werden unverändert geprüft, kein OS-Druckdialog oder Papier-/PDF-Spool behauptet.

**Prüfstand v3:** Die ursprünglichen 95 Fälle wurden vom Parent am eingefrorenen v2 tatsächlich bestanden; dies ist keine native v3-Abnahme. Die ursprünglichen Assertion-Bodies bleiben unverändert. Die acht neuen Fälle sind nur authoriert und browserfrei auf Registrierung/Syntax/Orakel/Build-Voraussetzungen geprüft; ein nativer v3-Lauf durch den Parent, erneute unabhängige SPEC- und danach QUALITY-Prüfung bleiben offen. Screenshots benötigen zusätzlich menschliche Pixelprüfung. Browserfreie Checks allein sind keine native Freigabe.

`npm test` registriert zusätzlich 37 Einheiten-/Build-Regressionen und 12 Import-Intent-Fälle am tatsächlichen App-Modul (insgesamt 78 Node- und 9 Python-Tests). Der minimale DOM-/Datei-I/O-Adapter ist kein Browser. Der explizit gestartete Node-VM-Kindprozess verwendet `--experimental-vm-modules`; dessen ExperimentalWarning ist als Testgrenze getrennt bezeichnet, kein Produktfehler. Exakte kanonische Zeileneinheiten (`spitex` → `Stunde`, `heim` → `Tag`) sind Pflicht vor Aktivierung, Check und Build; ungültige Einheiten dürfen keine der sieben vorher gültigen Runtime-Dateien ersetzen.

## Quellen aktualisieren

Nur bei bewusstem Quellen-Review:

```sh
npm run acquire
npm run import
```

`acquire` sichert unveränderte Rohbytes privat unter `sources/` samt Abrufzeit, URL, Bytezahl und SHA-256. `import` akzeptiert nur die in `scripts/source-pins.json` exakt gepinnten Bytes; für PDF-Auswertung wird `pdftotext` benötigt. Die Akquisition überschreibt nicht automatisch die Pins. Dynamische HTML-Nonces können auch ohne Inhaltsänderung neue Hashes ergeben: alte Pins nicht blind ersetzen. Ein Quellen-/Rechtsstandswechsel erfordert Quellenprüfung, neue Version, Validierungs-/Testanpassung und erneute Abnahme.

## Schnittstellen / Publikation

`createAppServer({root,basePath})` wird aus `scripts/serve.mjs` exportiert; etwa `root: '/absolut/pfad/dist', basePath: '/pflegefinanzierung/'`. `document.body.dataset.ready` wird erst nach validierten echten Daten und aktiver UI auf `true` gesetzt.

Die neun Kataloglinks sind normale gleichfenstrige Links; drei direkte Links, sechs weitere im nativen Klappbereich. Die vorgesehenen Ziel-URLs sind keine Behauptung einer bereits erfolgten Veröffentlichung. Die Pages-Workflowdatei ist vorbereitet; dieses Projekt wurde im Implementierungsauftrag nicht remote veröffentlicht.

Architektur, Tests und vollständiges Public-Inventar: [docs/CODEBASE.md](docs/CODEBASE.md). MIT gilt für den eigenständigen Code; amtliche Quellen, Herstellerinhalte und Marken sind davon nicht pauschal erfasst. Herstellerdokumente werden nicht mitgeliefert.
