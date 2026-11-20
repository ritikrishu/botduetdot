#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
KEEP_PATHS=()

prune=(-mindepth 1 -maxdepth 1)
for path in "${KEEP_PATHS[@]+"${KEEP_PATHS[@]}"}"; do
  prune+=(-not -name "$path")
done

docker compose down
docker compose run --rm --no-deps --entrypoint find demo /data "${prune[@]}" -exec rm -rf {} +
docker compose up -d
