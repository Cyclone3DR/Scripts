/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// Context
// The goal of the script is to provide an easy tool to use Boolean functions. 
// The functions are: BooleanAdd, BooleanCutIn, BooleanCuOut, BooleanCommon, BooleanOperation, BooleanSub. They are used to extract volumes and surfaces that concern 2 CLOSED and INTERSECTED meshes.
// More information can be found in Cyclone 3DR help menu for scripting.

// Before launching the script, check that the meshes are CLOSED and that they intersect. The script will stop if both conditions do not happen.
// After launching the script, 
// - Do a first click to select the REFERENCE MESH. The order of selection is relevant for METHODS 3 - 4 - 5. The order of selection does not matter for METHODS 1 and 2.
// - Do a second click to select the COMPARISON MESH.
// - The script checks if the meshes are closed and if they intersect.
// - In the Dialog Box, define the method: type a number from 1 to 5.
        // Method 1 = COMMON = Mesh the volumes that are common between the REFERENCE MESH and the COMPARISON MESH.
        // Method 2 = ADDITION = Add the 2 volumes together.
        // Method 3 = SUBSTRACTION = Substract from the REFERENCE MESH the common volumes with the COMPARISON MESH. 
        // Method 4 = Cut and Keep INSIDE surfaces of REFERENCE MESH from intersection with COMPARISON MESH.
        // Method 5 = Cut and Keep OUTSIDE surfaces of REFERENCE MESH from intersection with COMPARISON MESH.
// - In the Dialog Box, define if the outputs meshes must be grouped in one unique compound or not. Yes is the default parameter. Input must be "y" or "n".
// - Validate to close the dialog box and launch the boolean operation.


/**
 * Function to detect if the 2 meshes are closed
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @returns {Boolean}
 */

function detectifClosed(iReference,iComparison)
{
    var contourRef = iReference.GetContours().ErrorCode; // return 1 if the mesh is closed
    var contourCompar = iComparison.GetContours().ErrorCode; // return 1 if the mesh is closed
    var result = ((contourRef == 1) && (contourCompar == 1));

    if (contourRef == 0) {print("Reference Mesh is not closed. Boolean operation cannot be applied.");}
    if (contourCompar == 0) {print("Comparison Mesh is not closed. Boolean operation cannot be applied.");}
    if (result) {print("The 2 input meshes are closed.");}
    return result
}

/**
 * Function to detect if the 2 meshes intersect.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @returns {Number} 0 if yes or 1 if no
 */

function detectifInterfere(iReference,iComparison)
{
    var result = iReference.Intersect(iComparison,0).ErrorCode;
    if (result == 0) { print("The 2 input meshes intersect."); }
    if (result == 1) { print("The 2 input meshes do not intersect. Boolean operation cannot be applied."); }
    return result
}

/**
 * Function Method 1 to extract common volumes from both meshes.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @param {String} iCompound y or n to create a compound of the outputs
 */

function methodCommon(iReference,iComparison,iCompound)
{   
    var iResult = iReference.BooleanCommon(iComparison).PolyTbl;
    var i = 0;
    var j = 0;
    var tempMesh = SPoly.New();
    var iVolume;
    
    if (iCompound == "y")
    {
        tempMesh = SPoly.CreateCompound(iResult,1).Poly;
        tempMesh.SetName("Compound Common " + iReference.GetName() + " " + iComparison.GetName() );
        tempMesh.SetVisibility(true);
        tempMesh.AddToDoc();
        iVolume = tempMesh.GetVolume().Volume;
        print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3."); 
    }
    else
    {
        for (i = 0; i < iResult.length; i++) 
        {
            j = i+1;
            tempMesh = iResult[i];
            tempMesh.SetName("Common "+ j + " " + iReference.GetName() + " " + iComparison.GetName() );
            tempMesh.SetVisibility(true);
            tempMesh.AddToDoc();
            iVolume = tempMesh.GetVolume().Volume;
            print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3."); 
        }
    }
}

