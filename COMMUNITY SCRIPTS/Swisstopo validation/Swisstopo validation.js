/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts"/>

// -----------------------------------------------------------------------------
//  SwisstopoHeightValidation.js – v1.0 (2025-08-25)
// -----------------------------------------------------------------------------
//  ENGLISH: Height validation tool - for Cyclone 3DR 2025.1.4
//  DEUTSCH: Höhenvalidierungstool - für Cyclone 3DR 2025.1.4
//  Author: Jan Sigrist (Bimatic GmbH) - www.bimatic.ch
// -----------------------------------------------------------------------------

// -------------------- CONFIGURATION DIALOG / KONFIGURATIONSDIALOG -----------
var dlg = SDialog.New("Swisstopo Height Validation / Höhenvalidierung");
dlg.AddText("EN: Click on points to validate height against swisstopo reference data", SDialog.EMessageSeverity.Instruction);
dlg.AddText("DE: Auf Punkte klicken um Höhe gegen swisstopo-Referenzdaten zu validieren", SDialog.EMessageSeverity.Instruction);

dlg.BeginGroup("Settings / Einstellungen");
dlg.AddLength({
    id: "tolerance",
    name: "Warning threshold / Warngrenze [m]",
    value: 0.5,
    min: 0.01,
    max: 10.0,
    saveValue: true,
    tooltip: "EN: Show warning if difference exceeds this value | DE: Warnung anzeigen wenn Differenz diesen Wert überschreitet"
});

dlg.AddBoolean({
    id: "autoLabel",
    name: "Auto-create labels / Automatische Beschriftungen",
    value: true,
    saveValue: true,
    tooltip: "EN: Automatically create labels for each validation point | DE: Automatisch Beschriftungen für jeden Validierungspunkt erstellen"
});

dlg.AddBoolean({
    id: "showCoords",
    name: "Show coordinates / Koordinaten anzeigen",
    value: false,
    saveValue: true,
    tooltip: "EN: Include LV95 coordinates in labels | DE: LV95-Koordinaten in Beschriftungen einbeziehen"
});

var config = dlg.Run();
if (config.ErrorCode !== 0) {
    throw new Error("Operation cancelled by user / Vorgang vom Benutzer abgebrochen");
}

var WARNING_THRESHOLD = config.tolerance;
var AUTO_LABEL = config.autoLabel;
var SHOW_COORDINATES = config.showCoords;

// -------------------- HELPER FUNCTIONS / HILFSFUNKTIONEN --------------------

/**
 * Retrieves height from swisstopo API using LV95 coordinates
 */
function getSwisstopoHeight(easting, northing) {
    var apiUrl = "https://api3.geo.admin.ch/rest/services/height" +
        "?easting=" + easting +
        "&northing=" + northing +
        "&sr=2056" +
        "&format=json";

    var tempFileName = TempPath() + "swisstopo_validation_" +
        Math.round(easting) + "_" + Math.round(northing) + ".json";

    var curlResult = Execute("curl", ["-s", "-o", tempFileName, apiUrl]);
    if (curlResult !== 0) {
        return null;
    }

    var responseFile = SFile.New(tempFileName);
    var responseText = null;

    if (responseFile.Open(SFile.ReadOnly)) {
        responseText = responseFile.ReadAll();
        responseFile.Close();
        responseFile.Remove();
    }

    if (!responseText) {
        return null;
    }

    try {
        var apiResponse = JSON.parse(responseText);
        if (apiResponse.height !== undefined) {
            var height = parseFloat(apiResponse.height);
            return isNaN(height) ? null : height;
        }
    } catch (parseError) {
        return null;
    }

    return null;
}

/**
 * Creates a validation label with NUMBERS ONLY (Cyclone 3DR 2025.1.4 requirement)
 */
