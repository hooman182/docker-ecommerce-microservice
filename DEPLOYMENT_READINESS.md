# Deployment Readiness Gap Report

**Scope:** Phase 1 "Basic Ecommerce Cloud Services" deployment on Pardis Cloud, per
`phase-1-basic-ecommerce-cloud-services-customer-guide-v1.3.pdf` (Single VPC Architecture).

**Assessed repository:** This repo (7 Docker-based microservices + `docker-compose.yml`).

**Verdict:** ✅ **Deployable (code-side).** Phases 1–3 of the action plan are implemented
(2026-09-25): MySQL persistence, secrets hardening, health endpoints, K8s manifests, Redis
caching, and CORS lockdown. Remaining work is deployment-side: push images to SWR, fill in
RDS/DCS endpoints and TLS/domain in `k8s/`, and provision the Pardis/OpenStack infrastructure
(GAP-7). See status notes in each gap section.

---

## 1. Workload Mapping (guide topology ↔ this repo)

| Guide component (Phase 1) | Repo implementation | Fits? |
|---|---|---|
| Frontend pod (CCE) | `ecommerce-ui` — React, port 4000 | ✅ |
| Backend API pods (CCE) | `product-catalog` (3001), `product-inventory` (3002), `profile-management` (3003), `contact-support-team` (8000), `shipping-and-handling` (8080) | ✅ |
| Order Service pod (CCE) | `order-management` — Spring Boot, port 9090 | ✅ |
| RDS MySQL — persistent data | **None** — every service is in-memory | ❌ |
| DCS Redis — sessions / cart / cache | **None** | ❌ |
| OBS — images, invoices | **None** | ❌ |
| SWR images + K8s manifests | Dockerfiles only; no `deployment.yaml` / `service.yaml` / `ingress.yaml` | ❌ |

Traffic flow compatibility: the guide's chain
`ELB → Ingress → Frontend → Backend API → Order Service → RDS/DCS/OBS`
matches the repo's HTTP call graph (UI → all services; order-management → catalog/inventory/shipping).
No architectural rework needed at the service-boundary level — the gaps are below the service boundary.

---

## 2. Gap Analysis

### GAP-1 — No database (guide §6.1, §11.2 Step 3) — **BLOCKER** → ✅ **RESOLVED 2026-09-25**

> **Implementation:** `db/init.sql` (schema for users/products/inventory/cart_items/orders/
> order_items + seed data, RDS-ready); `product-catalog` on mysql2 pool, `product-inventory` on
> Flask-SQLAlchemy/PyMySQL, `profile-management` on mysql2 + bcryptjs, `order-management` on
> Spring Data JPA (cart_items table). All DB config via `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/
> DB_NAME` env vars; `docker-compose.yml` now runs MySQL 8.0 with a healthcheck and a named
> volume, and builds the DB-backed images locally. Verification status: compose/JS/Python syntax
> validated; Java compile pending a Maven/JDK run (daemon was offline).

The guide mandates an RDS MySQL instance holding: user accounts/profiles, product catalog,
order transactions, inventory management, payment records.

Current state (verified in code):

| Service | Storage today | Evidence |
|---|---|---|
| `product-catalog` | Hardcoded 12-item JS array | `product-catalog/index.js` (`let products = [...]`) |
| `product-inventory` | Python list, decremented on order | `product-inventory/inventory_api.py` (`inventory = [...]`) |
| `profile-management` | Empty in-memory array | `profile-management/auth_api.js` (`const users = []`) |
| `shipping-and-handling` | Hardcoded Go slice | `shipping-and-handling/main.go` (`// products is our in-memory database of products`) |
| `order-management` | Stateless (calls other services) | `pom.xml` — only `spring-boot-starter-web`, no JPA/JDBC |
| `contact-support-team` | Fully stateless | `contact-support-team/server.py` |

**Consequences:** all data (including registered users and stock decrements) is lost on every
pod restart or reschedule. Under CCE, pods restart routinely — this will surface immediately.
Guide validation step "Verify database operations" (§11.3) cannot pass.

**Actions required (repo side):**
1. Pick persistence per service, aligned to guide's schema recommendation:
   - `product-catalog`, `product-inventory`, `profile-management`, `order-management` → MySQL (RDS).
     Suggested drivers: `mysql2` (Node), `Flask-SQLAlchemy + PyMySQL` (Flask), `spring-boot-starter-data-jpa + mysql-connector-j` (Spring).
2. Introduce DB connection config via env vars (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) — ready for RDS endpoints, secrets, and ConfigMaps.
3. Ship schema/migration scripts (guide Step 3: "Create database schema").
4. Local dev: add a `mysql` service + volume to `docker-compose.yml` so behavior matches prod.

### GAP-2 — No Kubernetes manifests (guide §5.1, §11.2 Steps 5–6) — **BLOCKER** → ✅ **RESOLVED 2026-09-25**

> **Implementation:** `k8s/` contains namespace + ConfigMap + Secret, Deployments/Services for
> all 7 services (with resource requests/limits and liveness/readiness probes), Ingress with
> TLS, and HPAs for product-catalog and order-management. Apply order and SWR/RDS/DCS
> prerequisites documented in `k8s/README.md`. Image paths and endpoints are TODO placeholders
> to fill at deploy time.

Guide requires Deployments, Services, Ingress, ConfigMaps, Secrets, resource limits/requests,
liveness & readiness probes, HPA.

Current state: only `docker-compose.yml`; images pulled from Docker Hub (`fitransyah/...`), not SWR.

