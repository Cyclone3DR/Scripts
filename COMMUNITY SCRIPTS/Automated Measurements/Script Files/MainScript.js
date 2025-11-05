// === MeasureALL - Main Menu ===
var currentScriptPath = CurrentScriptPath() + "/";
print("Current script path: " + currentScriptPath);

var dialog = SDialog.New("Automated Measurements");

// Try to add logo image
    var scriptPath = CurrentScriptPath() + "/";
    
    try {
        var logoPath = scriptPath + "\\logo_white.png";
        dialog.AddImage({
            imagePath: logoPath,
            width: 200,
            height: 60
        });
    } catch (error) {
        // Try alternative syntax that works
        try {
            var logoPath2 = scriptPath + "\\logo_white.png";
            dialog.AddImage(logoPath2, 2000, 60);
        } catch (error2) {
            // If both methods fail, continue without logo
            print("Note: Logo could not be loaded");
        }
    }


dialog.AddText("Advanced measurement tool allows you to automatically\ncreate precise measurements between spheres.", SDialog.Instruction);
dialog.AddText("⚠️ Spheres will be automatically renamed to\n'Sphere 1', 'Sphere 2', etc. if needed.", SDialog.Warning);

dialog.AddBoolean({
    id: "doPoints",
    name: "Create reference points at\nsphere centers",
    tooltip: "Generate white reference points at the center of each detected sphere for better visualization and reference",
    value: false
});

dialog.AddBoolean({
    id: "doLines",
    name: "Length Measurements",
    tooltip: "Open the length measurement tool in a separate script",
    value: false
});

dialog.AddBoolean({
    id: "doAngles",
    name: "Angle Measurements", 
    tooltip: "Open the angle measurement tool in a separate script",
    value: false
});

dialog.AddBoolean({
    id: "doPerpendicular",
    name: "Perpendicular measurements",
    tooltip: "Launch perpendicular distance analyzer for sphere-to-line measurements",
    value: false
});

dialog.AddText("Tip: Label objects provide advanced\ndata tables and reports!", SDialog.Info);
dialog.SetButtons(["Start Operations", "Cancel"]);

var result = dialog.Run();
if (result.ErrorCode !== 0) {
    Print("❌ Operation cancelled by user.");
} else {
    Print("🚀 Starting MeasureALL operations...");
    ExecuteOperations(result);
}

// === Automatic Sphere Renaming Functions ===
function AutoRenameSpheres() {
    Print("🔍 Checking and renaming spheres...");
    
    var allSpheres = SSphere.All();
    
    if (allSpheres.length === 0) {
        Print("⚠️ No spheres found in document!");
        return false;
    }
    
    var renamedCount = 0;
    var existingNumbers = [];
    var spheresToRename = [];
    
    // First pass: collect information about existing numbers
    for (var i = 0; i < allSpheres.length; i++) {
        var sphere = allSpheres[i];
        var name = sphere.GetName();
        
        // Check pattern "Sphere X" where X is a number
        var match = name.match(/^Sphere\s+(\d+)$/);
        if (match) {
            var number = parseInt(match[1]);
            existingNumbers.push(number);
        }
        // Check spheres without number or with wrong format
        else if (name === "Sphere" || name.toLowerCase().indexOf("sphere") === 0) {
            spheresToRename.push(sphere);
        }
    }
    
    // Sort existing numbers to find available ones
    existingNumbers.sort(function(a, b) { return a - b; });
    
    Print("📊 Found spheres with correct names: " + existingNumbers.length);
    Print("📊 Found spheres to rename: " + spheresToRename.length);
    
    if (spheresToRename.length === 0) {
        Print("✅ All spheres already have correct names!");
        return true;
    }
    
    // Function to find next available number
    function getNextAvailableNumber(startFrom) {
        var number = startFrom || 1;
        while (existingNumbers.indexOf(number) !== -1) {
            number++;
        }
        return number;
    }
    
    // Rename spheres
    var nextNumber = getNextAvailableNumber(1);
    
    for (var j = 0; j < spheresToRename.length; j++) {
        var sphere = spheresToRename[j];
        var oldName = sphere.GetName();
        var newName = "Sphere " + nextNumber;
        
        try {
            sphere.SetName(newName);
            Print("✅ Renamed: '" + oldName + "' → '" + newName + "'");
            existingNumbers.push(nextNumber);
            renamedCount++;
            nextNumber = getNextAvailableNumber(nextNumber + 1);
        } catch (error) {
            Print("❌ Error renaming '" + oldName + "': " + error.message);
        }
    }
    
    Print("🎉 Successfully renamed spheres: " + renamedCount);
    return renamedCount > 0;
}

