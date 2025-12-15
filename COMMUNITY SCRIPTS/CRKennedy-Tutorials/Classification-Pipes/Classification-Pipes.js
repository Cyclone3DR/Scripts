// JCLEAR-NOV2025
//------------------------------------------------------------------------------------
//This script will classify a point cloud and extract only one class out of it.
//The user needs to select the cloud before launching the script.
//------------------------------------------------------------------------------------
var debug = true;
var modelName = 'Indoor Construction Site 1.3'; // the name of the classifcation model to run
var classToKeep = 'Pipe'; //the name of the class to keep

//Check that the user has selected a point cloud before launching the script
//--------------------------------------------------------------------------

var resSelect = SCloud.FromSel(); //Get all the selected SCloud.

if (resSelect.length != 1)
	throw new Error('Select one cloud before starting the script'); //stop the script

var myCloud = resSelect[0]; //get the selected cloud in the list


//Run the classification on the selected cloud
//--------------------------------------------
print('Classification started...'); //print a msg to the user

var resClassify = SCloud.Classify(	
	resSelect, //The table of clouds to classify
	modelName //The model name
	);
	
print('Classification done'); //print a msg to the user
	
if (resClassify.ErrorCode == 1)
	throw new Error('An error occurred'); //stop the script
else if (resClassify.ErrorCode == 2)
	throw new Error('An error occurred with the prerequisites'); //stop the script
else if (resClassify.ErrorCode == 3)
	throw new Error('The model does not exist'); //stop the script

if(resClassify.CloudTbl.length == 0)
	throw new Error('No cloud classified'); //stop the script

var myClassifiedCloud = resClassify.CloudTbl[0]; //get the classified cloud

if(debug)
{
	myClassifiedCloud.AddToDoc(); //add the cloud in the 3DR document
	myClassifiedCloud.SetCloudRepresentation(SCloud.CLOUD_CLASSIFICATION); //change the representation mode to Classification
}

myCloud.SetVisibility(false); //hide the original cloud

//Explode the cloud according to the classification
//-------------------------------------------------

print('Explode by class started...'); //print a msg to the user

var resExplodeByClass = myClassifiedCloud.ExplodeByClass(); //Explode a classified cloud by class.

print('Explode by class done'); //print a msg to the user

if (resExplodeByClass.ErrorCode != 0)
	throw new Error('Explode by class failed'); //stop the script

var NumberOfClouds = resExplodeByClass.CloudTbl.length;

if(NumberOfClouds == 0)
	throw new Error('No cloud exploded'); //stop the script


//Only keep the class that contains the pipes
//-------------------------------------------

for ( var iCloud=0; iCloud<NumberOfClouds; iCloud++)
{
	var theCloud = resExplodeByClass.CloudTbl[iCloud];
	var theClass = resExplodeByClass.ClassTbl[iCloud];
	
	var resClassName = SCloud.GetClassName(theClass); //get the class name for a given class index
	var currentClassName = resClassName.Name;

	if (debug)
		print('Class Name: ' + currentClassName); //print the current class name

	if(currentClassName != classToKeep)
		continue;

	theCloud.AddToDoc(); //add the cloud to the document
	theCloud.SetName('Cloud_' + currentClassName); //set a new name for the cloud
	theCloud.SetCloudRepresentation(SCloud.CLOUD_COLORED); //display in RGB
	
	iCloud = NumberOfClouds; //jump out of the loop

}

if(debug)
	myClassifiedCloud.SetVisibility(false); //hide the classified cloud