# prompton-docs — Markdown docs rendered at build time, served by nginx with Accept negotiation.
#   docker build --build-arg DOCS_URL=https://docs.dev.prompton.ai --build-arg APP_URL=https://app.dev.prompton.ai --build-arg HOME_URL=https://dev.prompton.ai -t prompton-docs:dev-local .
FROM node:22-alpine AS build
ARG DOCS_URL=https://docs.prompton.ai
ARG APP_URL=https://app.prompton.ai
ARG HOME_URL=https://prompton.ai
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY build.mjs ./
COPY assets assets
COPY static static
COPY docs docs
RUN DOCS_URL="$DOCS_URL" APP_URL="$APP_URL" HOME_URL="$HOME_URL" node build.mjs

FROM nginx:1.27-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
