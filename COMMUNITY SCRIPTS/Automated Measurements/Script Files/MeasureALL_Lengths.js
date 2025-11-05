// === MeasureALL - Length Measurements between Spheres ===

Print("🚀 Starting Length Measurement Tool...");

// === FIRST: Check if spheres exist in document ===
function CheckSpheresExist() {
    var allSpheres = SSphere.All();
    
    if (allSpheres.length === 0) {
        var noSpheresDialog = SDialog.New("⚠️ No Spheres Found");
        noSpheresDialog.AddText("❌ No spheres detected in the document!", SDialog.Error);
        noSpheresDialog.AddText("", SDialog.Info);
        noSpheresDialog.AddText("📋 Length measurements require spheres!", SDialog.Warning);
        noSpheresDialog.AddText("", SDialog.Info);
        noSpheresDialog.AddText("To use this tool, you need to:", SDialog.Instruction);
        noSpheresDialog.AddText(" 1. Create spheres at control points", SDialog.Info);
        noSpheresDialog.AddText(" 2. Name them 'Sphere 1', 'Sphere 2', etc.", SDialog.Info);
        noSpheresDialog.AddText(" 3. Run this measurement tool again", SDialog.Info);
        noSpheresDialog.AddText("", SDialog.Info);
        noSpheresDialog.AddText("💡 Tip: Lines can only be created between", SDialog.Instruction);
        noSpheresDialog.AddText("   existing sphere centers.", SDialog.Instruction);
        noSpheresDialog.SetButtons(["OK"]);
        noSpheresDialog.Run();
        
        Print("⚠️ No spheres found! Cannot create length measurements without spheres.");
        Print("📋 Please create spheres at control points first, then run this script again.");
        return false;
    }
    
    // Count valid spheres with correct naming
    var validCount = 0;
    var invalidSpheres = [];
    
    for (var i = 0; i < allSpheres.length; i++) {
        var sphere = allSpheres[i];
        var name = sphere.GetName();
        var number = parseInt(name.replace("Sphere ", "").trim());
        
        if (!isNaN(number)) {
            validCount++;
        } else {
            invalidSpheres.push(name);
        }
    }
    
    if (validCount === 0) {
        var invalidDialog = SDialog.New("⚠️ Invalid Sphere Names");
        invalidDialog.AddText("❌ Found " + allSpheres.length + " sphere(s), but none have valid names!", SDialog.Error);
        invalidDialog.AddText("", SDialog.Info);
        invalidDialog.AddText("📋 Spheres must be named: 'Sphere 1', 'Sphere 2', etc.", SDialog.Warning);
        invalidDialog.AddText("", SDialog.Info);
        invalidDialog.AddText("Found invalid sphere names:", SDialog.Info);
        
        for (var k = 0; k < Math.min(invalidSpheres.length, 5); k++) {
            invalidDialog.AddText("  • '" + invalidSpheres[k] + "'", SDialog.Warning);
        }
        
        if (invalidSpheres.length > 5) {
            invalidDialog.AddText("  ... and " + (invalidSpheres.length - 5) + " more", SDialog.Info);
        }
        
        invalidDialog.AddText("", SDialog.Info);
        invalidDialog.AddText("💡 Please rename your spheres using the", SDialog.Instruction);
        invalidDialog.AddText("   'Create reference points' option in the main menu.", SDialog.Instruction);
        invalidDialog.SetButtons(["OK"]);
        invalidDialog.Run();
        
        Print("⚠️ No valid sphere names found! Please rename spheres to 'Sphere 1', 'Sphere 2', etc.");
        return false;
    }
    
    Print("✅ Found " + validCount + " valid sphere(s) for length measurements");
    
    if (invalidSpheres.length > 0) {
        Print("⚠️ Warning: " + invalidSpheres.length + " sphere(s) have invalid names and will be ignored");
    }
    
    return true;
}

// Check for spheres before continuing
if (!CheckSpheresExist()) {
    Print("❌ Length Measurement Tool cannot proceed without valid spheres.");
    throw new Error("No valid spheres found in document");
}

