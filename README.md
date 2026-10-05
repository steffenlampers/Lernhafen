# Lernhafen

Die selbst gehostete Lernzentrale für Ausbildung, Schule und Studium, gebaut für Menschen mit ADHS: wenig auf einmal, klare Struktur, kleine Schritte.
Sie läuft in Docker auf deinem NAS (z. B. QNAP) oder jedem Server im Heimnetz. Deine Daten bleiben bei dir.

**Ein Platz für alles:** Stundenplan, Termine, Mitschriften, Scans, Word-, Excel- und PowerPoint-Dateien, Karteikarten, Noten und Lernlinks in einer App. Nichts, wofür du zwischen Programmen, Tabs und Cloud-Diensten wechseln musst.

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
| **Eigenes Office** | Dokumente (Text), Tabellen mit Formeln und Präsentationen direkt in der App schreiben, ohne Programmwechsel. Gespeichert wird als echte `.docx`, `.xlsx` und `.pptx` im Ordner des Fachs. Alles steckt im selben Container, nichts muss dazu installiert werden. |
| **Dateien und Ordner** | Pro Fach ein Ordner mit allen Dokumenten und Scans (`data/library/<Fach>/`). PDFs und Bilder öffnen sich direkt in der App. Der Plus-Knopf legt alles an einer Stelle an. |
| **Von überall** | Mit Tailscale erreichst du Lernhafen von jedem Gerät und Ort. Alles liegt gebündelt an einem Platz, siehe „Von überall nutzen“. |
| **Sicherung** | Alles in einer Datei herunterladen und einspielen, dazu jede Nacht eine automatische Sicherung auf dem Server (letzte 7). |
| **Google Drive** (optional) | Wer eine Google-App hinterlegt hat, kann Lernhafen mit einem Drive-Ordner abgleichen lassen. Ohne hinterlegte Google-App bleibt der Punkt unsichtbar. |

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

### Eigene IP-Adresse statt Port-Nummer

Statt `http://nas:8088` kann Lernhafen im Heimnetz eine **eigene Adresse** bekommen, z. B. `http://192.168.1.50`. Der Container erscheint dann im Netzwerk wie ein eigenes Gerät (Docker-Netz „macvlan“) und läuft auf Port 80, ohne Konflikt mit dem NAS.

1. Notiere dir deine Netzwerkdaten: Heimnetz (z. B. `192.168.1.0/24`), Router (z. B. `192.168.1.1`) und eine **freie** Adresse außerhalb des DHCP-Bereichs deines Routers (z. B. `192.168.1.50`).
2. Den Netzwerk-Anschluss des NAS findest du per SSH mit `ip addr` (meist `eth0`).
3. **QNAP Container Station:** Inhalt von [`deploy/qnap-eigene-ip.yml`](deploy/qnap-eigene-ip.yml) einfügen, die mit „ANPASSEN“ markierten Stellen ändern, erstellen.
   **Docker Compose:** In `.env` die Werte `LAN_PARENT`, `LAN_SUBNET`, `LAN_GATEWAY`, `LAN_IP` eintragen, dann `docker compose -f docker-compose.eigene-ip.yml up -d`.
4. Öffne `http://<deine Adresse>` auf dem PC oder Handy.

Gut zu wissen: Bei macvlan erreicht **das NAS selbst** den Container nicht unter dieser Adresse, alle anderen Geräte schon. Wenn dein Router die Adresse vergeben soll, trage sie dort als feste Zuordnung ein oder wähle eine Adresse außerhalb des DHCP-Bereichs. Ein schöner Name wie `lernhafen.fritz.box` geht über den Router (Heimnetz → Netzwerk → Gerät → Name).

Wenn macvlan bei dir nicht geht (manche Netzwerkkarten oder virtuelle Switches blockieren es), nimm das normale Compose mit einem freien Port, z. B. `PORT=8090`.

### Auf dem Handy installieren

Im Browser des Handys „Zum Startbildschirm hinzufügen“ wählen, dann startet die App wie eine normale App.

## Update per SSH

Ein Update tauscht nur das Image. Termine, Mitschriften, Scans und Einstellungen liegen im Ordner `data` und bleiben erhalten.

Am einfachsten geht es, wenn die Compose-Datei auf dem NAS liegt, zum Beispiel in `/share/Container/lernhafen/` (dort auch `data/` und `.env`). Dann reicht per SSH:

