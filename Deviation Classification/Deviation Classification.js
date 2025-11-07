/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

/******** HOW TO USE IT ******
 * 
 * This script demonstrates how point cloud classification can be used to highlight deviation information in regards of a BIM object.
 * 
 * Follow the steps below to use it:
 * 1. Select a BIM and a point cloud. If not, the script will ask for it.
 * 2. Setup the script parameters to define the deviation parameters and type of output
 * 3. Run the deviation analysis
 * 4. Assign a class to each deviation intervals
 * 5. Optionaly, export a new LGSx file
 * 
 */ 

//
// Helper methods
//

/**
 * Print a step in the console
 */

let _stepCounter=1;

function PrintStep(iMsg)
{
    print(`⚡[${_stepCounter}] ${iMsg}...`);
    _stepCounter++;
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
function ReplaceResult(iOriginalComps, iNewComp, iDeleteOrig = false)
{
    iNewComp.AddToDoc();
    for(let comp of iOriginalComps)
    {
        if(iDeleteOrig)
        {
            comp.RemoveFromDoc();
            comp.Clear();
        }
        else
            comp.SetVisibility(false);
    }
}

//
// Main methods
//

/**
 * Select a point cloud in the 3D scene
 */
function PickPointCloud()
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
 * Select a BIM in the 3D scene
 */
function PickBIM()
{
    let selBIMs = SBIM.FromSel();
    if(selBIMs.length > 0)
        return selBIMs[0];

    let queryBIM = SBIM.FromClick();
    if(queryBIM.ErrorCode != 0)
    {
        ShowError("No BIM selected.");
        return;        
    }

    return queryBIM.BIMObject;
}

/**
 * Get user parameters to configure inespection analysis
 */
function GetUserParameters()
{
    let paramDialog = SDialog.New("Define script parameters");
    paramDialog.BeginGroup("Deviation analysis");

    paramDialog.AddLength({
        "id": "tolerance",
        "name": "Tolerance +/-",
        "value": 0.1
    });

    paramDialog.AddLength({
        "id": "exclusionZone",
        "name": "Exclusion zone",
        "value": 1
    });

    paramDialog.BeginGroup("Script output")

    paramDialog.AddBoolean({
        "id": "exportLGSx",
        "name": "LGSx export",
        "value": "true",
        "tooltip": "Generate a new LGSx file containing the classified points."
    });

    paramDialog.SetButtons(["▶️ Run", "Cancel"]);

    let exec = paramDialog.Run();
    if(exec.errorCode > 0)
    {
        ShowError("User cancelled.");
        return;
    }

    return {
        "tolerance": exec.tolerance,
        "exclusionZone": exec.exclusionZone,
        "exportLGSx": exec.exportLGSx
    };
}

/**
 * Edit the colormap accorgind to the tolerance and exclusion zone
 */
function AdjustColormap(iCloud, iUserParams)
{
    let retGradient = iCloud.GetColorGradientAttribute("inspection");
    if(retGradient.ErrorCode > 0)
    {
        ShowError(`Error when editing the point cloud gradient. Error: ${retGradient.ErrorCode}`);
        return;
    }

    let gradient = retGradient.Gradient;
    let range = gradient.GetRange();

    gradient.SetNbCursor(4);

    gradient.SetCursorPos(1, iUserParams.tolerance);
    gradient.SetCursorPos(2, -iUserParams.tolerance);

    // red - green - blue
    gradient.SetColAfter(0, 1, 0, 0);
    gradient.SetColBefore(1, 1, 0, 0);

    gradient.SetColAfter(1, 0, 1, 0);
    gradient.SetColBefore(2, 0, 1, 0);

    gradient.SetColAfter(2, 0, 0, 1);
    gradient.SetColBefore(3, 0, 0, 1);    
}

/**
 * Perform the deviation analysis between the cloud and the BIM
 */
function DeviationAnalysis(iCloud, iBIM, iUserParams)
{
    let bimConv = iBIM.ConvertPolys();
    if(bimConv.ErrorCode != 0)
    {
        ShowError("Couldn't convert the BIM to a mesh.");
        return;
    }

    let retCompound = SPoly.CreateCompound(bimConv.PolyTbl, false);
    if(retCompound.ErrorCode > 0)
    {
        ShowError("Couldn't convert the BIM to a mesh.");
        return;
    }
    
    let bimMesh = retCompound.Poly;

    let retAnalysis = bimMesh.Compare(iCloud, iUserParams.exclusionZone, 2, true, null, 0, true);
    if(retAnalysis.ErrorCode > 0)
    {
        ShowError("Couldn't perform deviation analysis.");
        return;
    }

    var inspectedCloud = retAnalysis.Cloud;

    inspectedCloud.SetName(iCloud.GetName() + "- Inspected")
    AdjustColormap(inspectedCloud, iUserParams);
    ReplaceResult([iCloud, iBIM], inspectedCloud);

    return {
        "Cloud": inspectedCloud
    }
}

/**
 * Get all the intervals of a gradient
 */
function GetIntervals(iGradient)
{
    let curIndex = 1;
    let prevPos = iGradient.GetCursorInfo(0).Position;

    let intervals = [];
    while(curIndex < iGradient.GetNbCursor())
    {
        let cursorInfos = iGradient.GetCursorInfo(curIndex);
        if(cursorInfos.ErrorCode > 0)
        {
            ShowError("Invalid gradient cursor");
            continue;
        }
        
        let curPos = cursorInfos.Position;
        intervals.push([prevPos, curPos]);

        prevPos = curPos;
        curIndex++;
    }

    return intervals;
}

/**
 * Get user mapping of classe per deviation interval
 */
function GetUserClassMapping(iCloud)
{
    // Build a user friendly list of classes
    let classList = [];
    for(var ii=0; ii<256; ii++)
    {
        let className = SCloud.GetClassName(ii).Name;
        classList.push(`${ii} - ${className}`);
    }

    // Load gradient interval values
    let gradient = iCloud.GetColorGradientAttribute("inspection").Gradient;
    let intervals = GetIntervals(gradient);

    let getParamId = (iClassIdx) => "range_" + iClassIdx;
    let getRangeDisplayName= (val1, val2) => "[" + val1.toFixed(5) + "; " + val2.toFixed(5) + "]";

    let selClassesDlg = SDialog.New("Class assignation");
    selClassesDlg.BeginGroup("Class selection");
    selClassesDlg.AddText("Select a class for each intervals.", SDialog.Instruction);

    let choiceIds = [];

    for(var ii=0; ii<intervals.length; ii++)
    {
        let curId = getParamId(ii);
        let range = intervals[ii];
        choiceIds.push(curId);

        selClassesDlg.AddChoices({
            "id": curId,
            "name": getRangeDisplayName(range[0], range[1]),
            "choices": classList,
            "style": SDialog.ChoiceRepresentationMode.ComboBox
        });
    }

    let retDialog = selClassesDlg.Run();
    if(retDialog.ErrorCode > 0)
    {
        ShowError("User cancelled.");
        return;
    }

    var classIds = [];
    for(let id of choiceIds)
        classIds.push(retDialog[id]);

    return classIds;
}

/**
 * Manual classification of the cloud according to the user mapping
 */
function ClassifiyCloud(iCloud)
{
    let classMap = GetUserClassMapping(iCloud);

    let retScalar = iCloud.ScalarSteps();
    if(retScalar.ErrorCode > 0)
    {
        ShowError("Error when exploding the cloud per inspection values");
        return;        
    }

    let subClouds = retScalar.CloudTbl;
    
    // Undefined class is always 0
    subClouds[0].SetClass(0, true);
    
    for(var ii=1; ii<subClouds.length; ii++)
    {
        let selectedClass = classMap[ii-1];
        subClouds[ii].SetClass(selectedClass, true);
    }

    var mergedCloud = SCloud.Merge(subClouds).Cloud;
    mergedCloud.SetName(iCloud.GetName());
    return {
        "Cloud": mergedCloud
    }
}

/**
 * Main
 */
function Main()
{
    PrintStep("Select a point cloud");
    let selCloud = PickPointCloud();
    if(selCloud == undefined)
        return;

    PrintStep("Select a BIM object2");
    let selBIM = PickBIM();
    if(selBIM == undefined)
        return;

    PrintStep("Script settings");
    let userParams = GetUserParameters();
    if(userParams == undefined)
        return;

    PrintStep("Perfom Scan vs BIM analysis");
    let retAnalysis = DeviationAnalysis(selCloud, selBIM, userParams);
    if(retAnalysis == undefined)
    {
        print("Analysis failed");
        return;
    }

    PrintStep("Assigning one class per clouds");
    let retClassify = ClassifiyCloud(retAnalysis.Cloud);
    if(retClassify == undefined)
        return;

    let classifiedCloud = retClassify.Cloud;
    ReplaceResult([retAnalysis.Cloud], classifiedCloud, true);
    classifiedCloud.SetCloudRepresentation("classification");

    if(userParams.exportLGSx == true)
    {
        let filePath = GetSaveFileName("Export a new LGSx file", "*.lgsx", ScriptPath());
        if(filePath.length > 0)
        {
            SCwCloud.ExportLGSx([classifiedCloud], filePath);

            let getDir = (iPath) => iPath.substring(0, iPath.lastIndexOf("\\") + 1);
            OpenUrl(getDir(filePath));
        }
    }

    ShowSuccess("Script end.");
}

Main();