// === Sphere name validation function ===
function ValidateSphereName(sphereName) {
    // Check if sphere name matches expected format "Sphere N"
    var pattern = /^Sphere\s+\d+$/;
    return pattern.test(sphereName);
}

// === Improved sphere center points creation ===
function CreateSphereCenterPoints() {
    // FIRST: Check if there are ANY spheres in the document
    var spheresFound = SSphere.All();
    
    if (spheresFound.length === 0) {
        // Show dialog if no spheres found
        var noSpheresDialog = SDialog.New("⚠️ No Spheres Found");
        noSpheresDialog.AddText("❌ No spheres detected in the document!", SDialog.Error);
        noSpheresDialog.AddText("", SDialog.Info);
        noSpheresDialog.AddText("📋 To use this tool, you need to:", SDialog.Instruction);
        noSpheresDialog.AddText(" 1. Create spheres at control points", SDialog.Info);
        noSpheresDialog.AddText(" 2. Name them 'Sphere 1', 'Sphere 2', etc.", SDialog.Info);
        noSpheresDialog.AddText(" 3. Run this script again", SDialog.Info);
        noSpheresDialog.AddText("", SDialog.Info);
        noSpheresDialog.AddText("💡 Tip: Use sphere fitting tools to create", SDialog.Instruction);
        noSpheresDialog.AddText("   spheres at your control points first.", SDialog.Instruction);
        noSpheresDialog.SetButtons(["OK"]);
        noSpheresDialog.Run();
        
        Print("⚠️ No spheres found in document! Please create spheres at control points first.");
        return;
    }
    
    Print("✅ Found " + spheresFound.length + " sphere(s) in document");
    
    // Check if there are spheres with incorrect names
    var needsRenaming = false;
    var invalidSpheres = [];
    
    for (var i = 0; i < spheresFound.length; i++) {
        var sphere = spheresFound[i];
        var name = sphere.GetName();
        
        if (!ValidateSphereName(name)) {
            needsRenaming = true;
            invalidSpheres.push(name);
        }
    }
    
    if (needsRenaming) {
        var renameDialog = SDialog.New("🔄 Sphere Renaming");
        renameDialog.AddText("🔍 Found spheres with incorrect names:", SDialog.Warning);
        
        for (var k = 0; k < Math.min(invalidSpheres.length, 5); k++) {
            renameDialog.AddText("  • '" + invalidSpheres[k] + "'", SDialog.Info);
        }
        
        if (invalidSpheres.length > 5) {
            renameDialog.AddText("  ... and " + (invalidSpheres.length - 5) + " more sphere(s)", SDialog.Info);
        }
        
        renameDialog.AddText("", SDialog.Info);
        renameDialog.AddText("🔄 Automatically rename them to 'Sphere N' format?", SDialog.Instruction);
        renameDialog.AddText("✅ This will ensure proper script functionality", SDialog.Success);
        
        renameDialog.SetButtons(["🔄 Rename", "❌ Cancel"]);
        
        var renameResult = renameDialog.Run();
        if (renameResult.ErrorCode !== 0) {
            Print("⚠️ Operation cancelled by user.");
            return;
        }
        
        // Perform renaming
        if (!AutoRenameSpheres()) {
            Print("❌ Failed to rename spheres. Check names manually.");
            return;
        }
        
        // Update sphere list after renaming
        spheresFound = SSphere.All();
    }
    
    var pointDialog = SDialog.New("🎯 Create Reference Points");
    pointDialog.AddText("🔍 Detected " + spheresFound.length + " sphere(s) in document", SDialog.Success);
    pointDialog.AddText("📍 White reference points will be created at each sphere center", SDialog.Instruction);
    pointDialog.AddText("✨ These points help visualize sphere centers and can be used for further measurements", SDialog.Info);
    
    pointDialog.SetButtons(["✅ Create Points", "❌ Cancel"]);
    var pointResult = pointDialog.Run();
    if (pointResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return;
    }
    
    Print("🎯 Creating reference points...");
    var pointsCreated = 0;
    
    for (var j = 0; j < spheresFound.length; j++) {
        var sphere = spheresFound[j];
        var center = sphere.GetCenter();
        var fullName = sphere.GetName();
        
        // Extract only the number from "Sphere N" name
        var numberMatch = fullName.match(/Sphere\s+(\d+)/);
        var pointName = numberMatch ? numberMatch[1] : (j + 1).toString();

        try {
            var point = SPoint.New(center);
            point.SetName(pointName);
            point.SetPointSize(10);
            point.SetColors(1, 1, 1); // White color
            point.ShowName(true);
            point.AddToDoc();
            pointsCreated++;
            
            Print("📍 Created point '" + pointName + "' for sphere '" + fullName + "'");
        } catch (error) {
            Print("❌ Error creating point for sphere '" + fullName + "': " + error.message);
        }
    }
    
    Print("✅ Successfully created reference points: " + pointsCreated + " out of " + spheresFound.length);
    
    if (pointsCreated > 0) {
        // Automatically zoom to show all objects
        ZoomAll();
        Print("🔍 View scaled to show all objects");
    }
}

