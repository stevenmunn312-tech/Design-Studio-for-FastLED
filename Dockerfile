# The Studio's web app as a static site, for hosting the embeddable demo
# (docs/design/embed-mode.md). This image holds the browser app only: no upload
# helper, no compiler, nothing that reaches a board. Open it with `?embed`.
#
#   docker build -t design-studio-web .
#   docker run --rm -p 8080:8080 design-studio-web

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# The host names the port to listen on (Render sets PORT); 8080 otherwise.
# The nginx image fills ${PORT} into the template when the container starts.
ENV PORT=8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
