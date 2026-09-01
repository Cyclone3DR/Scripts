/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />
// @ts-check

/**
 * Script: Swisstopo Data Download
 * Purpose: Download official swisstopo elevation data into the document, for
 *          a chosen area of interest:
 *            - bounding box of all VISIBLE elements, or
 *            - a corridor along / area inside a SELECTED polyline.
 *          Sources: swissSURFACE3D (ground class or all classes, LAS) and
 *          swissALTI3D (0.5 m / 2 m raster, XYZ). Tiles come from the swisstopo
 *          STAC API (newest year per tile) and are cached on disk. The
 *          comparison itself is then done manually with the built-in Cyclone
 *          3DR inspection tools (e.g. Compare/Inspect cloud vs cloud or mesh).
 * Note:    All web requests run through curl. The in-engine fetch() hits SSL
 *          certificate-chain errors for data.geo.admin.ch in the GUI process
 *          ("Zertifikat des Ausstellers ... konnte nicht gefunden werden"),
 *          curl as a separate process does not.
 * Author: Jan Sigrist (Bimatic GmbH)
 * Contact: jan.sigrist@bimatic.ch
 * Date: 2026-09-01
 * Tested with: Cyclone 3DR 2026.1.2
 * Requires: Cyclone 3DR 2025.2+ (SFile.ListEntries, AddFileSelector),
 *           internet access, curl + tar (built into Windows 10/11)
 * Licensing: free to use and adapt, no warranty. Compatible with any Cyclone 3DR edition.
 * Data source: data.geo.admin.ch STAC API (LV95 / EPSG:2056), (c) swisstopo
 */

// ==================== Constants ====================

var SCRIPT_TITLE = "Swisstopo Data Download / Daten-Download";
var LOGO_PATH = CurrentScriptPath() + "/../Bimatic_white_just_Name.svg";
var RESULT_GROUP = "Swisstopo Data";

var STAC_BASE_URL = "https://data.geo.admin.ch/api/stac/v0.9/collections/";
var STAC_PAGE_LIMIT = 100;
var GROUND_CLASS = 2;            // swissSURFACE3D ground classification (ASPRS)
var MESH_TOLERANCE = 0.01;       // DirectionMesh decimation tolerance [m]
var MESH_MAX_POINTS = 12000000;  // thin the cloud before meshing above this count
var MESH_THIN_DISTANCE = 1.0;    // ReduceBest target spacing when thinning [m]
var MANY_TILES_WARNING = 9;      // ask before downloading more raster tiles than this
var SURFACE3D_TILE_WARNING = 2;  // swissSURFACE3D tiles are huge, warn earlier
var SURFACE3D_TILE_MB = 130;     // rough download size of one swissSURFACE3D tile

// LV95 plausibility bounds (Switzerland)
var LV95_MIN_E = 2450000, LV95_MAX_E = 2850000;
var LV95_MIN_N = 1050000, LV95_MAX_N = 1310000;

/**
 * Reference data sources. gsd selects the raster resolution for swissALTI3D,
 * classes restricts the LAS import (null = all classes).
 */
var SOURCES = [
    {
        label: "swissSURFACE3D ground points (LiDAR class 2) / Bodenpunkte (LiDAR Klasse 2)",
        shortName: "swissSURFACE3D ground",
        collection: "ch.swisstopo.swisssurface3d",
        assetSuffix: ".las.zip",
        gsd: null,
        classes: [GROUND_CLASS]
    },
    {
        label: "swissSURFACE3D all classes (LiDAR) / alle Klassen",
        shortName: "swissSURFACE3D",
        collection: "ch.swisstopo.swisssurface3d",
        assetSuffix: ".las.zip",
        gsd: null,
        classes: null
    },
    {
        label: "swissALTI3D 0.5 m raster",
        shortName: "swissALTI3D 0.5m",
        collection: "ch.swisstopo.swissalti3d",
        assetSuffix: ".xyz.zip",
        gsd: 0.5,
        classes: null
    },
    {
        label: "swissALTI3D 2 m raster",
        shortName: "swissALTI3D 2m",
        collection: "ch.swisstopo.swissalti3d",
        assetSuffix: ".xyz.zip",
        gsd: 2.0,
        classes: null
    }
];

// ==================== Error Handling ====================

var currentStep = "Start";

function beginStep(name) {
    currentStep = name;
    print("=== " + name + " ===");
}

/**
 * The engine sometimes throws strings or objects without a message property;
 * a plain error.message then reads "undefined". Always produce readable text.
 */
function formatError(error) {
    if (error === null || error === undefined) {
        return "EN: Unknown exception without an error message (engine error).\n" +
            "DE: Unbekannte Ausnahme ohne Fehlermeldung (Engine-Fehler).";
    }
    if (typeof error === "string") {
        return error;
    }
    if (typeof error.message === "string" && error.message.length > 0) {
        return error.message;
    }
    try {
        return "Unexpected error object / Unerwartetes Fehlerobjekt: " + JSON.stringify(error);
    } catch (stringifyError) {
        return "Unexpected error object / Unerwartetes Fehlerobjekt: " + String(error);
    }
}

function handleError(error) {
    var text = "EN: Error in step \"" + currentStep + "\": / " +
        "DE: Fehler im Schritt \"" + currentStep + "\":\n\n" + formatError(error);
    print("ERROR (" + currentStep + "): " + formatError(error));
    if (error && typeof error.stack === "string") {
        print("Stack:\n" + error.stack);
    }
    SDialog.Message(text, SDialog.EMessageSeverity.Error, SCRIPT_TITLE);
}