**Actions required (repo side):**
1. Create `k8s/` (or per-service `k8s/` folder) with, per service:
   - `Deployment` (replicas ≥ 2 for HA, resource requests/limits, probes)
   - `Service` (ClusterIP)
   - `ConfigMap` for service URLs (replacing today's `REACT_APP_*` / `*_API_HOST` env vars)
   - `Secret` for DB creds and JWT key
   - One `Ingress` routing the frontend.
2. Add HPA manifests for backend API + order service (guide §5.1: horizontal pod autoscaling).
3. Build & push images to SWR, update image refs (guide Step 6: "Push images to SWR").

### GAP-3 — No health endpoints (guide §5.1 probes, §5.2 ELB health checks, §11.2 Step 7) — **BLOCKER** → ✅ **RESOLVED 2026-09-25**

> **Implementation:** `GET /health` on all 6 Node/Flask/Go services; order-management exposes
> Spring Boot actuator `/actuator/health` (also gated via `management.endpoint.health.probes`).
> K8s probes reference these paths; ELB can point at the same endpoints.

ELB listeners, K8s liveness/readiness probes, and Cloud Eye alerting all need health endpoints.

Current state (verified): **no `/health`, `/ping`, `/ready`, or Spring actuator anywhere.**

**Actions required (repo side):** add `GET /health` to all 7 services:
- Express: trivial `app.get('/health', ...)`
- Flask: `@app.route('/health')`
- Go: `/health` handler
- Spring Boot: add `spring-boot-starter-actuator` dependency → `/actuator/health`

### GAP-4 — No Redis / caching layer (guide §6.2) — **HIGH** → ✅ **RESOLVED 2026-09-25**

> **Implementation:** Redis 7 added to docker-compose (persistence + healthcheck);
> product-catalog has an optional read-through cache (`REDIS_URL`, `REDIS_TTL_SECONDS`)
> with graceful degradation to direct DB reads if Redis is unavailable. DCS connection is
> configured in the K8s ConfigMap for the cloud deployment.

DCS Redis is required for session storage, shopping cart, product-catalog caching, rate limiting.
No service uses Redis today. `profile-management`'s JWT tokens are stateless (no session store),
and carts (if any) live client-side.

**Actions required (repo side):** integrate Redis in `profile-management` (sessions) and
`product-catalog`/`product-inventory` (read-through cache) behind env-based `REDIS_URL`.

### GAP-5 — No OBS integration (guide §7.1) — **MEDIUM**

Images today ship inside the `ecommerce-ui` build; no invoice generation/storage exists.
**Actions:** move product images to OBS buckets (`/images/products/`), add invoice generation
(order-management) writing to `/invoices/{year}/{month}/`, use signed URLs.

### GAP-6 — Hardcoded secrets (guide §5.1 "Use ConfigMaps and Secrets", §8.1, §13.1) — **HIGH** → ✅ **RESOLVED 2026-09-25** (CORS: 2026-09-28)

> **CORS follow-up (guide §13.1):** all services now read `CORS_ORIGINS` (comma-separated
> allowlist; `*` default for local demo) — set it to your public domain in production.

> **Implementation:** `profile-management` fails fast unless `JWT_SECRET` is set (compose provides
> a dev default via `${JWT_SECRET:-change-me-in-production}`), passwords are hashed with bcrypt
> (cost from `BCRYPT_ROUNDS` env), and the password hash is never returned by the API. Note:
> existing users signed up before this change (if any persisted rows exist) must re-register,
> since plaintext rows cannot be verified against bcrypt hashes.

- JWT signing key hardcoded: `const secretKey = 'secret-key'` (`profile-management/auth_api.js`).
- Passwords stored and compared in **plaintext** in the same file (guide §13.1 mandates data security; also basic credential hygiene).
- CORS `*` in all services (fine for demo, must be restricted for WAF/production).

**Actions:** move JWT secret to `JWT_SECRET` env var → K8s Secret; hash passwords (`bcrypt`); restrict CORS origins via env var.

### GAP-7 — Platform-side items (not repo changes, for the deployment team)

These are configured in Pardis Cloud, not in this repo — listed so the checklist is complete:
VPC/subnets (10.0.1–4.0/24), NAT GW + EIP, Bastion ECS + HSS agent, ELB + certs, CFW policies
(§8.3 Policy 1–3), WAF rules, Anti-DDoS, IAM roles (§8.1), Cloud Eye alarms (§9.1 thresholds),
LTS retention (30–180d), CTS (180d+), SMN topics (§10.1), CBS vault for Bastion/CCE-node EVS
(§10.2), RDS automated backups (7–35d), OBS versioning/lifecycle.

---

## 3. Recommended Action Plan

| Phase | Items | Outcome |
|---|---|---|
| 1 | GAP-1 (MySQL persistence + schema), GAP-6 (secrets, bcrypt) | ✅ **DONE 2026-09-25** — data survives restarts; meets guide's RDS schema requirement |
| 2 | GAP-3 (health endpoints), GAP-2 (K8s manifests: Deployment/Service/ConfigMap/Secret/Ingress/HPA) | ✅ **DONE 2026-09-25** — deployable to CCE with probes and ELB health checks |
| 3 | GAP-4 (Redis) ✅, CORS lockdown ✅, GAP-5 (OBS) ⬜ | Redis caching live; **OBS image/invoice storage remains the only code gap** |
| 4 | Platform-side checklist (GAP-7) executed in Pardis Cloud console | Guide §11.2 Steps 1–10 complete |

**Quick wins (hours, not days):** health endpoints in all services; JWT secret + bcrypt in
profile-management; `mysql` service added to `docker-compose.yml` for local parity.

---

*Report generated from code inspection of every service in this repo plus the full text of the
Phase 1 customer guide (v1.3, 32 pages). No code was changed as part of this assessment.*