// === Helper functions ===
function CalculateDistance(p1, p2) {
    var dx = p2.GetX() - p1.GetX();
    var dy = p2.GetY() - p1.GetY();
    var dz = p2.GetZ() - p1.GetZ();
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function FindMidPoint(p1, p2) {
    return SPoint.New(
        0.5 * (p1.GetX() + p2.GetX()),
        0.5 * (p1.GetY() + p2.GetY()),
        0.5 * (p1.GetZ() + p2.GetZ())
    );
}

// === Main dialog ===
var dialog = SDialog.New("📏 Length Measurement Tool");
dialog.SetHeader("SMeasure Length Measurements", "", 35);

dialog.AddText("Create precise length measurements between spheres\nusing SMeasure objects with analysis capabilities.", SDialog.Instruction);
dialog.AddText("✅ Spheres detected and ready for measurement", SDialog.Success);

dialog.AddChoices({
    id: "analysisMode",
    name: "📊 Analysis Mode",
    tooltip: "Choose whether to perform tolerance analysis or just measure distances",
    choices: ["📏 Simple Measurement", "📊 Full Analysis with Tolerances"],
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
        modeData.tolerances = GetLengthTolerances();
        if (modeData.tolerances === null) {
            Print("❌ Operation cancelled by user.");
        } else {
            Print("🚀 Starting length measurements with full analysis...");
            CreateSMeasureLengthsWithQuickSelection(modeData);
        }
    } else {
        Print("🚀 Starting simple length measurements...");
        CreateSMeasureLengthsWithQuickSelection(modeData);
    }
}

// === Get length tolerances ===
function GetLengthTolerances() {
    var toleranceDialog = SDialog.New("Length Tolerances");
    toleranceDialog.AddText("Set tolerance thresholds for quality\nassessment (Good / Warning / Error)", SDialog.Info);
    
    toleranceDialog.AddFloat({
        id: "lengthGood",
        name: "Length - Good threshold",
        tooltip: "Maximum length deviation considered acceptable (Green indicator)",
        value: 0.01,
        min: 0.001,
        max: 10.0
    });
    
    toleranceDialog.AddFloat({
        id: "lengthWarning",
        name: "Length - Warning threshold", 
        tooltip: "Maximum length deviation before critical error (Yellow indicator)",
        value: 0.1,
        min: 0.001,
        max: 10.0
    });
    
    toleranceDialog.SetButtons(["Apply", "Cancel"]);
    var toleranceResult = toleranceDialog.Run();
    
    if (toleranceResult.ErrorCode !== 0) {
        return null;
    }
    
    var tolerances = {
        lengthGood: toleranceResult.lengthGood,
        lengthWarning: toleranceResult.lengthWarning
    };
    
    Print("⚙️ Using length tolerances - Good: ±" + tolerances.lengthGood + ", Warning: ±" + tolerances.lengthWarning);
    Print("🎨 Color coding: 🟢 Green = Good, 🟡 Yellow = Warning, 🔴 Red = Error");
    
    return tolerances;
}

// === Main length measurement function ===
function CreateSMeasureLengthsWithQuickSelection(modeData) {
    var allSpheres = SSphere.All();
    var spheres = {};

    // Get all spheres
    for (var i = 0; i < allSpheres.length; i++) {
        var sphere = allSpheres[i];
        var name = sphere.GetName();
        var number = parseInt(name.replace("Sphere ", "").trim());
        if (!isNaN(number)) {
            spheres[number] = sphere.GetCenter();
        }
    }

    if (Object.keys(spheres).length === 0) {
        Print("❌ No valid spheres found! Please make sure you have spheres named 'Sphere 1', 'Sphere 2', etc.");
        return;
    }

    // Preset combinations
    var presetCombinations = [
        {
            name: "🎯 Default Set",
            pairs: [[1, 2], [2, 3], [4, 5], [1, 4], [8, 10], [2, 5], [7, 9], [3, 6], [5, 6]],
            description: "Original predefined measurement pairs"
        },
        {
            name: "📏 Sequential Pairs",
            pairs: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]],
            description: "Connect consecutive spheres in order"
        },
        {
            name: "🔧 Custom Selection",
            pairs: [],
            description: "Choose individual pairs manually"
        }
    ];

    // Quick selection dialog
    var quickDialog = SDialog.New("📏 Sphere Pair Selection for SMeasure");
    quickDialog.AddText("🔍 Found " + Object.keys(spheres).length + " spheres: " + Object.keys(spheres).sort().join(", "), SDialog.Success);
    quickDialog.AddText("📋 Choose how you want to connect the spheres with SMeasure objects:", SDialog.Instruction);
    quickDialog.AddText("💡 Each SMeasure will contain measurement data and analysis", SDialog.Info);
    
    var presetChoices = presetCombinations.map(function(combo) {
        return combo.name + " - " + combo.description;
    });
    
    quickDialog.AddChoices({
        id: "presetChoice",
        name: "📋 Measurement Patterns",
        choices: presetChoices,
        value: 0,
        tooltip: "Select a predefined set of sphere pairs for quick setup",
        style: SDialog.ComboBox
    });

    quickDialog.SetButtons(["➡️ Continue", "❌ Cancel"]);
    var quickResult = quickDialog.Run();
    if (quickResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return;
    }

    var selectedPairs;
    var selectedPreset = presetCombinations[quickResult.presetChoice];
    
    if (selectedPreset.name === "🔧 Custom Selection") {
        // Show detailed selection dialog
        selectedPairs = ShowDetailedSelectionDialog(spheres);
        if (selectedPairs === null) {
            Print("Operation cancelled by user.");
            return;
        }
    } else {
        selectedPairs = selectedPreset.pairs;
        Print("📏 Using preset: " + selectedPreset.name + " with " + selectedPairs.length + " measurement pairs");
    }

    // Continue with creating SMeasure objects...
    CreateSMeasureLengthsFromPairs(spheres, selectedPairs, modeData);
}

