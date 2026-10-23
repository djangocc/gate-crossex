# Self-hosted deployment

Build from a source-only checkout. Keep `.env`, logs, trading databases, private keys and local state out of the build context. The container uses a fresh persistent data directory; credentials can be added through the protected web UI after deployment.

```sh
sudo docker build -f deploy/Dockerfile -t allinone:RELEASE .
sudo env ALLINONE_IMAGE=allinone:RELEASE ALLINONE_HOST=app.example.com bash deploy/run-container.sh
```

The script requires a free loopback port 17840 and refuses to replace an existing `allinone-terminal` container. It creates `/opt/allinone/data` owned by UID 1000, keeps the image filesystem read-only, sets resource/log limits and enables automatic restarts. Every process start locks live trading. Store release tags/digests before upgrades and preserve the data directory when replacing a container. Do not run two backend processes against the same SQLite database.

The optional Compose file uses the same settings and requires Docker Compose. Set `ALLINONE_IMAGE` and `ALLINONE_HOST` before using it.

Create a Cloudflare Access self-hosted application for the full hostname, with the desired identity provider, allow policy and session duration. Then add a published application route to the existing cloudflared tunnel targeting `http://127.0.0.1:17840`. The backend remains bound to loopback; no public listener or inbound firewall change is required. `GCT_ALLOWED_HOSTS` and `GCT_FRONTEND_ORIGIN` must match the external hostname so HTTP, secure credential forms and WebSocket origin checks work through the tunnel.

Verify anonymous requests to the page and API are redirected to Access, the origin health is OK, the live mode is locked, WebSocket market updates arrive after login, and existing applications on the host are unaffected. No real order is needed for deployment verification.