```
cd /share/Container/lernhafen
sh update.sh                                   # normale Installation
sh update.sh docker-compose.eigene-ip.yml      # Variante mit eigener IP
```

Das Skript lädt das neue Image, startet den Container neu und räumt alte Images auf. Von Hand sind es zwei Befehle: `docker compose pull` und `docker compose up -d`. Ob es geklappt hat, siehst du in der App unter „Mehr → Daten und Verbindungen“ an der Versionsnummer.

Hast du Lernhafen über die Container Station per YAML angelegt, geht das Update dort ebenfalls über „Anwendungen“, indem du die Anwendung neu erstellen lässt (das Image wird dabei neu geladen). Mit der Compose-Datei auf dem NAS und `update.sh` bist du unabhängig davon.

## Eigenes Office

In jedem Fach gibt es „Neues Dokument“, „Neue Tabelle“ und „Neue Präsentation“. Die Editoren sind Teil der App:

- **Text:** Überschriften, fett, kursiv, unterstrichen, Listen, Links und Tabellen. Gespeichert als `.docx` (Word).
- **Tabelle:** Zellen, mehrere Blätter, Formeln mit `SUMME`, `MITTELWERT`, `WENN`, `MIN`, `MAX`, `RUNDEN` und weiteren (deutsche oder englische Namen). Gespeichert als `.xlsx` (Excel).
- **Folien:** Titel und Stichpunkte je Folie, umsortieren, einfügen, löschen. Gespeichert als `.pptx` (PowerPoint).
- Gespeichert wird von selbst wenige Sekunden nach der letzten Änderung. PDFs und Bilder öffnen sich zum Ansehen in der App.

**Grenzen:** Das ist ein schlankes Office, kein Ersatz für Word, Excel und PowerPoint. Öffnest du eine Datei, die woanders entstanden ist, wird sie beim Speichern vereinfacht (Bilder, Diagramme und besondere Layouts gehen in der bearbeiteten Fassung verloren). Davor legt Lernhafen einmalig eine Kopie „(Original)“ an. Die Tabelle zeigt bis zu 2000 Zeilen und 52 Spalten.

## Von überall nutzen (Tailscale)

Lernhafen ist der eine Ort für alles: Mitschriften, Scans, Dateien, Dokumente, Tabellen, Präsentationen, Termine und Stundenplan. Damit du von überall darankommst:

1. Tailscale auf dem NAS bzw. Rechner installieren, auf dem Lernhafen läuft, und anmelden.
2. Tailscale auf dem Gerät installieren, mit dem du arbeitest, und mit demselben Konto anmelden.
3. Im Browser `http://<Tailscale-Adresse>:<Port>` öffnen, zum Beispiel `http://100.x.y.z:8091`. Am Handy „Zum Startbildschirm hinzufügen“.

Die Anleitung steht auch in der App unter „Mehr → Daten und Verbindungen → Von überall nutzen“. Dafür muss weder ein Port im Router geöffnet noch ein Dienst im Internet erreichbar sein. Setze `APP_PASSWORD`, sobald mehrere Personen im Tailscale-Netz sind.

## Sicherung

- **Von Hand:** „Mehr → Daten und Verbindungen → Sicherung → Alles herunterladen“ liefert eine `.tar.gz` mit Daten, Dateien und Scans. „Sicherung einspielen“ stellt sie auf einer anderen Installation wieder her (Umzug auf ein neues NAS). Passwörter und Anmeldedaten sind nicht enthalten.
- **Automatisch:** Jede Nacht (nach 3 Uhr) legt Lernhafen eine Sicherung in `data/backups` an und behält die letzten 7 (`BACKUP_KEEP`). Mit `BACKUP_DIR` zeigst du auf eine andere Platte oder ein anderes Volume, damit die Sicherung auch einen Plattenausfall überlebt. Beispiel in der Compose-Datei: Volume `/share/Sicherung:/backups` und `BACKUP_DIR=/backups`.

## Google Drive (optional)

Standardmäßig ist Drive **ausgeblendet**. Es erscheint unter „Mehr → Verbindungen“ erst, wenn für die Installation eine Google-App hinterlegt ist (Variablen `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`, oder fest im Image über GitHub-Secrets). Du brauchst Drive nicht, um Lernhafen von überall zu nutzen.

