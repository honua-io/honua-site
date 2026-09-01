---
type: reference
title: "SCIM 2.0 IdP conformance reference"
description: "The SCIM discovery, resource, schema, and authentication contract implemented by Honua Server."
resource: "https://honua.io/docs/reference/compatibility/idp-conformance-matrix/"
tags: ["shape:reference", "protocol:scim-2.0", "surface:identity", "audience:idp-administrator"]
timestamp: "2026-09-01"
---

# SCIM 2.0 IdP conformance reference

This page records the SCIM 2.0 discovery contract implemented by Honua Server. It is the intended documentation target for the `documentationUri` returned from `ServiceProviderConfig`.

## Discovery endpoints

Honua exposes these SCIM 2.0 discovery resources beneath `/scim/v2/`:

- `/ServiceProviderConfig` reports optional features and authentication schemes.
- `/ResourceTypes` and `/ResourceTypes/{id}` report the `User` and `Group` resources.
- `/Schemas` and `/Schemas/{id}` report the attribute definitions for those resources.

The implementation protects these endpoints with the same bearer-token authentication as the rest of the SCIM API. Its advertised primary scheme is OAuth bearer token authentication.

## Advertised feature support

The service-provider configuration advertises PATCH and filtering as supported. It advertises bulk, password changes, sorting, and ETags as unsupported; bulk maximum operations and payload size are both `0`.

Filtering limits are supplied by the discovery document. Treat the values returned by the running server as authoritative for that deployment.

## Resource and attribute contract

`User` is available at `/Users`. `userName` is required and server-unique. Optional attributes are `displayName`, `active`, and the multi-valued `emails` complex attribute (`value`, `type`, `primary`).

`Group` is available at `/Groups`. `displayName` is required. Its optional multi-valued `members` attribute contains `value` and `display`.

These are the discovery schemas, not a promise that an IdP-specific connector accepts configuration outside the standard SCIM requests.

## Deployment verification — unvalidated; verify against your deployment

Use a bearer token issued for the SCIM API and inspect the returned discovery documents before enabling provisioning in an IdP. The exact server origin and token provisioning flow are deployment-specific.

```bash
curl -sS -H "Authorization: Bearer $SCIM_TOKEN" \
  "$HONUA_URL/scim/v2/ServiceProviderConfig"

curl -sS -H "Authorization: Bearer $SCIM_TOKEN" \
  "$HONUA_URL/scim/v2/ResourceTypes"

curl -sS -H "Authorization: Bearer $SCIM_TOKEN" \
  "$HONUA_URL/scim/v2/Schemas"
```

Confirm the response status, the advertised feature flags, and the `User` and `Group` schemas in the running server. Do not infer support for bulk, password changes, sorting, or ETags from a client default.
