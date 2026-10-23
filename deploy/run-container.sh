#!/usr/bin/env bash
set -euo pipefail
: "${ALLINONE_IMAGE:?Set ALLINONE_IMAGE to the built release tag}"
: "${ALLINONE_HOST:?Set ALLINONE_HOST to the Access-protected hostname}"
ALLINONE_DATA_DIR="${ALLINONE_DATA_DIR:-/opt/allinone/data}"
if docker container inspect allinone-terminal >/dev/null 2>&1; then
  echo 'Container allinone-terminal already exists; stop and preserve it before replacing a release.' >&2
  exit 1
fi
install -d -m 700 -o 1000 -g 1000 "$ALLINONE_DATA_DIR"
docker run -d --name allinone-terminal --restart unless-stopped --network host \
  --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 768m --cpus 1 \
  --tmpfs /tmp:size=64m,mode=1777 \
  --mount "type=bind,source=$ALLINONE_DATA_DIR,target=/data" \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --env GCT_HOST=127.0.0.1 --env GCT_PORT=17840 --env GCT_FRONTEND_PORT=17840 \
  --env "GCT_ALLOWED_HOSTS=$ALLINONE_HOST" --env "GCT_FRONTEND_ORIGIN=https://$ALLINONE_HOST" \
  --env GCT_DATA_DIR=/data --env GCT_CREDENTIAL_ENV_PATH=/data/credentials.env \
  --health-cmd "node -e \"fetch('http://127.0.0.1:17840/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
  --health-interval 30s --health-timeout 5s --health-retries 3 --health-start-period 45s \
  "$ALLINONE_IMAGE"
