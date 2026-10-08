/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />
// @ts-check

/**
 * Script: Swisstopo Systematic Validation
 * Purpose: Systematic grid validation of a point cloud against the official
 *          swisstopo height API. The cloud height is measured FIRST, so grid
 *          cells without cloud data cause no API traffic, and gross height
 *          errors are reported as FAILED instead of NO_DATA (the previous
 *          design centred its search cylinder on the API height before
 *          knowing the cloud's real height, which made large defects miss
 *          the cylinder entirely). All heights of a batch are fetched with a
 *          SINGLE curl process (--parallel, one reused TLS connection),
 *          which keeps large grids fast.
 * Note:    Web requests go through curl instead of the engine's fetch(). fetch()
 *          intermittently fails inside the GUI process with an SSL
 *          certificate-chain error ("Zertifikat des Ausstellers ... konnte
 *          nicht gefunden werden"); curl as a separate process does not hit it.
 * Author: Jan Sigrist (Bimatic GmbH)
 * Contact: jan.sigrist@bimatic.ch
 * Date: 2026-09-01
 * Tested with: Cyclone 3DR 2026.1.2
 * Requires: Cyclone 3DR 2025.1+, internet access, curl (built into Windows 10/11)
 * Licensing: free to use and adapt, no warranty. Compatible with any Cyclone 3DR edition.
 * Data source: api3.geo.admin.ch (LV95 / EPSG:2056), (c) swisstopo
 */

// ==================== Constants ====================

var SCRIPT_TITLE = "Swisstopo Systematic Validation / Rastervalidierung";
var LOGO_PATH = CurrentScriptPath() + "/../Bimatic_white_just_Name.svg";
var HEIGHT_DECIMALS = 3;
var MIN_LOCAL_POINTS = 5;
var API_BATCH_SIZE = 40;        // URLs per curl call (one process, one TLS connection)
var CURL_PARALLEL_MAX = 8;      // parallel transfers inside one curl call (fair use)
var CURL_TIMEOUT_S = 30;        // per-transfer timeout [s]
var LOGGED_FAILURE_LIMIT = 3;   // log details for the first N failed requests only

var CLASS_OK = "OK";
var CLASS_ERROR = "FAILED";
var CLASS_NO_DATA = "NO_DATA";
var CLASS_API_FAILED = "API_FAILED";

var FAIL_COLOR = [0.9, 0.1, 0.1];

// LV95 plausibility bounds (Switzerland)
var LV95_MIN_E = 2450000, LV95_MAX_E = 2850000;
var LV95_MIN_N = 1050000, LV95_MAX_N = 1310000;

// ==================== Main Function ====================

function main() {
    try {
        var params = getUserParameters();
        var clouds = getSelectedClouds();
        validateLv95Position(clouds);
        configureLabelStyle();

        var results = validateGrid(clouds, params);
        var summary = summarize(results);

        createLabels(results, params);
        if (params.generateReport) {
            exportCsvReport(results, params);
        }
        showSummary(summary, params);
    } catch (error) {
        handleError(error);
    }
}

// ==================== User Input ====================

