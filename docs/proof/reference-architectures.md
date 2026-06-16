# Reference Architectures

These reference architectures describe the deployment shapes Honua actually runs
in, so an evaluator can map Honua onto their own environment without a custom
deck. They lead with the **modern-infrastructure and security** pillar.

The building blocks are grounded in the live platform: Honua Server runs on
**.NET 10** (the same runtime benchmarked in [GeoBench](benchmarks.md)), is
packaged as a container image, ships a **Helm** chart for Kubernetes / **Azure
AKS**, stores features in **PostGIS / PostgreSQL**, can use **object storage
(S3 / MinIO)** for rasters and tiles, and emits **OpenTelemetry**. Operations
are driven by **GitOps**. (See `operations.html`, `cloud-native.html`, and
`security.html` on the public site for the source claims behind these
components.)

## Cross-cutting principles

- **Standards + Esri on one server.** A single Honua deployment serves the
  GeoServices REST surface ArcGIS clients expect *and* OGC API Features / WMS /
  WFS / WMTS / WCS / STAC — no second stack. See the
  [Compatibility Matrix](compatibility-matrix.md).
- **Stateless server tier, stateful data tier.** Scale the Honua server tier
  horizontally; keep state in PostGIS and object storage.
- **Observability by default.** OpenTelemetry traces/metrics from the server
  tier into the operator's existing backend.
- **Security posture:** TLS, OAuth2 / API-key / token auth, RBAC down to
  layer/field/row (verified by the honua-esri-compat **auth** lane), audit
  logging, and a published DPA. **SOC 2 Type II is on the roadmap** (see the
  public `security.html` status table) — represent it as roadmap, not as a held
  certification.

## A. Single-node / pilot

The simplest shape — a single Honua container plus PostGIS — matching what
GeoBench and the compat harness spin up, and what powers
**[demo.honua.io](https://demo.honua.io)**.

```
[ Esri / OGC / STAC clients ]
            |
        (TLS)
            v
   [ Honua Server (container) ]
            |
            v
        [ PostGIS ]
```

- Use for: pilots, proofs-of-concept, single-team deployments, the public demo.
- Reproducible today via the honua-esri-compat `scripts/up.sh` (server + seeded
  PostGIS) and the geobench `docker-compose.yml`.

## B. Cloud-native HA on Kubernetes / AKS

Horizontally scaled stateless server tier behind an ingress, with managed
PostgreSQL/PostGIS and object storage, deployed by the Honua Helm chart.

```
        [ Ingress / TLS ]
               |
   [ Honua Server pods (N) ]  ---- OTel ----> [ observability backend ]
        |                |
        v                v
 [ managed PostGIS ]  [ object storage (S3 / MinIO) ]
```

- Use for: production, multi-team, HA / autoscaling deployments on Azure AKS or
  any Kubernetes.
- Deployment evidence: the **honua-helm** chart and **honua-iac** seeded-cloud
  provisioning (the same path that stands up the live demo).

## C. GitOps-managed operations

Honua's operational model is GitOps: desired state in git, with
plan / diff / sync / promote / rollback driven by the shipped honua-gitops
engine. This is the un-flagged "works today" AI-DevOps proof point, but the
reference architecture itself is the deployment-automation shape, independent of
any AI framing.

```
   [ git repo: desired state ]
            |
       (plan / diff)
            v
   [ honua-gitops engine ] --sync/promote/rollback--> [ Honua deployment (A or B) ]
```

- Use for: auditable, repeatable promotion across environments
  (dev → staging → prod).

## Productized deployment paths

| Shape | Maps to | Primary evidence source |
|-------|---------|-------------------------|
| Single-node / pilot | demo.honua.io, PoCs | geobench `docker-compose.yml`, honua-esri-compat `scripts/up.sh` |
| Kubernetes / AKS HA | production | honua-helm chart, honua-iac |
| GitOps operations | multi-env promotion | honua-gitops engine |
| Azure Marketplace | one-click cloud | honua-marketplace listing |

## Data gaps to fill

> `TODO(data): honua-io/honua-iac, honua-io/honua-helm` — Embed the canonical
> reference-architecture diagrams and the exact AKS/Helm sizing guidance
> (node pools, replica counts, PostGIS tier, object-store config) from the IaC /
> Helm repos. The ASCII sketches above are illustrative; replace them with the
> owning repos' published topology once available.

> `TODO(data): honua-server` — Add concrete sizing / capacity guidance keyed to
> the GeoBench profile (4 vCPU / 4 GB per server container) — e.g.
> "N req/s per pod at the benchmarked profile" — sourced from honua-server
> capacity docs, not estimated here.

> `TODO(data): honua-server / security` — Replace the roadmap SOC 2 line with the
> certified status and report availability once SOC 2 Type II is achieved; keep
> it as "Roadmap" until then.

> `TODO(data): honua-io/honua-marketplace` — Add the Azure Marketplace listing
> URL and one-click-deploy reference once the listing is published
> (honua-marketplace#11 → #12 → #13).
