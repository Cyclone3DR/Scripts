/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />
// @ts-check

/**
 * Script: Swisstopo Height Validation (interactive)
 * Purpose: Click points to compare local height against the official swisstopo
 *          height API. Keeps validating point after point until Esc, then
 *          prints a session summary with deviation statistics.
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

var SCRIPT_TITLE = "Swisstopo Height Validation / Höhenvalidierung";
var LOGO_PATH = CurrentScriptPath() + "/../Bimatic_white_just_Name.svg";
var LABEL_GROUP = "Swisstopo Validation";
var HEIGHT_DECIMALS = 3;
var FAIL_COLOR = [0.9, 0.1, 0.1]; // red marker for out-of-tolerance points
var MARKER_RADIUS = 0.25;         // marker sphere radius [m]

// LV95 plausibility bounds (Switzerland)
var LV95_MIN_E = 2450000, LV95_MAX_E = 2850000;
var LV95_MIN_N = 1050000, LV95_MAX_N = 1310000;

// ==================== Main Function ====================

function main() {
    try {
        var params = getUserParameters();
        configureLabelStyle();
        var session = runValidationLoop(params);
        showSessionSummary(session, params.tolerance);
    } catch (error) {
        handleError(error);
    }
}

// ==================== User Input ====================

function getUserParameters() {
    var dialog = SDialog.New(SCRIPT_TITLE);
    dialog.SetHeader(SCRIPT_TITLE, LOGO_PATH, 60);
    dialog.AddText(
        "EN: Click points to check their height against the swisstopo reference. Press ESC to stop.",
        SDialog.EMessageSeverity.Instruction
    );
    dialog.AddText(
        "DE: Punkte anklicken, um die Höhe gegen die Swisstopo-Referenz zu prüfen (ESC zum Beenden).",
        SDialog.EMessageSeverity.Instruction
    );

    dialog.BeginGroup("Settings / Einstellungen");
    dialog.AddLength({
        id: "tolerance",
        name: "Tolerance / Toleranz [m]",
        value: 0.5,
        min: 0.01,
        max: 10.0,
        saveValue: true,
        tooltip: "EN: Deviations above this value are marked FAILED | DE: Abweichungen über diesem Wert gelten als FEHLER"
    });
    dialog.AddBoolean({
        id: "autoLabel",
        name: "Create labels automatically / Beschriftung automatisch erstellen",
        value: true,
        saveValue: true
    });
    dialog.AddBoolean({
        id: "showPopups",
        name: "Show a popup per point / Ergebnis-Popup pro Punkt anzeigen",
        value: false,
        saveValue: true,
        tooltip: "EN: Off = results only as labels and in the log (faster workflow) | DE: Aus = Ergebnisse nur als Label und im Log (schnellerer Arbeitsfluss)"
    });

    // Run() is typed as {ErrorCode} only; the field ids are dynamic
    var result = /** @type {any} */ (dialog.Run());
    if (result.ErrorCode !== 0) {
        throw new Error("EN: Cancelled by user. | DE: Vom Benutzer abgebrochen.");
    }

    return {
        tolerance: result.tolerance,
        autoLabel: result.autoLabel,
        showPopups: result.showPopups
    };
}

// ==================== Label Styling ====================

/**
 * Configure the global SLabel appearance once. SLabel color setters are static
 * (global), so per-label coloring is impossible. The label uses a dark background
 * with light text for readability; status is conveyed by the comment verdict and
 * the OK / FAILED group.
 */
function configureLabelStyle() {
    SLabel.SetDecimalNumber(HEIGHT_DECIMALS);
    SLabel.SetSizeType(SLabel.LONG);
    SLabel.SetBackgroundType(SLabel.SPECIAL_COLOR);
    SLabel.SetBackgroundColor(0.13, 0.13, 0.13, 0.0);
    SLabel.SetLineColor(0.95, 0.95, 0.95);
}

/**
 * Create a self-explaining height label (columns Measure | Reference | Deviation).
 * The verdict text and the OK / FAILED group flag the tolerance status.
 */