function getUserParameters() {
    var dialog = SDialog.New(SCRIPT_TITLE);
    dialog.SetHeader(SCRIPT_TITLE, LOGO_PATH, 60);
    dialog.AddText(
        "EN: Systematic height check of the point cloud against swisstopo reference data.",
        SDialog.EMessageSeverity.Instruction
    );
    dialog.AddText(
        "DE: Systematische Höhenprüfung der Punktwolke gegen Swisstopo-Referenzdaten.",
        SDialog.EMessageSeverity.Instruction
    );

    dialog.AddLength({
        id: "gridSpacing", name: "Grid spacing / Rasterabstand [m]",
        value: 20.0, min: 2.0, max: 100.0, saveValue: true,
        tooltip: "EN: Distance between validation points | DE: Abstand zwischen den Validierungspunkten"
    });
    dialog.AddLength({
        id: "searchRadius", name: "Search radius / Suchradius [m]",
        value: 1.0, min: 0.05, max: 5.0, saveValue: true,
        tooltip: "EN: Radius of the point-cloud search per grid point | DE: Radius der Punktwolkensuche je Rasterpunkt"
    });
    dialog.AddLength({
        id: "tolerance", name: "Tolerance / Toleranz [m]",
        value: 1.0, min: 0.02, max: 10.0, saveValue: true,
        tooltip: "EN: Deviations above this value are classified FAILED | DE: Abweichungen darüber werden als FEHLER klassiert"
    });
    dialog.AddBoolean({
        id: "createAllLabels", name: "Create labels for every point / Labels für alle Punkte erstellen",
        value: true, saveValue: true,
        tooltip: "EN: Off = only points over tolerance get a label | DE: Aus = nur Punkte über der Toleranz erhalten ein Label"
    });
    dialog.AddBoolean({
        id: "generateReport", name: "Create a CSV report / CSV-Bericht erstellen",
        value: true, saveValue: true
    });

    // Run() is typed as {ErrorCode} only; the field ids are dynamic
    var result = /** @type {any} */ (dialog.Run());
    if (result.ErrorCode !== 0) {
        throw new Error("EN: Cancelled by user. | DE: Vom Benutzer abgebrochen.");
    }

    return {
        gridSpacing: result.gridSpacing,
        searchRadius: result.searchRadius,
        tolerance: result.tolerance,
        createAllLabels: result.createAllLabels,
        generateReport: result.generateReport
    };
}

function getSelectedClouds() {
    var clouds = SCloud.FromSel();
    if (clouds.length === 0) {
        throw new Error(
            "EN: Please select at least one point cloud. | " +
            "DE: Bitte mindestens eine Punktwolke auswählen."
        );
    }
    return clouds;
}

function validateLv95Position(clouds) {
    var bounds = computeBoundingBox(clouds);
    var insideLv95 =
        bounds.minX >= LV95_MIN_E && bounds.maxX <= LV95_MAX_E &&
        bounds.minY >= LV95_MIN_N && bounds.maxY <= LV95_MAX_N;

    if (!insideLv95) {
        throw new Error(
            "EN: The point cloud lies outside the LV95 bounds of Switzerland. The\n" +
            "project must be georeferenced in LV95 / EPSG:2056.\n\n" +
            "DE: Die Punktwolke liegt ausserhalb der LV95-Grenzen der Schweiz.\n" +
            "Das Projekt muss in LV95 / EPSG:2056 georeferenziert sein."
        );
    }
}

// ==================== Label Styling ====================

/**
 * Configure the global SLabel appearance once. SLabel color setters are static
 * (global), so per-label coloring is impossible. Status is conveyed by the
 * comment verdict, the OK / FAILED group and a red sphere marker.
 */
function configureLabelStyle() {
    SLabel.SetDecimalNumber(HEIGHT_DECIMALS);
    SLabel.SetSizeType(SLabel.LONG);
    SLabel.SetBackgroundType(SLabel.SPECIAL_COLOR);
    SLabel.SetBackgroundColor(0.13, 0.13, 0.13, 0.0);
    SLabel.SetLineColor(0.95, 0.95, 0.95);
}

function createLabels(results, params) {
    for (var i = 0; i < results.length; i++) {
        var result = results[i];
        var hasHeights = result.measuredHeight !== null && result.swisstopoHeight !== null;
        if (!hasHeights) {
            continue;
        }
        if (params.createAllLabels || result.classification === CLASS_ERROR) {
            createDeviationLabel(result, params.tolerance, result.classification, params.searchRadius);
        }
    }
}

/**
 * Create a self-explaining height label (columns Measure | Reference | Deviation).
 */
