/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts"/>

// -----------------------------------------------------------------------------
//  SwisstopoSystematicValidation.js – v1.0 (2025-08-25)
// -----------------------------------------------------------------------------
//  ENGLISH: Systematic point cloud validation against Swisstopo reference data
//  DEUTSCH: Systematische Punktwolken-Validierung gegen Swisstopo-Referenzdaten
//  Author: Jan Sigrist (Bimatic GmbH) - www.bimatic.ch

//  FEATURES:
//  - Systematic grid-based validation across entire point cloud bounding box
//  - Official Swisstopo height API integration (api3.geo.admin.ch)
//  - Intelligent cylinder-based point extraction with ground detection
//  - Professional labels with tolerance visualization and organized grouping
//  - Comprehensive CSV reporting with statistical analysis
//  - Robust error handling with multiple fallback strategies
//
//  WORKFLOW:
//  1. Generate systematic validation grid over point cloud bounding box
//  2. Query Swisstopo API for official reference heights (EPSG:2056)
//  3. Extract representative ground heights from pointcloud
//  4. Compare measured vs. reference heights with configurable tolerance
//  5. Create labels with deviation analysis
//  6. Export detailed CSV report for further analysis
// -----------------------------------------------------------------------------

// -------------------- CONFIGURATION DIALOG -----------
var dlg = SDialog.New("Point Cloud Validation");
dlg.AddText("Systematic validation of point cloud heights against Swisstopo reference data", SDialog.EMessageSeverity.Instruction);

dlg.AddLength({
    id: "gridSpacing",
    name: "Grid spacing [m]",
    value: 20.0,
    min: 2.0,
    max: 100.0,
    saveValue: true,
    tooltip: "Distance between validation points in the grid"
});

dlg.AddLength({
    id: "searchRadius",
    name: "Search radius [m]",
    value: 1.0,
    min: 0.05,
    max: 5.0,
    saveValue: true,
    tooltip: "Radius for pointcloud search at each grid point"
});

dlg.AddLength({
    id: "tolerance",
    name: "Error threshold [m]",
    value: 1.0,
    min: 0.02,
    max: 10.0,
    saveValue: true,
    tooltip: "Maximum allowed deviation for classification as OK"
});


dlg.AddBoolean({
    id: "createAllLabels",
    name: "Create labels for all points",
    value: true,
    saveValue: true,
    tooltip: "Create labels for all validation points, not just errors"
});

dlg.AddBoolean({
    id: "generateReport",
    name: "Generate detailed report",
    value: true,
    saveValue: true,
    tooltip: "Generate and save detailed validation report"
});

var config = dlg.Run();
if (config.ErrorCode !== 0) {
    throw new Error("Operation cancelled by user");
}

var GRID_SPACING = config.gridSpacing;
var SEARCH_RADIUS = config.searchRadius;
var ERROR_THRESHOLD = config.tolerance;
var WARNING_THRESHOLD = ERROR_THRESHOLD * 0.5; // Warning at 50% of error threshold
var CREATE_ALL_LABELS = config.createAllLabels;
var GENERATE_REPORT = config.generateReport;

// -------------------- POINT CLOUD SELECTION -----------
var selectedClouds = SCloud.FromSel();
if (selectedClouds.length === 0) {
    SDialog.Message("Please select at least one point cloud", SDialog.EMessageSeverity.Error, "Selection Error");
    throw new Error("No point cloud selected");
}

print("=== Swisstopo Point Cloud Validation Started ===");
print("Grid spacing: " + GRID_SPACING + "m, Search radius: " + SEARCH_RADIUS + "m, Error threshold: " + ERROR_THRESHOLD + "m");
print("Selected " + selectedClouds.length + " point cloud(s)");

// -------------------- HELPER FUNCTIONS --------------------

