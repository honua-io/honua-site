# Honua for Excel (preview)

A demo-grade Office.js taskpane add-in that loads a Honua layer into Excel as a
regular table over **OData v4**, lets you edit attribute cells, and writes the
changes back to the live server — where they show up on the map.

Spatial data in Excel, like any other table. Literally.

- Hosted taskpane: `https://honua.io/excel-addin/taskpane.html`
- Default server: `https://demo.honua.io`
- Map to verify edits: `https://honua.io/demo.html`

No build step: `taskpane.html` + `taskpane.js` + `taskpane.css` are served
as-is. Office.js is loaded from Microsoft's CDN (required by Microsoft).

## Sideload the add-in

You need `manifest.xml` from this directory (download or clone). The taskpane
itself is already hosted on honua.io — the manifest just points Excel at it.

### Excel on Windows

1. Save `manifest.xml` to a folder, e.g. `C:\addins`.
2. Share that folder: right-click the folder → Properties → Sharing → Share…
   and note the network path (e.g. `\\YOURPC\addins`).
3. In Excel: File → Options → Trust Center → Trust Center Settings →
   Trusted Add-in Catalogs. Add the network path as Catalog Url, check
   **Show in Menu**, OK, and restart Excel.
4. Home → Add-ins (or Insert → My Add-ins) → **SHARED FOLDER** → Honua for
   Excel → Add.

### Excel on Mac

1. Save `manifest.xml` to:
   `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef`
   (create the `wef` folder if it doesn't exist).
2. Restart Excel.
3. Insert → My Add-ins → dropdown next to "My Add-ins" → Honua for Excel.

### Excel on the web

1. Open a workbook at office.com / excel.cloud.microsoft.
2. Home → Add-ins → More Add-ins (or Insert → Office Add-ins) →
   **MY ADD-INS** → Upload My Add-in.
3. Browse to `manifest.xml` → Upload.

After sideloading, the **Honua for Excel** button appears on the Home tab and
opens the taskpane.

## Demo script

1. Open the taskpane (Home tab → Honua for Excel).
2. Server URL is prefilled with `https://demo.honua.io`. Paste your API key
   (needed for saving) and hit **Connect**. The layer picker fills from the
   server's OData `Layers` entity set.
3. Pick a layer → **Load into sheet**. Up to 1,000 features land as an Excel
   table: `ObjectId` (key), one column per attribute, and a read-only geometry
   column.
4. Edit an attribute cell — say, rename a parcel or bump a value. The button
   flips to **Save changes (1)**.
5. Hit **Save changes**. The taskpane sends an OData `$batch` of `PATCH`
   requests (one per dirty row) and reports per-row results.
6. Click **See it on the map** in the footer (opens honua.io/demo.html in a
   new tab), find the feature, and confirm the edit is live.

## Auth notes

- **Reads** of public layers are anonymous. **Writes always require auth**:
  the taskpane sends your key as the `X-API-Key` header (the admin key is
  whatever `HONUA_ADMIN_PASSWORD` is set to on the server; scoped keys work
  too if configured).
- The API key is stored in the **workbook's document settings**
  (`Office.context.document.settings`), not in this repo and not in
  localStorage. Treat demo workbooks accordingly — don't share a workbook that
  has a real key saved in it.
- Concurrency: the server emits `@odata.etag` and honors `If-Match` (mismatch
  → 412, reported per row as a conflict). When no ETag is known the PATCH is
  unconditional (last write wins). Note: the sequential-PATCH fallback never
  sends `If-Match` because the server's CORS `Access-Control-Allow-Headers`
  list doesn't include it (a preflighted PATCH carrying it would be blocked);
  the primary `$batch` path carries ETags in the JSON body, which CORS can't
  see, so conditional updates work there.
- The server must allow CORS from `https://honua.io` (set
  `Cors:AllowedOrigins` on the server) — for Excel on the web and desktop
  webviews alike, this is a browser-context fetch.

## Current limitations

- **Row cap**: loads the first 1,000 features (`$top=1000`); no paging UI.
- **Geometry is read-only**: the geometry column shows only the geometry type;
  edits to it are ignored. Attribute cells are the editing surface.
- **Updates only**: added rows, deleted rows, and edited `ObjectId` cells are
  not synced (the taskpane warns and skips them).
- **Server allowlist**: the page CSP (`taskpane.html` meta tag and the
  `/excel-addin/*` block in `_headers`) only allows `connect-src
  https://demo.honua.io`. To point at another server, add its origin in both
  places.
- **Server must be seeded**: an unseeded server connects fine but offers no
  layers ("no layers are published yet").
- **Demo-grade**: no paging, no type-aware editors (dates come back as text),
  numbers/booleans round-trip as Excel gives them to us.

## Local development

Serve the repo root (`python3 -m http.server`) and open
`http://localhost:8000/excel-addin/taskpane.html` — outside Excel the pane
shows a "meant to run inside Excel" notice; Connect still works for testing
error states, but loading needs Excel. To sideload against localhost, change
`SourceLocation` in a copy of the manifest (Office requires HTTPS for anything
other than localhost).
