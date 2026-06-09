# ─── Stage 1: build Vite/React/TypeScript ────────────────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Copiar manifests antes do código para aproveitar cache de layer
COPY package*.json ./

# Instalar dependências de dev (necessárias para o build Vite)
RUN npm ci --ignore-scripts --legacy-peer-deps

# Copiar código-fonte e construir
COPY . .

# VITE_API_BASE_URL pode ser sobrescrito em build time via --build-arg
# Em produção Docker o Nginx faz proxy de /api → backend, então o padrão é vazio.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ─── Stage 2: servir com Nginx ────────────────────────────────────────────────
# Usamos alpine (não nginx:alpine) para que `apk upgrade` controle também o pacote
# nginx — na imagem oficial nginx:alpine o nginx é instalado via repo nginx.org e
# fica fora do alcance do `apk upgrade`, deixando CVEs HIGH sem patch.
# Alpine 3.23 inclui nginx >= 1.28.3-r3 (corrige CVE-2026-49975 e CVE-2026-9256).
FROM alpine:3.23 AS runtime

# nginx não tem versão pinada intencionalmente: `apk upgrade` garante patches futuros.
# hadolint ignore=DL3018
RUN apk upgrade --no-cache \
    && apk add --no-cache nginx \
    && rm -f /etc/nginx/http.d/default.conf

# No Alpine, vhosts ficam em http.d/ (não conf.d/ como na imagem nginx oficial)
COPY nginx.conf /etc/nginx/http.d/app.conf

# Copiar assets estáticos do build
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# alpine não herda o CMD da imagem nginx — definir explicitamente
CMD ["nginx", "-g", "daemon off;"]