function getSwisstopoHeight(easting, northing) {
    var apiUrl = "https://api3.geo.admin.ch/rest/services/height" +
        "?easting=" + easting +
        "&northing=" + northing +
        "&sr=2056" +
        "&format=json";

    var tempFileName = TempPath() + "swisstopo_simple_" +
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

function getCloudHeightAtPoint(clouds, centerX, centerY, centerZ, radius) {
    var searchHeight = 5.0; // Fixed 5m search height
    // Center the cylinder vertically around the reference height
    var cylinderCenterZ = centerZ - searchHeight / 2.0;
    var cylinderCenter = SPoint.New(centerX, centerY, cylinderCenterZ);
    var cylinderAxis = SVector.New(0, 0, 1);
    var cylinder = SCylinder.New(cylinderCenter, cylinderAxis, radius, searchHeight);

    var allHeights = [];

    for (var cloudIdx = 0; cloudIdx < clouds.length; cloudIdx++) {
        try {
            var cloud = clouds[cloudIdx];
            var separateResult = cloud.SeparateFeature(cylinder, 0, SCloud.FILL_IN_ONLY);

            if (separateResult.ErrorCode === 0 && separateResult.InCloud && separateResult.InCloud.GetNumber() > 5) {
                var localCloud = separateResult.InCloud;
                var bbox = localCloud.GetBoundingBox();
                var minZ = bbox.LowPoint.GetZ();
                var maxZ = bbox.UpPoint.GetZ();
                var heightRange = maxZ - minZ;

                // Try to get median of lower 25% using iterative cylinder approach
                var groundHeight;
                if (heightRange > 0.5) { // Only do complex calculation for significant height variation
                    try {
                        // Create a thin cylinder in the lower 25% of the height range
                        var lowerQuartileHeight = minZ + heightRange * 0.25;
                        var thinCylinderHeight = Math.max(0.1, heightRange * 0.15); // 15% of range or minimum 10cm

                        var groundCylinderCenter = SPoint.New(centerX, centerY, minZ + thinCylinderHeight / 2);
                        var groundCylinder = SCylinder.New(groundCylinderCenter, cylinderAxis, radius, thinCylinderHeight);

                        var groundResult = localCloud.SeparateFeature(groundCylinder, 0, SCloud.FILL_IN_ONLY);

                        if (groundResult.ErrorCode === 0 && groundResult.InCloud && groundResult.InCloud.GetNumber() > 3) {
                            // Use the center of the ground points bounding box as median approximation
                            var groundBbox = groundResult.InCloud.GetBoundingBox();
                            var groundMinZ = groundBbox.LowPoint.GetZ();
                            var groundMaxZ = groundBbox.UpPoint.GetZ();
                            groundHeight = (groundMinZ + groundMaxZ) / 2; // Median approximation
                        } else {
                            // Fallback to lower quartile calculation
                            groundHeight = minZ + heightRange * 0.25;
                        }
                    } catch (groundError) {
                        // Fallback to simple calculation
                        groundHeight = minZ + heightRange * 0.25;
                    }
                } else {
                    // For small height variations, use simple average
                    groundHeight = (minZ + maxZ) / 2;
                }

                allHeights.push({
                    height: groundHeight,
                    pointCount: localCloud.GetNumber()
                });
            }
        } catch (error) {
            // Skip this cloud on error
        }
    }

    if (allHeights.length === 0) {
        return null;
    }

    // Weighted average by point count
    var totalWeight = 0;
    var weightedSum = 0;
    for (var i = 0; i < allHeights.length; i++) {
        var weight = allHeights[i].pointCount;
        weightedSum += allHeights[i].height * weight;
        totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// -------------------- MAIN VALIDATION PROCESS -----------

// Calculate bounding box
var combinedMinX = Number.MAX_VALUE;
var combinedMaxX = Number.MIN_VALUE;
var combinedMinY = Number.MAX_VALUE;
var combinedMaxY = Number.MIN_VALUE;

for (var cloudIdx = 0; cloudIdx < selectedClouds.length; cloudIdx++) {
    var cloud = selectedClouds[cloudIdx];
    var bbox = cloud.GetBoundingBox();

    combinedMinX = Math.min(combinedMinX, bbox.LowPoint.GetX());
    combinedMaxX = Math.max(combinedMaxX, bbox.UpPoint.GetX());
    combinedMinY = Math.min(combinedMinY, bbox.LowPoint.GetY());
    combinedMaxY = Math.max(combinedMaxY, bbox.UpPoint.GetY());
}

print("Bounding box: X(" + combinedMinX.toFixed(1) + " - " + combinedMaxX.toFixed(1) +
    "), Y(" + combinedMinY.toFixed(1) + " - " + combinedMaxY.toFixed(1) + ")");

// Process validation points
var results = [];
var pointCount = 0;

for (var currentX = combinedMinX; currentX <= combinedMaxX; currentX += GRID_SPACING) {
    for (var currentY = combinedMinY; currentY <= combinedMaxY; currentY += GRID_SPACING) {
        pointCount++;
        print("\n--- Processing Point " + pointCount + " ---");
        print("Coordinates: E=" + currentX.toFixed(1) + ", N=" + currentY.toFixed(1));

        var result = {
            pointIndex: pointCount,
            easting: currentX,
            northing: currentY,
            swisstopoHeight: null,
            measuredHeight: null,
            heightDiff: null,
            classification: "UNKNOWN"
        };

        // Get Swisstopo height
        result.swisstopoHeight = getSwisstopoHeight(currentX, currentY);
        if (result.swisstopoHeight === null) {
            print("❌ Swisstopo API failed");
            result.classification = "API_FAILED";
            results.push(result);
            continue;
        }
        print("✓ Swisstopo height: " + result.swisstopoHeight.toFixed(3) + "m");

        // Get cloud height
        result.measuredHeight = getCloudHeightAtPoint(
            selectedClouds,
            currentX,
            currentY,
            result.swisstopoHeight,
            SEARCH_RADIUS
        );

        if (result.measuredHeight === null) {
            print("❌ No cloud data found");
            result.classification = "NO_DATA";
            results.push(result);
            continue;
        }
        print("✓ Measured height: " + result.measuredHeight.toFixed(3) + "m");

        // Calculate difference
        result.heightDiff = result.measuredHeight - result.swisstopoHeight;
        var absDiff = Math.abs(result.heightDiff);
        print("Difference: " + (result.heightDiff >= 0 ? "+" : "") + result.heightDiff.toFixed(3) + "m");

        // Classify
        if (absDiff <= ERROR_THRESHOLD) {
            result.classification = "OK";
            print("✓ Classification: OK");
        } else {
            result.classification = "ERROR";
            print("❌ Classification: ERROR (exceeds " + ERROR_THRESHOLD + "m)");
        }

        // Create label (for all points if enabled, or just errors)
        if (CREATE_ALL_LABELS || result.classification === "ERROR") {
            try {
                var gridPoint = SPoint.New(currentX, currentY, result.measuredHeight);
                var label = SLabel.New(5, 2); // 5 rows for complete information

                // Set column types: Measure and Reference
                label.SetColType([SLabel.Measure, SLabel.Reference]);

                // Set line types for different data rows
                label.SetLineType([
                    SLabel.Distance,    // Measured height
                    SLabel.Distance,    // Swisstopo height  
                    SLabel.Deviation,   // Difference (deviation) - this is the key measurement
                    SLabel.EmptyLine,   // Point ID
                    SLabel.EmptyLine    // Grid coordinates
                ]);

                // Row 0: Measured height
                label.SetCell(0, 0, parseFloat(result.measuredHeight.toFixed(3)));
                label.SetCell(0, 1, parseFloat(1)); // Code 1 = Measured

                // Row 1: Swisstopo reference height
                label.SetCell(1, 0, parseFloat(result.swisstopoHeight.toFixed(3)));
                label.SetCell(1, 1, parseFloat(2)); // Code 2 = Swisstopo Reference

                // Row 2: Height difference (deviation) - most important row
                label.SetCell(2, 0, parseFloat(result.heightDiff.toFixed(3)));
                label.SetCell(2, 1, parseFloat(3)); // Code 3 = Deviation

                // Row 3: Point ID for reference
                label.SetCell(3, 0, parseFloat(pointCount));
                label.SetCell(3, 1, parseFloat(4)); // Code 4 = Point ID

                // Row 4: Grid coordinates for location reference
                label.SetCell(4, 0, parseFloat(currentX.toFixed(1))); // Easting
                label.SetCell(4, 1, parseFloat(currentY.toFixed(1))); // Northing

                // Set global tolerance based on classification
                if (result.classification === "ERROR") {
                    // Stricter tolerance for error points to highlight them
                    label.SetTolerance(-ERROR_THRESHOLD, ERROR_THRESHOLD);
                } else {
                    // More lenient tolerance for OK points
                    label.SetTolerance(-WARNING_THRESHOLD, WARNING_THRESHOLD);
                }

                // Enhanced comment with classification and deviation info
                var labelComment = "Validation_" + result.classification + "_P" + pointCount +
                    "_Δ" + (result.heightDiff >= 0 ? "+" : "") + result.heightDiff.toFixed(3) + "m";
                label.SetComment(labelComment);

                // Attach to point and add to document
                label.AttachToPoint(gridPoint);
                label.AddToDoc();

                // Move to classification-specific group for better organization
                var groupName = "Validation_" + result.classification + "_Labels";
                label.MoveToGroup(groupName, true);

                print("✓ Enhanced label created: " + labelComment);
            } catch (labelError) {
                print("⚠ Enhanced label creation failed: " + labelError.message);
                print("  Falling back to basic label...");

                // Robust fallback to basic 3-row label
                try {
                    var basicLabel = SLabel.New(3, 2);
                    basicLabel.SetColType([SLabel.Measure, SLabel.Reference]);
                    basicLabel.SetLineType([SLabel.Distance, SLabel.Distance, SLabel.Deviation]);

                    // Basic data: measured, reference, difference
                    basicLabel.SetCell(0, 0, parseFloat(result.measuredHeight.toFixed(3)));
                    basicLabel.SetCell(0, 1, parseFloat(1)); // Measured
                    basicLabel.SetCell(1, 0, parseFloat(result.swisstopoHeight.toFixed(3)));
                    basicLabel.SetCell(1, 1, parseFloat(2)); // Reference
                    basicLabel.SetCell(2, 0, parseFloat(result.heightDiff.toFixed(3)));
                    basicLabel.SetCell(2, 1, parseFloat(3)); // Deviation

                    // Set appropriate tolerance
                    basicLabel.SetTolerance(-ERROR_THRESHOLD, ERROR_THRESHOLD);

                    // Simple comment
                    basicLabel.SetComment("VAL_" + result.classification + "_" + pointCount);
                    basicLabel.AttachToPoint(gridPoint);
                    basicLabel.AddToDoc();
                    basicLabel.MoveToGroup("Validation_Labels", true);

                    print("✓ Basic fallback label created");
                } catch (fallbackError) {
                    print("❌ All label creation attempts failed: " + fallbackError.message);
                }
            }
        }

        results.push(result);
    }
}

// -------------------- RESULTS -----------

print("\n=== Validation Results ===");
var okCount = 0;
var errorCount = 0;
var failedCount = 0;

for (var i = 0; i < results.length; i++) {
    var result = results[i];
    switch (result.classification) {
        case "OK": okCount++; break;
        case "ERROR": errorCount++; break;
        default: failedCount++; break;
    }
}

print("Total points processed: " + results.length);
print("OK: " + okCount);
print("ERROR: " + errorCount);
print("FAILED/NO_DATA: " + failedCount);

// -------------------- GENERATE REPORT -----------
if (GENERATE_REPORT) {
    try {
        print("Starting direct CSV generation...");

        // Create CSV content directly
        var csvContent = [];

        // CSV Header
        var csvHeader = [
            "Point_ID",
            "Easting",
            "Northing",
            "Measured_Height_m",
            "Swisstopo_Height_m",
            "Difference_m",
            "Classification",
            "Grid_Spacing_m",
            "Search_Radius_m",
            "Error_Threshold_m"
        ].join(",");
        csvContent.push(csvHeader);

        print("Adding " + results.length + " data rows...");

        // Add data rows
        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            var csvRow = [
                result.pointIndex,
                result.easting.toFixed(2),
                result.northing.toFixed(2),
                result.measuredHeight !== null ? result.measuredHeight.toFixed(3) : "N/A",
                result.swisstopoHeight !== null ? result.swisstopoHeight.toFixed(3) : "N/A",
                result.heightDiff !== null ? result.heightDiff.toFixed(3) : "N/A",
                '"' + result.classification + '"', // Quote to handle potential commas
                GRID_SPACING,
                SEARCH_RADIUS,
                ERROR_THRESHOLD
            ].join(",");
            csvContent.push(csvRow);
        }

        // Join all lines with newlines
        var csvText = csvContent.join("\n");
        print("CSV content prepared (" + csvContent.length + " lines)");

        // Try to save CSV - Method 1: User dialog
        var csvSaved = false;
        try {
            print("Opening CSV save dialog...");
            var csvPath = GetSaveFileName("Save CSV Report", "CSV files (*.csv)");
            print("User selected: " + (csvPath ? csvPath : "cancelled"));

            if (csvPath && csvPath !== "" && csvPath !== "null") {
                // Ensure .csv extension
                if (!csvPath.toLowerCase().endsWith('.csv')) {
                    csvPath += '.csv';
                }

                print("Saving CSV to: " + csvPath);
                var csvFile = SFile.New(csvPath);

                if (csvFile.Open(SFile.WriteOnly)) {
                    var writeSuccess = csvFile.Write(csvText);
                    csvFile.Close();
                    print("CSV write result: " + writeSuccess);
                    print("✓ CSV saved successfully to: " + csvPath);

                    SDialog.Message(
                        "CSV Report saved successfully!\n\nFile: " + csvPath + "\n\nContains " + results.length + " validation results.",
                        SDialog.EMessageSeverity.Success,
                        "CSV Export Complete"
                    );
                    csvSaved = true;
                } else {
                    print("❌ Could not open CSV file for writing: " + csvPath);
                }
            } else {
                print("CSV save dialog cancelled");
            }
        } catch (csvSaveError) {
            print("CSV save error: " + csvSaveError.message);
        }

        // Method 2: Fallback to temp directory
        if (!csvSaved) {
            try {
                var now = new Date();
                var year = now.getFullYear();
                var month = String(now.getMonth() + 1).padStart(2, '0');
                var day = String(now.getDate()).padStart(2, '0');
                var hour = String(now.getHours()).padStart(2, '0');
                var minute = String(now.getMinutes()).padStart(2, '0');
                var timestamp = year + "-" + month + "-" + day + "_" + hour + "-" + minute;

                var tempCsvPath = TempPath() + "Swisstopo_Validation_" + timestamp + ".csv";
                print("Attempting fallback save to: " + tempCsvPath);

                var tempCsvFile = SFile.New(tempCsvPath);
                if (tempCsvFile.Open(SFile.WriteOnly)) {
                    var tempWriteSuccess = tempCsvFile.Write(csvText);
                    tempCsvFile.Close();
                    print("Temp CSV write result: " + tempWriteSuccess);
                    print("✓ CSV saved to temp location: " + tempCsvPath);

                    SDialog.Message(
                        "CSV Report saved to temp directory:\n\n" + tempCsvPath + "\n\nContains " + results.length + " validation results.\nYou can copy this file to your desired location.",
                        SDialog.EMessageSeverity.Info,
                        "CSV Saved to Temp"
                    );
                    csvSaved = true;
                } else {
                    print("❌ Could not save to temp location: " + tempCsvPath);
                }
            } catch (tempCsvError) {
                print("Temp CSV save error: " + tempCsvError.message);
            }
        }

        // Method 3: Console output as last resort
        if (!csvSaved) {
            print("❌ All CSV save attempts failed - outputting to console");
            print("=== CSV CONTENT START ===");
            print(csvText);
            print("=== CSV CONTENT END ===");
            print("Copy the above CSV content to create your own file");
        }

    } catch (reportError) {
        print("CSV generation error: " + reportError.message);
    }
}

// Show summary dialog
try {
    var summaryMessage =
        "Swisstopo Validation Complete\n\n" +
        "Points processed: " + results.length + "\n" +
        "OK: " + okCount + "\n" +
        "ERROR: " + errorCount + "\n" +
        "FAILED/NO_DATA: " + failedCount + "\n\n" +
        "Error threshold: " + ERROR_THRESHOLD + "m\n" +
        "Labels created: " + (CREATE_ALL_LABELS ? "All points" : "Errors only") + "\n" +
        "Report generated: " + (GENERATE_REPORT ? "Yes" : "No") + "\n\n" +
        "Data source: © swisstopo";

    var severity = SDialog.EMessageSeverity.Success;
    if (errorCount > 0) {
        severity = SDialog.EMessageSeverity.Warning;
    } else if (failedCount > 0) {
        severity = SDialog.EMessageSeverity.Info;
    }

    SDialog.Message(summaryMessage, severity, "Validation Complete");
} catch (dialogError) {
    print("Dialog error: " + dialogError.message);
}

print("\n=== Swisstopo Validation Session End ===");
print("✓ Validation completed successfully!");
print("");
print("Data source: © swisstopo - Height data from api3.geo.admin.ch");
print("Coordinate system: LV95 (EPSG:2056)");
print("Script: Swisstopo Systematic Point Cloud Validation v1.0");