function ShowDetailedSelectionDialog(spheres) {
    var sphereNumbers = Object.keys(spheres).map(function(key) { return parseInt(key); }).sort(function(a, b) { return a - b; });
    
    // Create selection dialog with grouped checkboxes
    var selectionDialog = SDialog.New("🔧 Custom Sphere Pair Selection");
    selectionDialog.AddText("🎯 Select exactly which sphere pairs you want to measure:", SDialog.Instruction);
    selectionDialog.AddText("💡 Tip: Choose pairs that are important for your quality control or inspection", SDialog.Info);
    
    // Group by first sphere number for better organization
    var sphereGroups = {};
    for (var i = 0; i < sphereNumbers.length; i++) {
        for (var j = i + 1; j < sphereNumbers.length; j++) {
            var s1 = sphereNumbers[i];
            var s2 = sphereNumbers[j];
            
            if (!sphereGroups[s1]) {
                sphereGroups[s1] = [];
            }
            sphereGroups[s1].push(s2);
        }
    }

    // Add checkboxes grouped by first sphere
    for (var s1 in sphereGroups) {
        selectionDialog.BeginGroup("📏 From Sphere " + s1);
        
        for (var k = 0; k < sphereGroups[s1].length; k++) {
            var s2 = sphereGroups[s1][k];
            var pairId = s1 + "_" + s2;

            selectionDialog.AddBoolean({
                id: "pair_" + pairId,
                name: "📏 → Sphere " + s2,
                tooltip: "Measure distance from sphere " + s1 + " to sphere " + s2,
                value: false
            });
        }
    }

    selectionDialog.AddText("⚠️ Remember: You'll set nominal values for each selected pair in the next step", SDialog.Warning);
    selectionDialog.SetButtons(["✅ Confirm Selection", "❌ Cancel"]);
    var selectionResult = selectionDialog.Run();
    if (selectionResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return null;
    }

    // Get selected pairs
    var selectedPairs = [];
    for (var i = 0; i < sphereNumbers.length; i++) {
        for (var j = i + 1; j < sphereNumbers.length; j++) {
            var s1 = sphereNumbers[i];
            var s2 = sphereNumbers[j];
            var pairId = s1 + "_" + s2;
            
            if (selectionResult["pair_" + pairId]) {
                selectedPairs.push([s1, s2]);
            }
        }
    }

    return selectedPairs;
}

