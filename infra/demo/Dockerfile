FROM node:26.12.1-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.14.0
ENV CI=1 T3CODE_BRAND=standalone
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec vp run --filter t3 build
RUN pnpm --filter t3 deploy --prod /opt/app
RUN mkdir -p /opt/demo/agent /opt/demo/recordings \
 && cp apps/server/scripts/dev-replay-agent.ts /opt/demo/agent/ \
 && cp infra/demo/recordings/* /opt/demo/recordings/
RUN mkdir -p /data \
 && node infra/demo/seed.ts \
      --server /repo/apps/server/dist/bin.mjs \
      --agent /opt/demo/agent/dev-replay-agent.ts \
      --recordings /opt/demo/recordings \
      --out /data \
 && rm -f /data/userdata/server-runtime.json

FROM node:26.12.1-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --create-home demo \
 && mkdir -p /data /opt/demo \
 && chown 10001:10001 /data
COPY --from=build /opt/app /opt/app
COPY --from=build /opt/demo/agent /opt/demo/agent
COPY --from=build /opt/demo/recordings /opt/demo/recordings
COPY --from=build --chown=10001:10001 /data /opt/demo/golden
COPY infra/demo/policy.json /etc/botduetdot/policy.json
COPY --chmod=755 infra/demo/entrypoint.sh /opt/demo/entrypoint.sh
ENV T3CODE_BRAND=standalone
USER 10001
EXPOSE 3773
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/demo/entrypoint.sh"]
