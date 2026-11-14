---
type: guide
title: "Build with gRPC and cloud-native files"
description: "Start with gRPC for authenticated live queries and edits, and CDN-served files for public read-heavy data."
resource: "https://honua.io/docs/guides/native-first/"
tags: ["shape:guide", "task:build", "audience:developer"]
generated: "2026-11-13"
---

# Build with gRPC and cloud-native files

Use **gRPC (geospatial-grpc)** for authenticated queries against live data and for edits. Use **PMTiles, GeoParquet and Cloud Optimized GeoTIFF (COG)** over HTTP range requests through your CDN for public, read-heavy data. A single application can use both: a public basemap from files and an authenticated feature editor over gRPC.

Browsers need **gRPC-Web**, using a client such as Connect; they cannot call a native HTTP/2 gRPC endpoint directly. gRPC responses are not CDN-cacheable, so repeated public reads belong in cloud-native files. Private files need signed URLs and must be regenerated when their source data changes.

## 1. Query live data from a browser

This example uses the published geospatial-grpc bindings and Connect's **gRPC-Web transport**. It does not require Honua to serve the separate Connect wire protocol. The server exposes gRPC-Web on its HTTP endpoint (container port 8080); native gRPC uses port 8081. Put TLS in front of production endpoints. See the [server gRPC reference](https://github.com/honua-io/honua-server/blob/trunk/docs/reference/protocols/grpc.md) for the services, limits and release-specific contract.

First [install the server](../../playbooks/install-with-docker/index.md), publish a service and layer, and configure a user who can read it. The example assumes service `roads`, layer `0`; replace those with your published identifiers. Configure the server's allowed CORS origins for your app, including its development origin, and allow the authorization and gRPC-Web request headers. Ensure your TLS proxy forwards gRPC-Web requests and responses. Use a short-lived user access token from your configured identity provider; never embed an admin key or client secret in browser code.

Create a browser app with Node.js 20.19+ or 22.12+:

```bash
mkdir honua-native-browser
cd honua-native-browser
npm init -y
npm install @honua/geospatial-grpc@1.0.0 @connectrpc/connect@2 @connectrpc/connect-web@2 @bufbuild/protobuf@2
npm install --save-dev vite@7
```

`@honua/geospatial-grpc@1.0.0` supplies the stable `geospatial.v1` descriptors. Match the protocol package to your server release; installing bindings does not enable additional server operations. Keep the generated npm lockfile for reproducible dependencies.

Save this as `index.html`:

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>Honua native query</title>
  <form id="query">
    <label>Server HTTPS URL <input id="server" type="url" required></label>
    <label>User access token <input id="token" type="password" required autocomplete="off"></label>
    <button>Query roads</button>
  </form>
  <pre id="result" aria-live="polite"></pre>
  <script type="module" src="/main.js"></script>
</html>
```

Save this as `main.js`. These static imports let Vite include the browser transport and protobuf descriptors in the bundle:

```javascript
import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { FeatureService } from "@honua/geospatial-grpc/geospatial/v1/feature_service_pb.js";

document.querySelector("#query").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.querySelector("#result");
  const token = document.querySelector("#token").value;
  const client = createClient(FeatureService, createGrpcWebTransport({
    baseUrl: document.querySelector("#server").value.replace(/\/$/, ""),
    interceptors: [(next) => async (request) => {
      request.header.set("Authorization", `Bearer ${token}`);
      return next(request);
    }],
  }));
  try {
    const response = await client.queryFeatures({
      serviceId: "roads",
      layerId: 0,
      where: "1=1",
      outFields: ["*"],
      returnGeometry: true,
      resultRecordCountLong: 25n,
    });
    output.textContent = `Received ${response.features.length} features`;
  } catch (error) {
    output.textContent = String(error);
  }
});
```

Run `npx vite --host 127.0.0.1` and open the local URL it prints. Enter your server's HTTPS origin and user token. A successful query prints the feature count. A CORS error requires fixing the server/proxy origin policy; an authorization error requires checking the token and layer access policy. The form keeps the token in memory only; use your application's sign-in and refresh flow for production.

Build with `npx vite build`, then serve `dist/` from your own HTTPS host. This is a client setup recipe, not a claim that the public demo enables authenticated editing. The protocol also defines `ApplyEdits` and server-streaming `QueryFeaturesStream`; verify server support and write permissions before adding editing. Do not expose the native h2c port directly to the public internet.

## 2. Serve public reads from files

Generate a PMTiles archive for tiled vector maps, GeoParquet for analytical reads, or COG for raster imagery. Publish these exports to object storage behind a CDN that supports HTTP byte ranges. Configure CORS for the application origin and expose range response headers when your reader needs them. Select a reader that understands the format; a file URL alone does not render a map.

Check a small range before wiring it into the application:

```bash
# Replace this example URL with your own published archive.
curl --fail --dump-header - --output /dev/null \
  --header 'Range: bytes=0-16383' \
  https://data.example.org/roads/2026-11-13/roads.pmtiles
```

Expect `206 Partial Content` and a matching `Content-Range` response. Repeat this check for your GeoParquet or COG URL and inspect your CDN's cache behavior. Use versioned object paths, publish a complete new export after source changes, then update the application's pointer. Keep an older version available while clients finish reading it. Do not send public read-heavy traffic through gRPC expecting a CDN cache to absorb it.

For private files, authorize the user in your backend and issue a short-lived signed URL. Preserve the signature on every range request, keep expiry long enough for the intended read, and configure CDN cache access so private bytes cannot be retrieved by an unauthorized caller. Regenerate private exports after data changes too; a signed URL controls access, not freshness. Plan expiry and revocation with your storage/CDN provider.

Export generation, object storage, CDN configuration and signed-URL issuance in this pattern are customer-operated infrastructure. This guide does not promise an automatic Honua export/regeneration service or managed hosting. See [architecture](../../../architecture.html) for how the serving paths fit together.

## 3. Connect existing clients through compatibility APIs

Use **OGC API and GeoServices REST as compatibility surfaces** when an existing GIS client, integration or migration requires them. They follow the native examples here: [connect a client](../../../connect.html), [run the compatibility demo](../../../demo-two-protocols.html), or [choose a compatibility sample](../../../demos.html#code-samples). Their availability and limits depend on the deployed server; check [client support](../../../client-compatibility.html).

For HTTP administration and imports, use the [API reference](../../../api-reference.html). The admin control plane configures the server; it is separate from the application's live feature transport.