// ==================== Main Function ====================

function main() {
    try {
        beginStep("Collect parameters / Parameter erfassen");
        var params = getUserParameters();
        var source = SOURCES[params.sourceIndex];

        beginStep("Determine area / Gebiet bestimmen");
        var area = computeAreaOfInterest(params);

        beginStep("Find tiles (swisstopo STAC) / Kacheln suchen");
        var tiles = resolveTiles(source, area, params.buffer);
        confirmLargeDownload(tiles, source, params.cacheDir);

        beginStep("Download and import tiles / Kacheln herunterladen und importieren");
        var tileClouds = downloadAndImportTiles(tiles, source, params, area);

        beginStep("Prepare result / Ergebnis aufbereiten");
        var result = presentClouds(tileClouds, tiles, source, params);
        if (params.createMesh) {
            beginStep("Meshing (2.5D) / Vermaschung");
            result.mesh = createReferenceMesh(result.meshSourceCloud, source);
        }

        beginStep("Finish / Abschluss");
        showSummary(result, tiles, source, params);
    } catch (error) {
        handleError(error);
    }
}

// ==================== User Input ====================

function getUserParameters() {
    var dialog = SDialog.New(SCRIPT_TITLE);
    dialog.SetHeader(SCRIPT_TITLE, LOGO_PATH, 60);
    dialog.AddText(
        "EN: Downloads official swisstopo elevation data as a point cloud into the\n" +
        "project. Run the comparison manually afterwards (e.g. Compare/Inspect).",
        SDialog.EMessageSeverity.Instruction
    );
    dialog.AddText(
        "DE: Lädt offizielle swisstopo-Höhendaten als Punktwolke ins Projekt.\n" +
        "Den Vergleich danach manuell ausführen (z.B. Vergleichen/Prüfen).",
        SDialog.EMessageSeverity.Instruction
    );

    dialog.BeginGroup("Area / Gebiet");
    dialog.AddChoices({
        id: "areaIndex",
        name: "Area selection / Gebietswahl",
        choices: [
            "Bounding box of all visible elements / Bounding Box sichtbarer Elemente",
            "Along / inside the selected polyline / Entlang der selektierten Polylinie"
        ],
        value: 0,
        saveValue: true,
        tooltip: "EN: Polyline: open line = corridor with buffer width, closed contour = area plus buffer. " +
            "Select exactly one polyline first. | " +
            "DE: Polylinie: offene Linie = Korridor mit Pufferbreite, geschlossene Kontur = Fläche plus Puffer. " +
            "Vorher genau eine Polylinie selektieren."
    });
    dialog.AddLength({
        id: "buffer",
        name: "Buffer / Puffer [m]",
        value: 50.0, min: 0.0, max: 1000.0, saveValue: true,
        tooltip: "EN: Expands the bounding box, or sets half the corridor width around the polyline | " +
            "DE: Erweitert die Bounding Box bzw. definiert die halbe Korridorbreite um die Polylinie"
    });

    dialog.BeginGroup("Data / Daten");
    dialog.AddChoices({
        id: "sourceIndex",
        name: "Data source / Datenquelle",
        choices: SOURCES.map(function (s) { return s.label; }),
        value: 0,
        saveValue: true,
        tooltip: "EN: swissSURFACE3D = classified LiDAR (large downloads), swissALTI3D = terrain raster | " +
            "DE: swissSURFACE3D = klassifiziertes LiDAR (grosse Downloads), swissALTI3D = Terrainraster"
    });
    dialog.AddInt({
        id: "pointLimitMio",
        name: "Point limit per tile [millions, 0 = all] / Punktelimit pro Kachel",
        value: 0, min: 0, max: 100, saveValue: true,
        tooltip: "EN: 0 = all points (recommended). A limit truncates LAS tiles spatially, it does not thin them. | " +
            "DE: 0 = alle Punkte (empfohlen). Ein Limit schneidet LAS-Kacheln räumlich ab (kein Ausdünnen)."
    });

    dialog.BeginGroup("Output / Ausgabe");
    dialog.AddBoolean({
        id: "clipToArea",
        name: "Clip to the chosen area / Auf gewähltes Gebiet zuschneiden",
        value: true, saveValue: true,
        tooltip: "EN: Off = the full 1 km2 tiles are imported | DE: Aus = die vollen 1 km2 Kacheln werden importiert"
    });
    dialog.AddBoolean({
        id: "mergeTiles",
        name: "Merge tiles into one cloud / Kacheln zusammenführen",
        value: true, saveValue: true
    });
    dialog.AddBoolean({
        id: "createMesh",
        name: "Also create a 2.5D mesh / Zusätzlich 2.5D-Mesh erzeugen",
        value: false, saveValue: true,
        tooltip: "EN: For a manual mesh-to-cloud comparison. Very dense clouds are thinned to ~1 m point " +
            "spacing before meshing. | DE: Für manuellen Mesh-zu-Wolke-Vergleich. Sehr dichte Wolken werden " +
            "vor der Vermaschung auf ~1 m Punktabstand ausgedünnt."
    });
    dialog.AddFileSelector({
        id: "cacheDir",
        name: "Cache folder / Cache-Ordner",
        mode: SDialog.EMode.OpenDirectory,
        value: defaultCacheDirectory(),
        saveValue: true,
        tooltip: "EN: Downloaded tiles are reused from here | DE: Heruntergeladene Kacheln werden hier wiederverwendet"
    });

    // Run() is typed as {ErrorCode} only; the field ids are dynamic
    var result = /** @type {any} */ (dialog.Run());
    if (result.ErrorCode !== 0) {
        throw new Error("EN: Cancelled by user. | DE: Vom Benutzer abgebrochen.");
    }

    return {
        usePolyline: result.areaIndex === 1,
        buffer: result.buffer,
        sourceIndex: result.sourceIndex,
        pointLimit: result.pointLimitMio * 1000000,
        clipToArea: result.clipToArea,
        mergeTiles: result.mergeTiles,
        createMesh: result.createMesh,
        cacheDir: normalizeDirectory(result.cacheDir)
    };
}

