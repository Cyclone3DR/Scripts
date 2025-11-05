// === MeasureALL - Angle Measurements Between Lines ===

Print("🚀 Starting Angle Measurement Tool...");

// === FIRST: Check if lines exist in document ===
function CheckLinesExist() {
    var allLines = SMultiline.All();
    
    if (allLines.length === 0) {
        var noLinesDialog = SDialog.New("⚠️ No Lines Found");
        noLinesDialog.AddText("❌ No lines detected in the document!", SDialog.Error);
        noLinesDialog.AddText("", SDialog.Info);
        noLinesDialog.AddText("📋 Angle measurements require measurement lines!", SDialog.Warning);
        noLinesDialog.AddText("", SDialog.Info);
        noLinesDialog.AddText("To use this tool, you need to:", SDialog.Instruction);
        noLinesDialog.AddText(" 1. Create spheres at control points", SDialog.Info);
        noLinesDialog.AddText(" 2. Create length measurements (lines) between spheres", SDialog.Info);
        noLinesDialog.AddText(" 3. Then run this angle measurement tool", SDialog.Info);
        noLinesDialog.AddText("", SDialog.Info);
        noLinesDialog.AddText("💡 Tip: Use the 'Length Measurements' option", SDialog.Instruction);
        noLinesDialog.AddText("   in the main menu to create measurement lines first.", SDialog.Instruction);
        noLinesDialog.SetButtons(["OK"]);
        noLinesDialog.Run();
        
        Print("⚠️ No lines found! Cannot create angle measurements without measurement lines.");
        Print("📋 Please create length measurements first, then run this script again.");
        return { success: false, lineCount: 0 };
    }
    
    // Count valid measurement lines (lines starting with "L")
    var validLines = [];
    var invalidLines = [];
    
    for (var i = 0; i < allLines.length; i++) {
        var line = allLines[i];
        var name = line.GetName();
        
        if (name.startsWith("L")) {
            validLines.push(name);
        } else {
            invalidLines.push(name);
        }
    }
    
    if (validLines.length < 2) {
        var insufficientDialog = SDialog.New("⚠️ Insufficient Measurement Lines");
        insufficientDialog.AddText("❌ Need at least 2 measurement lines to calculate angles!", SDialog.Error);
        insufficientDialog.AddText("", SDialog.Info);
        insufficientDialog.AddText("📊 Current status:", SDialog.Info);
        insufficientDialog.AddText("  • Total lines found: " + allLines.length, SDialog.Info);
        insufficientDialog.AddText("  • Valid measurement lines (start with 'L'): " + validLines.length, SDialog.Warning);
        
        if (validLines.length > 0) {
            insufficientDialog.AddText("  • Found: " + validLines.join(", "), SDialog.Success);
        }
        
        if (invalidLines.length > 0) {
            insufficientDialog.AddText("  • Other lines (ignored): " + invalidLines.length, SDialog.Info);
        }
        
        insufficientDialog.AddText("", SDialog.Info);
        insufficientDialog.AddText("📋 To create measurement lines:", SDialog.Instruction);
        insufficientDialog.AddText("  1️⃣ Use the main MeasureALL menu", SDialog.Info);
        insufficientDialog.AddText("  2️⃣ Select 'Length Measurements'", SDialog.Info);
        insufficientDialog.AddText("  3️⃣ Create at least 2 lines between spheres", SDialog.Info);
        insufficientDialog.AddText("  4️⃣ Then run this angle measurement tool", SDialog.Info);
        insufficientDialog.SetButtons(["OK"]);
        insufficientDialog.Run();
        
        Print("⚠️ Insufficient measurement lines! Found only " + validLines.length + " valid line(s), need at least 2.");
        return { success: false, lineCount: validLines.length };
    }
    
    Print("✅ Found " + validLines.length + " valid measurement line(s) for angle measurements");
    Print("📏 Valid lines: " + validLines.join(", "));
    
    if (invalidLines.length > 0) {
        Print("ℹ️ Info: " + invalidLines.length + " other line(s) found but will be ignored (not measurement lines)");
    }
    
    return { success: true, lineCount: validLines.length, validLines: validLines };
}

// Check for lines before continuing
var linesCheckResult = CheckLinesExist();
if (!linesCheckResult.success) {
    Print("❌ Angle Measurement Tool cannot proceed without sufficient measurement lines.");
    throw new Error("Insufficient measurement lines in document (need at least 2)");
}

// === Helper functions ===
function FindMidPoint(p1, p2) {
    return SPoint.New(
        0.5 * (p1.GetX() + p2.GetX()),
        0.5 * (p1.GetY() + p2.GetY()),
        0.5 * (p1.GetZ() + p2.GetZ())
    );
}

