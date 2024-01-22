// ------------------------ HOW TO USE IT --------------------------------------------
// 1. Select the cloud(s) that must be used to generate the mesh. Be sure that they are cleaned and aligned is necessary.
// 2. Run one the 3 modes for choosing the meshing strategy: precise, normal, fast. 
//    For each mode, the workflow is: 
//        1) make a 3dmesh, 
//        2) reduce the mesh with deviation to reduce the triangle density in flat areas, 
//        3) refine the mesh using the input cloud(s)
// NOTE:
// by default all values are in MM, however you can adjust them using the scaleFactor parameter.
// NOTE:
// the general workflow is inside MeshWizard_General.js file. If you need more information regarding parameters, just open this file.

Include(CurrentScriptPath() + "/MeshWizard_General.js");

//select all the point clouds and run the script
var inputs = SCloud.FromSel();
if (inputs.length == 0) 
{
    SDialog.Message("No Input",SDialog.EMessageSeverity.Error,"Error");
    throw new Error("No Input");
}

//compute the scale if unit is not MM
//adjust parameter depending of the unit in the document (by default, parameter are define for MM)
var scaleFactor = 1.0 / GetScaleFactor().Value;

//main
var output = generateMeshWizard(inputs, 2, scaleFactor);

//treeview management
var outputName = inputs[0].GetName();
var nbPointsOfMainInput = inputs[0].GetNumber();
for (var iinputs = 0; iinputs < inputs.length; iinputs++) {
    inputs[iinputs].SetVisibility(false);
    if (inputs[iinputs].GetNumber() > nbPointsOfMainInput) {
        outputName = inputs[iinputs].GetName();
        nbPointsOfMainInput = inputs[iinputs].GetNumber();
    }
}

//add the result
output.SetName(outputName);
output.AddToDoc();