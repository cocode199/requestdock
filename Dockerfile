FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV REQUESTDOCK_DATA=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/LICENSE ./LICENSE
COPY --from=build --chown=node:node /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4310/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["serve", "--host", "0.0.0.0", "--port", "4310", "--data", "/data"]
