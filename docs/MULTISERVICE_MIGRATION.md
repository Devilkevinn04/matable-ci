# Multiservice migration foundation

## Current phase: legacy behind a gateway

The existing application remains the only implementation of business behavior.
The API gateway forwards every request path, method, query string, body, and
application header to that application without changing the legacy `/api/*`
contract. The gateway health endpoint is local; upstream availability is
reported separately by `/ready`.

Start the local stack from the repository root:

```sh
docker compose --project-directory . -f infra/docker-compose.yml up --build
```

Open `http://127.0.0.1:4000`. The legacy application uses a named Docker volume
for its SQLite database. The gateway is bound to loopback by default. Set
`GATEWAY_PORT` to change the local port. `ADMIN_ACCESS_KEY` and
`KYC_ENCRYPTION_KEY` may be set in the shell for local use; do not commit them.

This Compose stack is for local development, not production. It intentionally
does not start placeholder domain services or unused PostgreSQL/Redis
instances, and it does not enable TLS. Production traffic must pass through a
trusted HTTPS ingress. Configure the legacy application's `APP_URL`,
`DATABASE_URL`, `TRUST_PROXY_HOPS`, and secrets according to the deployment
environment before exposing it.

## Gateway contract

- The frontend continues using its existing relative `/api/*` URLs.
- Public catalog discovery and storefront reads now use
  `GET /api/v1/catalog/storefronts` and
  `GET /api/v1/catalog/storefronts/:slug`. Both API prefixes currently share
  the legacy public-shop handler, preserving visibility checks and response
  shapes while the data and business rules remain in the monolith. Merchant
  catalog management, orders, and writes still use their existing routes.
- The gateway forwards to `LEGACY_BASE_URL`, which must be an HTTP(S) origin
  without credentials or a path.
- `GET /health` checks gateway liveness only.
- `GET /ready` checks that the legacy application responds successfully.
- `/api/v1/*` domain endpoints are not implemented yet. Do not route traffic to
  proposed domain services until their routes and contracts are migrated and
  tested.
- The gateway propagates cookies, authorization, content types, streaming
  request bodies, response cookies, and request IDs. Hop-by-hop headers are
  not forwarded.

## Migration guardrails

1. Keep the legacy application as the source of truth while no domain has been
   migrated.
2. Select one bounded domain and document its routes, data ownership, and
   compatibility requirements.
3. Extract behavior into one implementation, with contract and integration
   tests against the current legacy behavior.
4. Add an explicit gateway route for the migrated domain. Preserve legacy
   routes for all other domains.
5. Use a reversible traffic switch. Compare results and monitor error rates
   before moving ownership of persistent data.
6. Only then remove the corresponding legacy route and update the frontend
   client to a versioned API contract.

Do not copy the monolith into domain services. Avoid dual writes: data
ownership changes only with an explicit migration plan and reconciliation
strategy.
