# Lead Capture And CRM Handoff

This repository owns the public-site contact form and consent-gated attribution fields. Downstream CRM import, sales ownership, missed-follow-up escalation, and failed-sync alerting are owned outside this static site.

## Site-Owned Entry Points

- Canonical form: `index.html#contact`
- Current form action: `https://formsubmit.co/mike@honua.io`
- Current method: `POST`
- Conversion event: `lead_form_submit`
- CTA click event: `cta_click`
- Shared implementation: `assets/analytics.js`
- Deployment allowlist: `_headers` and the `index.html` Content Security Policy allow `form-action 'self' https://formsubmit.co`

Site-owned commercial, contact, quickstart, and Open Core CTA buttons carry stable `data-analytics-event`, `data-analytics-label`, and `data-analytics-destination` attributes. The analytics helper records the most recent consenting CTA in session storage and copies it into the next contact-form submission.

## Submitted Payload Schema

The form intentionally submits contact fields to the form handler, not to analytics:

| Field | Owner | Purpose |
| --- | --- | --- |
| `name` | Visitor | Person requesting follow-up. |
| `email` | Visitor | Reply address for sales or support follow-up. |
| `company` | Visitor | Optional organization context. |
| `message` | Visitor | Optional inquiry details. |
| `lead_landing_page` | Site attribution | First consenting page observed in the current browser session. |
| `lead_current_page` | Site attribution | Page where the form was submitted. |
| `lead_referrer` | Site attribution | Browser referrer captured after analytics consent. |
| `lead_utm_source` | Site attribution | Consented `utm_source` value. |
| `lead_utm_medium` | Site attribution | Consented `utm_medium` value. |
| `lead_utm_campaign` | Site attribution | Consented `utm_campaign` value. |
| `lead_utm_term` | Site attribution | Consented `utm_term` value. |
| `lead_utm_content` | Site attribution | Consented `utm_content` value. |
| `lead_cta_label` | Site attribution | Stable label for the most recent consenting CTA click. |
| `lead_cta_page` | Site attribution | Page where the most recent consenting CTA was clicked. |
| `lead_cta_href` | Site attribution | Destination for the most recent consenting CTA click. |

Analytics events must not include `name`, `email`, `company`, or `message` values. The `lead_form_submit` event only sends conversion metadata such as event category, label, destination, page location, and beacon transport.

## Consent And Failure Behavior

Attribution is consent-gated. If a visitor accepts analytics, `assets/analytics.js` stores UTM, landing, referrer, and CTA context in current-session browser storage and refreshes hidden form fields before submit.

If analytics consent is declined, unavailable, or revoked, the form remains usable and the `lead_*` fields are blank. Browser storage errors, analytics load failures, and `gtag` errors are caught so navigation and form submission continue.

## CRM Handoff Expectations

The MVP handoff is FormSubmit email intake to `mike@honua.io`. Sales-owned CRM processing should map the submitted fields without changing the public-site contract:

| CRM concept | Site field |
| --- | --- |
| Contact name | `name` |
| Work email | `email` |
| Account/company | `company` |
| Inquiry notes | `message` |
| Lead source detail | `lead_landing_page`, `lead_current_page`, `lead_referrer` |
| Campaign attribution | `lead_utm_source`, `lead_utm_medium`, `lead_utm_campaign`, `lead_utm_term`, `lead_utm_content` |
| CTA attribution | `lead_cta_label`, `lead_cta_page`, `lead_cta_href` |

Sales or support must own CRM import status, lead owner assignment, follow-up SLA evidence, missed-follow-up escalation, and failed lead sync alerting. This static site has no secure CRM ingestion endpoint and must not publish CRM keys or private workflow credentials in HTML or JavaScript.

Failed lead sync alerting evidence must come from the sales or support workflow that owns CRM intake monitoring.

## Smoke Evidence

CI validates the static contract only. Manual release evidence should attach:

1. Accepted-consent smoke: open `index.html?utm_source=preview&utm_medium=smoke&utm_campaign=honua-site-3`, accept analytics, click a contact CTA, and confirm hidden `lead_*` fields include UTM and CTA context before submitting.
2. Declined-consent smoke: decline analytics and confirm the contact form remains submittable with blank `lead_*` fields.
3. Intake smoke: submit a test lead through the approved test process and attach the FormSubmit or CRM receipt evidence.
4. Downstream smoke: attach sales-owned evidence that the lead reached the CRM or tracked intake queue, owner assignment happened, and failed-sync alerting or missed-lead escalation is active.

## Release-Lane Ownership

- `honua-site#3`: site form contract, CTA instrumentation, consent-gated attribution, static validation, and this handoff evidence path.
- `honua-sales`: CRM field mapping/import, lead owner, follow-up SLA, intake smoke evidence, and failed-sync alerting. If no existing sales ticket explicitly owns sync monitoring and failed-lead alerting, file a bounded sales child ticket for that work.
- `honua-support`: missed-follow-up escalation routing if support owns pilot escalation.
- `honua-marketplace#3`: marketplace URL, offer/listing package, entitlement activation proof, and publish evidence. The site should not add marketplace CTAs until those details are supplied.
- `honua-site#9`: proof hub for benchmarks, compatibility matrix, migration evidence, and reference architecture.
- `honua-site#17`: public claims matrix mapping site claims to source/proof/roadmap status.
- `honua-showcase` and sales proof assets: repeatable portal-published dataset/demo flow for pilot and buyer-path motions.
