---
type: playbook
title: "Publish a service from a datasource"
description: "Register a database, publish one of its tables as a layer, open it for reading, and confirm it serves — over the admin API, with the file-import and MCP variants of the same path."
resource: "https://honua.io/docs/playbooks/publish-a-service/"
tags: ["shape:playbook", "task:publish-a-service", "protocol:ogc-api-features", "capability:admin.control-plane", "capability:import.file", "capability:serve.ogc-api-features", "capability:serve.vector-tiles", "surface:admin-api", "agent:mcp"]
generated: "2026-08-28"
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

Use Bash, curl 7.76 or later (`--fail-with-body`), and `jq` 1.6 or later. The CLI check in [Confirm it serves](#confirm-it-serves) also needs Node.js 20.19.0 or later with `npm` (the minimum `@honua/sdk-js` 0.1.16 declares). Run every block in the same shell; failed HTTP requests must stop the procedure.

Supply a PostGIS database reachable **from the server**, its credentials, and an existing spatial table with an integer primary key and 1–1000 rows. Replace every placeholder below. `EXPECTED_SOURCE_COUNT` is the row count you measured directly in that source table before publication, not a count copied from the published endpoint. Use a new connection, service, and layer name for this walkthrough.

```bash
set -euo pipefail
DB_HOST="<DATABASE_HOST>"
DB_PORT="<DATABASE_PORT>"
DB_NAME="<DATABASE_NAME>"
DB_USER="<DATABASE_USER>"
DB_PASSWORD="<DATABASE_PASSWORD>"
DB_SSL_MODE="<DATABASE_SSL_MODE>"
DB_SSL_REQUIRED="<DATABASE_SSL_REQUIRED>"
CONNECTION_NAME="<CONNECTION_NAME>"
SOURCE_SCHEMA="<SOURCE_SCHEMA>"
SOURCE_TABLE="<SOURCE_TABLE>"
GEOMETRY_COLUMN="<GEOMETRY_COLUMN>"
PRIMARY_KEY="<PRIMARY_KEY>"
SOURCE_SRID="<SOURCE_SRID>"
REQUESTED_SERVICE="<SERVICE_NAME>"
REQUESTED_LAYER="<LAYER_NAME>"
EXPECTED_SOURCE_COUNT="<EXPECTED_SOURCE_COUNT>"
jq -en --argjson count "$EXPECTED_SOURCE_COUNT" '$count >= 1 and $count <= 1000 and ($count | floor == .)'
```

For a TLS-enabled database, use `Require` and `true` for the two SSL settings. Only an isolated local database without TLS should use `Disable` and `false`. These are database connection settings, not permission to disable TLS on a public endpoint. Keep the source table unchanged until the readback finishes.

This whole path is Community. No entitlement gate sits on registering a connection, importing a file, or publishing a layer; the only gated step in this playbook is importing from a live ArcGIS or GeoServer service, at the end.

## Register the connection

```bash
curl --fail-with-body -sS -X POST "$BASE/api/v1/admin/connections" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg name "$CONNECTION_NAME" --arg host "$DB_HOST" \
    --argjson port "$DB_PORT" --arg databaseName "$DB_NAME" --arg username "$DB_USER" \
    --arg password "$DB_PASSWORD" --arg sslMode "$DB_SSL_MODE" \
    --argjson sslRequired "$DB_SSL_REQUIRED" \
    '{name:$name,host:$host,port:$port,databaseName:$databaseName,username:$username,
      password:$password,provider:"PostGIS",sslMode:$sslMode,sslRequired:$sslRequired}')" \
  -o connection.json
CONNECTION_ID=$(jq -er '.data.connectionId | strings | select(length > 0)' connection.json)
```

Members are camelCase. `provider` defaults to `postgis` and `sslMode` defaults to `Require`, which cannot be `Disable` while `sslRequired` is true. Supply exactly one of `password` or `secretReference`, and `secretType` alongside a `secretReference` — credentials are encrypted at rest and never returned by the API.

Six providers have a connection driver behind them: `postgis`, `mysql`, `sqlserver`, `oracle`, `redshift` and `snowflake`. Aliases normalise onto those — `postgres` to `postgis`, `mssql` to `sqlserver`, `mariadb` to `mysql`, `esri` and `featureserver` to `arcgis-rest`. The vocabulary also names `postgresql`, `duckdb`, `databricks` and `arcgis-rest`, which have no driver registered; a connection created with one of them falls back to the PostgreSQL connection-string builder rather than being rejected, which is a slower way to find out. Stay on the six unless you know why you are not.

One thing to know before reaching for a generated client: `provider` is absent from the pinned admin OpenAPI snapshot, so a client built from it cannot set one and every connection it creates is `postgis`. The REST call above can.

## Test it before building on it

```bash
curl --fail-with-body -sS -X POST "$BASE/api/v1/admin/connections/$CONNECTION_ID/test" \
  -H "X-API-Key: $KEY" -o connection-test.json
jq -e --arg id "$CONNECTION_ID" '.data.connectionId == $id and .data.isHealthy == true' connection-test.json
```

The `{id}` segment takes the connection GUID or its name, on this route and the ones below. `POST /api/v1/admin/connections/test` tests a draft body before you save it, which is the cheaper order when credentials are the thing in doubt.

## Find a table and check it

```bash
curl --fail-with-body -sS "$BASE/api/v1/admin/connections/$CONNECTION_ID/tables" -H "X-API-Key: $KEY"
```

Lists the spatial tables with schema, geometry column, geometry type and SRID. `POST /api/v1/admin/connections/{id}/tables/validate` checks one before you commit to publishing it.

One member name to watch: the validate body takes `targetSrid` where the publish body below takes `srid`. Same idea, two spellings, and a copied payload will silently drop the value.

## Publish the layer

```bash
curl --fail-with-body -sS -X POST "$BASE/api/v1/admin/connections/$CONNECTION_ID/layers" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg schema "$SOURCE_SCHEMA" --arg table "$SOURCE_TABLE" \
    --arg layerName "$REQUESTED_LAYER" --arg serviceName "$REQUESTED_SERVICE" \
    --arg geometryColumn "$GEOMETRY_COLUMN" --arg primaryKey "$PRIMARY_KEY" \
    --argjson srid "$SOURCE_SRID" \
    '{schema:$schema,table:$table,layerName:$layerName,serviceName:$serviceName,
      geometryColumn:$geometryColumn,primaryKey:$primaryKey,srid:$srid}')" \
  -o publication.json
jq -e --arg schema "$SOURCE_SCHEMA" --arg table "$SOURCE_TABLE" \
  --arg service "$REQUESTED_SERVICE" --arg layer "$REQUESTED_LAYER" \
  '.data | .schema == $schema and .table == $table and .serviceName == $service
    and .layerName == $layer and (.layerId | type == "number")' publication.json
SERVICE_NAME=$(jq -er '.data.serviceName | strings | select(length > 0)' publication.json)
LAYER_ID=$(jq -er '.data.layerId | select(. >= 0 and floor == .)' publication.json)
```

`201 Created` with the new `layerId`. Required members are `schema`, `table` and `layerName`; the rest are optional — `serviceName`, `geometryColumn`, `geometryType`, `srid`, `primaryKey`, `fields` (an empty list means every field), and `enabled`, which defaults to true.

The attribution members are checked rather than stored blindly: `license` must be a valid SPDX expression or the literal `proprietary`, and `licenseUrl` and `sourceUrl` must be absolute HTTP(S) URLs with no credentials embedded in them.

A published layer can be switched off later with `PUT /api/v1/admin/connections/{id}/layers/{layerId}/enabled`, or in bulk with the same route minus the layer id. A disabled layer stops resolving on the data plane, which is worth knowing before you debug a `404` on the next step.

## Open it for reading

```bash
curl --fail-with-body -sS -X PUT "$BASE/api/v1/admin/services/$SERVICE_NAME/access-policy" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"allowAnonymous": true}'
curl --fail-with-body -sS -X PUT "$BASE/api/v1/admin/services/$SERVICE_NAME/layers/$LAYER_ID/metadata" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"accessPolicy":{"allowAnonymous":true}}'
```

The path segment is the **service name**, not an id. The request members are `allowAnonymous`, `allowAnonymousWrite`, `allowedRoles` and `allowedWriteRoles`; older examples showing `readRole`, `writeRole` or `allowAnonymousRead` do not match the request model the server accepts.

## Confirm it serves

```bash
curl --fail-with-body -sS "$BASE/ogc/features/collections" -o collections.json
COLLECTION_ID=$(jq -er --arg layer "$LAYER_ID" --arg title "$REQUESTED_LAYER" \
  '[.collections[] | select(.id == $layer and .title == $title)] | select(length == 1) | .[0].id' collections.json)
```

The selected collection must have the layer ID returned by this publication. Read that collection and independently compare its feature count with the source table:

```bash
curl --fail-with-body -sS \
  "$BASE/ogc/features/collections/$COLLECTION_ID/items?limit=$EXPECTED_SOURCE_COUNT" -o features.json
jq -e --argjson expected "$EXPECTED_SOURCE_COUNT" \
  '.type == "FeatureCollection" and (.features | length == $expected)
    and ([.features[].id] | unique | length == $expected)
    and all(.features[]; .geometry != null)' features.json
curl --fail-with-body -sS \
  "$BASE/rest/services/$SERVICE_NAME/FeatureServer/$LAYER_ID/query?where=1%3D1&returnCountOnly=true&f=json" \
  -o count.json
jq -e --argjson expected "$EXPECTED_SOURCE_COUNT" \
  '(has("error") | not) and .count == $expected' count.json
```

The same layer is reachable on the other protocol surfaces without further configuration: `/tiles/{layerId}/{z}/{x}/{y}.mvt` with its `/tiles/{layerId}/tile.json`, an auto style at `/api/styles/{layerId}.json`, and the Esri-shaped `/rest/services/{serviceId}/FeatureServer` with `/{layerId}` and `/{layerId}/query` beneath it.

From the CLI, query the same `SERVICE_NAME` and `LAYER_ID` assigned from `publication.json` above. Do not replace them with IDs from another pre-existing service:

```bash
npm install --global @honua/sdk-js@0.1.16
export HONUA_BASE_URL=$BASE
honua services
honua layers "$SERVICE_NAME"
honua query "$SERVICE_NAME/$LAYER_ID" --count
```

> The write half of this path has no CLI or high-level SDK wrapper — `services`, `layers` and `query` are the commands that exist, and the file-upload operation in particular is documented as having neither. [Track it here](https://github.com/honua-io/honua-sdk-js/issues/1424).

## Starting from a file instead

```bash
curl --fail-with-body -sS "$BASE/api/v1/admin/import/formats" -H "X-API-Key: $KEY"
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
