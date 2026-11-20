# BotDuetDot review demo server

A sandboxed T3 Code server with seeded demo projects and scripted (replayed) agents, for store review.

- Build: `docker compose -f infra/demo/compose.yaml build`
- Run: `docker compose -f infra/demo/compose.yaml up -d` (host port 3780, override with `DEMO_PORT`; 3773 is left free for a local BotDuetDot)
- Pair: `docker compose -f infra/demo/compose.yaml exec demo node /opt/app/dist/bin.mjs pair --base-dir /data`, then connect to `http://<host>:3780`
- Reset to the golden home: `infra/demo/reset.sh`

Threat model:

- The agent is a replay script. It runs no model, holds no credentials and makes no network requests. Outbound access from the container is not restricted in this local setup; an egress allowlist comes with the hosted deployment.
- The container is read-only, non-root, capability-free and resource-limited. Managed policy disables cookie import, webhook tasks and telemetry and allows only the ACP registry driver.
- Demo data lives in the `demo-home` volume and holds only fixture repos. Reset discards everything else.

Verify a running container can run the demo agent (expect exit 0, status completed):

`docker exec botduetdot-demo-demo-1 node /opt/app/dist/bin.mjs thread start /data/workspaces/acme-weather "Add usage docs" --provider demo --model code-change --wait --json --base-dir /data`
