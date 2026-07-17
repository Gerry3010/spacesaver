# Two-stage: build the bundle, then serve statically with nginx.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:standalone

FROM nginx:alpine
COPY deploy/nginx-container.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/index.html /app/multi.html /app/styles.css /usr/share/nginx/html/
COPY --from=build /app/favicon.ico /app/site.webmanifest /usr/share/nginx/html/
COPY --from=build /app/icons /usr/share/nginx/html/icons/
COPY --from=build /app/dist/bundle.js /usr/share/nginx/html/dist/
COPY --from=build /app/dist/spacesaver.html /usr/share/nginx/html/dist/
