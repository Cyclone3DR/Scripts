// Select a mesh and colour it according to the elevation
//-------------------------------------------------------

print("Select the mesh to colour"); //inform the user

//Start the command for the user to click on a mesh
var resClick = SPoly.FromClick();

//Check the selection
if (resClick.ErrorCode != 0)
	throw new Error ("Nothing is selected.");

//get the cloud the user has clicked on
var myMesh = resClick.Poly; 

//Colour the mesh along elevation
//-------------------------------

//define the direction
var myVector = SVector(0,0,1); //to colour according to elevation, the vector to use is Z

var resColour = SPoly.ColorAlongDir(
	[myMesh],	//(Array<SPoly>) The table of SPoly to color
	myVector);	//(SVector) The direction used for coloring
	
//Check the result
if (resColour.ErrorCode != 0)
	throw new Error ("Colouring failed");

//get the coloured mesh
var myColouredMesh = resColour.PolyTbl[0];

//add the mesh to the document
myColouredMesh.AddToDoc();

//hide the original mesh
myMesh.SetVisibility(false);

//name the colouredmesh
myColouredMesh.SetName(myMesh.GetName()+"-Elevation");

//display it in inspection mode
myColouredMesh.SetPolyRepresentation(SPoly.POLY_INSPECTION);