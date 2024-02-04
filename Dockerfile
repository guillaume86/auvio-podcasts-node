# syntax=docker/dockerfile:1.3.0-labs

FROM node:21.6.1-alpine3.18 as builder

ENV NODE_ENV production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

WORKDIR /auvio-podcasts

COPY package.json package-lock.json ./

RUN npm install

COPY public public/

COPY dist dist/

FROM alpine:3.18.0

# look up https://pptr.dev/chromium-support to match the version of Chromium with the version of Puppeteer
ARG CHROMIUM_VERSION=121.0.6167.85-r0
ENV TERM xterm-color

RUN <<EOF cat > /etc/apk/repositories
http://dl-cdn.alpinelinux.org/alpine/edge/main
http://dl-cdn.alpinelinux.org/alpine/edge/community
http://dl-cdn.alpinelinux.org/alpine/edge/testing
EOF

# Chromium, CA certificates, fonts
# https://git.alpinelinux.org/cgit/aports/log/community/chromium
RUN apk update && apk upgrade && \
    apk add --no-cache \
    ca-certificates \
    libstdc++ \
    chromium=${CHROMIUM_VERSION} \
    font-noto-emoji \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont \
    wqy-zenhei && \
    # /etc/fonts/conf.d/44-wqy-zenhei.conf overrides 'monospace' matching FreeMono.ttf in /etc/fonts/conf.d/69-unifont.conf
    mv /etc/fonts/conf.d/44-wqy-zenhei.conf /etc/fonts/conf.d/74-wqy-zenhei.conf && \
    rm -rf /var/cache/apk/*

# Node.js
COPY --from=builder /usr/local/bin/node /usr/local/bin/

# Application
COPY --from=builder /auvio-podcasts /auvio-podcasts

RUN addgroup -g 1000 node && \
    adduser -u 1000 -G node -s /bin/sh -D node && \
    mkdir /data && \
    chown node:node /data

WORKDIR /auvio-podcasts

USER node

EXPOSE 3000

ENV NODE_ENV production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser
ENV DATA_PATH /data
ENV PORT 3000
ENV DISABLE_SANDBOX true

# The --no-sandbox option is required, or --cap-add=SYS_ADMIN to docker run command
# https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#running-puppeteer-in-docker
# https://github.com/GoogleChrome/puppeteer/issues/290
# https://github.com/jessfraz/dockerfiles/issues/65
# https://github.com/jessfraz/dockerfiles/issues/156
# https://github.com/jessfraz/dockerfiles/issues/341

ENTRYPOINT ["node", "dist/index.js"]