function GetDirectionVector(p1, p2) {
    return {
        x: p2.GetX() - p1.GetX(),
        y: p2.GetY() - p1.GetY(),
        z: p2.GetZ() - p1.GetZ()
    };
}

function VectorMagnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function DotProduct(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

function SafeAngleBetweenLines(lineA, lineB) {
    if (!lineA || !lineB) return null;

    var pA1 = lineA.GetPoint(0);
    var pA2 = lineA.GetPoint(1);
    var pB1 = lineB.GetPoint(0);
    var pB2 = lineB.GetPoint(1);

    var v1 = GetDirectionVector(pA1, pA2);
    var v2 = GetDirectionVector(pB1, pB2);

    var mag1 = VectorMagnitude(v1);
    var mag2 = VectorMagnitude(v2);
    if (mag1 === 0 || mag2 === 0) return null;

    var dot = DotProduct(v1, v2);
    var cosTheta = dot / (mag1 * mag2);
    cosTheta = Math.max(-1, Math.min(1, cosTheta));

    var angleRad = Math.acos(cosTheta);
    var angleDeg = angleRad * (180 / Math.PI);

    return Math.min(angleDeg, 180 - angleDeg);
}

/**
 * Create arc with detailed checks
 * @param {SPoint} ipt1 - center point
 * @param {SPoint} ipt2 - start direction
 * @param {SPoint} ipt3 - end direction
 * @param {string} arcName - arc name
 * @returns {SMultiline|null} - arc or null on error
 */
function CreateArcWithChecks(ipt1, ipt2, ipt3, arcName) {
    Print("=== STARTING ARC CREATION: " + arcName + " ===");
    
    // Input parameter validation
    if (!ipt1 || !ipt2 || !ipt3) {
        Print("❌ ERROR: Not all points provided to function");
        return null;
    }
    
    var pt1 = SPoint.New(ipt1);
    var pt2 = SPoint.New(ipt2);
    var pt3 = SPoint.New(ipt3);
    
    Print("📍 Point 1 (center): " + pt1.ValuesToString());
    Print("📍 Point 2 (start): " + pt2.ValuesToString());
    Print("📍 Point 3 (end): " + pt3.ValuesToString());
    
    // Distance validation
    var dist12 = pt1.Distance(pt2);
    var dist13 = pt1.Distance(pt3);
    
    Print("📏 Distance center-start: " + dist12);
    Print("📏 Distance center-end: " + dist13);
    
    if (dist12 < 0.001) {
        Print("❌ ERROR: Center and start point too close!");
        return null;
    }
    
    if (dist13 < 0.001) {
        Print("❌ ERROR: Center and end point too close!");
        return null;
    }
    
    // Radius calculation
    var R = Math.min(dist12, dist13) / 3;
    Print("📏 Calculated radius: " + R);
    
    if (R < 0.001) {
        Print("❌ ERROR: Radius too small!");
        return null;
    }
    
    // Vector creation
    var vec1 = SVector.New(pt1, pt2);
    var vec2 = SVector.New(pt1, pt3);
    
    Print("📏 Vector 1 created: " + (vec1 ? "YES" : "NO"));
    Print("📏 Vector 2 created: " + (vec2 ? "YES" : "NO"));
    
    if (!vec1 || !vec2) {
        Print("❌ ERROR: Failed to create vectors!");
        return null;
    }
    
    // Angle calculation
    var A = SVector.Angle(vec1, vec2);
    Print("📐 Angle between vectors: " + A + " degrees");
    
    if (A < 0.1) {
        Print("❌ ERROR: Angle too small (less than 0.1 degrees)!");
        return null;
    }
    
    if (A > 359.9) {
        Print("❌ ERROR: Angle too large (more than 359.9 degrees)!");
        return null;
    }
    
    // Create multiline
    var toRet = SMultiline.New();
    if (!toRet) {
        Print("❌ ERROR: Failed to create SMultiline!");
        return null;
    }
    
    Print("✅ SMultiline created successfully");
    
    // Create arc points
    var pointsAdded = 0;
    var PtToAdd = SPoint.New(0, 0, 0);
    
    Print("🔧 Adding arc points...");
    
    for (var iA = 0; iA <= A; iA++) {
        var radians = iA * Math.PI / 180;
        var x = Math.cos(radians) * R;
        var y = Math.sin(radians) * R;
        
        PtToAdd.SetX(x);
        PtToAdd.SetY(y);
        PtToAdd.SetZ(0);
        
        toRet.InsertLast(SPoint.New(PtToAdd));
        pointsAdded++;
        
        if (pointsAdded <= 3 || pointsAdded % 30 == 0) {
            Print("📍 Point " + pointsAdded + ": (" + x.toFixed(3) + ", " + y.toFixed(3) + ", 0)");
        }
    }
    
    Print("📊 Total points added: " + pointsAdded);
    
    // Create transformation matrix
    var theMat = SMatrix.New();
    if (!theMat) {
        Print("❌ ERROR: Failed to create transformation matrix!");
        return null;
    }
    
    Print("🔧 Creating transformation matrix...");
    
    try {
        theMat.InitAlign(
            pt1, pt2, pt3,
            SPoint.New(0, 0, 0),
            SPoint.New(1, 0, 0),
            SPoint.New(0, 1, 0)
        );
        Print("✅ Transformation matrix created successfully");
    } catch (e) {
        Print("❌ ERROR creating matrix: " + e.message);
        return null;
    }
    
    // Apply transformation
    try {
        toRet.ApplyTransformation(theMat);
        Print("✅ Transformation applied successfully");
    } catch (e) {
        Print("❌ ERROR applying transformation: " + e.message);
        return null;
    }
    
    // Final settings
    toRet.SetName(arcName);
    
    try {
        toRet.AddArrows(false);
        Print("✅ Arrows disabled");
    } catch (e) {
        Print("⚠️ WARNING: Failed to disable arrows: " + e.message);
    }
    
    // IMPORTANT: Add object to document!
    toRet.AddToDoc();
    Print("✅ Arc added to document: " + arcName);
    
    Print("=== ARC CREATED SUCCESSFULLY ===");
    return toRet;
}

/**
 * Find intersection point of two lines
 * @param {SMultiline} line1 - first line
 * @param {SMultiline} line2 - second line
 * @returns {SPoint|null} - intersection point or null if not found
 */
function FindLinesIntersection(line1, line2) {
    if (!line1 || !line2) {
        Print("❌ Error: Invalid lines provided for intersection calculation");
        return null;
    }
    
    // Use built-in function to find intersections between two lines
    try {
        var intersectionResult = line1.IntersectionWithOtherPlanarMulti(line2);
        
        if (intersectionResult.ErrorCode === 0 && intersectionResult.PointTbl && intersectionResult.PointTbl.length > 0) {
            // Return the first found intersection point
            Print("✅ Found intersection point between lines");
            return intersectionResult.PointTbl[0];
        } else {
            Print("⚠️ No intersection found between lines, using midpoint fallback");
            return null;
        }
    } catch (e) {
        Print("⚠️ Error finding intersection: " + e.message + ", using midpoint fallback");
        return null;
    }
}

/**
 * Create arc between two lines for angle visualization
 * @param {SMultiline} line1 - first line
 * @param {SMultiline} line2 - second line
 * @param {string} arcName - arc name
 * @returns {SMultiline|null} - arc or null on error
 */
function CreateAngleArcBetweenLines(line1, line2, arcName) {
    if (!line1 || !line2) {
        Print("❌ Error: Invalid lines provided for arc creation");
        return null;
    }
    
    Print("📐 Creating arc between lines: " + line1.GetName() + " and " + line2.GetName());
    
    // STEP 1: Find line intersection - this will be arc center (point 1)
    var intersectionPoint = FindLinesIntersection(line1, line2);
    
    if (intersectionPoint) {
        Print("✅ Found intersection point (arc center): " + intersectionPoint.ValuesToString());
        
        // STEP 2: Take ends of first line and find the one most distant from intersection
        var line1_start = line1.GetPoint(0);
        var line1_end = line1.GetPoint(1);
        
        var dist1_start = intersectionPoint.Distance(line1_start);
        var dist1_end = intersectionPoint.Distance(line1_end);
        
        var point2 = (dist1_start > dist1_end) ? line1_start : line1_end;
        
        Print("📏 Line 1 - distance to start: " + dist1_start.toFixed(3));
        Print("📏 Line 1 - distance to end: " + dist1_end.toFixed(3));
        Print("✅ Selected point 2 (most distant from intersection): " + point2.ValuesToString());
        
        // STEP 3: Take ends of second line and find the one most distant from intersection
        var line2_start = line2.GetPoint(0);
        var line2_end = line2.GetPoint(1);
        
        var dist2_start = intersectionPoint.Distance(line2_start);
        var dist2_end = intersectionPoint.Distance(line2_end);
        
        var point3 = (dist2_start > dist2_end) ? line2_start : line2_end;
        
        Print("📏 Line 2 - distance to start: " + dist2_start.toFixed(3));
        Print("📏 Line 2 - distance to end: " + dist2_end.toFixed(3));
        Print("✅ Selected point 3 (most distant from intersection): " + point3.ValuesToString());
        
        // STEP 4: Create arc with found three points
        Print("🔧 Creating arc with points:");
        Print("   Point 1 (center): " + intersectionPoint.ValuesToString());
        Print("   Point 2 (line 1 end): " + point2.ValuesToString());
        Print("   Point 3 (line 2 end): " + point3.ValuesToString());
        
        return CreateArcWithChecks(intersectionPoint, point2, point3, arcName);
        
    } else {
        Print("⚠️ Lines don't intersect. Creating arc at midpoint between closest points...");
        
        // FALLBACK: Find closest points between two lines
        var line1_start = line1.GetPoint(0);
        var line1_end = line1.GetPoint(1);
        var line2_start = line2.GetPoint(0);
        var line2_end = line2.GetPoint(1);
        
        // Find pair of closest points
        var minDistance = Number.MAX_VALUE;
        var closestPoint1 = null;
        var closestPoint2 = null;
        var farPoint1 = null;
        var farPoint2 = null;
        
        var distances = [
            { dist: line1_start.Distance(line2_start), l1close: line1_start, l2close: line2_start, l1far: line1_end, l2far: line2_end },
            { dist: line1_start.Distance(line2_end), l1close: line1_start, l2close: line2_end, l1far: line1_end, l2far: line2_start },
            { dist: line1_end.Distance(line2_start), l1close: line1_end, l2close: line2_start, l1far: line1_start, l2far: line2_end },
            { dist: line1_end.Distance(line2_end), l1close: line1_end, l2close: line2_end, l1far: line1_start, l2far: line2_start }
        ];
        
        // Find minimum distance
        for (var i = 0; i < distances.length; i++) {
            if (distances[i].dist < minDistance) {
                minDistance = distances[i].dist;
                closestPoint1 = distances[i].l1close;
                closestPoint2 = distances[i].l2close;
                farPoint1 = distances[i].l1far;
                farPoint2 = distances[i].l2far;
            }
        }
        
        Print("📏 Minimum distance between lines: " + minDistance.toFixed(3));
        Print("📏 Closest point on line 1: " + closestPoint1.ValuesToString());
        Print("📏 Closest point on line 2: " + closestPoint2.ValuesToString());
        
        // Arc center - midpoint between closest points
        var centerPoint = FindMidPoint(closestPoint1, closestPoint2);
        Print("📏 Arc center (midpoint): " + centerPoint.ValuesToString());
        
        // Use opposite ends as directions
        Print("📏 Far point on line 1: " + farPoint1.ValuesToString());
        Print("📏 Far point on line 2: " + farPoint2.ValuesToString());
        
        Print("🔧 Creating arc with points:");
        Print("   Point 1 (center): " + centerPoint.ValuesToString());
        Print("   Point 2 (far end of line 1): " + farPoint1.ValuesToString());
        Print("   Point 3 (far end of line 2): " + farPoint2.ValuesToString());
        
        return CreateArcWithChecks(centerPoint, farPoint1, farPoint2, arcName);
    }
}

// === Get all valid measurement lines ===
var allLines = SMultiline.All();
var lineNamesSet = {};
var lineNames = [];

for (var i = 0; i < allLines.length; i++) {
    var line = allLines[i];
    var name = line.GetName();
    if (name.startsWith("L") && !lineNamesSet[name]) {
        lineNamesSet[name] = true;
        lineNames.push(name);
    }
}

// This check should never fail because we already checked above, but just in case
if (lineNames.length < 2) {
    Print("❌ Error: Insufficient measurement lines after filtering. This should not happen!");
    throw new Error("Unexpected error: insufficient lines after filtering");
}

Print("📏 Found " + lineNames.length + " measurement lines: " + lineNames.join(", "));

// === Main dialog ===
var dialog = SDialog.New("📐 Angle Measurement Tool");
dialog.SetHeader("SMeasure Angle Measurements", "", 35);

dialog.AddText("Create precise angle measurements between existing\nmeasurement lines using SMeasure objects.", SDialog.Instruction);
dialog.AddText("✅ Found " + lineNames.length + " measurement lines ready for angle measurements", SDialog.Success);

dialog.AddChoices({
    id: "analysisMode",
    name: "📊 Analysis Mode",
    tooltip: "Choose whether to perform tolerance analysis or just measure angles",
    choices: ["📐 Simple Measurement", "📊 Full Analysis with Tolerances"],
    value: 1,
    style: SDialog.SwitchButtons
});

dialog.SetButtons(["🚀 Start Measurement", "❌ Cancel"]);

var result = dialog.Run();
if (result.ErrorCode !== 0) {
    Print("❌ Operation cancelled by user.");
} else {
    // Prepare mode data
    var modeData = {
        isFullAnalysis: result.analysisMode === 1,
        tolerances: null
    };
    
    // Get tolerances if in full analysis mode
    if (modeData.isFullAnalysis) {
        modeData.tolerances = GetAngleTolerances();
        if (modeData.tolerances === null) {
            Print("❌ Operation cancelled by user.");
        } else {
            Print("🚀 Starting angle measurements with full analysis...");
            CreateSMeasureAnglesWithSelection(modeData);
        }
    } else {
        Print("🚀 Starting simple angle measurements...");
        CreateSMeasureAnglesWithSelection(modeData);
    }
}

// === Get angle tolerances ===
function GetAngleTolerances() {
    var toleranceDialog = SDialog.New("Angle Tolerances");
    toleranceDialog.AddText("Set tolerance thresholds for quality\nassessment (Good / Warning / Error)", SDialog.Info);
    
    toleranceDialog.AddFloat({
        id: "angleGood",
        name: "Angle - Good threshold (degrees)",
        tooltip: "Maximum angle deviation considered acceptable (Green indicator)",
        value: 1.0,
        min: 0.1,
        max: 45.0
    });
    
    toleranceDialog.AddFloat({
        id: "angleWarning",
        name: "Angle - Warning threshold (degrees)",
        tooltip: "Maximum angle deviation before critical error (Yellow indicator)",
        value: 5.0,
        min: 0.1,
        max: 45.0
    });
    
    toleranceDialog.SetButtons(["Apply", "Cancel"]);
    var toleranceResult = toleranceDialog.Run();
    
    if (toleranceResult.ErrorCode !== 0) {
        return null;
    }
    
    var tolerances = {
        angleGood: toleranceResult.angleGood,
        angleWarning: toleranceResult.angleWarning
    };
    
    Print("⚙️ Using angle tolerances - Good: ±" + tolerances.angleGood + "°, Warning: ±" + tolerances.angleWarning + "°");
    Print("🎨 Color coding: 🟢 Green = Good, 🟡 Yellow = Warning, 🔴 Red = Error");
    
    return tolerances;
}



// === Main angle measurement function ===
function CreateSMeasureAnglesWithSelection(modeData) {
    // Get selected angle pairs using the selection scenarios
    var selectedAnglePairs = SelectAnglePairsWithScenarios(lineNames);
    if (selectedAnglePairs === null || selectedAnglePairs.length === 0) {
        Print("❌ No line pairs selected for angle measurement.");
        return;
    }

    var nominalAngles = null;
    
    // Get nominal angles if in full analysis mode
    if (modeData.isFullAnalysis) {
        nominalAngles = GetNominalAngleValues(selectedAnglePairs);
        if (nominalAngles === null) {
            Print("Operation cancelled by user.");
            return;
        }
    }

    // Create SMeasure angle objects for selected pairs
    Print("🔧 Creating SMeasure angle objects...");
    var createdCount = 0;
    
    for (var i = 0; i < selectedAnglePairs.length; i++) {
        var line1 = selectedAnglePairs[i][0];
        var line2 = selectedAnglePairs[i][1];
        
        // Get the actual lines
        var lines1 = SMultiline.FromName(line1);
        var lines2 = SMultiline.FromName(line2);
        
        if (lines1.length > 0 && lines2.length > 0) {
            var actualAngle = SafeAngleBetweenLines(lines1[0], lines2[0]);
            if (actualAngle !== null) {
                // Create SMeasure object for angle
                var mid1 = FindMidPoint(lines1[0].GetPoint(0), lines1[0].GetPoint(1));
                var mid2 = FindMidPoint(lines2[0].GetPoint(0), lines2[0].GetPoint(1));
                var attachPoint = FindMidPoint(mid1, mid2);
                
                var angleName = "A_" + line1 + "_" + line2;
                var statusComment = "";
                var measure;
                
                if (modeData.isFullAnalysis && nominalAngles) {
                    var nominal = nominalAngles["angle" + i] || 90.0;
                    var deviation = actualAngle - nominal;
                    var absDeviation = Math.abs(deviation);
                    
                    // Determine status based on tolerance for comment
                    if (absDeviation <= modeData.tolerances.angleGood) {
                        statusComment = "🟢 Pass";
                    } else if (absDeviation <= modeData.tolerances.angleWarning) {
                        statusComment = "🟡 Warning";
                    } else {
                        statusComment = "🔴 Error";
                    }
                    
                    measure = SMeasure.New(angleName, attachPoint, i + 100, statusComment);
                    
                    // Add measurement data row with tolerances
                    var rowDefinition = {
                        "key": "angle",
                        "name": "Angle",
                        "unit": "degrees",
                        "tolMin": -modeData.tolerances.angleWarning,
                        "tolMax": modeData.tolerances.angleWarning,
                        "values": [
                            {
                                "key": "actual",
                                "value": actualAngle
                            },
                            {
                                "key": "nominal",
                                "prefix": "Nom.",
                                "value": nominal
                            },
                            {
                                "key": "deviation",
                                "prefix": "Dev.",
                                "value": deviation
                            }
                        ]
                    };
                } else {
                    // Simple measurement mode
                    statusComment = "Angle: " + actualAngle.toFixed(2) + "°";
                    measure = SMeasure.New(angleName, attachPoint, i + 100, statusComment);
                    
                    // Add simple measurement data row
                    var rowDefinition = {
                        "key": "angle",
                        "name": "Angle",
                        "unit": "degrees",
                        "values": [
                            {
                                "key": "actual",
                                "value": actualAngle
                            }
                        ]
                    };
                }
                
                // Create visual arc between the two lines instead of straight connection
                var connectionArc = CreateAngleArcBetweenLines(lines1[0], lines2[0], "Arc_" + line1 + "_" + line2);
                
                // Set color based on angle tolerance if in full analysis mode
                var colorStatus = "";
                if (connectionArc) {
                    if (modeData.isFullAnalysis && nominalAngles) {
                        var absDeviation = Math.abs(actualAngle - nominalAngles["angle" + i]);
                        if (absDeviation <= modeData.tolerances.angleGood) {
                            connectionArc.SetColors(0, 1, 0); // Green - within good tolerance
                            colorStatus = "🟢 GOOD";
                        } else if (absDeviation <= modeData.tolerances.angleWarning) {
                            connectionArc.SetColors(1, 1, 0); // Yellow - within warning tolerance
                            colorStatus = "🟡 WARNING";
                        } else {
                            connectionArc.SetColors(1, 0, 0); // Red - outside tolerance
                            colorStatus = "🔴 ERROR";
                        }
                    } else {
                        connectionArc.SetColors(0, 0, 1); // Blue - simple mode
                        colorStatus = "📐 MEASURED";
                    }
                    
                    connectionArc.SetLineWidth(3);
                } else {
                    Print("⚠️ Warning: Could not create arc for " + line1 + " and " + line2);
                    colorStatus = "⚠️ NO ARC";
                }
                
                var addResult = measure.AddRow(rowDefinition);
                if (addResult.ErrorCode === 0) {
                    // Attach SMeasure to the middle of created arc
                    if (connectionArc) {
                        // Method 1: Get point at geometric middle of arc by length
                        var arcLength = connectionArc.GetLength();
                        if (arcLength > 0) {
                            var midDistanceResult = connectionArc.GetPointAtDistance(arcLength / 2);
                            if (midDistanceResult.ErrorCode === 0) {
                                var arcMidPoint = midDistanceResult.Point;
                                
                                // Set SMeasure attachment point at arc middle
                                var setPointResult = measure.SetPoint(arcMidPoint);
                                if (setPointResult.ErrorCode === 0) {
                                    Print("✅ SMeasure attached to geometric arc midpoint: " + arcMidPoint.ValuesToString());
                                } else {
                                    Print("⚠️ Warning: Could not set SMeasure point to arc geometric midpoint");
                                }
                            } else {
                                // Fallback: use index-based midpoint
                                Print("🔄 Fallback: using point index method for arc midpoint");
                                var arcPointCount = connectionArc.GetNumber();
                                if (arcPointCount > 0) {
                                    var midIndex = Math.floor(arcPointCount / 2);
                                    var arcMidPoint = connectionArc.GetPoint(midIndex);
                                    
                                    var setPointResult = measure.SetPoint(arcMidPoint);
                                    if (setPointResult.ErrorCode === 0) {
                                        Print("✅ SMeasure attached to arc midpoint (by index): " + arcMidPoint.ValuesToString());
                                    }
                                }
                            }
                        } else {
                            Print("⚠️ Warning: Arc has zero length, using original attachment point");
                        }
                    } else {
                        Print("⚠️ Warning: No arc created, SMeasure uses default attachment point");
                    }
                    
                    measure.AddToDoc();
                    
                    if (modeData.isFullAnalysis && nominalAngles) {
                        var nominal = nominalAngles["angle" + i];
                        var deviation = actualAngle - nominal;
                        Print("  " + line1 + " ↔ " + line2 + ": " + actualAngle.toFixed(2) + "° (nominal: " + nominal.toFixed(2) + 
                              "°, deviation: " + deviation.toFixed(2) + "°) - " + colorStatus);
                    } else {
                        Print("  " + line1 + " ↔ " + line2 + ": " + actualAngle.toFixed(2) + "° - " + colorStatus);
                    }
                    
                    createdCount++;
                } else {
                    Print("⚠️ Error creating SMeasure for " + angleName + " (ErrorCode: " + addResult.ErrorCode + ")");
                }
            }
        }
    }
    
    Print("✅ Successfully created " + createdCount + " SMeasure angle objects!");
    Print("📊 Check the SMeasure objects for detailed angle analysis");
    
    // Create measurement report for angles  
    CreateAngleMeasurementReport(selectedAnglePairs, modeData.isFullAnalysis);
    
    // Automatically zoom to show all objects
    ZoomAll();
}

// === Select angle pairs with scenarios (similar to length measurement) ===
function SelectAnglePairsWithScenarios(lineNames) {
    // Preset combinations similar to length measurements
    var presetCombinations = [
        {
            name: "🎯 Default Set",
            pairs: [["L1_2", "L1_4"], ["L1_2", "L8_10"], ["L8_10", "L4_5"], ["L2_5", "L4_5"], ["L2_5", "L8_10"], ["L2_5", "L7_9"], ["L2_5", "L5_6"], ["L7_9", "L5_6"], ["L3_6", "L7_9"]],
            description: "Original predefined angle measurement pairs"
        },
        {
            name: "📐 Sequential Pairs",
            pairs: [],
            description: "Connect consecutive line pairs in order"
        },
        {
            name: "🔧 Custom Selection",
            pairs: [],
            description: "Choose individual angle pairs manually"
        }
    ];
    
    // Generate sequential pairs based on available lines
    for (var i = 0; i < lineNames.length - 1; i++) {
        presetCombinations[1].pairs.push([lineNames[i], lineNames[i + 1]]);
    }

    // Quick selection dialog
    var quickDialog = SDialog.New("📐 Angle Pair Selection for SMeasure");
    quickDialog.AddText("📐 Found " + lineNames.length + " lines: " + lineNames.join(", "), SDialog.Success);
    quickDialog.AddText("📋 Choose how you want to connect the lines with SMeasure angle objects:", SDialog.Instruction);
    quickDialog.AddText("💡 Each SMeasure will contain angle measurement data and analysis", SDialog.Info);
    
    var presetChoices = presetCombinations.map(function(combo) {
        return combo.name + " - " + combo.description;
    });
    
    quickDialog.AddChoices({
        id: "presetChoice",
        name: "📋 Angle Measurement Patterns",
        choices: presetChoices,
        value: 0,
        tooltip: "Select a predefined set of line pairs for quick angle setup",
        style: SDialog.ComboBox
    });

    quickDialog.SetButtons(["➡️ Continue", "❌ Cancel"]);
    var quickResult = quickDialog.Run();
    if (quickResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return null;
    }

    var selectedPairs;
    var selectedPreset = presetCombinations[quickResult.presetChoice];
    
    if (selectedPreset.name === "🔧 Custom Selection") {
        // Show detailed selection dialog
        selectedPairs = ShowDetailedAngleSelectionDialog(lineNames);
        if (selectedPairs === null) {
            Print("Operation cancelled by user.");
            return null;
        }
    } else {
        selectedPairs = selectedPreset.pairs;
        // Filter pairs to only include lines that actually exist
        var filteredPairs = [];
        for (var i = 0; i < selectedPairs.length; i++) {
            var line1 = selectedPairs[i][0];
            var line2 = selectedPairs[i][1];
            if (lineNames.indexOf(line1) !== -1 && lineNames.indexOf(line2) !== -1) {
                filteredPairs.push([line1, line2]);
            }
        }
        selectedPairs = filteredPairs;
        Print("📐 Using preset: " + selectedPreset.name + " with " + selectedPairs.length + " angle measurement pairs");
    }

    return selectedPairs;
}

function ShowDetailedAngleSelectionDialog(lineNames) {
    // Create selection dialog with grouped checkboxes
    var selectionDialog = SDialog.New("🔧 Custom Angle Pair Selection");
    selectionDialog.AddText("🎯 Select exactly which line pairs you want to measure angles between:", SDialog.Instruction);
    selectionDialog.AddText("💡 Tip: Choose pairs that form critical angles in your quality control", SDialog.Info);
    
    // Group by first line number for better organization
    for (var i = 0; i < lineNames.length; i++) {
        var line1 = lineNames[i];
        selectionDialog.BeginGroup("📐 From " + line1);
        
        for (var j = i + 1; j < lineNames.length; j++) {
            var line2 = lineNames[j];
            var pairId = i + "_" + j;

            selectionDialog.AddBoolean({
                id: "pair_" + pairId,
                name: "📐 → " + line2,
                tooltip: "Measure angle between " + line1 + " and " + line2,
                value: false
            });
        }
    }

    selectionDialog.AddText("⚠️ Remember: You'll set nominal angles for each selected pair in the next step", SDialog.Warning);
    selectionDialog.SetButtons(["✅ Confirm Selection", "❌ Cancel"]);
    var selectionResult = selectionDialog.Run();
    if (selectionResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return null;
    }

    // Get selected pairs
    var selectedPairs = [];
    for (var i = 0; i < lineNames.length; i++) {
        for (var j = i + 1; j < lineNames.length; j++) {
            var pairId = i + "_" + j;
            
            if (selectionResult["pair_" + pairId]) {
                selectedPairs.push([lineNames[i], lineNames[j]]);
            }
        }
    }

    return selectedPairs;
}

// === Get nominal angle values ===
function GetNominalAngleValues(selectedAnglePairs) {
    var defaultNominalAngles = {
        "L1_2_L1_4": 90, "L1_2_L8_10": 45, "L8_10_L4_5": 45,
        "L2_5_L4_5": 90, "L2_5_L8_10": 45, "L2_5_L7_9": 45,
        "L2_5_L5_6": 90, "L7_9_L5_6": 45, "L3_6_L7_9": 45,
        "L2_3_L7_9": 45, "L2_3_L3_6": 90
    };

    // Create dialog for nominal angles
    var angleDialog = SDialog.New("📐 Set Nominal Angles for SMeasure");
    angleDialog.AddText("🎯 Define the expected (nominal) angles\nfor SMeasure tolerance analysis", SDialog.Instruction);
    angleDialog.AddText("📊 SMeasure will automatically calculate:\nActual Angle, Deviation, and Status", SDialog.Info);
    angleDialog.AddText("💡 Angles are measured in degrees (0-180°)", SDialog.Success);
    angleDialog.BeginGroup("📐 Nominal Angle Values (in degrees)");

    // Create EXACTLY one field per selected angle pair
    for (var i = 0; i < selectedAnglePairs.length; i++) {
        var line1 = selectedAnglePairs[i][0];
        var line2 = selectedAnglePairs[i][1];
        var angleName = line1 + "_" + line2;
        
        // Get default value
        var defaultValue = defaultNominalAngles[angleName] || 
                          defaultNominalAngles[line2 + "_" + line1] || 
                          90.0;

        angleDialog.AddFloat({
            id: "angle" + i,
            name: "📐 " + line1 + " ↔ " + line2,
            tooltip: "Enter nominal angle between " + line1 + " and " + line2,
            value: defaultValue,
            saveValue: false,
            readOnly: false,
            min: 0,
            max: 180
        });
    }

    angleDialog.SetButtons(["✅ Create SMeasure Angle Objects", "❌ Cancel"]);
    var angleResult = angleDialog.Run();
    if (angleResult.ErrorCode !== 0) {
        return null;
    }
    
    return angleResult;
}

// === Create angle measurement report ===
function CreateAngleMeasurementReport(selectedAnglePairs, isFullAnalysis) {
    try {
        Print("📋 Creating angle measurement report...");
        
        // Create report data
        var reportData = SReportData.New("Angle Report");
        
        // Collect all angle SMeasure objects created by our script
        var angleMeasures = [];
        var allMeasures = SMeasure.All();
        
        for (var i = 0; i < allMeasures.length; i++) {
            var measure = allMeasures[i];
            var measureName = measure.GetName();
            // Look for our angle measures (they start with "A_")
            if (measureName.indexOf("A_") === 0) {
                angleMeasures.push(measure);
            }
        }
        
        if (angleMeasures.length > 0) {
            // Add the SMeasure objects to report
            var result = reportData.AddMeasures("AngleMeasures", angleMeasures);
            if (result.ErrorCode === 0) {
                Print("✅ Added " + angleMeasures.length + " angle SMeasure objects to report");
            } else {
                Print("⚠️ Error adding angle SMeasures to report (ErrorCode: " + result.ErrorCode + ")");
            }
        } else {
            Print("⚠️ No angle SMeasure objects found for report");
        }
        
        // Add report to document
        reportData.SetName("Angle Report");
        reportData.AddToDoc();
        
        Print("📋 Angle measurement report created successfully!");
        
    } catch (error) {
        Print("⚠️ Error creating angle report: " + error.message);
    }
}

Print("✅ Angle Measurement Tool completed successfully!");
Print("💡 All SMeasure angle objects have been created with visual indicators");
Print("💡 Use SMeasure.All() to access all measurements programmatically");