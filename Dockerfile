FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ai/package.json ./packages/ai/
COPY packages/app/package.json ./packages/app/
COPY packages/builder/package.json ./packages/builder/
COPY packages/core/package.json ./packages/core/
COPY packages/element/package.json ./packages/element/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/parametric/package.json ./packages/parametric/
COPY packages/storage/package.json ./packages/storage/
COPY packages/three/package.json ./packages/three/
COPY packages/ui/package.json ./packages/ui/
COPY packages/wasm/package.json ./packages/wasm/
COPY packages/web/package.json ./packages/web/
COPY plugins/helloworld-js/package.json ./plugins/helloworld-js/
COPY plugins/helloworld-ts/package.json ./plugins/helloworld-ts/
COPY plugins/macro/package.json ./plugins/macro/
COPY plugins/visual-programming/package.json ./plugins/visual-programming/

RUN npm ci --no-audit --no-fund

COPY . .
ENV NODE_ENV=production
ENV SKIP_TYPECHECK=true
ENV NODE_OPTIONS="--max-old-space-size=768"
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