function normalizeDirectory(path) {
    var normalized = path.replace(/\\/g, "/");
    if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * TempPath() points into a per-session folder (Temp/Session/<random>/) that
 * 3DR removes on exit. Strip that part to reach the stable Temp root so
 * downloaded tiles survive between sessions.
 */
function defaultCacheDirectory() {
    var sessionTemp = normalizeDirectory(TempPath());
    var stableRoot = sessionTemp.replace(/\/Session\/[^\/]+$/, "");
    return stableRoot + "/swisstopo_cache";
}

// ==================== Area of Interest ====================

/**
 * area.type "bbox":     buffered LV95 rectangle
 * area.type "corridor": sample points along the polyline (+ closed contour)
 * Both carry a bounding box used for the STAC query.
 */
function computeAreaOfInterest(params) {
    var area = params.usePolyline
        ? buildPolylineArea(params.buffer)
        : buildVisibleElementsArea(params.buffer);

    validateLv95(area);
    print("Area (LV95): E " + area.minE.toFixed(0) + " to " + area.maxE.toFixed(0) +
        ", N " + area.minN.toFixed(0) + " to " + area.maxN.toFixed(0));
    return area;
}

function buildVisibleElementsArea(buffer) {
    var components = SComp.All(SComp.VISIBLE_ONLY);
    if (components.length === 0) {
        throw new Error(
            "EN: No visible elements found in the project. Make at least one element\n" +
            "(cloud, mesh, line ...) visible, or use the 'Polyline' area selection.\n\n" +
            "DE: Keine sichtbaren Elemente im Projekt gefunden. Mindestens ein Element\n" +
            "(Wolke, Mesh, Linie ...) sichtbar schalten oder die Gebietswahl 'Polylinie' verwenden."
        );
    }

    var minE = Number.MAX_VALUE, maxE = -Number.MAX_VALUE;
    var minN = Number.MAX_VALUE, maxN = -Number.MAX_VALUE;
    var used = 0;

    for (var i = 0; i < components.length; i++) {
        var box = safeBoundingBox(components[i]);
        if (box === null) {
            continue;
        }
        minE = Math.min(minE, box.minX);
        maxE = Math.max(maxE, box.maxX);
        minN = Math.min(minN, box.minY);
        maxN = Math.max(maxN, box.maxY);
        used++;
    }

    if (used === 0) {
        throw new Error(
            "EN: None of the visible elements provide a valid bounding box. Make a\n" +
            "cloud, mesh or line visible, or use the 'Polyline' area selection.\n\n" +
            "DE: Keines der sichtbaren Elemente liefert eine gültige Bounding Box.\n" +
            "Mindestens eine Wolke, ein Mesh oder eine Linie sichtbar schalten oder\n" +
            "die Gebietswahl 'Polylinie' verwenden."
        );
    }
    print(used + " visible element(s) considered for the bounding box.");

    return {
        type: "bbox",
        minE: minE - buffer, maxE: maxE + buffer,
        minN: minN - buffer, maxN: maxN + buffer,
        samples: null, polygon: null,
        vertices: null, closed: false, contourPolyline: null
    };
}

/**
 * Some component types can throw on GetBoundingBox or return degenerate
 * boxes; skip those instead of failing the whole area computation.
 */
function safeBoundingBox(component) {
    try {
        var box = component.GetBoundingBox();
        if (!box || !box.LowPoint || !box.UpPoint) {
            return null;
        }
        var minX = box.LowPoint.GetX(), maxX = box.UpPoint.GetX();
        var minY = box.LowPoint.GetY(), maxY = box.UpPoint.GetY();
        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
            return null;
        }
        if (maxX < minX || maxY < minY) {
            return null;
        }
        return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    } catch (boxError) {
        return null;
    }
}