// === Main execution function ===
function ExecuteOperations(result) {
    var operationsPerformed = false;
    
    if (result.doPoints) {
        Print("🔍 Creating reference points...");
        CreateSphereCenterPoints();
        operationsPerformed = true;
    }
    
    if (result.doLines) {
        Print("📏 Launching Length Measurement Script...");
        LaunchLengthScript();
        operationsPerformed = true;
    }
    
    if (result.doAngles) {
        Print("📐 Launching Angle Measurement Script...");
        LaunchAngleScript();
        operationsPerformed = true;
    }
    
    if (result.doPerpendicular) {
        Print("⊥ Launching Perpendicular Distance Analyzer...");
        LaunchPerpendicularScript();
        operationsPerformed = true;
    }
    
    if (operationsPerformed) {
        Print("🎉 MeasureALL operations completed successfully!");
        Print("💡 Pro tip: Use SMeasure.All() to get all measurements, or use the SMeasure Manager for detailed analysis");
        
        // Automatically zoom to show all objects if points were created
        if (result.doPoints) {
            ZoomAll();
        }
    } else {
        Print("ℹ️ No operations were selected. Please run the script again and select at least one operation.");
    }
}

// === Launch Length Script ===
function LaunchLengthScript() {
    try {
        Print("🚀 Launching Length Measurement Tool...");
        
        // Get the directory of the current script
        var currentPath = CurrentScriptPath() + "/";
        Print("📁 Current script path: " + currentPath);
        
        // Extract directory path correctly
        var lastSlash = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
        var scriptDirectory = currentPath.substring(0, lastSlash + 1) + "/";
        var lengthScriptPath = scriptDirectory + "MeasureALL_Lengths.js";
        
        Print("📁 Script directory: " + scriptDirectory);
        Print("🔍 Looking for length script at: " + lengthScriptPath);
        
        // Check if file exists first
        var file = SFile.New(lengthScriptPath);
        if (!file.Exists()) {
            Print("❌ File does not exist: " + lengthScriptPath);
            
            // Try alternative names
            var alternatives = [
                scriptDirectory + "Lengths.js",
                scriptDirectory + "Length_Measurements.js",
                scriptDirectory + "MeasureALL_Part2.js"
            ];
            
            var found = false;
            for (var i = 0; i < alternatives.length; i++) {
                var altFile = SFile.New(alternatives[i]);
                if (altFile.Exists()) {
                    lengthScriptPath = alternatives[i];
                    Print("✅ Found alternative: " + lengthScriptPath);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                ShowScriptNotFoundDialog("Length Measurement Script", lengthScriptPath, alternatives);
                return;
            }
        } else {
            Print("✅ File found at: " + lengthScriptPath);
        }
        
        // Try to include and run the length script
        Print("📂 Including script: " + lengthScriptPath);
        Include(lengthScriptPath);
        
        Print("✅ Length measurement script launched successfully!");
        
    } catch (error) {
        Print("⚠️ Error launching length script: " + error.message);
        Print("🔍 Error details: " + error.toString());
        ShowScriptErrorDialog("Length Measurement Script", error.message, lengthScriptPath || "unknown path");
    }
}

// === Launch Angle Script ===
function LaunchAngleScript() {
    try {
        Print("🚀 Launching Angle Measurement Tool...");
        
        // Get the directory of the current script
        var currentPath = CurrentScriptPath() + "/";
        Print("📁 Current script path: " + currentPath);
        
        // Extract directory path correctly
        var lastSlash = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
        var scriptDirectory = currentPath.substring(0, lastSlash + 1) + "/";
        var angleScriptPath = scriptDirectory + "MeasureALL_Angles.js";
        
        Print("📁 Script directory: " + scriptDirectory);
        Print("🔍 Looking for angle script at: " + angleScriptPath);
        
        // Check if file exists first
        var file = SFile.New(angleScriptPath);
        if (!file.Exists()) {
            Print("❌ File does not exist: " + angleScriptPath);
            
            // Try alternative names
            var alternatives = [
                scriptDirectory + "Angles.js",
                scriptDirectory + "Angle_Measurements.js",
                scriptDirectory + "MeasureALL_Part3.js"
            ];
            
            var found = false;
            for (var i = 0; i < alternatives.length; i++) {
                var altFile = SFile.New(alternatives[i]);
                if (altFile.Exists()) {
                    angleScriptPath = alternatives[i];
                    Print("✅ Found alternative: " + angleScriptPath);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                ShowScriptNotFoundDialog("Angle Measurement Script", angleScriptPath, alternatives);
                return;
            }
        } else {
            Print("✅ File found at: " + angleScriptPath);
        }
        
        // Try to include and run the angle script
        Print("📂 Including script: " + angleScriptPath);
        Include(angleScriptPath);
        
        Print("✅ Angle measurement script launched successfully!");
        
    } catch (error) {
        Print("⚠️ Error launching angle script: " + error.message);
        Print("🔍 Error details: " + error.toString());
        ShowScriptErrorDialog("Angle Measurement Script", error.message, angleScriptPath || "unknown path");
    }
}

// === Launch Perpendicular Script ===
function LaunchPerpendicularScript() {
    try {
        Print("🚀 Launching Perpendicular Distance Analyzer...");
        
        // Get the directory of the current script
        var currentPath = CurrentScriptPath() + "/";
        Print("📁 Current script path: " + currentPath);
        
        // Extract directory path correctly
        var lastSlash = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
        var scriptDirectory = currentPath.substring(0, lastSlash + 1) + "/";
        var perpendicularScriptPath = scriptDirectory + "MeasureALL_Perpendic.js";
        
        Print("📁 Script directory: " + scriptDirectory);
        Print("🔍 Looking for perpendicular script at: " + perpendicularScriptPath);
        
        // Check if file exists first
        var file = SFile.New(perpendicularScriptPath);
        if (!file.Exists()) {
            Print("❌ File does not exist: " + perpendicularScriptPath);
            
            // Try alternative path construction
            var basePath = currentPath.replace(/[^\\\/]*$/, "");
            var alternativePath = basePath + "MeasureALL_Perpendic.js";
            Print("🔍 Trying alternative path: " + alternativePath);
            
            var altFile = SFile.New(alternativePath);
            if (altFile.Exists()) {
                perpendicularScriptPath = alternativePath;
                Print("✅ Found file at alternative path!");
            } else {
                Print("❌ File not found at alternative path either");
                ShowScriptNotFoundDialog("Perpendicular Script", perpendicularScriptPath, [alternativePath]);
                return;
            }
        } else {
            Print("✅ File found at: " + perpendicularScriptPath);
        }
        
        // Try to include and run the perpendicular script
        Print("📂 Including script: " + perpendicularScriptPath);
        Include(perpendicularScriptPath);
        
        Print("✅ Perpendicular script launched successfully!");
        
    } catch (error) {
        Print("⚠️ Error launching perpendicular script: " + error.message);
        Print("🔍 Error details: " + error.toString());
        ShowScriptErrorDialog("Perpendicular Script", error.message, perpendicularScriptPath || "unknown path");
    }
}

// === Show script not found dialog ===
function ShowScriptNotFoundDialog(scriptName, primaryPath, alternatives) {
    var errorDialog = SDialog.New("Script File Not Found");
    errorDialog.AddText("Could not find " + scriptName + ":", SDialog.Error);
    errorDialog.AddText("Primary path: " + primaryPath, SDialog.Warning);
    errorDialog.AddText("", SDialog.Info);
    
    if (alternatives && alternatives.length > 0) {
        errorDialog.AddText("Also searched for:", SDialog.Info);
        for (var i = 0; i < alternatives.length; i++) {
            errorDialog.AddText((i + 1) + ": " + alternatives[i], SDialog.Instruction);
        }
        errorDialog.AddText("", SDialog.Info);
    }
    
    errorDialog.AddText("Please ensure the script file exists in the\nsame directory as this main script.", SDialog.Warning);
    errorDialog.SetButtons(["OK"]);
    errorDialog.Run();
}

// === Show script error dialog ===
function ShowScriptErrorDialog(scriptName, errorMessage, scriptPath) {
    var errorDialog = SDialog.New("Script Execution Error");
    errorDialog.AddText("Error executing " + scriptName + ":", SDialog.Error);
    errorDialog.AddText("Path: " + scriptPath, SDialog.Info);
    errorDialog.AddText("Error: " + errorMessage, SDialog.Warning);
    errorDialog.AddText("", SDialog.Info);
    errorDialog.AddText("Make sure the script file is valid\nand contains no syntax errors.", SDialog.Info);
    errorDialog.SetButtons(["OK"]);
    errorDialog.Run();
}

// === SMeasure Management Functions ===
function ShowSMeasureManager() {
    var allMeasures = SMeasure.All();
    
    if (allMeasures.length === 0) {
        Print("⚠️ No SMeasure objects found in document.");
        return;
    }
    
    var managerDialog = SDialog.New("🔧 SMeasure Manager");
    managerDialog.AddText("📊 Found " + allMeasures.length + " SMeasure objects", SDialog.Success);
    managerDialog.AddText("🔧 Choose an operation to perform:", SDialog.Instruction);
    
    managerDialog.AddChoices({
        id: "operation",
        name: "🛠️ Management Operations",
        choices: [
            "📊 Analyze All Results",
            "🔍 Show Detailed Info"
        ],
        value: 0,
        style: SDialog.ComboBox
    });
    
    managerDialog.SetButtons(["🚀 Execute", "❌ Cancel"]);
    var result = managerDialog.Run();
    
    if (result.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return;
    }
    
    switch (result.operation) {
        case 0: // Analyze All Results
            AnalyzeSMeasureResults();
            break;
        case 1: // Show Detailed Info
            ShowDetailedSMeasureInfo();
            break;
    }
}

function AnalyzeSMeasureResults() {
    Print("📊 Analyzing SMeasure results...");
    
    var allMeasures = SMeasure.All();
    if (allMeasures.length === 0) {
        Print("⚠️ No SMeasure objects found for analysis.");
        return;
    }
    
    var summary = {
        total: allMeasures.length,
        good: 0,
        warning: 0,
        error: 0,
        lengthMeasures: 0,
        angleMeasures: 0
    };
    
    Print("🔍 Analyzing " + allMeasures.length + " SMeasure objects...");
    
    for (var i = 0; i < allMeasures.length; i++) {
        var measure = allMeasures[i];
        var name = measure.GetName();
        
        // Categorize by type
        if (name.startsWith("L")) {
            summary.lengthMeasures++;
        } else if (name.startsWith("A_")) {
            summary.angleMeasures++;
        }
        
        // Get row keys to analyze tolerances
        var keysResult = measure.GetRowsKeys();
        if (keysResult.ErrorCode === 0) {
            var keys = keysResult.StringTbl;
            
            for (var j = 0; j < keys.length; j++) {
                var key = keys[j];
                
                if (measure.HasTolerances(key)) {
                    var valuesResult = measure.GetValues(key);
                    var tolerancesResult = measure.GetTolerances(key);
                    
                    if (valuesResult.ErrorCode === 0 && tolerancesResult.ErrorCode === 0) {
                        var values = valuesResult.ValueTbl;
                        var tolerances = tolerancesResult.Result;
                        
                        // Assume first value is actual, second is nominal
                        if (values.length >= 2) {
                            var actual = values[0];
                            var nominal = values[1];
                            var deviation = actual - nominal;
                            
                            if (Math.abs(deviation) <= Math.abs(tolerances.TolMax) / 3) {
                                summary.good++;
                            } else if (Math.abs(deviation) <= Math.abs(tolerances.TolMax)) {
                                summary.warning++;
                            } else {
                                summary.error++;
                            }
                        }
                    }
                }
            }
        }
    }
    
    Print("📈 Analysis Summary:");
    Print("  📏 Length measurements: " + summary.lengthMeasures);
    Print("  📐 Angle measurements: " + summary.angleMeasures);
    Print("  🟢 Good (within tolerance): " + summary.good);
    Print("  🟡 Warning (near tolerance): " + summary.warning);
    Print("  🔴 Error (outside tolerance): " + summary.error);
    
    return summary;
}

function ShowDetailedSMeasureInfo() {
    var allMeasures = SMeasure.All();
    
    Print("📊 Detailed SMeasure Information:");
    Print("=" + RepeatChar("=", 50));
    
    for (var i = 0; i < allMeasures.length; i++) {
        var measure = allMeasures[i];
        
        Print("🔍 Measure: " + measure.GetName() + " (ID: " + measure.GetID() + ")");
        
        var commentResult = measure.GetComment();
        if (commentResult.ErrorCode === 0) {
            Print("  💬 Comment: " + commentResult.String);
        }
        
        var keysResult = measure.GetRowsKeys();
        if (keysResult.ErrorCode === 0) {
            var keys = keysResult.StringTbl;
            
            for (var j = 0; j < keys.length; j++) {
                var key = keys[j];
                
                var rowDataResult = measure.GetRowData(key);
                if (rowDataResult.ErrorCode === 0) {
                    var rowData = rowDataResult.Result;
                    Print("  📊 Row '" + key + "': " + rowData.Name + " (" + rowData.Unit + ")");
                    
                    if (rowData.Values && rowData.Values.length > 0) {
                        for (var k = 0; k < rowData.Values.length; k++) {
                            var value = rowData.Values[k];
                            Print("    📈 " + value.key + ": " + value.value);
                        }
                    }
                    
                    if (measure.HasTolerances(key)) {
                        var tolResult = measure.GetTolerances(key);
                        if (tolResult.ErrorCode === 0) {
                            Print("    ⚖️ Tolerances: " + tolResult.Result.TolMin + " to " + tolResult.Result.TolMax);
                        }
                    }
                }
            }
        }
        
        Print("-" + RepeatChar("-", 40));
    }
}

function RepeatChar(char, count) {
    var result = "";
    for (var i = 0; i < count; i++) {
        result += char;
    }
    return result;
}

Print("✅ MeasureALL Main Menu loaded successfully!");
Print("💡 This script provides access to all measurement tools");
Print("💡 Run 'ShowSMeasureManager()' for advanced SMeasure management options");