function createDeviationLabel(result, tolerance, classification, markerRadius) {
    var point = SPoint.New(result.easting, result.northing, result.measuredHeight);
    var statusGroup = "Swisstopo Validation/" + classification;

    var label = SLabel.New(1, 3);
    label.SetColType([SLabel.Measure, SLabel.Reference, SLabel.Deviation]);
    label.SetLineType([SLabel.Level]);

    label.SetCell(0, 0, parseFloat(result.measuredHeight.toFixed(HEIGHT_DECIMALS)));
    label.SetCell(0, 1, parseFloat(result.swisstopoHeight.toFixed(HEIGHT_DECIMALS)));
    label.SetCell(0, 2, parseFloat(result.heightDiff.toFixed(HEIGHT_DECIMALS)));

    label.SetComment(buildVerdict(result.heightDiff, tolerance, result.pointIndex));
    label.ShowComment(true);

    label.AttachToPoint(point);
    label.AddToDoc();
    label.MoveToGroup(statusGroup, true);

    if (classification === CLASS_ERROR) {
        createFailMarker(point, statusGroup, markerRadius);
    }
}

/**
 * Red sphere marking an out-of-tolerance grid point (per-label coloring is
 * impossible, SComp.SetColors on geometry is the reliable per-point flag).
 */
function createFailMarker(point, group, radius) {
    var sphere = SSphere.New(point, radius);
    sphere.SetColors(FAIL_COLOR[0], FAIL_COLOR[1], FAIL_COLOR[2]);
    sphere.SetName("FAILED");
    sphere.AddToDoc();
    sphere.MoveToGroup(group, false);
}

function buildVerdict(deviation, tolerance, pointIndex) {
    var signed = (deviation >= 0 ? "+" : "") + deviation.toFixed(HEIGHT_DECIMALS) + " m";
    if (Math.abs(deviation) > tolerance) {
        return "P" + pointIndex + "  " + signed + " > tolerance " + tolerance.toFixed(2) + " m";
    }
    return "P" + pointIndex + "  OK  " + signed;
}

// ==================== Swisstopo API ====================

/**
 * Diagnostics for failed API requests, shown in the summary so a broken run
 * explains itself (transfer error vs. bad response) instead of silently
 * producing API_FAILED rows.
 */
var apiDiagnostics = { httpErrors: 0, exceptions: 0, logged: 0, lastDetail: "" };

function recordApiFailure(detail, isException) {
    if (isException) {
        apiDiagnostics.exceptions++;
    } else {
        apiDiagnostics.httpErrors++;
    }
    apiDiagnostics.lastDetail = detail;
    if (apiDiagnostics.logged < LOGGED_FAILURE_LIMIT) {
        apiDiagnostics.logged++;
        print("swisstopo request failed: " + detail);
    }
}

function buildHeightUrl(easting, northing) {
    return "https://api3.geo.admin.ch/rest/services/height" +
        "?easting=" + easting +
        "&northing=" + northing +
        "&sr=2056&format=json";
}

var curlBatchCounter = 0;

/**
 * Fetch the heights of one batch with a SINGLE curl process: one reused TLS
 * connection, parallel transfers, no per-request process spawn. curl runs
 * outside the engine, so the GUI fetch() SSL problem cannot occur. Individual
 * failures leave their response file missing/invalid and become null (picked
 * up later by the retry pass).
 */
function fetchHeightBatchViaCurl(batch) {
    curlBatchCounter++;
    var args = ["-sS", "-L", "--parallel", "--parallel-max", "" + CURL_PARALLEL_MAX,
        "-m", "" + CURL_TIMEOUT_S];
    var responseFiles = [];

    for (var i = 0; i < batch.length; i++) {
        var responseFile = TempPath() + "swisstopo_h_" + curlBatchCounter + "_" + i + ".json";
        responseFiles.push(responseFile);
        args.push("-o", responseFile, buildHeightUrl(batch[i].easting, batch[i].northing));
    }

    var exitCode = Execute("curl", args);
    if (exitCode !== 0) {
        recordApiFailure("curl exit code " + exitCode, true);
    }
    for (var i = 0; i < batch.length; i++) {
        batch[i].swisstopoHeight = parseHeightResponse(responseFiles[i]);
    }
}