function createValidationLabel(point, localHeight, swisstopoHeight, pointIndex) {
    try {
        var heightDiff = localHeight - swisstopoHeight;
        var absDiff = Math.abs(heightDiff);
        var isWarning = absDiff > WARNING_THRESHOLD;

        // Determine label size based on options
        var numRows = SHOW_COORDINATES ? 5 : 3;
        var label = SLabel.New(numRows, 2);

        // Set column and line types
        label.SetColType([SLabel.Measure, SLabel.Reference]);

        // Build line types array
        var lineTypes = [SLabel.Distance, SLabel.Distance, SLabel.Deviation];
        if (SHOW_COORDINATES) {
            lineTypes.push(SLabel.EmptyLine);
            lineTypes.push(SLabel.EmptyLine);
        }
        label.SetLineType(lineTypes);

        // Fill label data - ONLY NUMBERS!
        var rowIndex = 0;

        // Row 0: Local height
        label.SetCell(rowIndex, 0, parseFloat(localHeight.toFixed(3)));
        label.SetCell(rowIndex, 1, 1); // Code for "Local" (1 = Local, 2 = Swisstopo, 3 = Diff)
        rowIndex++;

        // Row 1: Swisstopo height
        label.SetCell(rowIndex, 0, parseFloat(swisstopoHeight.toFixed(3)));
        label.SetCell(rowIndex, 1, 2); // Code for "Swisstopo"
        rowIndex++;

        // Row 2: Height difference
        label.SetCell(rowIndex, 0, parseFloat(heightDiff.toFixed(3)));
        label.SetCell(rowIndex, 1, 3); // Code for "Difference"
        rowIndex++;

        // Optional coordinate rows
        if (SHOW_COORDINATES) {
            // Row 3: Easting
            label.SetCell(rowIndex, 0, parseFloat(point.GetX().toFixed(2)));
            label.SetCell(rowIndex, 1, 4); // Code for "Easting"
            rowIndex++;

            // Row 4: Northing
            label.SetCell(rowIndex, 0, parseFloat(point.GetY().toFixed(2)));
            label.SetCell(rowIndex, 1, 5); // Code for "Northing"
        }

        // Set label properties with simple pass/fail comment
        var labelComment;
        if (isWarning) {
            labelComment = "VALIDATION_FAILED";
        } else {
            labelComment = "VALIDATION_PASSED";
        }

        label.SetComment(labelComment);
        label.AttachToPoint(point);
        label.AddToDoc();

        // Move to group
        var groupName = "Height_Validation_Labels";
        label.MoveToGroup(groupName, true);

        return label;

    } catch (labelError) {
        print("Label creation error: " + labelError.message);
        return null;
    }
}

/**
 * Validates a single point and provides user feedback
 */
function validatePoint(clickedPoint, pointIndex) {
    var x = clickedPoint.GetX();
    var y = clickedPoint.GetY();
    var localHeight = clickedPoint.GetZ();

    print("=== Validation Point #" + pointIndex + " ===");
    print("Coordinates: E=" + x.toFixed(3) + ", N=" + y.toFixed(3) + ", H=" + localHeight.toFixed(3));

    // Get swisstopo reference height
    print("Retrieving swisstopo data...");
    var swisstopoHeight = getSwisstopoHeight(x, y);

    if (swisstopoHeight === null) {
        var errorMsg = "Failed to retrieve swisstopo height data!\n\nPossible causes:\n• Network connection issue\n• Point outside Switzerland\n• API temporarily unavailable";
        SDialog.Message(errorMsg, SDialog.EMessageSeverity.Error, "API Error");
        print("ERROR: API request failed");
        return false;
    }

    // Calculate difference
    var heightDiff = localHeight - swisstopoHeight;
    var absDiff = Math.abs(heightDiff);

    print("Swisstopo height: " + swisstopoHeight.toFixed(3) + "m");
    print("Difference: " + (heightDiff >= 0 ? "+" : "") + heightDiff.toFixed(3) + "m");

    // Create label if enabled
    if (AUTO_LABEL) {
        var label = createValidationLabel(clickedPoint, localHeight, swisstopoHeight, pointIndex);
        if (label) {
            print("✓ Label created: " + label.GetComment());
        } else {
            print("⚠ Label creation failed, but validation data is valid");
        }
    }

    // Show result dialog
    var resultMessage =
        "Validation Result #" + pointIndex + "\n" +
        "Validierungsergebnis #" + pointIndex + "\n\n" +
        "Local height / Lokale Höhe: " + localHeight.toFixed(3) + "m\n" +
        "Swisstopo ref / Referenz: " + swisstopoHeight.toFixed(3) + "m\n" +
        "Difference / Differenz: " + (heightDiff >= 0 ? "+" : "") + heightDiff.toFixed(3) + "m\n";

    if (SHOW_COORDINATES) {
        resultMessage += "Coordinates / Koordinaten: E=" + x.toFixed(2) + ", N=" + y.toFixed(2) + "\n";
    }

    resultMessage += "\n";

    var severity = SDialog.EMessageSeverity.Info;
    var title = "Validation Result";

    if (absDiff > WARNING_THRESHOLD) {
        resultMessage += "⚠️ WARNING: Difference exceeds " + WARNING_THRESHOLD + "m threshold\n";
        resultMessage += "⚠️ WARNUNG: Differenz überschreitet " + WARNING_THRESHOLD + "m Grenzwert\n";
        resultMessage += "Please verify data accuracy / Bitte Datengenauigkeit prüfen";
        severity = SDialog.EMessageSeverity.Warning;
        title = "Height Difference Warning";
    } else {
        resultMessage += "✓ OK: Difference within acceptable range\n";
        resultMessage += "✓ OK: Differenz im akzeptablen Bereich\n";
        resultMessage += "Data appears plausible / Daten erscheinen plausibel";
    }

    SDialog.Message(resultMessage, severity, title);
    return true;
}

