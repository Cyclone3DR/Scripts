/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

/******** HOW TO USE IT ******
 * 
 * This script simplifies the process of generating a mesh from a classified point cloud. 
 * 
 * Follow the steps below:
 * 1) Choose an already imported point cloud from your project.
 * 2) Select a classification model and perform the classification. If the point cloud is already classified, you can skip this step.
 * 3) After classification, it is possible to filter points corresponding to certain classes.
 * 4) Use the Scan To Mesh algorithm to generate a mesh by selecting the appropriate scanner. Optionally, you can generate a texture for the mesh.
 * 5) The resulting mesh can be exported in either OBJ or GLB format.
 * 
 */

//
// Helper methods
//

/**
 * Print a step in the console
 */

let _counter=1;

function PrintStep(iMsg)
{
    print(`⚡[${_counter}] ${iMsg}...`);
    _counter++;
}

/**
 * Show a success message in the console
 */
function ShowSuccess(iMsg)
{
    var prefix = "✅ Success";
    print(`${prefix}: ${iMsg}`);
}

/**
 * Show an error message in the console
 */
function ShowError(iMsg)
{
    var title = "🛑 Error";
    print(`${title}: ${iMsg}`);
    SDialog.Message(iMsg, SDialog.Error, title);    
}

/**
 * Show a result + hide all other element
 */
function ShowResult(iComp)
{
    iComp.AddToDoc();
    ShowOnly([iComp]);
}

//
// Top level methods
//

/**
 * Pick a point cloud or take the one already selected
 */
function GrabPointCloud()
{
    let selClouds = SCloud.FromSel();
    if(selClouds.length > 0)
        return selClouds[0];

    let queryCloud = SCloud.FromClick();
    if(queryCloud.ErrorCode != 0)
    {
        ShowError("No cloud selected.");
        return;        
    }

    return queryCloud.Cloud;
}

/**
 * Load a LGSx file and convert it to a 3DR SDK cloud
 */
function LoadCloudFromLGSx()
{
    // Close any opened project
    SCwCloud.CloseCwProject();

    let path = GetOpenFileName("Select a LGSx file", "LGSx file (*.lgsx)");

    if(path.length == 0)
    {
        ShowError("No file selected.");
        return;
    }

    let lgsxProject = SCwCloud.NewFromLGSxData(path);
    if(lgsxProject.ErrorCode != 0)
    {
        ShowError(`The file couldn't be loaded at the following location: ${path}`);
        return;
    }

    let cwCloud = lgsxProject.CwCloud;

    let conversion = cwCloud.ToCloud(100_000_000, false, true);
    let stdCloud = conversion.Cloud;

    return { LGSxCloud: cwCloud, StdCloud: stdCloud, LGSxPath: path};
}

/**
 * Select a classification model from the available ones
 */
function SelectedModel(iAllowSkipping)
{
    let allModels = SCloud.GetClassificationModels();

    let selModelDialog = SDialog.New("Classification model");

    if(iAllowSkipping)
    {
        selModelDialog.BeginGroup("ℹ️ Information")
        selModelDialog.AddText("The point cloud is already classified.\nYou have the possibility to skip the classification step.", SDialog.Info);
    }

    selModelDialog.BeginGroup("⚙️ Model Selection")
    selModelDialog.AddChoices({
        id: "selection",
        name: "Select a model:",
        choices: allModels,
        style: SDialog.ChoiceRepresentationMode.RadioButtons
    });

    let cancelIndex = 1;
    let skipIndex = -1;
    if(iAllowSkipping)
    {
        selModelDialog.SetButtons(["OK", "Skip", "Cancel"]);
        skipIndex = 1;
        cancelIndex = 2;
    }

    let exec = selModelDialog.Run();

    if(exec.ErrorCode == cancelIndex)
    {
        ShowError("Step cancelled");
        return;
    }
    
    if(iAllowSkipping && exec.ErrorCode == skipIndex)
    {
        return "skip";
    }

    return allModels[exec.selection];
}

/**
 * * Classify an input cloud by a given model
 * @param {SCloud} iCloud
 * @param {string} iModelName
 */

function RunClassification(iCloud, iModelName)
{
    const modelList = SCloud.GetClassificationModels();
    let modelName = modelList.find(n => n == iModelName);
    
    if(modelName.length == 0)
    {
        ShowError(`Can't find model.`);
        return;
    }

    let retClassification = SCloud.Classify([iCloud], modelName);

    if(retClassification.ErrorCode != 0)
    {
        ShowError("Classification failed.");
        return;
    }

    var classifiedCloud = retClassification.CloudTbl[0];
    classifiedCloud.SetName(`${iCloud.GetName()} (classified)`);
    ShowResult(classifiedCloud);
    classifiedCloud.SetCloudRepresentation("classification");

    return classifiedCloud;
}

/**
 * Keep only selected classes from an input classify cloud
 * @param {iCloud} SCloud 
 */
