// JCLEAR-NOV2025
//------------------------------------------------------------------------------------
//This script will colour a mesh along the Z direction.
//The user will be prompted to click on the mesh at the launch of the script.
//------------------------------------------------------------------------------------


//Inform the user
print("Select the mesh to colour");

//Ask the user to click on a mesh in the scene
var resClick = SPoly.FromClick();

//Check the selection
if(resClick.ErrorCode != 0)
	throw new Error ("Nothing is selected");

//Get the selected mesh
var myMesh = resClick.Poly;

//Colour the mesh along the elevation
//-----------------------------------

//defining the direction as the Z vector
var myVector = SVector(0, 0, 1);

//colour the mesh
var resColour = SPoly.ColorAlongDir(
	[myMesh],	//(Array<SPoly>) The table of SPoly to color
	myVector	//(SVector) The direction used for coloring
	);

//Check the result
if(resColour.ErrorCode != 0)
	throw new Error ("Colouring failed");

//Get the coloured mesh
var myColouredMesh = resColour.PolyTbl[0];

//Add the mesh into the document
myColouredMesh.AddToDoc();

//Hide the selected mesh
myMesh.SetVisibility(false);

//Rename the coloured mesh
myColouredMesh.SetName(myMesh.GetName()+"-Elevation");	

	

