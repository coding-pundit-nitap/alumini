# PostgreSQL with pgBackRest for the production stack. CI publishes it with the app images and
# servers release it by digest; `deploy.sh build` builds it on the server instead.
# pgBackRest reads all of its configuration from PGBACKREST_* variables that compose.yml sets, so the image
# holds no repository address or secret. Alpine packages an older pgBackRest, so it is built from the release
# tarball; the runtime libraries come from the same Alpine release as the base image.
ARG POSTGRES_IMAGE=postgres:18.6-alpine3.24
ARG PGBACKREST_VERSION=2.59.3
ARG PGBACKREST_SHA256=b2a95535a68e326a0f316c2d8d3243bc30092cf1ce9de9be5d142e204d2d4263

FROM ${POSTGRES_IMAGE} AS pgbackrest
ARG PGBACKREST_VERSION
ARG PGBACKREST_SHA256
# hadolint ignore=DL3018
RUN apk add --no-cache build-base meson ninja pkgconf curl \
        curl-dev openssl-dev lz4-dev zstd-dev bzip2-dev zlib-dev libxml2-dev yaml-dev libssh2-dev
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
WORKDIR /src
RUN curl -fsSL -o /tmp/pgbackrest.tar.gz \
        "https://github.com/pgbackrest/pgbackrest/archive/release/${PGBACKREST_VERSION}.tar.gz" \
    && echo "${PGBACKREST_SHA256}  /tmp/pgbackrest.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/pgbackrest.tar.gz --strip-components=1 \
    && meson setup build --buildtype=release -Dprefix=/usr \
    && ninja -C build \
    && install -D -m 0755 build/src/pgbackrest /out/pgbackrest

FROM ${POSTGRES_IMAGE}
# hadolint ignore=DL3018
RUN apk add --no-cache openssl libssl3 lz4-libs zstd-libs libbz2 zlib libxml2 yaml libssh2 \
    && install -d -o postgres -g postgres -m 0750 /var/log/pgbackrest /var/lib/pgbackrest /var/spool/pgbackrest
COPY --from=pgbackrest /out/pgbackrest /usr/bin/pgbackrest
RUN pgbackrest version
