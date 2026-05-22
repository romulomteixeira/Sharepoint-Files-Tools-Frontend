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
FROM nginx:1.27-alpine AS runtime

# Remover configuração padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar configuração customizada
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copiar assets estáticos do build
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx roda em foreground por padrão com CMD herdado da imagem base
