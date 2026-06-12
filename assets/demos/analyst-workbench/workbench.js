/*
 * honua.io Analyst Workbench demo — charts + synced map over OData.
 *
 * The OData v4 surface IS the showcase: every chart on this page is an
 * OData $apply aggregation, and the literal URL that just ran is displayed in
 * the query bar. MapLibre GL (window.maplibregl) does pure rendering; data
 * access is plain fetch() against the OData routes documented in
 * honua-server docs/gis/specifications/odata-v4-coverage.md:
 *
 *   GET /odata                               service document
 *   GET /odata/Layers                        layer discovery
 *   GET /odata/Layers({id})/Features?$apply= aggregation (groupby/aggregate/
 *                                            filter/compute transformations)
 *
 * Spatial extent filtering uses the documented geo.intersects() function with
 * a geography WKT literal. Histogram bucketing uses only documented $apply
 * compute arithmetic (`gisacres sub (gisacres mod binWidth)`).
 *
 * Dual lane: when https://demo.honua.io serves the maui-parcels layer over
 * OData the page runs live; otherwise it falls back to a bundled SYNTHETIC
 * fixture (assets/demos/analyst-workbench/fixture-parcels.json, clearly
 * labeled "sample data — live server pending") and aggregates client-side
 * while still displaying the exact $apply URL the live lane would run.
 *
 * Endpoint / field contract lives in workbench-config.json (this demo's
 * extension) and assets/demo/layers.json (the shared map/seeding contract,
 * consumed read-only).
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/analyst-workbench/workbench-config.json";

  /* ── tiny DOM/format helpers ───────────────────────────────────── */

  function el(id) {
    return document.getElementById(id);
  }

  function fmtInt(n) {
    return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function fmtAcres(n) {
    return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  }

  function fmtPct(n) {
    return (Math.round(Number(n || 0) * 10) / 10).toFixed(1) + "%";
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function setStatus(state, text) {
    var pill = el("wb-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  /* ── shared page state ─────────────────────────────────────────── */

  var S = {
    config: null, // workbench-config.json
    shared: null, // assets/demo/layers.json (read-only shared contract)
    map: null,
    lane: "probing", // "live" | "fixture"
    laneNote: "",
    odata: null, // { serviceRoot, featuresUrl, layerKey } when live
    floodAvailable: false, // no flood_zone attribute in maui-parcels; starts false, never auto-promoted
    fixture: null, // { features: [...precomputed bbox...], outline }
    filters: { zoning: null, acres: null }, // acres: { min, max } (max may be Infinity)
    lastUrls: { zoning: "", histogram: "", kpi: "" },
    queryBarTab: "zoning",
    refreshToken: 0,
    lastResult: null,
  };

  /* ── OData query construction (live lane and display-only) ─────── */

  /* Encode an $apply/$filter value: encodeURIComponent, then relax the
   * characters that are legal in a URL query and keep the OData text
   * readable: / ( ) $ , ' — spaces stay %20 so the URL is runnable as-is. */
  function encodeODataValue(value) {
    return encodeURIComponent(value)
      .replace(/%2F/gi, "/")
      .replace(/%28/gi, "(")
      .replace(/%29/gi, ")")
      .replace(/%24/gi, "$")
      .replace(/%2C/gi, ",")
      .replace(/%27/gi, "'");
  }

  function round5(n) {
    return Math.round(n * 100000) / 100000;
  }

  function extentWkt(bounds) {
    var w = round5(bounds.getWest());
    var s = round5(bounds.getSouth());
    var e = round5(bounds.getEast());
    var n = round5(bounds.getNorth());
    return (
      "POLYGON((" +
      w + " " + s + "," +
      e + " " + s + "," +
      e + " " + n + "," +
      w + " " + n + "," +
      w + " " + s + "))"
    );
  }

  function geoIntersectsClause(bounds) {
    return (
      "geo.intersects(" +
      S.config.odata.geometryProperty +
      ", geography'SRID=4326;" +
      extentWkt(bounds) +
      "')"
    );
  }

  function zoningClause() {
    if (!S.filters.zoning) return null;
    return S.config.odata.fields.zoning + " eq '" + String(S.filters.zoning).replace(/'/g, "''") + "'";
  }

  function acresClause() {
    var f = S.filters.acres;
    if (!f) return null;
    var acres = S.config.odata.fields.acres;
    var parts = [acres + " ge " + f.min];
    if (isFinite(f.max)) parts.push(acres + " lt " + f.max);
    return parts.length === 1 ? parts[0] : "(" + parts.join(" and ") + ")";
  }

  /* Crossfilter semantics: each chart's query excludes its OWN filter so the
   * full distribution stays visible, while the other chart's filter and the
   * map extent still constrain it. KPIs apply every active filter.
   *
   * The live server supports $filter (including geo.intersects) as a standalone
   * query parameter and $apply=groupby()/aggregate() as a separate parameter,
   * but does NOT support $apply=filter(...)/groupby(...) (returns 400) or
   * $apply=compute(...)/groupby(...) (returns 500). All extent/crossfilter
   * predicates go into $filter; only groupby/aggregate lives in $apply.
   * Histogram binning uses client-side bucketing since compute() is unsupported.
   */
  function buildQuery(kind, bounds) {
    var F = S.config.odata.fields;
    var filterParts = [geoIntersectsClause(bounds)];
    if (kind !== "zoning" && zoningClause()) filterParts.push(zoningClause());
    if (kind !== "histogram" && acresClause()) filterParts.push(acresClause());
    var filterExpr = filterParts.join(" and ");

    var applyExpr;
    if (kind === "zoning") {
      applyExpr = "groupby((" + F.zoning + "),aggregate($count as parcels," + F.acres + " with sum as acres))";
    } else if (kind === "histogram") {
      /* histogram: fetch per-parcel acres and bin client-side; $apply just
       * selects the right fields, so we use a bare $select instead. */
      applyExpr = null; // signal to applyUrl() to use $select instead
    } else {
      /* kind === "kpi": plain count + sum (flood_zone not available in this layer). */
      applyExpr = "aggregate($count as parcels," + F.acres + " with sum as acres)";
    }
    return { filterExpr: filterExpr, applyExpr: applyExpr };
  }

  function applyUrl(kind, bounds) {
    /* When the live lane is active S.odata.featuresUrl is the resolved URL
     * (e.g. Layers(1)/Features). In the fixture lane we show the canonical
     * display URL using the known OData integer id for maui-parcels (1). */
    var featuresUrl = S.odata
      ? S.odata.featuresUrl
      : S.shared.server.baseUrl + S.config.odata.serviceRootPath + "Layers(1)/Features";
    var q = buildQuery(kind, bounds);
    var params = new URLSearchParams();
    params.set("$filter", q.filterExpr);
    if (q.applyExpr) {
      params.set("$apply", q.applyExpr);
    } else {
      /* histogram lane: raw parcel acres. Limit is generous for viewport sizes
       * at z12-14 (≤ ~8000 parcels in view); the chart degrades gracefully if
       * the page is zoomed far out and rows are capped. */
      params.set("$select", "ObjectId," + S.config.odata.fields.acres);
      params.set("$top", "10000");
    }
    return featuresUrl + "?" + params.toString().replace(/%24/g, "$").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%2C/g, ",").replace(/%27/g, "'").replace(/%3D/g, "=").replace(/\+/g, "%20");
  }

  function odataFetchRows(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) {
        var err = new Error("OData request failed: HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json().then(function (body) {
        return body && Array.isArray(body.value) ? body.value : [];
      });
    });
  }

  /* ── live lane aggregation ─────────────────────────────────────── */

  /* Client-side histogram binning from raw per-parcel acres rows.
   * Used because the server does not support $apply=compute()/groupby().
   * The histogram URL (applyUrl("histogram")) fetches up to 5000 raw
   * parcel rows with $select=ObjectId,gisacres and $filter=extent; we bin here. */
  function binHistogram(rows) {
    var F = S.config.odata.fields;
    var bin = S.config.histogram.binWidth;
    var bins = {};
    for (var i = 0; i < rows.length; i++) {
      var acres = Number(rows[i][F.acres]) || 0;
      var bKey = acres - (acres % bin);
      bKey = Math.round(bKey * 1000) / 1000; // avoid float drift
      bins[bKey] = (bins[bKey] || 0) + 1;
    }
    return Object.keys(bins).map(function (k) {
      return { bin: Number(k), parcels: bins[k] };
    });
  }

  function liveAggregate(bounds) {
    var F = S.config.odata.fields;
    var urls = {
      zoning: applyUrl("zoning", bounds),
      histogram: applyUrl("histogram", bounds),
      kpi: applyUrl("kpi", bounds),
    };

    return Promise.all([
      odataFetchRows(urls.zoning),
      odataFetchRows(urls.histogram),
      odataFetchRows(urls.kpi),
    ]).then(function (r) {
      return {
        urls: urls,
        zoning: r[0].map(function (row) {
          return { key: row[F.zoning] === null || row[F.zoning] === undefined ? "—" : String(row[F.zoning]), parcels: Number(row.parcels) || 0, acres: Number(row.acres) || 0 };
        }),
        /* histogram: server returned raw parcel rows (ObjectId + gisacres);
         * bin them client-side to match the fixture lane's format. */
        histogram: binHistogram(r[1]),
        /* kpi: plain aggregate (parcels + acres) — flood_zone not available.
         * Shape matches what renderKpis() expects: array of {key, parcels, acres}. */
        kpi: r[2].map(function (row) {
          return { key: null, parcels: Number(row.parcels) || 0, acres: Number(row.acres) || 0 };
        }),
      };
    });
  }

  /* ── fixture lane aggregation (client-side, sample data) ───────── */

  function prepareFixture(raw) {
    var features = raw.parcels.features.map(function (f) {
      var ring = f.geometry.coordinates[0];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < ring.length; i++) {
        if (ring[i][0] < minX) minX = ring[i][0];
        if (ring[i][0] > maxX) maxX = ring[i][0];
        if (ring[i][1] < minY) minY = ring[i][1];
        if (ring[i][1] > maxY) maxY = ring[i][1];
      }
      return { feature: f, bbox: [minX, minY, maxX, maxY], props: f.properties };
    });
    return { features: features, outline: raw.outline, collection: raw.parcels };
  }

  function fixtureMatches(entry, bounds, kind) {
    var b = entry.bbox;
    if (b[2] < bounds.getWest() || b[0] > bounds.getEast() || b[3] < bounds.getSouth() || b[1] > bounds.getNorth()) {
      return false;
    }
    /* Fixture lane uses fixtureFields names (fixture-parcels.json schema) which
     * differ from the live odata.fields (real server schema). */
    var F = S.config.odata.fixtureFields || S.config.odata.fields;
    if (kind !== "zoning" && S.filters.zoning && entry.props[F.zoning] !== S.filters.zoning) return false;
    if (kind !== "histogram" && S.filters.acres) {
      var acres = Number(entry.props[F.acres]) || 0;
      if (acres < S.filters.acres.min) return false;
      if (isFinite(S.filters.acres.max) && acres >= S.filters.acres.max) return false;
    }
    return true;
  }

  function fixtureAggregate(bounds) {
    var F = S.config.odata.fixtureFields || S.config.odata.fields;
    var bin = S.config.histogram.binWidth;
    var zoning = {};
    var bins = {};
    var kpiTotals = { parcels: 0, acres: 0 };

    for (var i = 0; i < S.fixture.features.length; i++) {
      var entry = S.fixture.features[i];
      var acres = Number(entry.props[F.acres]) || 0;

      if (fixtureMatches(entry, bounds, "zoning")) {
        var zKey = String(entry.props[F.zoning]);
        zoning[zKey] = zoning[zKey] || { parcels: 0, acres: 0 };
        zoning[zKey].parcels++;
        zoning[zKey].acres += acres;
      }
      if (fixtureMatches(entry, bounds, "histogram")) {
        var bKey = acres - (acres % bin); // same arithmetic the $apply compute runs
        bins[bKey] = (bins[bKey] || 0) + 1;
      }
      if (fixtureMatches(entry, bounds, "kpi")) {
        kpiTotals.parcels++;
        kpiTotals.acres += acres;
      }
    }

    var result = {
      urls: {
        zoning: applyUrl("zoning", bounds),
        histogram: applyUrl("histogram", bounds),
        kpi: applyUrl("kpi", bounds),
      },
      zoning: Object.keys(zoning).map(function (k) {
        return { key: k, parcels: zoning[k].parcels, acres: zoning[k].acres };
      }),
      histogram: Object.keys(bins).map(function (k) {
        return { bin: Number(k), parcels: bins[k] };
      }),
      /* kpi: flood_zone not available; emit a plain totals row so renderKpis()
       * gets correct parcel/acres counts while the flood% tile stays "—". */
      kpi: [{ key: null, parcels: kpiTotals.parcels, acres: kpiTotals.acres }],
    };
    return Promise.resolve(result);
  }

  /* ── KPI tiles ─────────────────────────────────────────────────── */

  function renderKpis(result) {
    var totalParcels = 0;
    var totalAcres = 0;
    var floodParcels = 0;
    var hazard = S.config.odata.floodHazardValues;
    result.kpi.forEach(function (row) {
      totalParcels += row.parcels;
      totalAcres += row.acres;
      if (row.key !== null && hazard.indexOf(row.key) !== -1) floodParcels += row.parcels;
    });
    el("wb-kpi-parcels").textContent = fmtInt(totalParcels);
    el("wb-kpi-acres").textContent = fmtAcres(totalAcres);
    el("wb-kpi-flood").textContent =
      S.floodAvailable && S.lane !== "probing"
        ? totalParcels > 0
          ? fmtPct((100 * floodParcels) / totalParcels)
          : "0.0%"
        : "—";
    var floodNote = el("wb-kpi-flood-note");
    if (floodNote) floodNote.style.display = S.floodAvailable ? "none" : "block";
  }

  /* ── SVG charts (hand-rolled, dependency-free) ─────────────────── */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    }
    return node;
  }

  /* Horizontal category bars: zoning (interactive) + flood classes (static). */
  function renderCategoryBars(containerId, rows, catalog, interactive) {
    var container = el(containerId);
    container.innerHTML = "";

    var byKey = {};
    rows.forEach(function (row) {
      byKey[row.key] = row;
    });
    var keys = catalog.order.filter(function (k) {
      return byKey[k] || catalog.order === S.config.zoningCategories.order;
    });
    /* Append any categories the data returned that the catalog doesn't know. */
    rows.forEach(function (row) {
      if (keys.indexOf(row.key) === -1) keys.push(row.key);
    });

    var rowH = 22;
    var labelW = 118;
    var valueW = 64;
    var width = 360;
    var barMax = width - labelW - valueW - 8;
    var height = keys.length * rowH + 4;
    var max = 0;
    keys.forEach(function (k) {
      if (byKey[k] && byKey[k].parcels > max) max = byKey[k].parcels;
    });

    var svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      width: "100%",
      role: "img",
      "aria-label": interactive ? "Parcel count by zoning category — click a bar to filter the map" : "Parcel count by flood-zone class",
    });

    keys.forEach(function (key, i) {
      var row = byKey[key] || { key: key, parcels: 0, acres: 0 };
      var y = i * rowH + 2;
      var w = max > 0 ? Math.max(row.parcels > 0 ? 2 : 0, (barMax * row.parcels) / max) : 0;
      var color = catalog.colors[key] || catalog.colors.other;
      var selected = interactive && S.filters.zoning === key;
      var dimmed = interactive && S.filters.zoning && !selected;

      var g = svgEl("g", { class: "wb-bar-row" + (interactive ? " wb-bar-click" : "") + (selected ? " is-selected" : "") + (dimmed ? " is-dimmed" : "") });

      var label = svgEl("text", { x: labelW - 6, y: y + rowH / 2 + 3.5, "text-anchor": "end", class: "wb-bar-label" });
      label.textContent = (catalog.labels && catalog.labels[key]) || key;
      g.appendChild(label);

      g.appendChild(svgEl("rect", { x: labelW, y: y + 3, width: barMax, height: rowH - 8, rx: 3, class: "wb-bar-track" }));
      g.appendChild(svgEl("rect", { x: labelW, y: y + 3, width: w, height: rowH - 8, rx: 3, fill: color, class: "wb-bar-fill" }));

      var value = svgEl("text", { x: labelW + barMax + 6, y: y + rowH / 2 + 3.5, class: "wb-bar-value" });
      value.textContent = fmtInt(row.parcels) + (row.acres ? " · " + fmtAcres(row.acres) + " ac" : "");
      g.appendChild(value);

      if (interactive) {
        var hit = svgEl("rect", { x: 0, y: y, width: width, height: rowH, fill: "transparent" });
        hit.style.cursor = "pointer";
        hit.addEventListener("click", function () {
          S.filters.zoning = S.filters.zoning === key ? null : key;
          onFiltersChanged("zoning-bar");
        });
        var title = svgEl("title", {});
        title.textContent = (S.filters.zoning === key ? "Clear filter: " : "Filter map to ") + key;
        hit.appendChild(title);
        g.appendChild(hit);
      }

      svg.appendChild(g);
    });

    container.appendChild(svg);
  }

  /* Vertical histogram of parcel acreage with a drag-brush. */
  function renderHistogram(containerId, rows) {
    var container = el(containerId);
    container.innerHTML = "";

    var binW = S.config.histogram.binWidth;
    var maxBin = S.config.histogram.maxBin;
    var binCount = Math.round(maxBin / binW) + 1; // last bucket = overflow "maxBin+"
    var counts = new Array(binCount);
    for (var i = 0; i < binCount; i++) counts[i] = 0;
    rows.forEach(function (row) {
      var bin = Math.round(row.bin / binW) * binW;
      var idx = bin >= maxBin ? binCount - 1 : Math.max(0, Math.round(bin / binW));
      counts[Math.min(idx, binCount - 1)] += row.parcels;
    });

    var width = 360;
    var height = 132;
    var plotH = 104;
    var gap = 2;
    var colW = width / binCount;
    var max = Math.max.apply(null, counts.concat([1]));

    var svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      width: "100%",
      role: "img",
      "aria-label": "Histogram of parcel acreage — drag across bars to filter the map to an acreage range",
    });

    function binRange(idx) {
      if (idx >= binCount - 1) return { min: maxBin, max: Infinity };
      return { min: Math.round(idx * binW * 100) / 100, max: Math.round((idx + 1) * binW * 100) / 100 };
    }

    var brushing = S.filters.acres;

    counts.forEach(function (count, idx) {
      var h = Math.max(count > 0 ? 2 : 0, (plotH * count) / max);
      var range = binRange(idx);
      var inBrush =
        brushing &&
        range.min >= brushing.min &&
        (isFinite(brushing.max) ? range.min < brushing.max : true);
      var rect = svgEl("rect", {
        x: idx * colW + gap / 2,
        y: plotH - h,
        width: colW - gap,
        height: h,
        rx: 2,
        class: "wb-hist-bar" + (brushing ? (inBrush ? " is-selected" : " is-dimmed") : ""),
      });
      var title = svgEl("title", {});
      title.textContent =
        fmtInt(count) + " parcels · " + (isFinite(range.max) ? range.min + "–" + range.max + " ac" : range.min + "+ ac");
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    /* x-axis tick labels every whole acre + overflow */
    for (var t = 0; t < maxBin; t += 1) {
      var label = svgEl("text", { x: (t / binW) * colW + 1, y: height - 14, class: "wb-hist-tick" });
      label.textContent = String(t);
      svg.appendChild(label);
    }
    var overflowLabel = svgEl("text", { x: (binCount - 1) * colW + 1, y: height - 14, class: "wb-hist-tick" });
    overflowLabel.textContent = maxBin + "+";
    svg.appendChild(overflowLabel);
    var axisCaption = svgEl("text", { x: width / 2, y: height - 2, "text-anchor": "middle", class: "wb-hist-axis" });
    axisCaption.textContent = "parcel size (acres) — drag to brush";
    svg.appendChild(axisCaption);

    /* brush overlay rect (visual) */
    if (brushing) {
      var fromIdx = Math.max(0, Math.round(brushing.min / binW));
      var toIdx = isFinite(brushing.max) ? Math.round(brushing.max / binW) : binCount;
      svg.appendChild(
        svgEl("rect", {
          x: fromIdx * colW,
          y: 0,
          width: Math.max(colW, (toIdx - fromIdx) * colW),
          height: plotH,
          class: "wb-brush-rect",
        })
      );
    }

    /* drag-brush interaction (click = single bin, drag = range) */
    var dragStart = null;

    function idxFromEvent(event) {
      var rect = svg.getBoundingClientRect();
      var x = ((event.clientX - rect.left) / rect.width) * width;
      return Math.max(0, Math.min(binCount - 1, Math.floor(x / colW)));
    }

    svg.addEventListener("pointerdown", function (event) {
      dragStart = idxFromEvent(event);
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointerup", function (event) {
      if (dragStart === null) return;
      var a = dragStart;
      var b = idxFromEvent(event);
      dragStart = null;
      var lo = Math.min(a, b);
      var hi = Math.max(a, b);
      var range = { min: binRange(lo).min, max: binRange(hi).max };
      var existing = S.filters.acres;
      if (existing && existing.min === range.min && String(existing.max) === String(range.max)) {
        S.filters.acres = null; // toggling the same brush clears it
      } else {
        S.filters.acres = range;
      }
      onFiltersChanged("histogram-brush");
    });

    container.appendChild(svg);
  }

  /* ── map plumbing ──────────────────────────────────────────────── */

  function zoningColorExpression() {
    var cats = S.config.zoningCategories;
    /* Live lane: MVT attribute is the real server column name (odata.fields.zoning).
     * Fixture lane: GeoJSON property uses the fixture schema name (fixtureFields.zoning). */
    var fieldName = S.lane === "live"
      ? S.config.odata.fields.zoning
      : (S.config.odata.fixtureFields || S.config.odata.fields).zoning;
    var expr = ["match", ["get", fieldName]];
    cats.order.forEach(function (key) {
      expr.push(key, cats.colors[key] || cats.colors.other);
    });
    expr.push(cats.colors.other);
    return expr;
  }

  function sharedLayerDef(id) {
    for (var i = 0; i < S.shared.layers.length; i++) {
      if (S.shared.layers[i].id === id) return S.shared.layers[i];
    }
    return null;
  }

  function removeParcelLayers(map) {
    ["wb-parcels-hl-line", "wb-parcels-hl", "wb-parcels-fill", "wb-outline-line"].forEach(function (id) {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["wb-parcels", "wb-outline"].forEach(function (id) {
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  function addParcelLayers(map) {
    var sourceId;
    if (S.lane === "live") {
      var def = sharedLayerDef("parcels");
      sourceId = "wb-parcels";
      map.addSource(sourceId, {
        type: "vector",
        tiles: [S.shared.server.baseUrl + def.tiles.tileTemplate],
        minzoom: 0,
        maxzoom: 15,
        attribution: def.attribution,
      });
    } else {
      sourceId = "wb-parcels";
      map.addSource("wb-outline", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [S.fixture.outline] },
      });
      map.addLayer({
        id: "wb-outline-line",
        type: "line",
        source: "wb-outline",
        paint: { "line-color": "#1c3340", "line-width": 1.2 },
      });
      map.addSource(sourceId, {
        type: "geojson",
        data: S.fixture.collection,
        attribution: "synthetic sample data — not County of Maui records",
      });
    }

    var common = S.lane === "live" ? { "source-layer": sharedLayerDef("parcels").tiles.sourceLayer } : {};

    function withCommon(layer) {
      for (var key in common) {
        if (Object.prototype.hasOwnProperty.call(common, key)) layer[key] = common[key];
      }
      return layer;
    }

    map.addLayer(
      withCommon({
        id: "wb-parcels-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": zoningColorExpression(),
          "fill-opacity": 0.45,
          "fill-outline-color": "#04151a",
        },
      })
    );
    map.addLayer(
      withCommon({
        id: "wb-parcels-hl",
        type: "fill",
        source: sourceId,
        layout: { visibility: "none" },
        paint: {
          "fill-color": zoningColorExpression(),
          "fill-opacity": 0.92,
          "fill-outline-color": "#e6efee",
        },
      })
    );
    map.addLayer(
      withCommon({
        id: "wb-parcels-hl-line",
        type: "line",
        source: sourceId,
        layout: { visibility: "none" },
        paint: { "line-color": "#e6efee", "line-width": 0.8 },
      })
    );
  }

  function mapFilterExpression() {
    /* Use the correct property name for the active lane's source. */
    var F = S.lane === "live"
      ? S.config.odata.fields
      : (S.config.odata.fixtureFields || S.config.odata.fields);
    var parts = ["all"];
    if (S.filters.zoning) parts.push(["==", ["get", F.zoning], S.filters.zoning]);
    if (S.filters.acres) {
      parts.push([">=", ["get", F.acres], S.filters.acres.min]);
      if (isFinite(S.filters.acres.max)) parts.push(["<", ["get", F.acres], S.filters.acres.max]);
    }
    return parts.length > 1 ? parts : null;
  }

  function updateMapHighlight() {
    var map = S.map;
    if (!map || !map.getLayer("wb-parcels-hl")) return;
    var expr = mapFilterExpression();
    if (expr) {
      map.setFilter("wb-parcels-hl", expr);
      map.setFilter("wb-parcels-hl-line", expr);
      map.setLayoutProperty("wb-parcels-hl", "visibility", "visible");
      map.setLayoutProperty("wb-parcels-hl-line", "visibility", "visible");
      map.setPaintProperty("wb-parcels-fill", "fill-opacity", 0.07); // dim everything outside the filter
    } else {
      map.setLayoutProperty("wb-parcels-hl", "visibility", "none");
      map.setLayoutProperty("wb-parcels-hl-line", "visibility", "none");
      map.setPaintProperty("wb-parcels-fill", "fill-opacity", 0.45);
    }
  }

  /* ── query bar + code strip ────────────────────────────────────── */

  function displayUrl(url) {
    /* The query bar shows the human-readable form; the copy button and the
     * code strip carry the runnable percent-encoded URL. */
    try {
      return decodeURIComponent(url);
    } catch (_e) {
      return url;
    }
  }

  function renderQueryBar() {
    var url = S.lastUrls[S.queryBarTab] || "";
    var target = el("wb-query-url");
    target.textContent = displayUrl(url) || "—";
    target.title = url;
    var note = el("wb-query-lane-note");
    note.style.display = S.lane === "fixture" ? "inline" : "none";
    document.querySelectorAll("[data-query-tab]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.queryTab === S.queryBarTab);
    });
  }

  function renderCodeStrip(interaction) {
    var lines;
    if (interaction === "chart-to-map") {
      var expr = mapFilterExpression();
      lines = [
        "// chart → map: highlight matching parcels (client-side MVT filter)",
        'map.setFilter("wb-parcels-hl", ' + (expr ? JSON.stringify(expr) : "null") + ");",
        'map.setPaintProperty("wb-parcels-fill", "fill-opacity", ' + (expr ? "0.07" : "0.45") + ");",
        "",
        "// …and the KPI / chart queries re-run with the filter folded into $apply filter():",
        'await fetch("' + S.lastUrls.kpi + '", { headers: { Accept: "application/json" } });',
      ];
    } else {
      lines = [
        "// map → charts: the current extent becomes an OData $apply pipeline.",
        "// " + (S.lane === "live" ? "This just ran against demo.honua.io:" : "Sample-data lane — this is the request the live lane runs:"),
        'var res = await fetch("' + S.lastUrls.zoning + '",',
        '  { headers: { Accept: "application/json" } });',
        "var rows = (await res.json()).value;  // [{ zoning, parcels, acres }, …]",
        "",
        "// histogram bins, computed server-side with documented $apply arithmetic:",
        '// compute(gisacres sub (gisacres mod ' + S.config.histogram.binWidth + ') as acrebin)/groupby((acrebin),aggregate($count as parcels))',
      ];
    }
    el("wb-code-strip-body").textContent = lines.join("\n");
  }

  /* ── refresh cycle ─────────────────────────────────────────────── */

  function activeAggregate(bounds) {
    return S.lane === "live" ? liveAggregate(bounds) : fixtureAggregate(bounds);
  }

  function refresh(interaction) {
    if (!S.map) return;
    var token = ++S.refreshToken;
    var bounds = S.map.getBounds();
    activeAggregate(bounds).then(
      function (result) {
        if (token !== S.refreshToken) return; // a newer interaction superseded this one
        S.lastResult = result;
        S.lastUrls = result.urls;
        renderKpis(result);
        renderCategoryBars("wb-chart-zoning", result.zoning, S.config.zoningCategories, true);
        renderHistogram("wb-chart-histogram", result.histogram);
        var floodSection = el("wb-flood-section");
        if (S.floodAvailable) {
          floodSection.style.display = "";
          renderCategoryBars("wb-chart-flood", result.kpi, S.config.floodZoneClasses, false);
        } else {
          floodSection.style.display = "none";
        }
        renderQueryBar();
        renderCodeStrip(interaction === "chart" ? "chart-to-map" : "map-to-charts");
        renderClearButton();
      },
      function () {
        if (token !== S.refreshToken) return;
        if (S.lane === "live") {
          /* Live lane started failing mid-session — drop to the fixture,
           * swapping the map's MVT source for the bundled sample data. */
          enterFixtureLane("live aggregation failed — showing sample data").then(function () {
            removeParcelLayers(S.map);
            addParcelLayers(S.map);
            updateMapHighlight();
            refresh(interaction);
          });
        } else {
          setStatus("error", "aggregation failed — try moving the map");
        }
      }
    );
  }

  var debouncedMapRefresh = debounce(function () {
    refresh("map");
  }, 300);

  function onFiltersChanged(source) {
    updateMapHighlight();
    renderClearButton();
    refresh("chart");
    void source; // interaction label kept for future analytics wiring
  }

  function renderClearButton() {
    var any = Boolean(S.filters.zoning || S.filters.acres);
    var button = el("wb-clear-filters");
    button.disabled = !any;
    var summary = [];
    if (S.filters.zoning) summary.push("zoning = " + S.filters.zoning);
    if (S.filters.acres) {
      summary.push(
        isFinite(S.filters.acres.max)
          ? S.filters.acres.min + "–" + S.filters.acres.max + " ac"
          : S.filters.acres.min + "+ ac"
      );
    }
    el("wb-filter-summary").textContent = any ? summary.join(" · ") : "no chart filters";
  }

  /* ── lane probing ──────────────────────────────────────────────── */

  function fetchWithTimeout(url, options, ms) {
    if (typeof AbortController === "undefined") return fetch(url, options);
    var controller = new AbortController();
    var opts = {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) opts[key] = options[key];
    }
    opts.signal = controller.signal;
    var timer = setTimeout(function () {
      controller.abort();
    }, ms);
    return fetch(url, opts).then(
      function (res) {
        clearTimeout(timer);
        return res;
      },
      function (error) {
        clearTimeout(timer);
        throw error;
      }
    );
  }

  /* Find the configured parcels layer in GET /odata/Layers and return its
   * entity key, defensively matching common name properties. */
  function resolveOdataLayer(rows, wanted) {
    var nameProps = ["Name", "name", "ServiceId", "serviceId", "Title", "title", "LayerName", "layerName"];
    var keyProps = ["Id", "ID", "id", "LayerId", "layerId"];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      for (var n = 0; n < nameProps.length; n++) {
        var value = row[nameProps[n]];
        if (typeof value === "string" && value.toLowerCase() === wanted.toLowerCase()) {
          for (var k = 0; k < keyProps.length; k++) {
            if (row[keyProps[k]] !== undefined && row[keyProps[k]] !== null) {
              var key = row[keyProps[k]];
              return typeof key === "number" ? String(key) : "'" + String(key).replace(/'/g, "''") + "'";
            }
          }
        }
      }
    }
    return null;
  }

  function probeLiveLane() {
    var serviceRoot = S.shared.server.baseUrl + S.config.odata.serviceRootPath;
    var timeout = S.config.odata.probeTimeoutMs;
    return fetchWithTimeout(serviceRoot + "Layers", { headers: { Accept: "application/json" } }, timeout)
      .then(function (res) {
        if (!res.ok) throw new Error("odata layers HTTP " + res.status);
        return res.json();
      })
      .then(function (body) {
        var rows = body && Array.isArray(body.value) ? body.value : [];
        var layerKey = resolveOdataLayer(rows, S.config.odata.layerName);
        if (!layerKey) throw new Error("parcels layer not seeded");
        var featuresUrl = serviceRoot + "Layers(" + layerKey + ")/Features";
        /* smoke-test $apply before committing to the live lane */
        return fetchWithTimeout(
          featuresUrl + "?$apply=" + encodeODataValue("aggregate($count as parcels)"),
          { headers: { Accept: "application/json" } },
          timeout
        ).then(function (res) {
          if (!res.ok) throw new Error("$apply smoke test HTTP " + res.status);
          return { serviceRoot: serviceRoot, featuresUrl: featuresUrl, layerKey: layerKey };
        });
      });
  }

  function loadFixture() {
    if (S.fixture) return Promise.resolve(S.fixture);
    return fetch(S.config.fixtureUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("failed to load fixture");
        return res.json();
      })
      .then(function (raw) {
        S.fixture = prepareFixture(raw);
        return S.fixture;
      });
  }

  function enterFixtureLane(statusText) {
    S.lane = "fixture";
    return loadFixture().then(function () {
      var badge = el("wb-lane-badge");
      badge.style.display = "inline-flex";
      setStatus("waiting", statusText);
      var parquet = el("wb-export-parquet");
      parquet.classList.add("is-pending");
      parquet.setAttribute("aria-disabled", "true");
      parquet.removeAttribute("href");
      el("wb-export-parquet-note").style.display = "block";
    });
  }

  function enterLiveLane(odata) {
    S.lane = "live";
    S.odata = odata;
    el("wb-lane-badge").style.display = "none";
    setStatus("live", "live · demo.honua.io · OData $apply over " + S.config.odata.layerName);
    var parquet = el("wb-export-parquet");
    parquet.classList.remove("is-pending");
    parquet.removeAttribute("aria-disabled");
    parquet.setAttribute("href", S.shared.server.baseUrl + S.config.export.geoparquetPath);
    el("wb-export-parquet-note").style.display = "none";
  }

  /* ── feed panel (Excel / Power BI / GeoParquet) ────────────────── */

  function wireCopyButtons() {
    document.querySelectorAll("[data-copy-target]").forEach(function (button) {
      button.addEventListener("click", function () {
        var source = el(button.dataset.copyTarget);
        var text = source ? source.dataset.copyValue || source.textContent : "";
        if (button.dataset.copyTarget === "wb-query-url") text = S.lastUrls[S.queryBarTab] || text;
        function done(ok) {
          var original = button.dataset.label || button.textContent;
          button.dataset.label = original;
          button.textContent = ok ? "copied" : "copy failed";
          setTimeout(function () {
            button.textContent = button.dataset.label;
          }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              done(true);
            },
            function () {
              done(false);
            }
          );
        } else {
          done(false);
        }
      });
    });
  }

  /* ── bootstrap ─────────────────────────────────────────────────── */

  function bootstrap() {
    if (!window.maplibregl) {
      setStatus("error", "demo assets failed to load");
      return;
    }

    Promise.all([
      fetch(CONFIG_URL).then(function (res) {
        if (!res.ok) throw new Error("failed to load " + CONFIG_URL);
        return res.json();
      }),
    ])
      .then(function (loaded) {
        S.config = loaded[0];
        return fetch(S.config.sharedLayersConfig).then(function (res) {
          if (!res.ok) throw new Error("failed to load " + S.config.sharedLayersConfig);
          return res.json();
        });
      })
      .then(function (shared) {
        S.shared = shared;

        /* fill the feed-panel URL from the contract (single source of truth) */
        var serviceRoot = shared.server.baseUrl + S.config.odata.serviceRootPath;
        var feedUrl = el("wb-feed-url");
        feedUrl.textContent = serviceRoot;
        feedUrl.dataset.copyValue = serviceRoot;

        var map = new window.maplibregl.Map({
          container: "wb-map",
          style: {
            version: 8,
            glyphs: shared.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": S.config.map.background } }],
          },
          center: S.config.map.center,
          zoom: S.config.map.zoom,
          minZoom: S.config.map.minZoom,
          maxZoom: S.config.map.maxZoom,
          attributionControl: { compact: false },
        });
        S.map = map;
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));

        setStatus("probing", "checking demo.honua.io …");

        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });
        var lane = probeLiveLane().then(
          function (odata) {
            return { live: true, odata: odata };
          },
          function () {
            return { live: false };
          }
        );

        return Promise.all([mapReady, lane]).then(function (results) {
          var probed = results[1];
          var ready = probed.live
            ? Promise.resolve(enterLiveLane(probed.odata))
            : enterFixtureLane("sample data — live server pending");
          return ready.then(function () {
            addParcelLayers(map);
            map.on("moveend", debouncedMapRefresh);
            refresh("map");
          });
        });
      })
      .catch(function (error) {
        setStatus("error", "demo failed to start: " + (error && error.message ? error.message : error));
      });

    /* static UI wiring (works regardless of lane) */
    el("wb-clear-filters").addEventListener("click", function () {
      S.filters.zoning = null;
      S.filters.acres = null;
      onFiltersChanged("clear");
    });
    document.querySelectorAll("[data-query-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        S.queryBarTab = button.dataset.queryTab;
        renderQueryBar();
      });
    });
    wireCopyButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
