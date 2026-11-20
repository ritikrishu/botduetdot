# BotDuetDot review demo server

A sandboxed T3 Code server with seeded demo projects and scripted (replayed) agents, for store review.

- Build: `docker compose -f infra/demo/compose.yaml build`
- Run: `docker compose -f infra/demo/compose.yaml up -d` (port 3773)
- Pair: `docker compose -f infra/demo/compose.yaml exec demo node /opt/app/dist/bin.mjs pair --base-dir /data`
- Reset to the golden home: `infra/demo/reset.sh`

Threat model:

- The agent is a replay script. It runs no model and has no network or credentials.
- The container is read-only, non-root, capability-free and resource-limited. Managed policy caps runtime mode at approval-required.
- Demo data lives in the `demo-home` volume and holds only fixture repos. Reset discards everything else.
