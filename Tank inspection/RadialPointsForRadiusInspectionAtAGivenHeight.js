// This script will project points onto the wall of a tank at angular increments so that radial distance measurements can be taken.
// This scrip is useful for creating radial measurements at a given height on a tank
// The origin of the tanks coordinate system is assumed to be on the bottom of the tank in the center of the tank
// Note: If a Local Coordinate system is active, the transformation will not be applied and the projection will fail.
// Note: if the projection fails for given point (there is no mesh where the point is projected)
// then the scrip will place a point on the opposite wall of the tank and you'll end up with two points. 

//Revision History
// 	4/1/2016 - updated to work with 2016 version
//	4/25/2016 - changed script to start at X+ instead of X- and changed rotation to go clockwise instead of counterclockwise

//be sure the victim has selected a mesh
var testForMesh = SPoly.FromSel()

if (testForMesh.length != 1)
{
    SDialog.Message('No mesh selected.  Select a mesh and run the script again',SDialog.EMessageSeverity.Error,'Error');
    throw new Error('No mesh selected.  Select a mesh and run the script again');
}
var theMesh = testForMesh[0] //mesh is there, grab it


//Enter the number of radials required and the height at which the radials are to be created
var theDialog = SDialog.New('Radials');
theDialog.AddText("Enter the height for the radials",SDialog.EMessageSeverity.Instruction);
theDialog.AddFloat({id: "Z_Height",name: "Z Height", saveValue: true,readOnly: false});
theDialog.AddInt({id: "Number_of_radials",name: "Number of radials",saveValue: true,readOnly: false});
var resultExec = theDialog.Run();

if (resultExec.ErrorCode == 0){ // resultExec == 0 means the user click on the "OK" button
    // Retrieve output values
    var radialHeight = resultExec.Z_Height;
    var numberOfRadials = resultExec.Number_of_radials;
}

var originPoint = SPoint.New(0, 0, radialHeight); //create an origin point for the radials and add it to the doc.
originPoint.AddToDoc();
originPoint.SetName('Z ' + radialHeight.toString() + ' center point')

//make a folder to put the points in
var folderName = 'Geometric Group' + '/' + 'Z-' + radialHeight;
originPoint.MoveToGroup(folderName, false);

//we have to make the initialDirection -1 because for some reason, on round meshes, the point returned is always at the -X 
var initialDirection = SVector.New(-1, 0, 0);  //Radials always start from X+
var angleBetweenRadials = 360 / numberOfRadials;


//start the string that will be output as .CSV
var outputString = 'Z ' + radialHeight + ' Radials ' + 'at ' + angleBetweenRadials + ' degree increments \n';
outputString += originPoint.GetName() + ',' + originPoint.GetX().toString() + ',' + originPoint.GetY().toString() + ',' + originPoint.GetZ().toString() + '\n';

for (var i = 0; i < numberOfRadials; i++) {  //project a point at each angle 
    var result = theMesh.ProjDir(originPoint, initialDirection, true); 
    switch (result.ErrorCode) 
    {
        case 0:
            var thePoint = result.Point;
            thePoint.AddToDoc();
            var count = i + 1
            thePoint.SetName('Radial ' + count);
            var distance = Calculate3DDistance(originPoint, thePoint);
            thePoint.MoveToGroup(folderName,false)
            // write the point out
            outputString += thePoint.GetName() + ',' + thePoint.GetX().toString() + ',' + thePoint.GetY().toString() + ',' + thePoint.GetZ().toString() + ',' + distance + '\n';

            break;
        case 1:
            SDialog.Message('No projection found',SDialog.EMessageSeverity.Error,'Error');
            throw new Error('No projection found');
            break;
        case 2:
            SDialog.Message('An error occured',SDialog.EMessageSeverity.Error,'Error');
            throw new Error('An error occured');
            break;
    }
    
    //rotate the vector
    RotateVectorAroundZ(initialDirection, angleBetweenRadials);
}

WriteDataToFile(outputString);




function RotateVectorAroundZ (vectorToRotate, rotationAmountInDegrees){
    //set up the rotation matrix
    var rotationAxisVector =  SVector.New(0,0,-1);//this funciton rotates around Z in the clockwise direction
    var rotationAxisPoint = SPoint.New(0,0,0);//this function rorates around the origin
    var theMatrix = SMatrix.New(rotationAxisPoint, rotationAxisVector, rotationAmountInDegrees, SMatrix.DEGREE);
    vectorToRotate.ApplyTransformation(theMatrix);

    return vectorToRotate; 
}


function Calculate3DDistance(firstPoint, secondPoint) {

    var deltaXSquared = Math.pow(Math.abs(firstPoint.GetX() - secondPoint.GetX()), 2);
    var deltaYSquared = Math.pow(Math.abs(firstPoint.GetY() - secondPoint.GetY()), 2);
    var deltaZSquared = Math.pow(Math.abs(firstPoint.GetZ() - secondPoint.GetZ()), 2);

    var sumSquares = deltaXSquared + deltaYSquared + deltaZSquared;
    var tst = Math.sqrt(sumSquares);
    return Math.sqrt(sumSquares);
}


function WriteDataToFile(stringToWrite) {
   
    // get the file path from user
    var fileName = GetSaveFileName( "Save file", "Text files (*.csv)");

    // open the file
    var file = SFile.New(fileName);
    if (!file.Open( SFile.WriteOnly ))
    {
        SDialog.Message('Failed to write file:' + fileName,SDialog.EMessageSeverity.Error,'Error');
        throw new Error('Failed to write file:' + fileName); // test if we can open the file
    }

    // write data inside the file
    file.Write(stringToWrite);

    // Close the file
    file.Close();

    return;
}
  
function printP(point) {
    print("x:" + point.GetX() + " y:" + point.GetY() + " z:" + point.GetZ());
}

function GetZHeightByClick() {
    print("Click a point at the height you'd like the radial points to be:");
    // wait while the user select something
    while (true) {
        var res = SPoint.FromClick();
        switch (res.ErrorCode) {
            case 0: // an scomp is selected  => ok break the loop
                return res.Point;
                break;
            case 1: // nothing is selected => continue
                break;
            case 2: // escape key has been pressed
                throw new Error("The user stopped the script.");
                break;
        }
    }
}