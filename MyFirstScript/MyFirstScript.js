/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// The goal of the script is to learn how to get started on scripting with Cyclone 3DR.
// To get started, it is recommended to go through the script step by step.

// Step 1: Open a file
// Step 2: Select a point cloud
// Step 3: Create a mesh
// Step 4: Create a dialog box with user inputs to customize the mesh
// Step 5: Extract planar sections along the vertical direction
// Step 6: Launch an inspection
// Step 7: Extract a geometry and a label
// Step 8: Texture and export a mesh in OBJ format

/**
 * Helper function to show an error message and throw an error that will stop the script
 * @param {string} iMessage the message to display
 */
function ErrorMessage(iMessage) {
    SDialog.Message(iMessage,SDialog.EMessageSeverity.Error,"Error");
    throw new Error(iMessage);
}


/**
 * Function 1 to load and display all the clouds from a 3DR file
 * @param {String} iName path and name of the 3DR file
 */

function openMyproject(iName) {
    var isOpen = OpenDoc(iName, true, true).ErrorCode; // 3DR document is cleared and the defined 3DR project is opened 

    if (isOpen == 1) {
        ErrorMessage("An error occurred. Impossible to open the 3DR file."); // print an error message if no success
    }
    else {
        print("Your project " + iName + " has been opened."); // throw a message to inform the opening of the file
    }
}

/**
 * Function 2 to select a point cloud
 * @returns {SCloud} 
 */

function clickCloud() {
    print("\nSelect a point cloud."); // Instruction
    var selectedCloud = SCloud.FromClick(); // Click to select a point cloud in the scene

    if (selectedCloud.ErrorCode != 0) {
        ErrorMessage("An error occurred. No cloud has been selected."); // print an error message if no success
    }
    else {
        print("Point Cloud " + selectedCloud.Cloud.GetName() + " has been selected for meshing."); // print the name of the cloud
    }
    return selectedCloud.Cloud;
}

/**
 * Function 3 to create a basic 3D Mesh from a point cloud
 * @param {SCloud} iCloud cloud that is meshed
 * @returns {SPoly} the mesh created from the input point cloud
 */

function createsimpleMesh(iCloud) {
    // Definition of the 3D MESH basic parameters: used by the function
    var newMesh = SPoly.New(); // creation of new object 
    var deviationError = 0; // deviation error. 0 means that deviation error is not used
    var miniaverageDist = 0.05; // average distance between points in current distance unit
    var meshHoles = SPoly.ALL_CLOSED; // all the detected holes are closed in this case
    var sizeHoles = miniaverageDist * 3; // size of the holes in current distance unit

    var iResult = SPoly.Direct3DMesh(iCloud, deviationError, miniaverageDist, meshHoles, sizeHoles); // basic 3D MESH function

    if (iResult.ErrorCode == 0) {
        newMesh = iResult.Poly;
        iCloud.SetVisibility(false); // input cloud is hidden   
        newMesh.AddToDoc(); // necessary step to add the mesh from the script into the project (displayed by default)
        print("\nThe mesh is created.");
        return newMesh; // the mesh is returned as the output 
    }
    else {
        ErrorMessage("An error occurred. No mesh was created.");
    }

}

/**
 * Function 4 to create a dialog box and enter user parameter to adjust the rendering of the mesh (name, color and transparency)
 * @param {SPoly} iMesh mesh that will be changed
 */

function customizeMesh(iMesh) {
    var myDialog = SDialog.New("Customize your mesh");
    myDialog.AddText("Parameters of the mesh: ",SDialog.EMessageSeverity.Instruction);
    myDialog.AddTextField({id: "name",name: "Mesh name",
    tooltip: "Set the name of the created mesh",value: "MyNewMesh",saveValue: true, readOnly: false,canBeEmpty: false});
    myDialog.AddChoices({id: "color",name: "Mesh color:",choices: ["Red","Green", "Blue"],tooltip: "Choose the color of the created mesh",value: 0,saveValue: true,readOnly: false,style: SDialog.ChoiceRepresentationMode.RadioButtons});
    myDialog.AddInt({id: "opacity",name: "Opacity (%)",tooltip: "Set the mesh opacity",value: 100,saveValue: true,readOnly: false,min: 0,max: 100});

    var dialogResult = myDialog.Run();

    if (dialogResult.ErrorCode == 0) {
        iMesh.SetName(dialogResult.name);

        if(dialogResult.color==0)iMesh.SetColors(1, 0, 0);
        else if (dialogResult.color==1)iMesh.SetColors(0, 1, 0);
        else if (dialogResult.color==2)iMesh.SetColors(0, 0, 1);

        iMesh.SetTransparency(Math.round(dialogResult.opacity * 255 / 100));
    }
}

/**
 * Function 5 to create planar sections of the mesh along the vertical axis of the current UCS
 * @param {SPoly} iMesh input mesh for the planar sections
 * @returns {SMultiline[]} the set of multiline created
 */

function extractsectionsalongZ(iMesh) {

    var myDialog = SDialog.New("Extract planar sections along Z");
    myDialog.AddLength({id: 'steplength',name: "Length of the step",value: 1,saveValue: true,  readOnly: false});
    var dialogResult = myDialog.Run();

    if (dialogResult.ErrorCode == 0) 
        var iStep = dialogResult.steplength; // get distance for step

    var iPoint = iMesh.GetBoundingBox().LowPoint; // get lowest point of the mesh
    var iVector = SVector.New(0, 0, 1); // vertical direction is defined
    var sectionResult = iMesh.SectionPlane(iVector, iPoint, -1, iStep); // function for planar section

    if (sectionResult.ErrorCode == 1) {
        ErrorMessage("An error occurred during the extraction of planar sections.");
    }
    else {
        var i = 0;
        for (i = 0; i < sectionResult.MultiTbl.length; i++) {
            var temp = sectionResult.MultiTbl[i];
            temp.SetName("Section " + i);
            temp.AddToDoc();
        }
        print("\nPlanar sections are extracted.");
        return sectionResult.MultiTbl;
    }
}

