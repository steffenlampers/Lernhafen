# Lernhafen

Die selbst gehostete Lernzentrale für Ausbildung, Schule und Studium, gebaut für Menschen mit ADHS: wenig auf einmal, klare Struktur, kleine Schritte.
Sie läuft in Docker auf deinem NAS (z. B. QNAP) oder jedem Server im Heimnetz. Deine Daten bleiben bei dir.

Der Name der App ist einstellbar (`APP_NAME` oder im Einrichtungs-Assistenten), sodass du sie als „StudyDock“, „Mein Studium“ oder wie du willst benutzen kannst. Alles Berufsspezifische steckt in **Profil-Paketen**.

## Was sie kann

| Bereich | Funktionen |
|---|---|
| **Heute** | Nur zwei Karten: „Jetzt / Als Nächstes“ und die eine dringendste Aufgabe mit ihren Schritten. Der Rest steht hinter „Mehr anzeigen“. |
| **Stundenplan** | Aus **Schulmanager Online** (täglich automatisch), aus **iCal-Links** (Hochschule, Moodle, Google Kalender, Nextcloud) oder **von Hand** als Wochenplan. Ausfälle und Vertretungen werden markiert. |
| **Termine** | Hausaufgaben, Klausuren, Abgaben usw. Termine können an eine Stunde gebunden sein und wandern mit, wenn sie ausfällt. Aufgaben lassen sich in **Schritte** zerlegen. Alle Termine gibt es als **Kalender-Abo fürs Handy** mit Erinnerungen. |
| **Fächer und Module** | Pro Fach: Mitschriften, Scans, Dateien (Skripte, Folien, PDFs), Links, Karteikarten, Noten, Leistungspunkte. |
| **Mitschriften** | Ein Knopf pro Stunde legt einen Eintrag mit Zeit, Lehrkraft, Raum und deiner Vorlage an. |
| **Scannen mit dem Handy** | Seiten fotografieren, die App richtet sie aus, hellt auf, erkennt den Text (Tesseract, Deutsch und Englisch), erzeugt ein durchsuchbares PDF und legt alles beim passenden Fach ab. Das Fach errät sie aus dem aktuellen Stundenplan. |
| **Lernen** | **Karteikarten** mit Wiederholung in Abständen (kurze Runden à 10), **Lernplan** vor Prüfungen (verteilt Lernblöcke, der letzte zum Wiederholen), **Noten** mit gewichtetem Durchschnitt, **Leistungspunkte** (ECTS), **Praxisstunden-Zähler**. |
| **Suche** | Findet Begriffe in Mitschriften, im erkannten Text von Scans, in Karten, Dateien und Terminen. |
| **Fokus-Timer** | 10/2, 25/5 und 50/10 Minuten, mit Tageszähler. |
| **Zentrale für alles** | Lernlinks je Profil (KI-Helfer, Fachportale) plus eigene Links, z. B. Hermes Agent oder die Lernplattform deiner Schule. |
| **Sicherung** | Alle Daten als eine Datei herunterladen und wieder einspielen. |

## Profile

Das Profil legt Begriffe, Terminarten, Noten-Skala, Praxisstunden oder Leistungspunkte und Lernlinks fest. Du wählst es beim ersten Start.

| Profil | Besonderheiten |
|---|---|
| `allgemein` | Neutral, für alles andere |
| `schule` | Klassenarbeiten, Punkte 0 bis 15, Lernlinks für die Schule |
| `duale-ausbildung` | Berufsschule und Betrieb, Berichtsheft als Terminart |
| `studium` | „Module“, ECTS-Punkte (Ziel 180), Hochschul-Kalender per iCal |
| `pflege` | Praxisstunden-Zähler (Ziel 2500) |
| `ergotherapie` | Doppelstunden, Praxisstunden-Zähler (Ziel 1700), Lernlinks für Medizinberufe |

Ein eigenes Profil ist eine JSON-Datei: Kopiere `profiles/allgemein.json`, benenne sie um und passe sie an. Sie erscheint danach in der Auswahl. Die Ziele (Stunden, Punkte) lassen sich unter „Einstellungen“ ändern.

## Installation auf einem QNAP-NAS

Voraussetzung: **Container Station** ist installiert.

1. Lege in der File Station den Ordner `/share/Container/lernhafen/data` an.
2. Öffne Container Station → **Anwendungen** → **Erstellen**.
3. Füge den Inhalt von [`deploy/qnap-container-station.yml`](deploy/qnap-container-station.yml) ein und ersetze `APP_PASSWORD` durch ein eigenes Passwort.
4. Klicke auf **Erstellen**. Nach dem Herunterladen des Images läuft die App.
5. Öffne `http://<NAS-Adresse>:8088` im Browser, auch auf dem Handy im selben WLAN. Der Assistent führt dich durch die ersten Schritte.

Steht das Paket auf GitHub noch auf „privat“, stelle es unter *Packages → lernhafen → Package settings* auf **Public**, damit das NAS es ohne Anmeldung laden kann.

### Mit Docker Compose

```
cp .env.example .env      # Werte anpassen, alles optional
docker compose up -d      # fertiges Image laden und starten
```

Lokal bauen statt laden: `docker compose -f docker-compose.build.yml up -d --build`.

### Auf dem Handy installieren

Im Browser des Handys „Zum Startbildschirm hinzufügen“ wählen, dann startet die App wie eine normale App.

## Stundenplan verbinden