function FilterClasses(iCloud)
{
    let classExplode = iCloud.ExplodeByClass();
    let classIds = classExplode.ClassTbl;

    let selClasses = SDialog.New("Class filtering");
    selClasses.BeginGroup("🔍 Select class to keep")
    for(const id of classIds)
    {
        let className = SCloud.GetClassName(id).Name;
        selClasses.AddBoolean({
            id: String(id),
            name: className,
            value: id!=0,
            saveValue: false
        });
    }

    let exec = selClasses.Run();
    if(exec.ErrorCode != 0)
    {
        ShowError("Dialog cancelled.");
        return;        
    }

    let idToKeep = [];
    for(const classId of classIds)
    {
        let id = String(classId);
        let classStatus = exec[id];
        if(classStatus == undefined)
            continue;

        if(classStatus)
            idToKeep.push(classId);
    }

    var cloudsToKeep = [];

    classExplode.ClassTbl.forEach((c, ii) => 
    {
        if(idToKeep.includes(c))
            cloudsToKeep.push(classExplode.CloudTbl[ii]);
    });

    if(cloudsToKeep.length == 0)
    {
        ShowError("Couldn't find relevant classes");
        return;
    }

    let mergedCloud = SCloud.Merge(cloudsToKeep).Cloud;
    mergedCloud.SetName("Filtered classes");
    ShowResult(mergedCloud);
    mergedCloud.SetCloudRepresentation("classification");
    
    return mergedCloud;
}

/**
 * Create a mesh from a point cloud
 * @param {SCloud} iCloud
 * @param {string} iLGSxPath
 */
function DoMesh(iCloud, iOutputDir)
{
    // Query all available scanners and ask the user to pick one
    let scannerKeys = Object.keys(SPoly.ScannerType);    

    let meshingOptions = SDialog.New("Scanner selection");
    meshingOptions.BeginGroup("Scanner Type");
    meshingOptions.AddChoices({
        id: "scannerType",
        name: "Select Scanner Type",
        tooltip: "Choose the appropriate scanner type for mesh generation.",
        choices: Object.keys(SPoly.ScannerType),
        style: SDialog.ComboBox
    });

    meshingOptions.BeginGroup("Options");
    meshingOptions.AddBoolean({
        id: "texturing",
        name: "Texture the mesh",
        tooltip: "Enable this option to apply texture to the mesh using point cloud colors.",
        value: true
    });

    meshingOptions.AddBoolean({
        id: "export",
        name: "Export to disk",
        tooltip: "Allow to export the created mesh at the end of the process",
        value: false, 
    });    

    let exec = meshingOptions.Run();
    if(exec.ErrorCode != 0)
    {
        ShowError("Dialog cancelled.");
        return;        
    }

    let scannerId = exec.scannerType;
    let doTexturing = exec.texturing;
    let ignoreScanDir = false;

    PrintStep(`Generating a mesh (selected scanner: ${scannerKeys[scannerId]})`);
    
    let meshing = SPoly.ScanToMesh(iCloud, [], scannerId, doTexturing, ignoreScanDir);
    if(meshing.ErrorCode != 0 || meshing.PolyTbl.length == 0)
    {
        ShowError("Meshing failed");
        return;
    }

    ShowSuccess(`Meshing succeeds.`);

    let theMesh = meshing.PolyTbl[0];
    theMesh.SetName(`Mesh (${iCloud.GetName()})`);
    ShowResult(theMesh);
    theMesh.SetPolyRepresentation(SPoly.POLY_TEXTURE);

    // Export the mesh to disk
    if(exec.export)
    {
        let outputPath = GetSaveFileName("Select mesh output", "Mesh formats (*.glb *.obj)", iOutputDir);
        if (outputPath.length == 0) {
            ShowError("Empty file path. Exiting the script.");
            return;
        }

        let retSave = theMesh.Save(outputPath, false);
        if (retSave.ErrorCode != 0) {
            ShowError("Couldn't generate a new GLB file.");
            return;
        }

        let outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
        print(`Output file: ${outputPath}`);

        OpenUrl(outputDir);
    }
}

//
//  Main function
//

function Main()
{
    PrintStep("Selecting an available point cloud");
    let selCloud = GrabPointCloud();
    if(selCloud == undefined)
        return;

    let hasClassification = selCloud.HasAttribute("classification");

    PrintStep("Classification settings");
    let modelName = SelectedModel(hasClassification);
    if(modelName == undefined)
        return;

    let classifiedCloud = selCloud;

    if(modelName == "skip")
        PrintStep("Skipping classification");
    else
    {
        PrintStep(`Classifying with model '${modelName}'`);
        let classifiedData = RunClassification(selCloud, modelName);
        if(classifiedData == undefined)
            return;

        classifiedCloud = classifiedData;
    }

    PrintStep("Class filtering");
    let editedCloud = FilterClasses(classifiedCloud);
    if(editedCloud == undefined)
        return;

    // Mesh the cleaned cloud
    DoMesh(editedCloud, CurrentScriptPath());
}

Main();