function buildPolylineArea(buffer) {
    var polylines = SMultiline.FromSel();
    if (polylines.length !== 1) {
        throw new Error(
            "EN: Please select exactly ONE polyline (currently: " + polylines.length + "). " +
            "The 'Polyline' area selection needs one selected SMultiline.\n\n" +
            "DE: Bitte genau EINE Polylinie selektieren (aktuell: " + polylines.length + "). " +
            "Die Gebietswahl 'Polylinie' braucht eine selektierte SMultiline."
        );
    }
    var polyline = polylines[0];
    var vertexCount = polyline.GetNumber();
    if (vertexCount < 2) {
        throw new Error(
            "EN: The selected polyline has fewer than 2 points. | " +
            "DE: Die selektierte Polylinie hat weniger als 2 Punkte."
        );
    }

    var samples = samplePolyline(polyline, Math.max(10, buffer / 2));
    var isClosed = polyline.IsClosed();
    var vertices = [];
    for (var i = 0; i < vertexCount; i++) {
        var vertex = polyline.GetPoint(i);
        vertices.push({ x: vertex.GetX(), y: vertex.GetY() });
    }
    if (isClosed) {
        print("Closed contour detected: the area inside will be included.");
    }

    var minE = Number.MAX_VALUE, maxE = -Number.MAX_VALUE;
    var minN = Number.MAX_VALUE, maxN = -Number.MAX_VALUE;
    for (var s = 0; s < samples.length; s++) {
        minE = Math.min(minE, samples[s].x);
        maxE = Math.max(maxE, samples[s].x);
        minN = Math.min(minN, samples[s].y);
        maxN = Math.max(maxN, samples[s].y);
    }
    print("Polyline: " + vertexCount + " vertices, " + samples.length + " sample points.");

    return {
        type: "corridor",
        minE: minE - buffer, maxE: maxE + buffer,
        minN: minN - buffer, maxN: maxN + buffer,
        samples: samples,
        polygon: isClosed ? vertices : null,
        vertices: vertices, closed: isClosed, contourPolyline: isClosed ? polyline : null
    };
}

/**
 * Sample points along the polyline (vertices plus intermediate points) so the
 * tile filter sees the real course, not only the corners.
 */
function samplePolyline(polyline, stepSize) {
    var samples = [];
    var vertexCount = polyline.GetNumber();

    for (var i = 0; i < vertexCount - 1; i++) {
        var start = polyline.GetPoint(i);
        var end = polyline.GetPoint(i + 1);
        var dx = end.GetX() - start.GetX();
        var dy = end.GetY() - start.GetY();
        var length = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(length / stepSize));

        for (var s = 0; s < steps; s++) {
            var t = s / steps;
            samples.push({ x: start.GetX() + t * dx, y: start.GetY() + t * dy });
        }
    }
    var last = polyline.GetPoint(vertexCount - 1);
    samples.push({ x: last.GetX(), y: last.GetY() });
    return samples;
}

function validateLv95(area) {
    var insideLv95 =
        area.minE >= LV95_MIN_E && area.maxE <= LV95_MAX_E &&
        area.minN >= LV95_MIN_N && area.maxN <= LV95_MAX_N;
    if (!insideLv95) {
        throw new Error(
            "EN: The area lies outside the LV95 bounds of Switzerland\n" +
            "(E " + area.minE.toFixed(0) + " to " + area.maxE.toFixed(0) +
            ", N " + area.minN.toFixed(0) + " to " + area.maxN.toFixed(0) + ").\n" +
            "The project must be georeferenced in LV95 / EPSG:2056.\n\n" +
            "DE: Das Gebiet liegt ausserhalb der LV95-Grenzen der Schweiz\n" +
            "(E " + area.minE.toFixed(0) + " bis " + area.maxE.toFixed(0) +
            ", N " + area.minN.toFixed(0) + " bis " + area.maxN.toFixed(0) + ").\n" +
            "Das Projekt muss in LV95 / EPSG:2056 georeferenziert sein."
        );
    }
}

// ==================== Tile Selection ====================

/**
 * Official swisstopo approximation formulas LV95 -> WGS84 (accuracy ~1 m,
 * more than enough for a buffered STAC bounding box query).
 */
function lv95ToWgs84(easting, northing) {
    var y = (easting - 2600000) / 1000000;
    var x = (northing - 1200000) / 1000000;

    var lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x +
        0.1306 * y * x * x - 0.0436 * y * y * y;
    var lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y -
        0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;

    return { lon: lon * 100 / 36, lat: lat * 100 / 36 };
}

var jsonRequestCounter = 0;

/**
 * Fetch JSON via curl into a temp file. The in-engine fetch() runs into SSL
 * certificate-chain errors for data.geo.admin.ch inside the GUI process
 * ("Zertifikat des Ausstellers ... konnte nicht gefunden werden"), while curl
 * as a separate process resolves the chain fine. TempPath() is per-session,
 * which is exactly right for these short-lived response files.
 */
function downloadJson(url, context) {
    jsonRequestCounter++;
    var tempFile = TempPath() + "swisstopo_stac_" + jsonRequestCounter + ".json";

    var curlCode = Execute("curl", ["-sS", "-L", "--fail", "-o", tempFile, url]);
    if (curlCode !== 0 || !fileExists(tempFile)) {
        throw new Error(
            context + " failed (curl exit code " + curlCode + ").\n" +
            "Check internet connection / firewall / proxy."
        );
    }

    var file = SFile.New(tempFile);
    if (!file.Open(SFile.ReadOnly)) {
        throw new Error(context + ": response file could not be read.");
    }
    var text = file.ReadAll();
    file.Close();
    file.Remove();

    if (!text) {
        throw new Error(context + ": empty response from the server.");
    }
    try {
        return JSON.parse(text);
    } catch (parseError) {
        throw new Error(context + ": invalid JSON response (" + String(parseError) + ").");
    }
}

function queryStacItems(collection, area) {
    var southWest = lv95ToWgs84(area.minE, area.minN);
    var northEast = lv95ToWgs84(area.maxE, area.maxN);
    var url = STAC_BASE_URL + collection + "/items" +
        "?bbox=" + southWest.lon + "," + southWest.lat + "," +
        northEast.lon + "," + northEast.lat +
        "&limit=" + STAC_PAGE_LIMIT;

    var items = [];
    while (url) {
        var page = downloadJson(url, "STAC tile query");
        items = items.concat(page.features || []);
        url = findNextLink(page.links);
    }
    return items;
}

