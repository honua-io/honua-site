---
type: playbook
title: "Publish a service from a datasource"
description: "Register a database, publish one of its tables as a layer, open it for reading, and confirm it serves — over the admin API, with the file-import and MCP variants of the same path."
resource: "https://honua.io/docs/playbooks/publish-a-service/"
tags: ["shape:playbook", "task:publish-a-service", "protocol:ogc-api-features", "capability:admin.control-plane", "capability:import.file", "capability:serve.ogc-api-features", "capability:serve.vector-tiles", "surface:admin-api", "agent:mcp"]
timestamp: "2026-08-28"
---

# Publish a service from a datasource

Register a database, publish one of its tables as a layer, open it for reading, and confirm it serves — over the admin API, with the file-import and MCP variants of the same path.

Publishing a layer writes catalog metadata. It is configuration, not data movement: the table stays where it is, and every protocol the service enables reads through the same record.

## Before you start

Every `/api/v1/admin/*` route needs a credential. Send `X-API-Key` with the admin password or a scoped API key, or `Authorization: Bearer <jwt>` when OIDC is enabled — bearer tokens are evaluated first. A mapped client certificate works when mTLS is configured. A missing key answers `401` with `WWW-Authenticate: ApiKey realm="Honua Admin", header="X-API-Key"`.

On a compose install the admin password is `HONUA_ADMIN_PASSWORD`, which the root compose file defaults to `quickstart-admin-password` — a placeholder, and the reason that compose file binds to `127.0.0.1`.

```bash
BASE=http://localhost:8080
KEY=quickstart-admin-password
```

This whole path is Community. No entitlement gate sits on registering a connection, importing a file, or publishing a layer; the only gated step in this playbook is importing from a live ArcGIS or GeoServer service, at the end.

## Register the connection

```bash
curl -sS -X POST "$BASE/api/v1/admin/connections" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"city-gis","host":"db.example.internal","port":5432,
       "databaseName":"citygis","username":"honua_reader",
       "password":"db-password","sslMode":"Require"}'
```

Members are camelCase. `provider` defaults to `postgis` and `sslMode` defaults to `Require`, which cannot be `Disable` while `sslRequired` is true. Supply exactly one of `password` or `secretReference`, and `secretType` alongside a `secretReference` — credentials are encrypted at rest and never returned by the API.

Six providers have a connection driver behind them: `postgis`, `mysql`, `sqlserver`, `oracle`, `redshift` and `snowflake`. Aliases normalise onto those — `postgres` to `postgis`, `mssql` to `sqlserver`, `mariadb` to `mysql`, `esri` and `featureserver` to `arcgis-rest`. The vocabulary also names `postgresql`, `duckdb`, `databricks` and `arcgis-rest`, which have no driver registered; a connection created with one of them falls back to the PostgreSQL connection-string builder rather than being rejected, which is a slower way to find out. Stay on the six unless you know why you are not.

One thing to know before reaching for a generated client: `provider` is absent from the pinned admin OpenAPI snapshot, so a client built from it cannot set one and every connection it creates is `postgis`. The REST call above can.

## Test it before building on it

```bash
curl -sS -X POST "$BASE/api/v1/admin/connections/city-gis/test" -H "X-API-Key: $KEY"
```

The `{id}` segment takes the connection GUID or its name, on this route and the ones below. `POST /api/v1/admin/connections/test` tests a draft body before you save it, which is the cheaper order when credentials are the thing in doubt.

## Find a table and check it

```bash
curl -sS "$BASE/api/v1/admin/connections/city-gis/tables" -H "X-API-Key: $KEY"
```

Lists the spatial tables with schema, geometry column, geometry type and SRID. `POST /api/v1/admin/connections/{id}/tables/validate` checks one before you commit to publishing it.

One member name to watch: the validate body takes `targetSrid` where the publish body below takes `srid`. Same idea, two spellings, and a copied payload will silently drop the value.

## Publish the layer

```bash
curl -sS -X POST "$BASE/api/v1/admin/connections/city-gis/layers" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"schema":"public","table":"parcels","layerName":"city-parcels",
       "geometryColumn":"geom","srid":4326}'
```

`201 Created` with the new `layerId`. Required members are `schema`, `table` and `layerName`; the rest are optional — `serviceName`, `geometryColumn`, `geometryType`, `srid`, `primaryKey`, `fields` (an empty list means every field), and `enabled`, which defaults to true.

The attribution members are checked rather than stored blindly: `license` must be a valid SPDX expression or the literal `proprietary`, and `licenseUrl` and `sourceUrl` must be absolute HTTP(S) URLs with no credentials embedded in them.

A published layer can be switched off later with `PUT /api/v1/admin/connections/{id}/layers/{layerId}/enabled`, or in bulk with the same route minus the layer id. A disabled layer stops resolving on the data plane, which is worth knowing before you debug a `404` on the next step.

## Open it for reading

```bash
curl -sS -X PUT "$BASE/api/v1/admin/services/default/access-policy" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"allowAnonymous": true}'
```