function parseHeightResponse(responseFilePath) {
    var file = SFile.New(responseFilePath);
    if (!file.Exists()) {
        recordApiFailure("no response file (transfer failed)", false);
        return null;
    }
    if (!file.Open(SFile.ReadOnly)) {
        recordApiFailure("response file could not be read", false);
        return null;
    }
    var text = file.ReadAll();
    file.Close();
    file.Remove();

    if (!text) {
        recordApiFailure("empty response from the server", false);
        return null;
    }
    try {
        var height = parseFloat(JSON.parse(text).height);
        if (isNaN(height)) {
            recordApiFailure("response without a height value: " + text.slice(0, 80), false);
            return null;
        }
        return height;
    } catch (parseError) {
        recordApiFailure("invalid response: " + text.slice(0, 80), false);
        return null;
    }
}

/**
 * Resolve the swisstopo reference height for all grid points: curl batches
 * first, then one single-request retry pass for every point that is still
 * missing, so transient failures do not end up as API_FAILED.
 */
function fetchReferenceHeights(results) {
    var pending = results.filter(function (r) { return r.classification !== CLASS_NO_DATA; });
    if (pending.length === 0) {
        return;
    }

    var batchCount = Math.ceil(pending.length / API_BATCH_SIZE);
    for (var b = 0; b < batchCount; b++) {
        var batch = pending.slice(b * API_BATCH_SIZE, (b + 1) * API_BATCH_SIZE);
        fetchHeightBatchViaCurl(batch);
        print("swisstopo lookup: batch " + (b + 1) + "/" + batchCount +
            " (" + Math.min((b + 1) * API_BATCH_SIZE, pending.length) + "/" + pending.length + " points)");
    }

    var missing = pending.filter(function (r) { return r.swisstopoHeight === null; });
    if (missing.length > 0) {
        print("Fetching " + missing.length + " missing reference heights one by one ...");
        for (var i = 0; i < missing.length; i++) {
            fetchHeightBatchViaCurl([missing[i]]);
            if ((i + 1) % 25 === 0 || i === missing.length - 1) {
                print("Single request: " + (i + 1) + "/" + missing.length);
            }
        }
    }
}

// ==================== Cloud Height Extraction ====================

/**
 * Estimate the ground height in the cloud(s) around a grid point, weighted by
 * point count across all clouds. The search cylinder spans the full vertical
 * extent of the data, so even grossly wrong heights are found and classified
 * as FAILED instead of silently producing NO_DATA.
 */
