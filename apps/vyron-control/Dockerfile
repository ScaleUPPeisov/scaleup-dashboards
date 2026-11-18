FROM node:22-alpine
WORKDIR /opt/vyron-control
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
RUN mkdir -p /data /config && chown node:node /data

USER node
ENV HOST=0.0.0.0
ENV PORT=8787
ENV VYRON_CONTROL_DB=/data/state.json
ENV VYRON_CHANNELS_FILE=/config/channels.json
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
