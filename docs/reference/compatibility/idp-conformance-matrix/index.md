---
type: reference
title: "SCIM and SAML IdP conformance matrix"
description: "What Honua's SCIM 2.0 provisioning and SAML 2.0 sign-in support against Okta, Entra ID, Auth0 and PingFederate, and what each provider needs configured."
resource: "https://honua.io/docs/reference/compatibility/idp-conformance-matrix/"
tags: ["shape:reference", "protocol:scim-2-0", "protocol:saml-2-0", "capability:identity.scim", "capability:identity.saml", "audience:idp-administrator"]
generated: "2026-10-19"
---

# SCIM and SAML IdP conformance matrix

What Honua's SCIM 2.0 provisioning and SAML 2.0 sign-in support against Okta, Entra ID, Auth0 and PingFederate, and what each provider needs configured.

This is the page the server names as `documentationUri` in its SCIM `ServiceProviderConfig`. It is a projection of [`docs/reference/compatibility/idp-conformance-matrix.md`](https://github.com/honua-io/honua-server/blob/393987ccf2/docs/reference/compatibility/idp-conformance-matrix.md) and the SCIM discovery handlers in honua-server at commit `393987c`. The support statements are the server's own; the commands under "Check a deployment" were not run against a deployment for this page.

## One role store

SCIM, SAML and OIDC all write to the same identity and role model rather than to parallel stores. SCIM provisioning follows RFC 7643 and RFC 7644 and is not provider-specific. SAML attribute mapping is the part that varies by provider.

## SCIM 2.0 provisioning

The server reports every item below as supported for all four providers: Okta, Entra ID, Auth0 and PingFederate.

- User create and replace (`PUT`).
- User deactivate (`active: false`) and delete.
- User `PATCH` of `active` and roles.
- Group create, replace and delete.
- Group membership `PATCH` (`add` and `remove`).
- Filtering and pagination (`filter`, `startIndex`, `count`).
- Bearer-token authentication.
- The discovery documents `/ServiceProviderConfig`, `/ResourceTypes` and `/Schemas`.

`Scim:OidcIssuer` is required whenever `Scim:BearerToken` turns provisioning on. It must equal the exact OIDC `iss` value of the IdP connected to this SCIM endpoint. The server stores that issuer with each SCIM `externalId`, so the key is issuer plus subject, and identical `sub` values from different issuers never share role membership. User creation therefore needs the IdP to send its OIDC subject in `externalId`.

### SCIM provider quirks

- Okta provisions users first, then assigns groups through group-membership `PATCH`. It expects `application/scim+json` and the RFC 7644 `Operations` form of `PATCH`; the server supports both.
- Entra ID changes membership through group `PATCH` `add` and `remove` value arrays, and probes `/scim/v2/Users?filter=userName eq "..."` before it creates a user. Both are supported.
- Auth0 provisions users through its SCIM client. Group-to-role mapping follows the group display name: each SCIM group maps to a Honua role.
- PingFederate uses standard RFC 7644 `PUT` and `PATCH`. The server docs record no Honua-specific deviation.

## What discovery advertises

`/scim/v2/ServiceProviderConfig` advertises `PATCH` and filtering as supported, with a filter `maxResults` of 200. It advertises bulk, password change, sorting and ETags as unsupported; bulk `maxOperations` and `maxPayloadSize` are both `0`. Do not enable those in an IdP connector because a client defaults to them.

`/scim/v2/ResourceTypes` lists `User` and `Group`, and `/scim/v2/Schemas` returns their attribute schemas. The discovery endpoints sit behind the same bearer token as the rest of the SCIM API, so a request without it is refused.

## SAML 2.0 sign-in

The server reports these as supported for all four providers:

- Signed `Assertion` consumption: RSA and ECDSA, SHA-256, SHA-384 and SHA-512, Exclusive C14N.
- `AudienceRestriction`, `Issuer`, and `NotBefore` / `NotOnOrAfter` enforcement.
- `NameID` as the subject.
- Email, display-name and role or group attribute mapping.
- A default role when the `Assertion` carries no role claim.
- IdP-initiated Single Logout over HTTP-POST with a signed `LogoutRequest`.

> SP-initiated Single Logout and the HTTP-Redirect logout binding are not supported yet, for any provider.

### Per-provider attributes

Set `Saml:RoleAttribute`, `Saml:EmailAttribute` and `Saml:DisplayNameAttribute` to the attribute `Name` your IdP emits. The server matches an attribute by `Name` or `FriendlyName`, so either works when an IdP sends both.

- Okta: role `groups` (or your group-claim name), email `email`, display name `displayName`.
- Entra ID: role `http://schemas.microsoft.com/ws/2008/06/identity/claims/role`, email `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`, display name `http://schemas.microsoft.com/identity/claims/displayname`.
- Auth0: role a namespaced custom claim such as `https://your-domain/saml/roles`, email `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`, display name `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name`.
- PingFederate: role `memberOf`, email `mail`, display name `cn`.

### SAML provider quirks

- Okta sends group membership as a multi-valued `groups` attribute; map it to the role attribute. Okta defaults `NameID` to the user's email or login.
- Entra ID sends the role claim only when app roles or group claims are configured on the enterprise application, and group claims can arrive as object IDs rather than names unless the application is set to emit display names.
- Auth0 drops a custom claim that is not namespaced, so emit roles under a namespaced attribute.
- PingFederate usually maps straight from directory attributes. `memberOf` values are often full LDAP DNs, so role names must match the DN or be normalised by your role mapping.

### Single Logout

Set `Saml:SingleLogoutServiceUrl` to the server's own `/saml/slo` endpoint to advertise an HTTP-POST `SingleLogoutService` in SP metadata. A signed `LogoutRequest` posted there is verified against `Saml:IdpSigningCertificate`, ends the local admin session, and produces a `LogoutResponse`. Set `Saml:IdpSingleLogoutServiceUrl` to relay that response back to the IdP; leave it unset to return it directly. Unsigned or forged logout requests are rejected.

If the session store is unavailable, SAML logout and admin OIDC logout return a retryable HTTP `503`, keep the session cookie, and do not report success. The session has not been revoked; retry after recovery.

## Check a deployment

Unvalidated — verify against your deployment. Read the discovery documents from the server you are about to connect, with the SCIM bearer token, before you enable provisioning in the IdP. `-i` prints the status line, so a `401` or `404` body cannot pass for a discovery document, and `--fail-with-body` makes the command exit non-zero on one:

```bash
curl -i --fail-with-body -H "Authorization: Bearer $SCIM_TOKEN" "$HONUA_URL/scim/v2/ServiceProviderConfig"
curl -i --fail-with-body -H "Authorization: Bearer $SCIM_TOKEN" "$HONUA_URL/scim/v2/ResourceTypes"
curl -i --fail-with-body -H "Authorization: Bearer $SCIM_TOKEN" "$HONUA_URL/scim/v2/Schemas"
```

Expect `HTTP/1.1 200` or `HTTP/2 200` on each. The feature flags in the first response are what your IdP should configure against; where they differ from this page, the running server wins.
