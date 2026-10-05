# Lernhafen – schlankes Image für x86 und ARM (QNAP-NAS)
FROM node:22-alpine

LABEL org.opencontainers.image.title="Lernhafen" \
      org.opencontainers.image.description="Selbst gehostete Lernzentrale für Ausbildung und Studium (ADHS-freundlich) mit Scannen und Texterkennung" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    TZ=Europe/Berlin \
    DATA_DIR=/data \
    PORT=8088

# tzdata: lokale Zeiten; su-exec: Rechte nach dem Start abgeben; tini: sauberes Beenden; tesseract: Texterkennung (Deutsch, Englisch)
RUN apk add --no-cache tzdata su-exec tini tesseract-ocr tesseract-ocr-data-deu tesseract-ocr-data-eng wget \
 && ( [ -f /usr/share/tessdata/pdf.ttf ] || wget -q -O /usr/share/tessdata/pdf.ttf https://github.com/tesseract-ocr/tessconfigs/raw/main/pdf.ttf )

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY profiles ./profiles
COPY templates ./templates
COPY public ./public
# Optional: Zugangsdaten der zentralen Google-App (aus GitHub-Secrets beim Bauen). Wer das Image nutzt, meldet sich dann nur noch bei Google an.
ARG GOOGLE_CLIENT_ID=""
ARG GOOGLE_CLIENT_SECRET=""
RUN if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then printf '{"clientId":"%s","clientSecret":"%s"}' "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" > /app/google-client.json; fi
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

VOLUME ["/data"]
EXPOSE 8088

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
