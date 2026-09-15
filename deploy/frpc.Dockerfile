# Block T deploy, revision 2 (2026-09-15): official frp binary release,
# not a third-party Docker image — the well-known snowdreamtech/frpc image
# on Docker Hub is stale (last tag 0.28.1, protocol-incompatible with the
# 0.71.0 frps installed on the VPS relay via deploy/vps-relay-setup.sh).
# Version pinned to match that exactly.
FROM debian:bookworm-slim
ARG FRP_VERSION=0.71.0
RUN apt-get update -qq && apt-get install -y -qq curl ca-certificates \
  && curl -fsSL "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz" -o /tmp/frp.tar.gz \
  && tar -xzf /tmp/frp.tar.gz -C /tmp \
  && mv /tmp/frp_${FRP_VERSION}_linux_amd64/frpc /usr/local/bin/frpc \
  && rm -rf /tmp/frp.tar.gz /tmp/frp_${FRP_VERSION}_linux_amd64 \
  && apt-get remove -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/local/bin/frpc", "-c", "/etc/frp/frpc.toml"]