function findNextLink(links) {
    if (!links) {
        return null;
    }
    for (var i = 0; i < links.length; i++) {
        if (links[i].rel === "next") {
            return links[i].href;
        }
    }
    return null;
}

/**
 * Swisstopo republishes tiles over the years; keep only the newest item per
 * km tile (the trailing "E-N" part of the item id, e.g. "2600-1198").
 */
function selectNewestItemPerTile(items) {
    var newestByTile = {};
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var tileKey = item.id.split("_").pop();
        var existing = newestByTile[tileKey];
        if (!existing || item.properties.datetime > existing.properties.datetime) {
            newestByTile[tileKey] = item;
        }
    }
    return Object.keys(newestByTile).map(function (key) { return newestByTile[key]; });
}

/** LV95 rectangle of a km tile, derived from its key "2600-1198". */
function tileRectangle(tileKey) {
    var parts = tileKey.split("-");
    var eastKm = parseInt(parts[0], 10);
    var northKm = parseInt(parts[1], 10);
    if (isNaN(eastKm) || isNaN(northKm)) {
        return null;
    }
    return {
        minX: eastKm * 1000, maxX: (eastKm + 1) * 1000,
        minY: northKm * 1000, maxY: (northKm + 1) * 1000
    };
}

function pointToRectangleDistance(x, y, rect) {
    var dx = Math.max(rect.minX - x, 0, x - rect.maxX);
    var dy = Math.max(rect.minY - y, 0, y - rect.maxY);
    return Math.sqrt(dx * dx + dy * dy);
}

/** Standard ray-casting point-in-polygon test (2D). */
function pointInPolygon(x, y, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i].x, yi = polygon[i].y;
        var xj = polygon[j].x, yj = polygon[j].y;
        var crosses = (yi > y) !== (yj > y) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (crosses) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Keep a tile when it lies in the buffered bbox (bbox mode), or when the
 * polyline passes within the buffer / the tile center lies inside a closed
 * contour (corridor mode). This is what keeps a diagonal railway corridor
 * from pulling in every tile of its bounding box.
 */
function tileMatchesArea(tileKey, area, buffer) {
    var rect = tileRectangle(tileKey);
    if (rect === null) {
        return true; // unknown key format: keep rather than silently drop
    }
    if (area.type === "bbox") {
        return rect.minX <= area.maxE && rect.maxX >= area.minE &&
            rect.minY <= area.maxN && rect.maxY >= area.minN;
    }

    for (var i = 0; i < area.samples.length; i++) {
        if (pointToRectangleDistance(area.samples[i].x, area.samples[i].y, rect) <= buffer) {
            return true;
        }
    }
    if (area.polygon !== null) {
        var centerX = (rect.minX + rect.maxX) / 2;
        var centerY = (rect.minY + rect.maxY) / 2;
        if (pointInPolygon(centerX, centerY, area.polygon)) {
            return true;
        }
    }
    return false;
}

/** Pick the matching download asset of a STAC item. */
function pickAsset(item, source) {
    var assetKeys = Object.keys(item.assets);
    for (var i = 0; i < assetKeys.length; i++) {
        var key = assetKeys[i];
        if (!key.endsWith(source.assetSuffix)) {
            continue;
        }
        var asset = item.assets[key];
        if (source.gsd !== null && Math.abs(asset["eo:gsd"] - source.gsd) > 0.01) {
            continue;
        }
        return { fileName: key, href: asset.href };
    }
    return null;
}

function resolveTiles(source, area, buffer) {
    print("Querying the swisstopo STAC API ...");
    var items = selectNewestItemPerTile(queryStacItems(source.collection, area));

    var tiles = [];
    var skipped = 0;
    for (var i = 0; i < items.length; i++) {
        var tileKey = items[i].id.split("_").pop();
        if (!tileMatchesArea(tileKey, area, buffer)) {
            skipped++;
            continue;
        }
        var asset = pickAsset(items[i], source);
        if (asset === null) {
            print("Warning: tile " + items[i].id + " has no matching asset and is skipped.");
            continue;
        }
        tiles.push({ id: items[i].id, key: tileKey, fileName: asset.fileName, href: asset.href });
    }

    if (tiles.length === 0) {
        throw new Error(
            "EN: No " + source.shortName + " tiles found for this area. Does the area\n" +
            "lie within swisstopo's data coverage?\n\n" +
            "DE: Keine " + source.shortName + "-Kacheln für dieses Gebiet gefunden.\n" +
            "Liegt das Gebiet innerhalb der Datenabdeckung von swisstopo?"
        );
    }
    print(tiles.length + " tile(s) in the area" +
        (skipped > 0 ? " (" + skipped + " outside the corridor discarded)" : "") + ".");
    return tiles;
}

// ==================== Download & Import ====================

function fileExists(path) {
    return SFile.New(path).Exists();
}

/**
 * SFile.Open creates intermediate directories (since 2025.2), so writing a
 * small marker file is the scripting way to create a directory tree.
 */
function ensureDirectoryExists(dirPath) {
    var marker = SFile.New(dirPath + "/.cache");
    if (!marker.Open(SFile.WriteOnly)) {
        throw new Error(
            "EN: Cannot create the cache folder: " + dirPath + " | " +
            "DE: Cache-Ordner kann nicht erstellt werden: " + dirPath
        );
    }
    marker.Write("swisstopo tile cache");
    marker.Close();
}

