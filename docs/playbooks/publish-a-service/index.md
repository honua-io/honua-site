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

On the install playbook, the admin password is the `HONUA_ADMIN_PASSWORD` generated in that shell, and the block below exports it as `KEY`. In a new shell, replace `quickstart-admin-password` below with your server's admin password, or export `HONUA_ADMIN_PASSWORD` first. `quickstart-admin-password` is the default only in the repository root compose file, which binds to `127.0.0.1`.

```bash
export BASE=http://localhost:8080
export KEY="${HONUA_ADMIN_PASSWORD:-quickstart-admin-password}"
```

The walk below uses Python 3.11 or later with `honua-admin` 0.1.12 and `honua-sdk` 0.1.19, then Node.js 22.12.0 or later with `npm` to install `@honua/sdk-js` 0.2.10. Those are the client packages the 2026.1 release manifest pins. `jq` 1.6 or later is the tool the hand-written REST count checks used; this walk compares the CLI count instead. Run every block in the same shell.

Supply a PostGIS database reachable **from the server**, its credentials, and an existing spatial table with an integer primary key and 1–1000 rows. Replace every placeholder below. `EXPECTED_SOURCE_COUNT` is the row count you measured directly in that source table before publication, not a count copied from the published endpoint. Use a new connection, service, and layer name for this walkthrough.

```bash
set -eo pipefail
export DB_HOST="<DATABASE_HOST>"
export DB_PORT="<DATABASE_PORT>"
export DB_NAME="<DATABASE_NAME>"
export DB_USER="<DATABASE_USER>"
export DB_PASSWORD="<DATABASE_PASSWORD>"
export DB_SSL_MODE="<DATABASE_SSL_MODE>"
export DB_SSL_REQUIRED="<DATABASE_SSL_REQUIRED>"
export CONNECTION_NAME="<CONNECTION_NAME>"
export SOURCE_SCHEMA="<SOURCE_SCHEMA>"
export SOURCE_TABLE="<SOURCE_TABLE>"
export GEOMETRY_COLUMN="<GEOMETRY_COLUMN>"
export PRIMARY_KEY="<PRIMARY_KEY>"
export SOURCE_SRID="<SOURCE_SRID>"
export REQUESTED_SERVICE="<SERVICE_NAME>"
export REQUESTED_LAYER="<LAYER_NAME>"
export EXPECTED_SOURCE_COUNT="<EXPECTED_SOURCE_COUNT>"
python3 -m venv .venv && . .venv/bin/activate
pip install honua-admin==0.1.12 honua-sdk==0.1.19
```

For a TLS-enabled database, use `Require` and `true` for the two SSL settings. Only an isolated local database without TLS should use `Disable` and `false`. These are database connection settings, not permission to disable TLS on a public endpoint. Keep the source table unchanged until the readback finishes.

This whole path is Community. No entitlement gate sits on registering a connection, importing a file, or publishing a layer; the only gated step in this playbook is importing from a live ArcGIS or GeoServer service, at the end.

## Register the connection

`honua-admin` 0.1.12 sends the admin JSON with camelCase members. `provider` is absent from its connection model, so the created connection uses the server default, `postgis`. Supply exactly one of `password` or `secretReference`. Credentials are encrypted at rest and never returned by the API.

```python
import os
from honua_admin import CreateSecureConnectionRequest, HonuaAdminClient, PublishLayerRequest

expected = int(os.environ["EXPECTED_SOURCE_COUNT"])
if not 1 <= expected <= 1000:
    raise SystemExit("EXPECTED_SOURCE_COUNT must be an integer from 1 to 1000")

admin = HonuaAdminClient(os.environ["BASE"], api_key=os.environ["KEY"])
created = admin.create_connection(CreateSecureConnectionRequest(
    name=os.environ["CONNECTION_NAME"],
    host=os.environ["DB_HOST"],
    port=int(os.environ["DB_PORT"]),
    database_name=os.environ["DB_NAME"],
    username=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    ssl_mode=os.environ["DB_SSL_MODE"],
    ssl_required=os.environ["DB_SSL_REQUIRED"].lower() == "true",
))
if not created.connection_id:
    raise SystemExit("create_connection returned no connection id")
print(created.connection_id)
```

Six providers have a connection driver behind them: `postgis`, `mysql`, `sqlserver`, `oracle`, `redshift` and `snowflake`. Aliases normalise onto those — `postgres` to `postgis`, `mssql` to `sqlserver`, `mariadb` to `mysql`, `esri` and `featureserver` to `arcgis-rest`. The vocabulary also names `postgresql`, `duckdb`, `databricks` and `arcgis-rest`, which have no driver registered; a connection created with one of them falls back to the PostgreSQL connection-string builder rather than being rejected, which is a slower way to find out. Stay on the six unless you know why you are not.

One thing to know before reaching for a generated client built from the pinned admin OpenAPI snapshot: `provider` is absent there too, so a client built from it cannot set one and every connection it creates is `postgis`.

## Test it before building on it

```python
probe = admin.test_connection(created.connection_id)
if not probe.is_healthy or probe.connection_id != created.connection_id:
    raise SystemExit(probe.message or "connection test failed")
print(probe.is_healthy)
```

The `{id}` segment takes the connection GUID or its name, on this route and the ones below. `POST /api/v1/admin/connections/test` tests a draft body before you save it, which is the cheaper order when credentials are the thing in doubt. `test_draft_connection` is that call.

## Find a table and check it

`GET /api/v1/admin/connections/{id}/tables` lists the tables the connection can see, with schema, geometry column, geometry type and SRID. `POST /api/v1/admin/connections/{id}/tables/validate` checks one before you commit to publishing it.

