// JCLEAR-NOV2025
//------------------------------------------------------------------------------------
//This script will compare a point cloud to a mesh, both selected by the user when prompted by the script.
//The colour gradient resulting from the inspection will be modified to have 5 regular steps.
//------------------------------------------------------------------

var distMax = 0.1;//Ignore point having a distance greater than distMax.
var nbCursors = 6; //6 cursors to get 5 colours in the gradient

//Ask the user to click on the mesh
//-----------------------------------

//Inform the user
print("Select the mesh to use as a reference");

//Ask the user to click on the mesh
var resClick1 = SPoly.FromClick();

//Check the selection
if(resClick1.ErrorCode != 0)
	throw new Error ("No mesh is selected");

//Get the selected mesh
var myMesh = resClick1.Poly;

//Hide the mesh
myMesh.SetVisibility(false); 


//Ask the user to click on the point cloud
//-----------------------------------------

//Inform the user
print("Select the point cloud to compare to the mesh");

//Ask the user to click on the cloud
var resClick2 = SCloud.FromClick();

//Check the selection
if(resClick2.ErrorCode != 0)
	throw new Error ("No cloud is selected");

//Get the selected cloud
var myCloud = resClick2.Cloud;

//Hide de the cloud
myCloud.SetVisibility(false); 


//Compare the point cloud to the mesh
//-----------------------------------

var resCompare = myMesh.Compare(	
	myCloud, 	//SCloud considered as the measured object to project on this
	distMax, 	//	(number) Ignore point having a distance greater than distMax.
	2 			//number mappingObject = 1,Choose the object to color.
	);

//Check the result
if(resCompare.ErrorCode != 0)
	throw new Error ("The comparison failed");

//Get the inspected cloud
var myComparedCloud = resCompare.Cloud;

//Add this cloud to the document
myComparedCloud.AddToDoc();

//Change the name of the cloud
myComparedCloud.SetName(myCloud.GetName()+"-"+myMesh.GetName()+"-Comparison");

//Modify the colour scale
//-----------------------------------

//Get the colour scale
var resGetColor = myComparedCloud.GetColorGradient();

//Check the result
if(resGetColor.ErrorCode != 0)
	throw new Error ("Problem with the colour scale");

var myGradient = resGetColor.Gradient; //The SColorGradient associated to the current SCloud

//Set the number of cursors
var resSetNbCursors = myGradient.SetNbCursor(nbCursors);

//Check the result
if(resSetNbCursors.ErrorCode != 0)
	throw new Error ("Setting the number of cursors failed");