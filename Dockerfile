FROM node:24-bookworm-slim
WORKDIR /app
COPY --chmod=0644 package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chmod=0644 server.js views.js preview.js style.css ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