function createDeviationLabel(point, measuredHeight, referenceHeight, tolerance) {
    var deviation = measuredHeight - referenceHeight;
    var exceeded = Math.abs(deviation) > tolerance;
    var statusGroup = LABEL_GROUP + "/" + (exceeded ? "FAILED" : "OK");

    var label = SLabel.New(1, 3);
    label.SetColType([SLabel.Measure, SLabel.Reference, SLabel.Deviation]);
    label.SetLineType([SLabel.Level]);

    label.SetCell(0, 0, parseFloat(measuredHeight.toFixed(HEIGHT_DECIMALS)));
    label.SetCell(0, 1, parseFloat(referenceHeight.toFixed(HEIGHT_DECIMALS)));
    label.SetCell(0, 2, parseFloat(deviation.toFixed(HEIGHT_DECIMALS)));

    label.SetComment(buildVerdict(deviation, tolerance));
    label.ShowComment(true);

    label.AttachToPoint(point);
    label.AddToDoc();
    label.MoveToGroup(statusGroup, true);

    if (exceeded) {
        createFailMarker(point, statusGroup);
    }
}

/**
 * Red sphere marking an out-of-tolerance point. SComp.SetColors is per-instance
 * and reliably rendered on geometry (unlike on labels), so this is the only way
 * to get a real red flag per point.
 */
function createFailMarker(point, group) {
    var sphere = SSphere.New(point, MARKER_RADIUS);
    sphere.SetColors(FAIL_COLOR[0], FAIL_COLOR[1], FAIL_COLOR[2]);
    sphere.SetName("FAILED");
    sphere.AddToDoc();
    sphere.MoveToGroup(group, false);
}

function buildVerdict(deviation, tolerance) {
    var signed = (deviation >= 0 ? "+" : "") + deviation.toFixed(HEIGHT_DECIMALS) + " m";
    if (Math.abs(deviation) > tolerance) {
        return "Deviation " + signed + " > tolerance " + tolerance.toFixed(2) + " m";
    }
    return "OK  Deviation " + signed;
}

// ==================== Swisstopo API ====================

var requestCounter = 0;

/**
 * Query the official swisstopo height for LV95 coordinates via curl (separate
 * process, avoids the GUI fetch() SSL certificate problem). Returns null on
 * any failure (network, HTTP error, invalid payload) with a log line.
 */
function getSwisstopoHeight(easting, northing) {
    var apiUrl = "https://api3.geo.admin.ch/rest/services/height" +
        "?easting=" + easting +
        "&northing=" + northing +
        "&sr=2056&format=json";

    requestCounter++;
    var responseFile = TempPath() + "swisstopo_click_" + requestCounter + ".json";

    var exitCode = Execute("curl", ["-sS", "-L", "-m", "30", "-o", responseFile, apiUrl]);
    if (exitCode !== 0) {
        print("swisstopo API unreachable (curl exit code " + exitCode + ").");
        return null;
    }

    var file = SFile.New(responseFile);
    if (!file.Exists() || !file.Open(SFile.ReadOnly)) {
        print("swisstopo response file could not be read.");
        return null;
    }
    var text = file.ReadAll();
    file.Close();
    file.Remove();

    if (!text) {
        print("Empty response from the swisstopo API.");
        return null;
    }
    try {
        var height = parseFloat(JSON.parse(text).height);
        if (isNaN(height)) {
            print("swisstopo response without a height value: " + text.slice(0, 80));
            return null;
        }
        return height;
    } catch (parseError) {
        print("Invalid swisstopo response: " + text.slice(0, 80));
        return null;
    }
}

// ==================== Validation ====================

function isInsideLv95Bounds(point) {
    var e = point.GetX();
    var n = point.GetY();
    return e >= LV95_MIN_E && e <= LV95_MAX_E && n >= LV95_MIN_N && n <= LV95_MAX_N;
}

function validatePoint(point, params, session) {
    var easting = point.GetX();
    var northing = point.GetY();
    var localHeight = point.GetZ();
    var index = session.total + 1;

    if (!isInsideLv95Bounds(point)) {
        print("Point #" + index + " lies outside the LV95 bounds (E=" +
            easting.toFixed(1) + ", N=" + northing.toFixed(1) + ") and is skipped.");
        SDialog.Message(
            "EN: This point lies outside Switzerland (LV95). The project must be\n" +
            "georeferenced in LV95 / EPSG:2056.\n\n" +
            "DE: Der Punkt liegt ausserhalb der Schweiz (LV95). Das Projekt muss\n" +
            "in LV95 / EPSG:2056 georeferenziert sein.",
            SDialog.EMessageSeverity.Warning, SCRIPT_TITLE
        );
        return;
    }

    var referenceHeight = getSwisstopoHeight(easting, northing);
    if (referenceHeight === null) {
        session.apiFailed++;
        session.total++;
        print("Point #" + index + ": swisstopo reference not available.");
        return;
    }

    var deviation = localHeight - referenceHeight;
    session.total++;
    session.recordDeviation(deviation, params.tolerance);

    if (params.autoLabel) {
        createDeviationLabel(point, localHeight, referenceHeight, params.tolerance);
    }

    print("Point #" + index +
        "  local=" + localHeight.toFixed(HEIGHT_DECIMALS) +
        "  swisstopo=" + referenceHeight.toFixed(HEIGHT_DECIMALS) +
        "  dZ=" + (deviation >= 0 ? "+" : "") + deviation.toFixed(HEIGHT_DECIMALS) + " m");

    if (params.showPopups) {
        showPointResult(index, localHeight, referenceHeight, deviation, params.tolerance);
    }
}