function CreateSMeasureLengthsFromPairs(spheres, selectedPairs, modeData) {
    if (selectedPairs.length === 0) {
        Print("❌ No sphere pairs selected for measurement.");
        return;
    }

    Print("📏 Preparing to create " + selectedPairs.length + " SMeasure length objects...");

    var nominalValues = null;
    
    // Get nominal values if in full analysis mode
    if (modeData.isFullAnalysis) {
        nominalValues = GetNominalLengthValues(selectedPairs);
        if (nominalValues === null) {
            Print("Operation cancelled by user.");
            return;
        }
    }

    // Create SMeasure objects for selected pairs
    Print("🔧 Creating SMeasure length objects...");
    var createdCount = 0;
    
    for (var i = 0; i < selectedPairs.length; i++) {
        var s1 = selectedPairs[i][0];
        var s2 = selectedPairs[i][1];

        var p1 = spheres[s1];
        var p2 = spheres[s2];

        if (!p1 || !p2) {
            Print("⚠️ Warning: Could not find sphere " + s1 + " or " + s2);
            continue;
        }

        var lineName = "L" + s1 + "_" + s2;
        var actualLength = CalculateDistance(p1, p2);
        
        // Create SMeasure object
        var attachPoint = FindMidPoint(p1, p2);
        var statusComment = "";
        var measure;
        
        if (modeData.isFullAnalysis && nominalValues) {
            var nominal = nominalValues[lineName] || 0;
            var deviation = actualLength - nominal;
            var absDeviation = Math.abs(deviation);
            
            // Determine status based on tolerance for comment
            if (absDeviation <= modeData.tolerances.lengthGood) {
                statusComment = "🟢 Pass";
            } else if (absDeviation <= modeData.tolerances.lengthWarning) {
                statusComment = "🟡 Warning";
            } else {
                statusComment = "🔴 Error";
            }
            
            measure = SMeasure.New(lineName, attachPoint, i + 1, statusComment);
            
            // Add measurement data row with tolerances
            var rowDefinition = {
                "key": "length",
                "name": "Length",
                "tolMin": -modeData.tolerances.lengthWarning,
                "tolMax": modeData.tolerances.lengthWarning,
                "values": [
                    {
                        "key": "actual",
                        "value": actualLength
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
            statusComment = "Length: " + actualLength.toFixed(3);
            measure = SMeasure.New(lineName, attachPoint, i + 1, statusComment);
            
            // Add simple measurement data row
            var rowDefinition = {
                "key": "length",
                "name": "Length",
                "values": [
                    {
                        "key": "actual",
                        "value": actualLength
                    }
                ]
            };
        }
        
        // Create visual line between spheres
        var visualLine = SMultiline.New();
        visualLine.InsertLast(p1);
        visualLine.InsertLast(p2);
        visualLine.SetName(lineName);
        
        // Set line color based on tolerance if in full analysis mode
        var colorStatus = "";
        if (modeData.isFullAnalysis && nominalValues) {
            var absDeviation = Math.abs(actualLength - nominalValues[lineName]);
            if (absDeviation <= modeData.tolerances.lengthGood) {
                visualLine.SetColors(0, 1, 0); // Green - within good tolerance
                colorStatus = "🟢 GOOD";
            } else if (absDeviation <= modeData.tolerances.lengthWarning) {
                visualLine.SetColors(1, 1, 0); // Yellow - within warning tolerance
                colorStatus = "🟡 WARNING";
            } else {
                visualLine.SetColors(1, 0, 0); // Red - outside tolerance
                colorStatus = "🔴 ERROR";
            }
        } else {
            visualLine.SetColors(0, 0, 1); // Blue - simple mode
            colorStatus = "📏 MEASURED";
        }
        
        visualLine.SetLineWidth(3);
        visualLine.AddToDoc();
        
        var addResult = measure.AddRow(rowDefinition);
        if (addResult.ErrorCode === 0) {
            measure.AddToDoc();
            
            if (modeData.isFullAnalysis && nominalValues) {
                var nominal = nominalValues[lineName];
                var deviation = actualLength - nominal;
                Print("  " + lineName + ": " + actualLength.toFixed(3) + " (nominal: " + nominal.toFixed(3) + 
                      ", deviation: " + deviation.toFixed(3) + ") - " + colorStatus);
            } else {
                Print("  " + lineName + ": " + actualLength.toFixed(3) + " - " + colorStatus);
            }
            
            createdCount++;
        } else {
            Print("⚠️ Error creating SMeasure for " + lineName + " (ErrorCode: " + addResult.ErrorCode + ")");
        }
    }
    
    Print("✅ Successfully created " + createdCount + " SMeasure length objects!");
    Print("📊 Check the SMeasure objects for detailed analysis");
    
    // Create measurement report for lengths
    CreateLengthMeasurementReport(selectedPairs, modeData.isFullAnalysis);
    
    // Automatically zoom to show all objects
    ZoomAll();
}

// === Get nominal length values ===
function GetNominalLengthValues(selectedPairs) {
    var defaultNominalLengths = {
        "1_2": 8.5, "2_3": 7.6, "4_5": 8.5, "1_4": 7.6, "8_10": 9.93,
        "2_5": 7.6, "7_9": 9.3, "3_6": 7.6, "5_6": 7.6
    };

    // Create dialog for nominal lengths
    var lengthDialog = SDialog.New("📏 Set Nominal Lengths for SMeasure");
    lengthDialog.AddText("🎯 Define the expected (nominal) lengths\nfor SMeasure tolerance analysis", SDialog.Instruction);
    lengthDialog.AddText("📊 SMeasure will automatically calculate:\nActual Length, Deviation, and Status", SDialog.Info);
    lengthDialog.AddText("💡 Green values = within tolerance, Red values = outside tolerance", SDialog.Success);
    lengthDialog.BeginGroup("📏 Nominal Length Values (in current units)");

    for (var i = 0; i < selectedPairs.length; i++) {
        var s1 = selectedPairs[i][0];
        var s2 = selectedPairs[i][1];
        var pairId = s1 + "_" + s2;
        var lineName = "L" + s1 + "_" + s2;
        
        var defaultValue = defaultNominalLengths[pairId] || 
                          defaultNominalLengths[s2 + "_" + s1] || 
                          10.0;

        lengthDialog.AddFloat({
            id: lineName,
            name: "📏 " + lineName + " (Sphere " + s1 + "→" + s2 + ")",
            tooltip: "Enter the nominal/expected length in current document units",
            value: defaultValue,
            saveValue: false,
            readOnly: false,
            min: 0,
            max: 1000
        });
    }

    lengthDialog.SetButtons(["✅ Create SMeasure Objects", "❌ Cancel"]);
    var lengthResult = lengthDialog.Run();
    if (lengthResult.ErrorCode !== 0) {
        return null;
    }
    
    // Build nominal values object
    var nominalValues = {};
    for (var i = 0; i < selectedPairs.length; i++) {
        var s1 = selectedPairs[i][0];
        var s2 = selectedPairs[i][1];
        var lineName = "L" + s1 + "_" + s2;
        nominalValues[lineName] = lengthResult[lineName] || 0;
    }
    
    return nominalValues;
}

// === Create length measurement report ===
function CreateLengthMeasurementReport(selectedPairs, isFullAnalysis) {
    try {
        Print("📋 Creating length measurement report...");
        
        // Create report data
        var reportData = SReportData.New("Length Report");
        
        // Collect all length SMeasure objects created by our script
        var lengthMeasures = [];
        var allMeasures = SMeasure.All();
        
        for (var i = 0; i < allMeasures.length; i++) {
            var measure = allMeasures[i];
            var measureName = measure.GetName();
            // Look for our length measures (they start with "L" and don't contain "A_")
            if (measureName.indexOf("L") === 0 && measureName.indexOf("A_") === -1) {
                lengthMeasures.push(measure);
            }
        }
        
        if (lengthMeasures.length > 0) {
            // Add the SMeasure objects to report
            var result = reportData.AddMeasures("LengthMeasures", lengthMeasures);
            if (result.ErrorCode === 0) {
                Print("✅ Added " + lengthMeasures.length + " length SMeasure objects to report");
            } else {
                Print("⚠️ Error adding length SMeasures to report (ErrorCode: " + result.ErrorCode + ")");
            }
        } else {
            Print("⚠️ No length SMeasure objects found for report");
        }
        
        // Add report to document
        reportData.SetName("Length Report");
        reportData.AddToDoc();
        
        Print("📋 Length measurement report created successfully!");
        
    } catch (error) {
        Print("⚠️ Error creating length report: " + error.message);
    }
}

Print("✅ Length Measurement Tool completed successfully!");
Print("💡 All SMeasure length objects have been created with visual indicators");
Print("💡 Use SMeasure.All() to access all measurements programmatically");