// -------------------- MAIN VALIDATION LOOP / HAUPT-VALIDIERUNGSSCHLEIFE -----

print("=== Swisstopo Height Validation Tool Started ===");
print("Version: Fixed for Cyclone 3DR 2025.1.4.47974");
print("Click on points to validate (ESC to exit)");
print("Labels use numeric codes: 1=Local, 2=Swisstopo, 3=Difference, 4=Easting, 5=Northing");

var validationCount = 0;
var continueValidation = true;

while (continueValidation) {
    print("\nWaiting for point selection... (ESC to exit)");

    try {
        var clickResult = SPoint.FromClick();

        switch (clickResult.ErrorCode) {
            case 0: // Point selected
                validationCount++;
                var success = validatePoint(clickResult.Point, validationCount);

                if (success) {
                    // Ask to continue
                    var continueDialog = SDialog.New("Continue Validation?");
                    continueDialog.AddText("Point #" + validationCount + " validated successfully", SDialog.EMessageSeverity.Success);
                    continueDialog.AddText("Punkt #" + validationCount + " erfolgreich validiert", SDialog.EMessageSeverity.Success);
                    continueDialog.SetButtons(["Validate Another / Weiteren validieren", "Finish / Beenden"]);

                    var continueResult = continueDialog.Run();
                    if (continueResult.ErrorCode !== 0) {
                        continueValidation = false;
                    }
                } else {
                    // Error occurred
                    var retryDialog = SDialog.New("Validation Error");
                    retryDialog.AddText("Error during validation", SDialog.EMessageSeverity.Error);
                    retryDialog.AddText("Fehler bei der Validierung aufgetreten", SDialog.EMessageSeverity.Error);
                    retryDialog.SetButtons(["Retry / Wiederholen", "Exit / Beenden"]);

                    var retryResult = retryDialog.Run();
                    if (retryResult.ErrorCode !== 0) {
                        continueValidation = false;
                    }
                    validationCount--;
                }
                break;

            case 1: // Nothing selected
                break;

            case 2: // ESC pressed
                continueValidation = false;
                print("Validation cancelled by user");
                break;

            default:
                print("Selection error: " + clickResult.ErrorCode);
                continueValidation = false;
                break;
        }

    } catch (error) {
        print("Error: " + error.message);
        continueValidation = false;
    }
}

// -------------------- FINAL REPORT / ABSCHLUSSBERICHT ------------------------

print("\n=== Validation Complete ===");
print("Total validations: " + validationCount);

if (validationCount > 0) {
    var finalLabels = SLabel.All();
    var summaryMessage =
        "Validation Session Complete\n" +
        "Validierungssitzung abgeschlossen\n\n" +
        "Points validated / Punkte validiert: " + validationCount + "\n" +
        "Labels created / Labels erstellt: " + finalLabels.length + "\n" +
        "Warning threshold / Warngrenze: " + WARNING_THRESHOLD + "m\n\n" +
        "Label Codes / Label-Codes:\n" +
        "1 = Local height / Lokale Höhe\n" +
        "2 = Swisstopo reference / Referenz\n" +
        "3 = Difference / Differenz\n" +
        (SHOW_COORDINATES ? "4 = Easting / Ostwert\n5 = Northing / Nordwert\n" : "") +
        "\nData source: © swisstopo\n" +
        "Coordinate system: LV95 (EPSG:2056)";

    SDialog.Message(summaryMessage, SDialog.EMessageSeverity.Info, "Session Complete");
} else {
    SDialog.Message(
        "No validations performed\nKeine Validierungen durchgeführt",
        SDialog.EMessageSeverity.Warning,
        "Session Empty"
    );
}

print("\n© swisstopo - Height data from api3.geo.admin.ch");
print("=== Session End ===");