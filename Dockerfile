FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server.mjs chunk-uploads.mjs ./
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.mjs"]