/**
 * Find the tile data file inside an extraction directory. The file inside the
 * swisstopo zip follows a DIFFERENT naming scheme than the zip itself, so
 * search by extension.
 */
function findTileFile(extractDir, extension) {
    var entries = SFile.ListEntries(extractDir, SFile.Files, false, [extension]);
    if (entries.ErrorCode !== 0 || entries.Entries.length === 0) {
        return null;
    }
    var entry = entries.Entries[0];
    var hasFullPath = entry.indexOf("/") >= 0 || entry.indexOf("\\") >= 0;
    return hasFullPath ? entry : extractDir + "/" + entry;
}

/**
 * Warn before large downloads. Only tiles missing from the cache count;
 * swissSURFACE3D warns much earlier because one tile is ~130 MB LAS plus a
 * multi-minute import.
 */
function confirmLargeDownload(tiles, source, cacheDir) {
    var extension = source.gsd === null ? "las" : "xyz";
    var missing = tiles.filter(function (tile) {
        var extractDir = cacheDir + "/" + tile.fileName.slice(0, -4);
        return findTileFile(extractDir, extension) === null;
    });

    var warnThreshold = source.gsd === null ? SURFACE3D_TILE_WARNING : MANY_TILES_WARNING;
    if (missing.length <= warnThreshold) {
        return;
    }

    var sizeHint = source.gsd === null
        ? "EN: That is roughly " + Math.round(missing.length * SURFACE3D_TILE_MB) + " MB of download,\n" +
          "plus several minutes of LAS import after the download.\n" +
          "DE: Das sind ca. " + Math.round(missing.length * SURFACE3D_TILE_MB) + " MB Download,\n" +
          "plus mehrere Minuten LAS-Import nach dem Download."
        : "EN: This can mean a larger download (the cache is reused on later runs).\n" +
          "DE: Das kann einen grösseren Download bedeuten (Cache wird wiederverwendet).";

    var dialog = SDialog.New(SCRIPT_TITLE);
    dialog.AddText(
        "EN: " + missing.length + " of " + tiles.length + " " + source.shortName +
        " tiles need to be downloaded.\n" + sizeHint + "\n\n" +
        "DE: " + missing.length + " von " + tiles.length + " " + source.shortName +
        "-Kacheln müssen heruntergeladen werden.",
        SDialog.EMessageSeverity.Warning
    );
    dialog.SetButtons(["Continue / Fortfahren", "Cancel / Abbrechen"]);
    if (dialog.Run().ErrorCode !== 0) {
        throw new Error("EN: Cancelled by user (download size). | DE: Vom Benutzer abgebrochen (Downloadumfang).");
    }
}

/**
 * Download and extract one tile into the cache directory. Zip and extracted
 * file are cached, so repeated runs cause no network traffic. Large downloads
 * run through curl because SFile cannot write binary data.
 */
function ensureTileOnDisk(tile, cacheDir, extension) {
    var zipPath = cacheDir + "/" + tile.fileName;
    var extractDir = cacheDir + "/" + tile.fileName.slice(0, -4); // strip ".zip"

    var cachedFile = findTileFile(extractDir, extension);
    if (cachedFile !== null) {
        print("Tile already cached: " + tile.fileName);
        return cachedFile;
    }

    if (!fileExists(zipPath)) {
        print("Downloading " + tile.fileName + " ...");
        var curlCode = Execute("curl", ["-sS", "-L", "--fail", "--create-dirs", "-o", zipPath, tile.href]);
        if (curlCode !== 0 || !fileExists(zipPath)) {
            throw new Error(
                "EN: Download failed: " + tile.fileName + " (curl exit code " + curlCode + "). " +
                "Check your internet connection.\n\n" +
                "DE: Download fehlgeschlagen: " + tile.fileName + "\n" +
                "Internetverbindung prüfen (curl Exit-Code " + curlCode + ")."
            );
        }
    }

    print("Extracting " + tile.fileName + " ...");
    ensureDirectoryExists(extractDir);
    var tarCode = Execute("tar", ["-xf", zipPath, "-C", extractDir]);
    var extractedFile = findTileFile(extractDir, extension);
    if (tarCode !== 0 || extractedFile === null) {
        throw new Error(
            "EN: Extraction failed (tar exit code " + tarCode + "): " + zipPath + "\n" +
            "No ." + extension + " file found in " + extractDir + ".\n\n" +
            "DE: Entpacken fehlgeschlagen (tar Exit-Code " + tarCode + "): " + zipPath
        );
    }
    return extractedFile;
}

function importTile(filePath, source, pointLimit) {
    if (source.gsd !== null) {
        var rasterResult = SCloud.FromAsciiFile(filePath, "XYZ", pointLimit);
        if (rasterResult.ErrorCode !== 0 || !rasterResult.Cloud) {
            throw new Error(
                "EN: XYZ import failed: " + filePath + " | DE: XYZ-Import fehlgeschlagen: " + filePath
            );
        }
        return rasterResult.Cloud;
    }

    var lasResult = source.classes !== null
        ? SSurveyingFormat.ImportLASLAZ(filePath, pointLimit, ["classification"], source.classes)
        : SSurveyingFormat.ImportLASLAZ(filePath, pointLimit, ["all_attributes"], []);
    if (lasResult.ErrorCode === 3 || !lasResult.Cloud) {
        throw new Error(
            "EN: LAS import failed: " + filePath + " | DE: LAS-Import fehlgeschlagen: " + filePath
        );
    }
    if (lasResult.ErrorCode !== 0) {
        print("Warning: import filter not applied (error code " + lasResult.ErrorCode + "), all points imported.");
    }
    return lasResult.Cloud;
}