/**
 * Function 6 to do a basic cloud vs mesh inspection
 * @param {SPoly} iMesh input mesh
 * @param {SCloud} iCloud input cloud
 * @returns {SPoly} the mesh with inspection
 */

function basicInspection(iMesh, iCloud) {
    var maxDist = 1; // max distance of the inspection
    var iInspection = iMesh.Compare(iCloud, maxDist, 1, true, null, 90, true); // Mesh with inspection

    if (iInspection.ErrorCode == 1) {
        ErrorMessage("An error occurred during the inspection.");
    }
    else {
        var inspectedMesh = iInspection.Poly;
        inspectedMesh.AddToDoc();
        inspectedMesh.SetName("Inspected " + iMesh.GetName());
        iMesh.SetVisibility(false); // to hide the original mesh
        print("\nInspection succeeded.");
        return inspectedMesh;
    }
}


/**
 * Function 7 to extract the best plane and a label from a point cloud
 * @param {SCloud} iCloud input cloud
 * @returns {SPlane} the best plane
 */

function bestPlane(iCloud) {
    // Define the parameters of the Best Plane Extraction
    var eliminatePoints = iCloud.GetNumber() * 0.1; // 10% of the points are not considered to extract the best plane
    var force = SCloud.PLANE_FORCE_NOTHING; // no forced constraint
    var result = iCloud.BestPlane(Math.round(eliminatePoints), force); // computation of a basic best plane

    if (result.ErrorCode == 0) {
        // Plane is added in the document
        var myPlane = result.Plane;
        myPlane.SetName(iCloud.GetName() + " Best Plane");
        myPlane.AddToDoc();
        print("\nExtraction of Best Plane of " + iCloud.GetName() + " succeeded.");

        // 2nd step of the function to create a label with the surface and normal direction of the plane
        var planeSurface = myPlane.GetSurface(); // surface of the best plane
        var planeNormal = myPlane.GetNormal(); // normal of the best plane
        var planePoint = myPlane.GetCenter(); // center of the best plane

        var iLabel = SLabel.New(4, 1); // creation of a label
        iLabel.SetColType([SLabel.Measure]); // column that contains measures
        iLabel.SetLineType([SLabel.Surface, SLabel.NormalX, SLabel.NormalY, SLabel.NormalZ,]); // lines are surface and directions of the normal vector
        iLabel.SetCol(0, [planeSurface, planeNormal.GetX(), planeNormal.GetY(), planeNormal.GetZ()]);
        iLabel.AttachToPoint(planePoint); // label is attached to the center of the best plane
        iLabel.AddToDoc();

        return myPlane;
    }
    else {
        ErrorMessage("An error occurred. No best plane was extracted.");
    }
}

/**
 * Function 8 to convert the color of a mesh in texture and to export it in an OBJ format
 * @param {SPoly} iMesh input mesh
 * @param {String} iPath path to save the OBJ file
 */

function colorandexportinObj(iMesh, iPath) {
    // texture the mesh from its current representation colors
    var iConvertResult = STexturingUtil.ConvertColorToTexture(iMesh, 32, true);
    if (iConvertResult.ErrorCode != 0) {
        ErrorMessage("Converting color to textured mesh failed.");
    }

    // export to OBJ
    var filePath = iPath + "//" + iMesh.GetName() + ".obj";
    var iMatrix = SMatrix.FromActiveCS();
    var iResult = iMesh.Save(filePath, false, iMatrix);

    if (iResult.ErrorCode == 0) {
        print("\nThe export of the object " + iMesh.GetName() + " succeeded.");
    }
    else {
        ErrorMessage("The export of the object " + iMesh.GetName() + " failed.");
    }
}

// EXECUTION OF THE FULL SCRIPT

// Step 1: open an existing 3DR file
var myfileName = GetOpenFileName("Select the file to open", "3DR files (*.3dr)", "C://"); // Define the path and the name of your file
if (myfileName.length == 0) {
    ErrorMessage("Operation canceled");
}
openMyproject(myfileName);

// Step 2: click a cloud in the scene to launch the workflow
var myCloud = clickCloud();

// Step 3: create a basic mesh from the selected point cloud
var myMesh = createsimpleMesh(myCloud);

// Step 4: customize the mesh from user parameters
customizeMesh(myMesh);

// Step 5: extract planar sections along Z - step is defined by user
var mySections = extractsectionsalongZ(myMesh);

// Step 6: compare the selected point cloud to the created mesh 
var myInspection = basicInspection(myMesh, myCloud);

// Step 7 create a best plane and a label from selected point cloud
var myPlane = bestPlane(myCloud);

// Step 8:
var exportPath = GetOpenFolder("Select folder to save the mesh to OBJ", "C:/"); // define the path of the folder to store the saved OBJ file
if (exportPath.length == 0) {
    ErrorMessage("Operation canceled");
}
colorandexportinObj(myInspection, exportPath); // the inspected mesh is chosen to texture the mesh with the inspection results and to export it in OBJ