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
| **Office im Browser** | Dokumente, Tabellen und Präsentationen anlegen und direkt in der App bearbeiten (Word-, Excel- und PowerPoint-Dateien, über Collabora Online). Alles bleibt als normale Datei im Ordner des Fachs. Optional, siehe „Office im Browser“. |
| **Dateien und Ordner** | Pro Fach ein Ordner mit allen Dokumenten und Scans (`data/library/<Fach>/`). PDFs und Bilder öffnen sich direkt in der App. Der Plus-Knopf legt alles an einer Stelle an. |
| **Abgleich mit Google Drive** | Über das NAS (QNAP Hybrid Backup Sync, Synology Cloud Sync, rclone): Anmelden, Ordner wählen, fertig. Bei Google ist dafür nichts einzurichten. |
| **Google direkt** (optional) | Mit einem Klick bei Google anmelden: Mitschriften als **Google Docs** (Ordner „Lernhafen / Fach“ legt die App selbst an), Scans automatisch in **Drive** sichern, **Google Kalender** anzeigen und Termine mit Erinnerungen dorthin schreiben, ungelesene **Gmail**-Nachrichten anzeigen, Suche auch in Drive. |
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

## Office im Browser (Word, Excel, PowerPoint)

Mit dem eingebauten Office bearbeitest du Dokumente, Tabellen und Präsentationen **in der App**, ohne Programmwechsel. Dahinter arbeitet **Collabora Online** (kostenlose Entwickler-Ausgabe), ein zweiter Container, den Lernhafen über das Standardprotokoll WOPI nutzt. Die Dateien bleiben als `.docx`, `.xlsx` und `.pptx` in `data/library/<Fach>/` und lassen sich mit Word, Excel, PowerPoint, LibreOffice oder Google Drive öffnen.

**Aktivieren (einmalig):**
- **QNAP Container Station:** Inhalt von [`deploy/qnap-office.yml`](deploy/qnap-office.yml) einfügen, `APP_PASSWORD` ändern, erstellen.
- **Docker Compose:** `docker compose -f docker-compose.office.yml up -d`, Update mit `sh update.sh docker-compose.office.yml`.

Danach erscheinen in jedem Fach die Knöpfe „Neues Dokument“, „Neue Tabelle“ und „Neue Präsentation“, und hochgeladene Word-, Excel- und PowerPoint-Dateien lassen sich mit einem Klick öffnen. Das Office braucht etwa 1 GB Arbeitsspeicher und läuft auf x86-NAS am besten.

**Gut zu wissen:** Der Browser muss das Office auf Port 9980 unter demselben Rechnernamen erreichen wie Lernhafen. Das ist im Heimnetz der Normalfall. Bei einem Aufruf über HTTPS (zum Beispiel Tailscale Serve) muss auch das Office über HTTPS erreichbar sein, dafür gibt es `COLLABORA_PUBLIC_URL`.

## Mit Google Drive abgleichen (ohne Google-Projekt)

Alle Dateien liegen als normale Dateien in `data/library`. Dein NAS gleicht diesen Ordner selbst mit Google Drive ab, und die Anmeldung bei Google erledigt das NAS-Programm, nicht Lernhafen:

1. **QNAP:** App **Hybrid Backup Sync** → **Sync** → **Erstellen** → *Einseitige Synchronisierung* (NAS → Drive, am sichersten) oder *Zwei-Wege-Sync*.
2. Ziel **Google Drive** wählen und mit deinem Google-Konto anmelden.
3. Quelle: `/Container/lernhafen/data/library`, Ziel: ein Ordner in Drive.
4. Zeitplan festlegen, zum Beispiel stündlich.

Bei Synology heißt das Gegenstück „Cloud Sync“. Bearbeite ein Dokument nicht gleichzeitig hier und in Google. Die Anleitung steht auch in der App unter „Mehr → Verbindungen → Google Drive abgleichen“.

## Google direkt verbinden (optional)

Die Direktverbindung ist **nicht nötig**, wenn du den Abgleich über das NAS nutzt. Sie bietet zusätzlich Google Docs als Mitschrift-Format, den Google Kalender und Gmail. Sie setzt eine Google-App-Registrierung voraus, die der Betreiber einmalig anlegt:

**Für Nutzer:** „Mehr → Verbindungen → Google → Anmelden“, mit dem normalen Google-Konto anmelden und den Zugriff erlauben. Mehr ist nicht nötig. Danach legt die App die Mitschrift-Dokumente und Ordner selbst an. Schalter gibt es nur drei: Scans automatisch in Drive sichern, Termine in Google Kalender schreiben, Google-Kalender anzeigen. Google zeigt beim ersten Mal „Nicht bestätigte App“. Das ist normal, weil die App nicht von Google geprüft ist: auf „Erweitert“ und „Weiter“ klicken.