function downloadAndImportTiles(tiles, source, params, area) {
    var extension = source.gsd === null ? "las" : "xyz";
    var tileClouds = [];

    for (var i = 0; i < tiles.length; i++) {
        print("Tile " + (i + 1) + "/" + tiles.length + ": " + tiles[i].id);
        var filePath = ensureTileOnDisk(tiles[i], params.cacheDir, extension);
        print("Importing " + tiles[i].id + " ...");
        var cloud = importTile(filePath, source, params.pointLimit);
        if (cloud.GetNumber() === 0) {
            throw new Error(
                "EN: Tile imported without points: " + tiles[i].id + " | " +
                "DE: Kachel ohne Punkte importiert: " + tiles[i].id
            );
        }
        print("  " + cloud.GetNumber() + " points imported.");

        if (params.clipToArea) {
            cloud = clipCloudToArea(cloud, area, params.buffer);
            if (cloud === null) {
                print("  Tile lies fully outside the area and is skipped.");
                continue;
            }
            print("  " + cloud.GetNumber() + " points after clipping.");
        }

        cloud.SetName(tiles[i].id);
        tileClouds.push(cloud);
    }

    if (tileClouds.length === 0) {
        throw new Error(
            "EN: No points remain in the chosen area after clipping. Check the area\n" +
            "or the buffer.\n\n" +
            "DE: Nach dem Zuschnitt bleiben keine Punkte im gewählten Gebiet übrig.\n" +
            "Gebiet oder Puffer prüfen."
        );
    }
    return tileClouds;
}

// ==================== Area Clipping ====================

/**
 * Clip an imported tile cloud to the area of interest. All clipping uses
 * SCloud.Separate with a closed 2D contour extruded along Z (unlimited), so
 * the point heights never influence the result.
 * Returns null when nothing of the cloud lies inside the area.
 */
function clipCloudToArea(cloud, area, buffer) {
    if (area.type === "bbox") {
        var rectangle = buildClosedContour([
            { x: area.minE, y: area.minN }, { x: area.maxE, y: area.minN },
            { x: area.maxE, y: area.maxN }, { x: area.minE, y: area.maxN }
        ]);
        return collectInsideContours(cloud, [rectangle]);
    }

    // Corridor: one rotated rectangle per polyline segment (caps extended by
    // the buffer so consecutive rectangles overlap at the joints); a closed
    // contour additionally contributes its inner area.
    var corridorBuffer = Math.max(0.5, buffer);
    var contours = [];
    if (area.closed && area.contourPolyline !== null) {
        contours.push(area.contourPolyline);
    }
    for (var i = 0; i < area.vertices.length - 1; i++) {
        var rect = buildSegmentRectangle(area.vertices[i], area.vertices[i + 1], corridorBuffer);
        if (rect !== null) {
            contours.push(rect);
        }
    }
    return collectInsideContours(cloud, contours);
}

/**
 * Run the contours as a cascade on the shrinking remainder cloud: every point
 * is counted exactly once even where contours overlap.
 */
function collectInsideContours(cloud, contours) {
    var zAxis = SVector.New(0, 0, 1);
    var keptClouds = [];
    var remaining = cloud;

    for (var i = 0; i < contours.length && remaining !== null; i++) {
        var separated = remaining.Separate(
            contours[i], zAxis,
            /** @type {any} */ (null), /** @type {any} */ (null),
            SCloud.FILL_ALL
        );
        if (separated.ErrorCode === 3) {
            throw new Error(
                "EN: The clipping contour is invalid (self-intersecting or not closed).\n" +
                "For the 'Polyline' area selection, check the line for self-intersections.\n\n" +
                "DE: Die Zuschnitt-Kontur ist ungültig (Selbstschnitt oder nicht geschlossen).\n" +
                "Bei Gebietswahl 'Polylinie' die Linie auf Überschneidungen prüfen."
            );
        }
        if (separated.InCloud && separated.InCloud.GetNumber() > 0) {
            keptClouds.push(separated.InCloud);
        }
        remaining = separated.OutCloud && separated.OutCloud.GetNumber() > 0
            ? separated.OutCloud
            : null;
    }

    if (keptClouds.length === 0) {
        return null;
    }
    if (keptClouds.length === 1) {
        return keptClouds[0];
    }
    var merged = SCloud.Merge(keptClouds);
    if (merged.ErrorCode !== 0 || !merged.Cloud) {
        throw new Error(
            "EN: Merging the clipped parts failed. | DE: Zusammenführen der Zuschnitt-Teile fehlgeschlagen."
        );
    }
    return merged.Cloud;
}

function buildClosedContour(points2d) {
    var contour = SMultiline.New();
    for (var i = 0; i < points2d.length; i++) {
        contour.InsertLast(SPoint.New(points2d[i].x, points2d[i].y, 0));
    }
    contour.InsertLast(SPoint.New(points2d[0].x, points2d[0].y, 0));
    return contour;
}