/**
 * Function Method 2 to add volumes from both meshes.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @param {String} iCompound y or n to create a compound of the outputs
 */

function methodAdd(iReference,iComparison,iCompound)
{
    var iResult = iReference.BooleanAdd(iComparison).PolyTbl;
    var i = 0;
    var j = 0;
    var tempMesh = SPoly.New();
    var iVolume;

    if (iCompound == "y")
    {
        tempMesh = SPoly.CreateCompound(iResult,1).Poly;
        tempMesh.SetName("Compound Merged " + iReference.GetName() + " " + iComparison.GetName() );
        tempMesh.SetVisibility(true);
        tempMesh.AddToDoc();
        iVolume = tempMesh.GetVolume().Volume;
        print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3."); 
    }
    else
    {
        for (i = 0; i < iResult.length; i++)
        {
            j = i+1;
            tempMesh = iResult[i];
            tempMesh.SetName("Merged "+ j + " " + iReference.GetName() + " " + iComparison.GetName() );
            tempMesh.SetVisibility(true);
            tempMesh.AddToDoc();
            iVolume = tempMesh.GetVolume().Volume;
            print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3.") 
        }
    }
}

/**
 * Function Method 3 to substract common volumes from the reference mesh.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @param {String} iCompound y or n to create a compound of the outputs
 */

function methodSubstract(iReference,iComparison,iCompound)
{   
    var iResult = iReference.BooleanSub(iComparison).PolyTbl;
    var i = 0;
    var j = 0;
    var tempMesh = SPoly.New();
    var iVolume;

    if (iCompound == "y")
    {
        tempMesh = SPoly.CreateCompound(iResult,1).Poly;
        tempMesh.SetName("Compound Substracted " + iReference.GetName() + " " + iComparison.GetName() );
        tempMesh.SetVisibility(true);
        tempMesh.AddToDoc();
        iVolume = tempMesh.GetVolume().Volume;
        print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3."); 
    }
    else
    {
        for (i = 0; i < iResult.length; i++)
        {
            j = i+1;
            tempMesh = iResult[i];
            tempMesh.SetName("Substracted "+ j + " " + iReference.GetName());
            tempMesh.SetVisibility(true);
            tempMesh.AddToDoc();
            iVolume = tempMesh.GetVolume().Volume;
            print("Volume of " +tempMesh.GetName() + " is " + iVolume.toFixed(3) +" m3.") 
        }
    }
}

/**
 * Function Method 4 to extract "inside" surfaces from the reference mesh.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @param {String} iCompound y or n to create a compound of the outputs
 */

function methodCutIn(iReference,iComparison,iCompound)
{ 
    var iResult = iReference.BooleanCutIn(iComparison).PolyTbl;
    var i = 0;
    var j = 0;
    var tempMesh = SPoly.New();
    var iSurface;

    if (iCompound == "y")
    {
        tempMesh = SPoly.CreateCompound(iResult,1).Poly;
        tempMesh.SetName("Compound Inside " + iReference.GetName() + " " + iComparison.GetName() );
        tempMesh.SetVisibility(true);
        tempMesh.AddToDoc();
        iSurface = tempMesh.GetSurface().Surface;
        print("Surface of " +tempMesh.GetName() + " is " + iSurface.toFixed(3) +" m2."); 
    }
    else
    {
        for (i = 0; i < iResult.length; i++)
        {
            j = i+1;
            tempMesh = iResult[i];
            tempMesh.SetName("Inside "+ j + " " + iReference.GetName());
            tempMesh.SetVisibility(true);
            tempMesh.AddToDoc();
            iSurface = tempMesh.GetSurface().Surface;
            print("Surface of " +tempMesh.GetName() + " is " + iSurface.toFixed(3) +" m2.") 
        }
    }
}

/**
 * Function Method 5 to extract "outside" surfaces from the reference mesh.
 * @param {SPoly} iReference the reference mesh
 * @param {SPoly} iComparison the comparison mesh
 * @param {String} iCompound y or n to create a compound of the outputs
 */