The path segment is the **service name**, not an id. The request members are `allowAnonymous`, `allowAnonymousWrite`, `allowedRoles` and `allowedWriteRoles`; older examples showing `readRole`, `writeRole` or `allowAnonymousRead` do not match the request model the server accepts.

## Confirm it serves

```bash
curl -sS "$BASE/ogc/features/collections"
```

The collection should be listed with your `layerName` as its title. Take the `id` from that response — do not assume its spelling — and read features through it:

```bash
curl -sS "$BASE/ogc/features/collections/<collectionId>/items"
```

The same layer is reachable on the other protocol surfaces without further configuration: `/tiles/{layerId}/{z}/{x}/{y}.mvt` with its `/tiles/{layerId}/tile.json`, an auto style at `/api/styles/{layerId}.json`, and the Esri-shaped `/rest/services/{serviceId}/FeatureServer` with `/{layerId}` and `/{layerId}/query` beneath it.

From the CLI, the read side is covered:

```bash
npm install --global @honua/sdk-js
export HONUA_BASE_URL=http://localhost:8080
honua services
honua layers default
honua query default/1 --count
```

> The write half of this path has no CLI or high-level SDK wrapper — `services`, `layers` and `query` are the commands that exist, and the file-upload operation in particular is documented as having neither. [Track it here](https://github.com/honua-io/honua-sdk-js/issues/1424).

## Starting from a file instead

```bash
curl -sS "$BASE/api/v1/admin/import/formats" -H "X-API-Key: $KEY"
```

Ask the server rather than guessing; the detected extensions are `.geojson`, `.json`, `.esrijson`, `.wkb`, `.kml`, `.kmz`, `.gml`, `.wkt`, `.zip`, `.gpkg`, `.gpx`, `.csv`, `.parquet`, `.geoparquet`, `.fgb` and `.gdb.zip`.

`POST /api/v1/admin/import/preview` takes the same multipart shape and shows you what the import would produce. `POST /api/v1/admin/import/upload` runs it: multipart, with the file part and `TableName` required, plus `TargetSchema`, `SourceSrid`, `TargetSrid` (4326 when omitted), `OverwriteExisting`, `ForceBackground`, `TrackProgress` and `UploadId`. Field names bind case-insensitively, so the camelCase spellings in the guides and the PascalCase ones in the API spec both work. `POST /api/v1/admin/import/upload-url` takes the same options as JSON with a `sourceUrl` instead of a file part.

A background import answers with `jobId`, `statusUrl` and `cancelUrl`; poll `GET /api/v1/admin/import/jobs/{jobId}` and stop it with `POST /api/v1/admin/import/jobs/{jobId}/cancel`. Then publish the imported table exactly as above — the import lands a table, and publishing is still the step that makes it a service.

Importing from a live ArcGIS or GeoServer service instead (`POST /api/v1/admin/import/geoservices/start`, `POST /api/v1/admin/import/geoserver/start`) is the one Enterprise step in this playbook. Without the entitlement it refuses with `402` and a detail naming `entitlement: import.geoservices` or `entitlement: import.geoserver` — a different shape from the `503` capability-unavailable refusal in [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md), so branch on the status before you look for fields.

## Over MCP

`honua_publish_service` is the publish step, running through the `service.publish` operation and its operator-approval gate. It takes `connectionId`, `schema`, `table` and `layerName`, with the same optional `serviceName`, `description`, `geometryColumn`, `geometryType`, `srid`, `primaryKey` and `fields` as the REST body.

`honua_ingest_dataset` covers a narrow slice of import: inline data only, at most 4 MB, `csv` or `geojson`, returning the `connectionId`, `schema` and `table` you then hand to `honua_publish_service`. For anything larger or in another format its own description sends you to `POST /api/v1/admin/import/upload`.

Verification has tools: `honua_list_layers`, `honua_describe_layer`, `honua_query_features` and `honua_list_capabilities`. There is no separate list-services tool.

> **No MCP tool registers a data connection.** That is a real break in the chain, not an omission in this page: the ingest tool's own text tells the caller to register a connection over REST first and pass its name or id as `connectionId`. Until one exists, an MCP-only agent cannot complete this playbook from an empty server.

> **No MCP tool edits features, in any profile, by design** (ADR-0028). Publishing is a metadata operation; changing the data underneath it is not on this surface.

## Next

- [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) — what to do with the layer once it serves.
- [Install Honua locally with Docker](../install-with-docker/index.md) — where `BASE` and `KEY` above come from.
- Capability keys touched here: [admin.control-plane](../../../evidence-admin-control-plane.html), [import.file](../../../evidence-import-file.html), [import.geoservices](../../../evidence-import-geoservices.html), [import.geoserver](../../../evidence-import-geoserver.html), [serve.ogc-api-features](../../../evidence-serve-ogc-api-features.html), [serve.vector-tiles](../../../evidence-serve-vector-tiles.html).
