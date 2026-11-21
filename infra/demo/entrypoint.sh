#!/bin/sh
set -eu
if [ ! -f /data/userdata/statev2.sqlite ]; then
  cp -a /opt/demo/golden/. /data/
fi
exec node /opt/app/dist/bin.mjs serve --base-dir /data --host 0.0.0.0 --port 3773