function showPointResult(index, localHeight, referenceHeight, deviation, tolerance) {
    var exceeded = Math.abs(deviation) > tolerance;
    var signed = (deviation >= 0 ? "+" : "") + deviation.toFixed(HEIGHT_DECIMALS) + " m";
    var message =
        "EN: Local height: " + localHeight.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "swisstopo reference: " + referenceHeight.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "Deviation: " + signed + "\n" +
        (exceeded
            ? "Exceeds the tolerance of " + tolerance.toFixed(2) + " m."
            : "Within the tolerance of " + tolerance.toFixed(2) + " m.") +
        "\n\nDE: Lokale Höhe: " + localHeight.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "Swisstopo-Referenz: " + referenceHeight.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "Abweichung: " + signed + "\n" +
        (exceeded
            ? "Toleranz " + tolerance.toFixed(2) + " m überschritten."
            : "Innerhalb der Toleranz von " + tolerance.toFixed(2) + " m.");

    SDialog.Message(
        message,
        exceeded ? SDialog.EMessageSeverity.Warning : SDialog.EMessageSeverity.Success,
        "Validation point / Validierung Punkt #" + index
    );
}

function createSession() {
    return {
        total: 0,
        ok: 0,
        exceeded: 0,
        apiFailed: 0,
        sumDeviation: 0,
        maxAbsDeviation: 0,
        recordDeviation: function (deviation, tolerance) {
            if (Math.abs(deviation) > tolerance) {
                this.exceeded++;
            } else {
                this.ok++;
            }
            this.sumDeviation += deviation;
            this.maxAbsDeviation = Math.max(this.maxAbsDeviation, Math.abs(deviation));
        }
    };
}

function runValidationLoop(params) {
    print("=== " + SCRIPT_TITLE + " started (ESC stops) ===");
    var session = createSession();

    while (true) {
        var click = SPoint.FromClick();
        if (click.ErrorCode === 2) {
            break; // ESC pressed
        }
        if (click.ErrorCode !== 0) {
            continue; // nothing hit, keep waiting
        }
        validatePoint(click.Point, params, session);
    }
    return session;
}

function showSessionSummary(session, tolerance) {
    var validCount = session.ok + session.exceeded;
    var meanText = validCount > 0
        ? (session.sumDeviation / validCount).toFixed(HEIGHT_DECIMALS) + " m"
        : "n/a";

    print("=== Validation finished: " + session.total + " point(s) ===");
    SDialog.Message(
        "EN: Validation complete.\n\n" +
        "Points checked: " + session.total + "\n" +
        "OK: " + session.ok + "\n" +
        "Over tolerance: " + session.exceeded + "\n" +
        "API failures: " + session.apiFailed + "\n\n" +
        "Mean deviation: " + meanText + "\n" +
        "Max |deviation|: " + session.maxAbsDeviation.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "Tolerance: " + tolerance.toFixed(2) + " m\n\n" +
        "DE: Validierung abgeschlossen.\n\n" +
        "Geprüfte Punkte: " + session.total + "\n" +
        "OK: " + session.ok + "\n" +
        "Über Toleranz: " + session.exceeded + "\n" +
        "API-Fehler: " + session.apiFailed + "\n\n" +
        "Mittlere Abweichung: " + meanText + "\n" +
        "Max. |Abweichung|: " + session.maxAbsDeviation.toFixed(HEIGHT_DECIMALS) + " m\n" +
        "Toleranz: " + tolerance.toFixed(2) + " m\n\n" +
        "Data source / Datenquelle: (c) swisstopo (LV95 / EPSG:2056)",
        session.exceeded > 0 ? SDialog.EMessageSeverity.Warning : SDialog.EMessageSeverity.Info,
        SCRIPT_TITLE
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