function methodCutOut(iReference,iComparison,iCompound)
{   
    var iResult = iReference.BooleanCutOut(iComparison).PolyTbl;
    var i = 0;
    var j = 0;
    var tempMesh = SPoly.New();
    var iSurface;

    if (iCompound == "y")
    {
        tempMesh = SPoly.CreateCompound(iResult,1).Poly;
        tempMesh.SetName("Compound Outside " + iReference.GetName() + " " + iComparison.GetName() );
        tempMesh.SetVisibility(true);
        tempMesh.AddToDoc();
        iSurface = tempMesh.GetSurface().Surface;
        print("Surface of " +tempMesh.GetName() + " is " + iSurface.toFixed(3) +" m2."); 
    }
    else
    {
        for (i = 0; i < iResult.length; i++)
        {
            j = i+1;
            tempMesh = iResult[i];
            tempMesh.SetName("Outside "+ j + " " + iReference.GetName());
            tempMesh.SetVisibility(true);
            tempMesh.AddToDoc();
            iSurface = tempMesh.GetSurface().Surface;
            print("Surface of " +tempMesh.GetName() + " is " + iSurface.toFixed(3) +" m2.") 
        }
    }
}


// EXECUTION STEP 1: Selection

print("\nCheck that the input meshes are closed and that they intersect.\n\nSelect first the REFERENCE MESH.");
var meshRef = SPoly.FromClick().Poly;
print("REFERENCE MESH is "+ meshRef.GetName()+".");

print("\nThen select the COMPARISON MESH.");
var meshComparison = SPoly.FromClick().Poly;

while (meshRef == meshComparison)
{
    print("\nCOMPARISON MESH and REFERENCE MESH are the same object. Select another mesh as COMPARISON MESH");
    var meshComparison = SPoly.FromClick().Poly;
}
print("COMPARISON MESH is "+ meshComparison.GetName()+".");



if (detectifClosed(meshRef,meshComparison) && (detectifInterfere(meshRef,meshComparison) == 0))
{
    // EXECUTION STEP 2: Open and display dialog box to define the method

    var myDialog = SDialog.New("Boolean operations");
    myDialog.AddLine("List of methods\n", false, { 'align':'center','size' : 18 } );
    myDialog.AddLine("Method 1: Extract COMMON volumes.\nMethod 2: ADD volumes.\nMethod 3: SUBSTRACT common volumes from Reference Mesh.\nMethod 4: Cut and Keep INSIDE surfaces of Reference Mesh.\nMethod 5: Cut and Keep OUTSIDE surfaces of Reference Mesh.\n", false, { 'align':'left' } );
    myDialog.AddLine("Define your method (from 1 to 5) ", true, { 'align':'left' } );
    myDialog.AddLine("Create one compound from output meshes (y or n) ?", true, { 'align':'left' },"y");

    var dialogResult = myDialog.Execute();

    if ( dialogResult.ErrorCode == 0 ) 
    {
        var values = dialogResult.InputTbl;
        var myMethod = parseFloat(values[0]);
        var myCompound = values[1].toString();
        if(isNaN(myMethod))
            print("'Method' field is not a valid number.")
        else 
            print("\nMethod " + myMethod + " is applied.\n")
            meshRef.SetVisibility(false);
            meshComparison.SetVisibility(false);
    }

    // EXECUTION STEP 3: Execute method of calculation

    if (myMethod == 1) { methodCommon(meshRef,meshComparison,myCompound); }
    if (myMethod == 2) { methodAdd(meshRef,meshComparison,myCompound); }
    if (myMethod == 3) { methodSubstract(meshRef,meshComparison,myCompound); }
    if (myMethod == 4) { methodCutIn(meshRef,meshComparison,myCompound); }
    if (myMethod == 5) { methodCutOut(meshRef,meshComparison,myCompound); }
}