# ==========================================
# Dockerfile - Frontend React/Vite (TKA Tryout)
# Multi-stage: build static assets, lalu serve dengan nginx
# ==========================================

# --- Stage 1: build ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL di-"bake" ke dalam file JS hasil build saat ini,
# jadi WAJIB di-set sebagai build arg, bukan env var runtime biasa.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# --- Stage 2: serve ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
