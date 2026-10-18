FROM node:24-alpine AS package
WORKDIR /src
COPY package.json ./
COPY tools/build.mjs tools/build.mjs
COPY server server
COPY shared shared
COPY public public
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN node tools/build.mjs

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --from=package --chown=node:node /src/dist/ ./
RUN apk add --no-cache su-exec && mkdir -p /app/data && chown node:node /app/data && chmod +x server/entrypoint.sh
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/server/entrypoint.sh"]
CMD ["node", "server/index.js"]
