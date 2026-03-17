# ---- Build Stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Cache les dépendances npm séparément
COPY package.json package-lock.json ./
RUN npm ci --quiet

# Build Angular en production
COPY . .
RUN npm run build -- --configuration=production

# ---- Run Stage ----
# Nginx Alpine = image ultra-légère pour servir les fichiers statiques
FROM nginx:1.27-alpine

# Supprime la config Nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Notre config personnalisée (gère le routing Angular)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copie les fichiers buildés
# Angular CLI v21 sort dans dist/<nom-projet>/browser/
COPY --from=build /app/dist/carbonaze_frontend/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