„Mehr → Verbindungen → Google Drive → Anmelden“. Lernhafen zeigt einen kurzen Code, den du auf `google.com/device` eingibst. Mehr ist für Nutzer nicht zu tun.

- Lernhafen legt in deinem Drive den Ordner „Lernhafen“ mit einem Unterordner je Fach an und gleicht dort alle Dateien, Dokumente und Scans ab, kurz nach jeder Änderung und alle 30 Minuten (`GDRIVE_SYNC_MINUTES`).
- **Sichern** (Standard): Lernhafen → Drive. **In beide Richtungen:** Änderungen aus Drive kommen zurück. Wurde dieselbe Datei auf beiden Seiten geändert, bleiben beide Fassungen erhalten. In Drive gelöschte Dateien landen im versteckten Ordner `.papierkorb`.
- Lernhafen sieht nur Dateien, die es selbst angelegt hat (Zugriffsbereich `drive.file`). Dateien, die du in Drive von Hand hinzufügst, erscheinen nicht.
- Verbindung trennen: in der App unter „Google Drive → Trennen“.

**Einmalig für den, der Lernhafen bereitstellt (nicht für die Nutzer):** Die App braucht eine Google-Registrierung (Client-ID und -Schlüssel).

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen und die **Google Drive API** aktivieren.
2. Unter „Google Auth Platform“ Zielgruppe **Extern** wählen und die App **veröffentlichen** („In Produktion“), sonst läuft die Verbindung nach 7 Tagen ab.
3. Unter „Clients“ einen Client vom Typ **„Fernseher und Geräte mit begrenzter Eingabe“** erstellen.
4. Client-ID und -Schlüssel im GitHub-Repo unter *Settings → Secrets and variables → Actions* als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` eintragen und den Build neu starten. Sie sind dann im Image enthalten. Alternativ: als Umgebungsvariablen setzen oder in der App eintragen (Dialog erscheint, wenn nichts hinterlegt ist).

Gut zu wissen: Der Schlüssel in einem öffentlichen Image lässt sich auslesen. Damit kann jemand die Anmeldeseite unter dem Namen der App anzeigen, aber nicht auf fremde Konten zugreifen. Für diesen Zugriffsbereich ist nach heutigem Stand keine Google-Prüfung nötig, die Zusage dafür liegt bei Google. Bis zu 100 Nutzer sind ohne Prüfung möglich.

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
- **Update:** siehe „Update per SSH“. Die Daten bleiben erhalten.
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

- **Automatisch getestet (57 Tests):** Plan-Umwandlung, Schulmanager-Passwort-Hash, iCal (Wiederholungen, Ausnahmen, Verlegung, Zeitzonen, mehrtägig), Kalender-Abruf mit Fehlern, Handy-Abo (Inhalt, Erinnerungen, Falten, Link erneuern), Dateien (Typen, Pfadtricks), Scans, Suche, Sicherung, Anmeldung und Sperre, alle Profile.
- **Im echten Browser durchgespielt (Handy- und Desktop-Breite, hell und dunkel):** Einrichtungs-Assistent, Kalender-Link, Heute mit Uhrzeiten, Mitschrift zur Stunde, Termin mit Schritten, Lernplan, Karteikarten-Runde, Noten, Datei- und Scan-Upload, Wochenplan von Hand, Handy-Abo, Suche.
- **Nicht getestet:** die Anbindung an das **echte Google** (getestet gegen einen nachgebauten Google-Server: Anmeldung per Code, Hochladen, Konflikte, Löschen, Schutz vor leerem Drive, Token-Erneuerung), der Dauerbetrieb auf dem NAS, Word-/Excel-/PowerPoint-Dateien aus fremden Programmen mit vielen Sonderfunktionen.
- **Noch nicht enthalten:** Seitenzuschnitt und Kantenerkennung per Hand, Handschrifterkennung, mehrere Nutzer, englische Oberfläche.

## Entwicklung

```
npm ci
npm test
DATA_DIR=./data PORT=8088 npm start
```

Aufbau: `src/` (Server, Schulmanager, iCal, Scans, Dateien, Anmeldung), `public/` (Oberfläche ohne Build-Schritt), `profiles/` (Profil-Pakete), `test/`.

Lizenz: MIT.