- **Schulmanager:** Im Tab „Woche“ auf „Verbinden“, E-Mail oder Benutzername und Passwort eintragen. Der Server holt den Plan jeden Morgen (`SYNC_HOUR`, Standard 6 Uhr) und holt einen verpassten Abgleich nach. Die Zugangsdaten liegen nur in `data/schulmanager.json` (Rechte 600). Die Schnittstelle ist nicht offiziell und kann sich ändern. Dann zeigt die App eine Meldung, und das Lesezeichen-Verfahren bleibt als Ersatz.
- **Kalender-Link (iCal):** Unter „Mehr → Kalender-Links“ den Link einfügen. Unterstützt werden Zeitzonen, Wiederholungen, Ausnahmen und verlegte oder abgesagte Einzeltermine. Als „Stundenplan“ ersetzt der Kalender die Stundenliste, als „Termine“ erscheinen die Einträge zusätzlich (Fristen, Familie, Moodle).
- **Von Hand:** Unter „Mehr → Wochenplan von Hand“ Einträge mit Wochentag, Zeit, Fach und Raum anlegen, optional für ein Semester begrenzt.

Die Quellen gelten in dieser Reihenfolge: Schulmanager, Kalender-Link, Wochenplan von Hand. Hat eine Quelle für den Tag Einträge, werden die späteren nicht gemischt.

## Termine im Handy-Kalender

Unter „Mehr → Daten und Verbindungen → Termine im Handy-Kalender“ findest du einen geheimen Abo-Link. Wenn du ihn im Kalender des Handys abonnierst (iPhone: Einstellungen → Kalender → Accounts → Kalenderabo; Google Kalender: „Per URL hinzufügen“), erscheinen deine Termine dort mit Erinnerungen am Vorabend, bei Prüfungen auch einen Tag und eine Woche vorher. Der Link lässt sich jederzeit erneuern.

## Scannen

- **Foto aufnehmen** nutzt die Kamera des Handys und braucht kein HTTPS.
- Mehrere Seiten nacheinander aufnehmen, dann „Fertig und ablegen“. Die Texterkennung läuft im Hintergrund.
- Gedruckte Texte werden gut erkannt, **Handschrift erkennt Tesseract schlecht**. Die Seiten bleiben dann als Foto in der Mitschrift.

## Betrieb

- **Backup:** Den Ordner `data/` kopieren (alles drin) oder in der App „Sicherung herunterladen“ (ohne Scans und Dateien).
- **Update:** In Container Station den Container neu erstellen oder `docker compose pull && docker compose up -d`. Die Daten bleiben erhalten.
- **Passwort ändern:** `APP_PASSWORD` ändern und den Container neu starten.
- **Von außen erreichbar:** Nicht ohne HTTPS und Passwort ins Internet stellen. Besser per VPN (WireGuard, Tailscale oder der QNAP-VPN-Dienst).

## Sicherheit

- Ohne `APP_PASSWORD` ist die App offen. Das ist nur im vertrauenswürdigen Heimnetz sinnvoll.
- Mit Passwort sind alle Daten gesperrt, Fehlversuche werden begrenzt (5 pro Minute), das Cookie ist signiert (30 Tage).
- Der Container läuft ohne Root-Rechte mit `no-new-privileges`.
- Scans und Dateien sind nur über feste Namen abrufbar, hochgeladene Dateien wie HTML werden nie angezeigt, sondern nur zum Herunterladen ausgeliefert.
- Der Kalender-Abo-Link ist ein Geheimnis. Wer ihn kennt, kann deine Termine lesen. Er lässt sich erneuern.
- Kalender-Links ruft der Server von sich aus ab. Trage nur Links ein, denen du vertraust.

## Stand: was getestet ist und was nicht

- **Automatisch getestet (28 Tests):** Plan-Umwandlung, Schulmanager-Passwort-Hash, iCal (Wiederholungen, Ausnahmen, Verlegung, Zeitzonen, mehrtägig), Kalender-Abruf mit Fehlern, Handy-Abo (Inhalt, Erinnerungen, Falten, Link erneuern), Dateien (Typen, Pfadtricks), Scans, Suche, Sicherung, Anmeldung und Sperre, alle Profile.
- **Im echten Browser durchgespielt (Handy- und Desktop-Breite, hell und dunkel):** Einrichtungs-Assistent, Kalender-Link, Heute mit Uhrzeiten, Mitschrift zur Stunde, Termin mit Schritten, Lernplan, Karteikarten-Runde, Noten, Datei- und Scan-Upload, Wochenplan von Hand, Handy-Abo, Suche.
- **Nicht getestet:** Der Live-Abruf bei Schulmanager mit echten Zugangsdaten, die Texterkennung mit Tesseract im fertigen Image (der GitHub-Lauf prüft, dass Deutsch und die PDF-Schrift vorhanden sind), der Betrieb auf einem echten NAS und die Kalender-Abos auf iPhone und Android.
- **Noch nicht enthalten:** Google-Anbindung (Docs, Drive, Gmail), Seitenzuschnitt und Kantenerkennung per Hand, Handschrifterkennung, mehrere Nutzer, englische Oberfläche.

## Entwicklung

```
npm ci
npm test
DATA_DIR=./data PORT=8088 npm start
```

Aufbau: `src/` (Server, Schulmanager, iCal, Scans, Dateien, Anmeldung), `public/` (Oberfläche ohne Build-Schritt), `profiles/` (Profil-Pakete), `test/`.

Lizenz: MIT.