function getCloudHeightAtPoint(clouds, centerX, centerY, zRange, radius) {
    var axis = SVector.New(0, 0, 1);
    var cylinderHeight = zRange.maxZ - zRange.minZ + 2.0;
    var cylinderCenter = SPoint.New(centerX, centerY, zRange.minZ - 1.0);
    var cylinder = SCylinder.New(cylinderCenter, axis, radius, cylinderHeight);

    var weightedSum = 0;
    var totalWeight = 0;

    for (var i = 0; i < clouds.length; i++) {
        var local = separateLocalCloud(clouds[i], cylinder);
        if (local === null) {
            continue;
        }
        var groundHeight = estimateGroundHeight(local, centerX, centerY, radius, axis);
        var weight = local.GetNumber();
        weightedSum += groundHeight * weight;
        totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function separateLocalCloud(cloud, cylinder) {
    var separated = cloud.SeparateFeature(cylinder, 0, SCloud.FILL_IN_ONLY);
    if (separated.ErrorCode !== 0 || !separated.InCloud) {
        return null;
    }
    if (separated.InCloud.GetNumber() <= MIN_LOCAL_POINTS) {
        return null;
    }
    return separated.InCloud;
}

/**
 * Approximate ground height as the center of the lowest cloud slice. For nearly
 * flat patches the bounding-box mid height is sufficient.
 */
function estimateGroundHeight(localCloud, centerX, centerY, radius, axis) {
    var bbox = localCloud.GetBoundingBox();
    var minZ = bbox.LowPoint.GetZ();
    var maxZ = bbox.UpPoint.GetZ();
    var range = maxZ - minZ;

    if (range <= 0.5) {
        return (minZ + maxZ) / 2;
    }

    var sliceHeight = Math.max(0.1, range * 0.15);
    var sliceCenter = SPoint.New(centerX, centerY, minZ + sliceHeight / 2);
    var sliceCylinder = SCylinder.New(sliceCenter, axis, radius, sliceHeight);
    var slice = localCloud.SeparateFeature(sliceCylinder, 0, SCloud.FILL_IN_ONLY);

    if (slice.ErrorCode === 0 && slice.InCloud && slice.InCloud.GetNumber() > 3) {
        var sliceBox = slice.InCloud.GetBoundingBox();
        return (sliceBox.LowPoint.GetZ() + sliceBox.UpPoint.GetZ()) / 2;
    }
    return minZ + range * 0.25; // fallback: lower quartile
}

// ==================== Grid Validation ====================

function computeBoundingBox(clouds) {
    var minX = Number.MAX_VALUE, maxX = -Number.MAX_VALUE;
    var minY = Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
    var minZ = Number.MAX_VALUE, maxZ = -Number.MAX_VALUE;

    for (var i = 0; i < clouds.length; i++) {
        var bbox = clouds[i].GetBoundingBox();
        minX = Math.min(minX, bbox.LowPoint.GetX());
        maxX = Math.max(maxX, bbox.UpPoint.GetX());
        minY = Math.min(minY, bbox.LowPoint.GetY());
        maxY = Math.max(maxY, bbox.UpPoint.GetY());
        minZ = Math.min(minZ, bbox.LowPoint.GetZ());
        maxZ = Math.max(maxZ, bbox.UpPoint.GetZ());
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ };
}

/**
 * Phase 1: measure the local cloud height on every grid point (no network).
 * Phase 2: fetch the swisstopo reference in batches, then classify.
 */
function validateGrid(clouds, params) {
    var bounds = computeBoundingBox(clouds);
    var results = measureGridHeights(clouds, bounds, params);

    var withData = results.filter(function (r) { return r.classification !== CLASS_NO_DATA; });
    print("Grid: " + results.length + " points, " + withData.length + " with point-cloud data.");

    fetchReferenceHeights(results);
    classifyResults(results, params.tolerance);
    return results;
}

function measureGridHeights(clouds, bounds, params) {
    var results = [];
    var index = 0;

    for (var x = bounds.minX; x <= bounds.maxX; x += params.gridSpacing) {
        for (var y = bounds.minY; y <= bounds.maxY; y += params.gridSpacing) {
            index++;
            var measured = getCloudHeightAtPoint(clouds, x, y, bounds, params.searchRadius);
            results.push({
                pointIndex: index, easting: x, northing: y,
                measuredHeight: measured, swisstopoHeight: null, heightDiff: null,
                classification: measured === null ? CLASS_NO_DATA : CLASS_API_FAILED
            });
        }
    }
    return results;
}

function classifyResults(results, tolerance) {
    for (var i = 0; i < results.length; i++) {
        var result = results[i];
        if (result.classification === CLASS_NO_DATA || result.swisstopoHeight === null) {
            continue;
        }
        result.heightDiff = result.measuredHeight - result.swisstopoHeight;
        result.classification =
            Math.abs(result.heightDiff) <= tolerance ? CLASS_OK : CLASS_ERROR;
    }
}

// ==================== Summary & Report ====================

function summarize(results) {
    var summary = { total: results.length, ok: 0, error: 0, noData: 0, apiFailed: 0 };
    for (var i = 0; i < results.length; i++) {
        switch (results[i].classification) {
            case CLASS_OK: summary.ok++; break;
            case CLASS_ERROR: summary.error++; break;
            case CLASS_NO_DATA: summary.noData++; break;
            default: summary.apiFailed++; break;
        }
    }
    return summary;
}

function buildCsv(results, params) {
    var lines = [[
        "Point_ID", "Easting", "Northing", "Measured_Height_m",
        "Swisstopo_Height_m", "Difference_m", "Classification",
        "Grid_Spacing_m", "Search_Radius_m", "Tolerance_m"
    ].join(",")];

    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        lines.push([
            r.pointIndex,
            r.easting.toFixed(2),
            r.northing.toFixed(2),
            r.measuredHeight !== null ? r.measuredHeight.toFixed(HEIGHT_DECIMALS) : "N/A",
            r.swisstopoHeight !== null ? r.swisstopoHeight.toFixed(HEIGHT_DECIMALS) : "N/A",
            r.heightDiff !== null ? r.heightDiff.toFixed(HEIGHT_DECIMALS) : "N/A",
            r.classification,
            params.gridSpacing,
            params.searchRadius,
            params.tolerance
        ].join(","));
    }
    return lines.join("\n");
}

function exportCsvReport(results, params) {
    var csvText = buildCsv(results, params);
    var csvPath = GetSaveFileName("Save CSV report / CSV-Bericht speichern", "CSV files (*.csv)");

    if (!csvPath || csvPath === "" || csvPath === "null") {
        print("CSV export cancelled.");
        return;
    }
    if (!csvPath.toLowerCase().endsWith(".csv")) {
        csvPath += ".csv";
    }

    var file = SFile.New(csvPath);
    if (file.Open(SFile.WriteOnly)) {
        file.Write(csvText);
        file.Close();
        print("CSV saved: " + csvPath);
    } else {
        print("CSV could not be written: " + csvPath);
    }
}

function buildApiDiagnosisText(summary) {
    if (summary.apiFailed === 0) {
        return "";
    }
    var text = "\nAPI diagnosis / API-Diagnose: " + apiDiagnostics.httpErrors + " response errors / Antwortfehler, " +
        apiDiagnostics.exceptions + " transfer errors / Übertragungsfehler (curl)";
    if (apiDiagnostics.lastDetail !== "") {
        text += "\nLast error / Letzter Fehler: " + apiDiagnostics.lastDetail;
    }
    return text + "\n";
}

function showSummary(summary, params) {
    var severity = SDialog.EMessageSeverity.Success;
    if (summary.error > 0) {
        severity = SDialog.EMessageSeverity.Warning;
    } else if (summary.apiFailed > 0) {
        severity = SDialog.EMessageSeverity.Info;
    }

    SDialog.Message(
        "EN: Validation complete.\n\n" +
        "Grid points total: " + summary.total + "\n" +
        "OK: " + summary.ok + "\n" +
        "Over tolerance: " + summary.error + "\n" +
        "Without cloud data: " + summary.noData + "\n" +
        "API failures: " + summary.apiFailed + "\n" +
        buildApiDiagnosisText(summary) + "\n" +
        "Tolerance: " + params.tolerance.toFixed(2) + " m\n\n" +
        "DE: Validierung abgeschlossen.\n\n" +
        "Rasterpunkte gesamt: " + summary.total + "\n" +
        "OK: " + summary.ok + "\n" +
        "Über Toleranz: " + summary.error + "\n" +
        "Ohne Wolkendaten: " + summary.noData + "\n" +
        "API-Fehler: " + summary.apiFailed + "\n\n" +
        "Toleranz: " + params.tolerance.toFixed(2) + " m\n\n" +
        "Data source / Datenquelle: (c) swisstopo (LV95 / EPSG:2056)",
        severity, SCRIPT_TITLE
    );
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
    var text = formatError(error);
    print("ERROR: " + text);
    if (error && typeof error.stack === "string") {
        print("Stack:\n" + error.stack);
    }
    SDialog.Message(text, SDialog.EMessageSeverity.Error, SCRIPT_TITLE);
}

// ==================== Entry Point ====================

main();