/** Rotated rectangle around one polyline segment, caps extended by buffer. */
function buildSegmentRectangle(p1, p2, buffer) {
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-9) {
        return null;
    }
    var ux = dx / length, uy = dy / length;   // along the segment
    var nx = -uy, ny = ux;                    // perpendicular

    var startX = p1.x - ux * buffer, startY = p1.y - uy * buffer;
    var endX = p2.x + ux * buffer, endY = p2.y + uy * buffer;

    return buildClosedContour([
        { x: startX + nx * buffer, y: startY + ny * buffer },
        { x: endX + nx * buffer, y: endY + ny * buffer },
        { x: endX - nx * buffer, y: endY - ny * buffer },
        { x: startX - nx * buffer, y: startY - ny * buffer }
    ]);
}

// ==================== Document Output ====================

function presentClouds(tileClouds, tiles, source, params) {
    var groupPath = RESULT_GROUP + "/" + source.shortName;
    var totalPoints = 0;
    var meshSourceCloud;

    if (params.mergeTiles && tileClouds.length > 1) {
        var merged = SCloud.Merge(tileClouds);
        if (merged.ErrorCode !== 0 || !merged.Cloud) {
            throw new Error(
                "EN: Merging the tiles failed. | DE: Zusammenführen der Kacheln fehlgeschlagen."
            );
        }
        meshSourceCloud = merged.Cloud;
        meshSourceCloud.SetName(source.shortName + " (" + tiles.length + " tiles)");
        meshSourceCloud.AddToDoc();
        meshSourceCloud.MoveToGroup(groupPath, false);
        totalPoints = meshSourceCloud.GetNumber();
    } else {
        for (var i = 0; i < tileClouds.length; i++) {
            tileClouds[i].AddToDoc();
            tileClouds[i].MoveToGroup(groupPath, false);
            totalPoints += tileClouds[i].GetNumber();
        }
        meshSourceCloud = tileClouds[0];
    }

    print("Result in group '" + groupPath + "' (" + totalPoints + " points).");
    return {
        groupPath: groupPath,
        totalPoints: totalPoints,
        cloudCount: params.mergeTiles && tileClouds.length > 1 ? 1 : tileClouds.length,
        meshSourceCloud: meshSourceCloud,
        mesh: null
    };
}

/**
 * DirectionMesh on a huge cloud is the slowest possible step, so thin dense
 * clouds to a regular spacing first (raster sources stay untouched below the
 * limit, their spacing is already regular).
 */
function prepareCloudForMeshing(cloud) {
    if (cloud.GetNumber() <= MESH_MAX_POINTS) {
        return cloud;
    }
    print("Cloud has " + cloud.GetNumber() + " points, thinning for meshing to ~" +
        MESH_THIN_DISTANCE.toFixed(1) + " m point spacing ...");
    var reduced = cloud.ReduceBest(MESH_THIN_DISTANCE, 0);
    if (reduced.ErrorCode !== 0 || !reduced.Cloud) {
        throw new Error(
            "EN: Thinning for meshing failed. | DE: Ausdünnen für die Vermaschung fehlgeschlagen."
        );
    }
    print("Cloud for meshing: " + reduced.Cloud.GetNumber() + " points.");
    return reduced.Cloud;
}

function createReferenceMesh(cloud, source) {
    var meshSource = prepareCloudForMeshing(cloud);
    print("Meshing " + meshSource.GetNumber() + " points (2.5D, can take a few minutes) ...");

    var meshResult = SPoly.DirectionMesh(meshSource, SVector.New(0, 0, 1), MESH_TOLERANCE, true);
    if (meshResult.ErrorCode !== 0 || !meshResult.Poly) {
        throw new Error("EN: Meshing failed. | DE: Vermaschung fehlgeschlagen.");
    }

    var mesh = meshResult.Poly;
    mesh.SetName(source.shortName + " Mesh");
    mesh.AddToDoc();
    mesh.MoveToGroup(RESULT_GROUP + "/" + source.shortName, false);
    print("Mesh created: " + mesh.GetName());
    return mesh;
}

function showSummary(result, tiles, source, params) {
    var tileYears = {};
    for (var i = 0; i < tiles.length; i++) {
        tileYears[tiles[i].id.split("_")[1]] = true;
    }
    var years = Object.keys(tileYears).join(", ");

    SDialog.Message(
        "EN: Download complete.\n\n" +
        "Source: " + source.label + "\n" +
        "Tiles: " + tiles.length + " (survey year " + years + ")\n" +
        "Points: " + result.totalPoints + "\n" +
        "Clouds in project: " + result.cloudCount +
        (result.mesh !== null ? " plus a 2.5D mesh" : "") + "\n" +
        "Group: '" + result.groupPath + "'\n\n" +
        "Run the comparison manually now, e.g. Analyze > Compare/Inspect\n" +
        "(reference = swisstopo data, measured = your own cloud).\n\n" +
        "DE: Download abgeschlossen.\n\n" +
        "Quelle: " + source.label + "\n" +
        "Kacheln: " + tiles.length + " (Jahrgang " + years + ")\n" +
        "Punkte: " + result.totalPoints + "\n" +
        "Wolken im Projekt: " + result.cloudCount +
        (result.mesh !== null ? " plus 2.5D-Mesh" : "") + "\n" +
        "Gruppe: '" + result.groupPath + "'\n\n" +
        "Height datum LN02, position LV95 / Höhenbezug LN02, Lage LV95.\n" +
        "Data source / Datenquelle: (c) swisstopo",
        SDialog.EMessageSeverity.Success,
        SCRIPT_TITLE
    );
}

// ==================== Entry Point ====================

main();
