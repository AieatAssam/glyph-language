# Sandbox for the merge-gate check. Holds no secrets and runs agent-written code.
# Network is disabled and the repo is mounted read-only at run time (see run.sh).
FROM node:24-bookworm-slim

ARG WASMTIME_VERSION=50.0.2
# Set by BuildKit for each platform; picks the matching wasmtime release asset.
ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-yaml python3-jsonschema ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /usr/bin/python3 /usr/local/bin/python

RUN case "${TARGETARCH:-amd64}" in \
      amd64) WT_ARCH=x86_64 ;; \
      arm64) WT_ARCH=aarch64 ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/wasmtime.tar.xz \
      "https://github.com/bytecodealliance/wasmtime/releases/download/v${WASMTIME_VERSION}/wasmtime-v${WASMTIME_VERSION}-${WT_ARCH}-linux.tar.xz" \
 && mkdir -p /tmp/wt \
 && tar -xJf /tmp/wasmtime.tar.xz -C /tmp/wt --strip-components=1 \
 && install -m 0755 /tmp/wt/wasmtime /usr/local/bin/wasmtime \
 && rm -rf /tmp/wt /tmp/wasmtime.tar.xz \
 && wasmtime --version

RUN useradd --create-home --uid 10001 runner
ENV HOME=/home/runner PYTHONDONTWRITEBYTECODE=1
# /out is root-owned and private to the checker: untrusted code runs as uid 65534 and cannot open it.
RUN install -d -m 0700 -o root -g root /out
WORKDIR /checker
# node's docker-entrypoint rewrites unknown commands to `node CMD`; run commands as given.
ENTRYPOINT []
