// This script will create points at a given radius around a mesh 
// This script is useful for creating inspection points on a tank floor to inspect settlement
// The origin of the tanks coordinate system is assumed to be on the bottom of the tank in the center of the tank
// Note: If a Local Coordinate system is active, the transformation will not be applied and the projection will fail.

//Revision History
//	4/1/2016 - changed scripto work with 2016 version
//	4/25/2016 - changed script to rotate clockwise


//Enter the number of radials required and the height at which the radials are to be created
var theDialog = SDialog.New('Settlement Points');
theDialog.AddLine("Enter the radius and number of points", false);
theDialog.AddLine("Radius", true);
theDialog.AddLine("Number of points", true);   
        
    
var result = theDialog.Execute();
if (result.ErrorCode == 0) { // result == 0 means the user click on the "OK" button
    // Retrieve output values
    var values = result.InputTbl; // InputTbl contains all the content of the input box
    var radius = parseFloat(values[0]);  //use parseFloat() to return a floating point number from the string
    //if there is no value entered for the radius, wait while we ask the user to click a point to define it
    if (isNaN(radius)) {
        var clickedPoint = GetRadiusByClick();
        //printP(clickedPoint);
        zeroPoint = SPoint.New(0, 0, 0);
        radius = Calculate3DDistance(zeroPoint, clickedPoint);//figure out the radius clicked.
        radius = radius.toFixed(3); //we don't need 12 decimal places here
    }
    var numberOfPoints = parseFloat(values[1]);
}

//be sure the victim has selected a mesh
var testForMesh = SPoly.FromSel()

if (testForMesh.length != 1) {
    throw new Error('No mesh selected.  Select a mesh and run the script again');
}
var theMesh = testForMesh[0]; //mesh is there, grab it

var initialPoint = SPoint.New(radius, 0, 0 ); //set up first point to project
var angleBetweenRadials = 360 / numberOfPoints;


//start the string that will be output as .CSV
var outputString = numberOfPoints + ' points on the tank bottom at ' + radius + ' radius ' + angleBetweenRadials + ' degrees apart' + '\n';

var projectionDirection = SVector.New(0, 0, 1) //ponits projected onto mesh in Z

//make a folder to put the points in
var folderName = 'Geometric Group' + '/' + 'Drop points for settlement inspection';

for (i = 0; i < numberOfPoints; i++) {  //project each point to the mesh
  
    var result = theMesh.ProjDir(initialPoint, projectionDirection, false);  //project point to the mesh in Z direction
    switch (result.ErrorCode) {
        case 0:
            var thePoint = result.Point;
            thePoint.AddToDoc();
            var count = i + 1;
            thePoint.SetName('Radial ' + count);
            thePoint.MoveToGroup(folderName, false);
            
            // write the point out
            outputString += thePoint.GetName() + ',' + thePoint.GetX().toString() + ',' + thePoint.GetY().toString() + ',' + thePoint.GetZ().toString() + '\n';

            break;
        case 1:
            //throw new Error('no projection found');
            break;
        case 2:
            throw new Error('an error occured');
            break;
        }
   
    //calculate the next point
    RotatePointAroundZ(initialPoint, angleBetweenRadials);

    
}

WriteDataToFile(outputString);


function RotatePointAroundZ(pointToRotate, rotationAmountInDegrees) {

    var rotationAxisPoint = SPoint.New(0, 0, 0);//this function rorates around the origin
    var rotationAxisVector = SVector.New(0, 0,-1);//this funciton rotates around Z clockwise
    var theMatrix = SMatrix.New(rotationAxisPoint, rotationAxisVector, rotationAmountInDegrees, SMatrix.DEGREE);

    return pointToRotate.ApplyTransformation(theMatrix);

}
 
  
function WriteDataToFile(stringToWrite) {

    // get the file path from user
    var fileName = GetSaveFileName( "Save file", "Text files (*.csv)");

    // open the file
    var file = SFile.New(fileName);
    //var openMode = QIODevice.OpenMode(QIODevice.WriteOnly, QIODevice.Text, QIODevice.Truncate);
    if (!file.Open( SFile.WriteOnly ))
        throw new Error('Failed to write file:' + fileName); // test if we can open the file

    // write data inside the file
    file.Write(stringToWrite);

    // Close the file
    file.Close();

    return;

}


function GetRadiusByClick() {
    print("Click a point at the radius you'd like the dropped radial points to be:");
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


function Calculate3DDistance(firstPoint, secondPoint) {

    var deltaXSquared = Math.pow(Math.abs(firstPoint.GetX() - secondPoint.GetX()), 2);
    var deltaYSquared = Math.pow(Math.abs(firstPoint.GetY() - secondPoint.GetY()), 2);
    var deltaZSquared = Math.pow(Math.abs(firstPoint.GetZ() - secondPoint.GetZ()), 2);

    var sumSquares = deltaXSquared + deltaYSquared + deltaZSquared;
    var tst = Math.sqrt(sumSquares);
    return Math.sqrt(sumSquares);
}