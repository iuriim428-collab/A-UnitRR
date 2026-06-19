# Production Deployment

This folder contains a practical deployment starter pack for running `AD Unit R`
on a dedicated Linux server behind `nginx`.

## What is included

- `env/ad-unit-r.env.example`
- `nginx/ad-unit-r.conf.example`
- `nginx/two-projects.conf.example`
- `systemd/ad-unit-r.service`
- `../scripts/build-production.sh`
- `../scripts/run-production.sh`

## Recommended topology

- `AD Unit R` runs as a separate `systemd` service on its own port
- the second project runs as a different service on a different port
- `nginx` routes each domain or subdomain to the correct upstream
- both projects keep separate env files, logs, and service users

Recommended example:

- `ad-unit-r.example.com` -> `127.0.0.1:8092`
- `other-app.example.com` -> `127.0.0.1:8093`

## Suggested server layout

```text
/opt/ad-unit-r/current
/etc/ad-unit-r/ad-unit-r.env
/var/log/ad-unit-r/
```

## Minimal rollout steps

1. Copy the repo to `/opt/ad-unit-r/current`
2. Copy `deploy/env/ad-unit-r.env.example` to `/etc/ad-unit-r/ad-unit-r.env`
3. Fill in `DATABASE_URL`, `SESSION_SECRET`, `APP_PASSWORD`, and domain values
4. Run `./scripts/build-production.sh`
5. Install `deploy/systemd/ad-unit-r.service`
6. Install one of the `nginx` configs and adjust domains and paths
7. Enable HTTPS with LetsEncrypt
8. Start the service with `systemctl enable --now ad-unit-r`

## Auto-deploy from GitHub

This repo also includes a production auto-deploy workflow:

- `.github/workflows/deploy-production.yml`
- `scripts/deploy-production.sh`

Recommended flow:

1. push changes to `main`
2. GitHub Actions copies the repo to `/opt/ad-unit-r/current`
3. the server rebuilds the app and restarts `ad-unit-r`

Required GitHub repository secrets:

- `AD_UNIT_R_DEPLOY_HOST`
- `AD_UNIT_R_DEPLOY_USER`
- `AD_UNIT_R_DEPLOY_KEY`

The current production server values are:

- host: `194.67.116.74`
- user: `root`

If you later move to a deploy user or another server, only the secrets need to change.

## Important security note

`AD Unit R` currently authenticates users with one shared password set through
`APP_PASSWORD`. That is acceptable for:

- VPN-only access
- office IP allowlists
- small trusted internal teams

It is not ideal for open public internet exposure. If managers need external
access, prefer at least one of these:

- VPN
- IP allowlist
- Cloudflare Access or similar identity proxy
- replacing shared-password auth with named users

## Tokens

The application can read WB, Ozon, and YM credentials from `api_settings` in
PostgreSQL. That is the preferred setup.

Environment variables remain supported as fallback only.