**Voraussetzung:** Die App braucht dafür eine Google-App-Registrierung (Client-ID und -Schlüssel). Sie wird **einmal vom Betreiber des Images** angelegt, nicht von jedem Nutzer:

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen und die Dienste **Drive, Docs, Kalender** und **Gmail** aktivieren.
2. Unter „Google Auth Platform“ die Zielgruppe **Extern** wählen und die App **veröffentlichen** („In Produktion“). Sonst läuft die Verbindung nach 7 Tagen ab.
3. Unter „Clients“ einen Client vom Typ **Webanwendung** erstellen. Als „Autorisierte Weiterleitungs-URI“ eintragen: `https://steffenlampers.github.io/Lernhafen/google-callback.html` (bei einem Fork die eigene GitHub-Pages-Adresse, dann auch `GOOGLE_REDIRECT_URI` setzen).
4. Client-ID und -Schlüssel in den GitHub-Einstellungen des Repos unter *Secrets and variables → Actions* als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` speichern und den Bau neu starten. Das Image enthält sie dann. Alternativ setzt jede Installation sie in der `.env`.
5. In den Repo-Einstellungen unter *Pages* die Quelle „Branch main, Ordner /docs“ wählen. Die Seite `google-callback.html` leitet den Anmelde-Code an die App im Heimnetz weiter. Sie speichert nichts und leitet nur zu Adressen im privaten Netz weiter (Heimnetz, `.local`, Tailscale).

**Gut zu wissen:**
- Ohne `APP_PASSWORD` lässt sich Google nicht verbinden, damit nicht jeder im Netz auf dein Konto kommt.
- Eine nicht geprüfte Google-App darf bis zu **100 Nutzer** haben. Für mehr braucht Google eine Prüfung („Verifizierung“), für Drive und Gmail mit Sicherheitsgutachten.
- Der Schlüssel im öffentlichen Image lässt sich auslesen. Damit kann jemand die Anmeldeseite unter dem Namen der App anzeigen, aber nicht auf Konten zugreifen, denn die Zugangs-Tokens liegen nur bei den Nutzern (`data/google.json`, Rechte 600).
- **Eigene Google-App statt der zentralen:** Enthält das Image keine Zugangsdaten, führt die App Schritt für Schritt durch das Anlegen (Client-Typ „Desktop-App“). Danach kopiert man einmal die Adresse aus dem Browser in die App.
- Verbindung trennen: in der App unter „Google → Trennen“. Dabei wird der Zugriff bei Google widerrufen.

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

- **Automatisch getestet (53 Tests):** Plan-Umwandlung, Schulmanager-Passwort-Hash, iCal (Wiederholungen, Ausnahmen, Verlegung, Zeitzonen, mehrtägig), Kalender-Abruf mit Fehlern, Handy-Abo (Inhalt, Erinnerungen, Falten, Link erneuern), Dateien (Typen, Pfadtricks), Scans, Suche, Sicherung, Anmeldung und Sperre, alle Profile.
- **Im echten Browser durchgespielt (Handy- und Desktop-Breite, hell und dunkel):** Einrichtungs-Assistent, Kalender-Link, Heute mit Uhrzeiten, Mitschrift zur Stunde, Termin mit Schritten, Lernplan, Karteikarten-Runde, Noten, Datei- und Scan-Upload, Wochenplan von Hand, Handy-Abo, Suche.
- **Nicht getestet:** Das Office mit dem **echten Collabora** (getestet mit einem nachgebauten Collabora: Editor-Adresse, WOPI-Zugriff mit Token, Laden und Speichern, im Browser mit Öffnen, Speichern und Zurück; ob Collabora die Einbettung bei deiner Adresse zulässt, zeigt der erste Versuch), die Anmeldung und alle Aufrufe mit **echtem Google** (getestet mit einem nachgebauten Google-Server, im Browser und automatisch: Anmelden mit Rückruf, Token-Erneuerung, Drive, Docs, Kalender lesen und schreiben, Gmail, Scans in Drive sichern; ob Google die Weiterleitungsseite auf github.io bei deiner App akzeptiert, zeigt erst der erste Versuch), die eigene IP per macvlan auf einem echten NAS (die Konfiguration ist geprüft, der Start mit Port 80 ohne Root läuft im GitHub-Test), der Live-Abruf bei Schulmanager mit echten Zugangsdaten, die Texterkennung mit Tesseract im fertigen Image (der GitHub-Lauf prüft, dass Deutsch und die PDF-Schrift vorhanden sind), der Betrieb auf einem echten NAS und die Kalender-Abos auf iPhone und Android.
- **Noch nicht enthalten:** Seitenzuschnitt und Kantenerkennung per Hand, Handschrifterkennung, mehrere Nutzer, englische Oberfläche.

## Entwicklung

```
npm ci
npm test
DATA_DIR=./data PORT=8088 npm start
```

Aufbau: `src/` (Server, Schulmanager, iCal, Scans, Dateien, Anmeldung), `public/` (Oberfläche ohne Build-Schritt), `profiles/` (Profil-Pakete), `test/`.

Lizenz: MIT.