`discover_tables` in `honua-admin` 0.1.12 cannot read that list from a 2026.1 server yet. The server omits `maxLength` on columns that have none, the client's column model requires it, and the call raises `TypeError` ([honua-sdk-python#315](https://github.com/honua-io/honua-sdk-python/issues/315)). This walk lets the publish call below do the check instead: it validates the same schema and table on the server, and a table the connection cannot see is refused with `400` and `Table validation failed (source-table)`.

One member name to watch: the validate body takes `targetSrid` where the publish body below takes `srid`. Same idea, two spellings, and a copied payload will silently drop the value.

## Publish the layer

Send `enabled: true`. The Python model's default is also true, and `to_dict` includes the field. A server that still treats an omitted `enabled` as false will store a layer that does not resolve; this request does not omit it.

```python
published = admin.publish_layer(created.connection_id, PublishLayerRequest(
    schema=os.environ["SOURCE_SCHEMA"],
    table=os.environ["SOURCE_TABLE"],
    layer_name=os.environ["REQUESTED_LAYER"],
    service_name=os.environ["REQUESTED_SERVICE"],
    geometry_column=os.environ["GEOMETRY_COLUMN"],
    primary_key=os.environ["PRIMARY_KEY"],
    srid=int(os.environ["SOURCE_SRID"]),
    enabled=True,
))
if (published.schema != os.environ["SOURCE_SCHEMA"]
        or published.table != os.environ["SOURCE_TABLE"]
        or published.service_name != os.environ["REQUESTED_SERVICE"]
        or published.layer_name != os.environ["REQUESTED_LAYER"]
        or published.layer_id < 0
        or not published.enabled
        or not published.service_name):
    raise SystemExit("publication did not return the requested enabled layer")
print(published.service_name, published.layer_id, published.enabled)
```

`201 Created` with the new `layerId`. Required members are `schema`, `table` and `layerName`; the rest are optional — `serviceName`, `geometryColumn`, `geometryType`, `srid`, `primaryKey`, `fields` (an empty list means every field), and `enabled`.

The attribution members are checked rather than stored blindly: `license` must be a valid SPDX expression or the literal `proprietary`, and `licenseUrl` and `sourceUrl` must be absolute HTTP(S) URLs with no credentials embedded in them.

A published layer can be switched off later with `PUT /api/v1/admin/connections/{id}/layers/{layerId}/enabled`, or in bulk with the same route minus the layer id. `set_layer_enabled` is that call. A disabled layer stops resolving on the data plane, which is worth knowing before you debug a `404` on the next step.

## Open it for reading

```python
settings = admin.update_access_policy(published.service_name, allow_anonymous=True)
print(settings.access_policy.allow_anonymous if settings.access_policy else None)
path = "publish.env"
quoted_service = "'" + published.service_name.replace("'", "'\"'\"'") + "'"
path_text = f"SERVICE_NAME={quoted_service}\nLAYER_ID={published.layer_id}\n"
open(path, "w", encoding="utf-8").write(path_text)
```

`update_access_policy` sends `{"allowAnonymous": true}` to `PUT /api/v1/admin/services/{serviceName}/access-policy`. The path segment is the **service name**, not an id. The request members are `allowAnonymous`, `allowAnonymousWrite`, `allowedRoles` and `allowedWriteRoles`; older examples showing `readRole`, `writeRole` or `allowAnonymousRead` do not match the request model the server accepts.

The layer-scoped form is `PUT /api/v1/admin/services/{serviceName}/layers/{layerId}/metadata` with `{"accessPolicy":{"allowAnonymous":true}}`. `honua-admin` 0.1.12 has no method for that metadata body, so this walk opens the service.

## Confirm it serves

The same layer is reachable on the other protocol surfaces without further configuration: `/tiles/{layerId}/{z}/{x}/{y}.mvt` with its `/tiles/{layerId}/tile.json`, an auto style at `/api/styles/{layerId}.json`, and the Esri-shaped `/rest/services/{serviceId}/FeatureServer` with `/{layerId}` and `/{layerId}/query` beneath it.

From the `honua` CLI that `@honua/sdk-js` installs into this directory (run through `npx`, so nothing is installed globally), query the `SERVICE_NAME` and `LAYER_ID` this publication just wrote. Do not replace them with IDs from another pre-existing service. `--count` is the FeatureServer count, and it has to equal the source-table count measured before publication:

```bash
set -eo pipefail
. ./publish.env
export HONUA_BASE_URL="$BASE"
export HONUA_API_KEY="$KEY"
npm install --no-save @honua/sdk-js@0.2.10
npx honua services
npx honua layers "$SERVICE_NAME"
COUNT="$(npx honua query "$SERVICE_NAME/$LAYER_ID" --count)"
test "$COUNT" = "$EXPECTED_SOURCE_COUNT"
```

> The JavaScript CLI still has no write commands — `services`, `layers` and `query` are the commands that exist, and the file-upload operation in particular is documented as having neither. The Python client above is the supported register-and-publish path. [Track the CLI gap here](https://github.com/honua-io/honua-sdk-js/issues/1424).

## Starting from a file instead

`GET /api/v1/admin/import/formats` lists what this server will accept. Ask the server rather than guessing; the detected extensions are `.geojson`, `.json`, `.esrijson`, `.wkb`, `.kml`, `.kmz`, `.gml`, `.wkt`, `.zip`, `.gpkg`, `.gpx`, `.csv`, `.parquet`, `.geoparquet`, `.fgb` and `.gdb.zip`.

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
