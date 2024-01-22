//verify user has selected lines to be evaluated
var theLines = SMultiline.FromSel();
if (theLines.length == 0)
    throw new Error('no polylines selected for evaluation');

//Ask user for ruler dimension and tolerance

var theDialog = SDialog.New('Pavement Inspection');
theDialog.AddLength({id: 'rulerLength',name: "Length of rule",value: 10, saveValue: true,readOnly: false});
theDialog.AddLength({id: 'tolerance',name: "Flatness Tolerance",value: 0.005,saveValue: true,readOnly: false});
theDialog.AddLength({id: 'increment',name: "Increment",value: 2,saveValue: true,readOnly: false});
var result = theDialog.Run();

if (result.ErrorCode == 0) { // result == 0 means the user click on the "OK" button
    // Retrieve output values
    var rulerLength = result.rulerLength;
    var flatTol = result.tolerance;
    var increment = result.increment;

    var currentInspectionLine = SMultiline.New();
    var lenghtOfCurrentInspectionline = 0;
    var currentAdjacentLine = SMultiline.New();
    var currentStartDistanceAlongLine = 0;
    var currentStartPoint = SPoint.New();
    var currentEndPoint = SPoint.New();
    var currentMidPoint = SPoint.New();
    var currentAdjacentPoint = SPoint.New();
    var currentPlane = SPlane.New();
    var upVector = SVector.New(0, 0, 1);
    var currentPoints = new Array(); //points from line above the plane
    var thePlanes = new Array();  //array of planes created from 'ruler' dimension
    var thePoints = new Array();  //array of clouds of points from lines above the plane
    var currentResultColoredPoints = new Array();


    //for each line selected 
    var redcloudArray = new Array();
    var greencloudArray = new Array();
    var bluecloudArray = new Array();
    for (var i = 0; i < theLines.length; i++) {
        currentInspectionLine = theLines[i];
        var lenghtOfCurrentInspectionLine = currentInspectionLine.GetLength();

        //make an array to throw the deviation of each point into.  
        //We will use this array to check the deviation on each point and only keep the worst deviation
        var theDeviations = new Array(currentInspectionLine.GetNumber());  //array with enough elements to store a deviation for each point in the line
        for (var j = 0; j < theDeviations.length; j++) {
            theDeviations[j] = 0;
        }

        //make an array of points to hold the worst deviation point 
        var theInspectedPoints = new Array();

        //initialize the array by reading in the points from this line
        for (var k = 0; k < currentInspectionLine.GetNumber(); k++) {
            theInspectedPoints.push(currentInspectionLine.GetPoint(k));
        }

        //grab a neighbor line so we can build our plane	
        if (i != (theLines.length - 1)) {
            currentAdjacentLine = theLines[i + 1];
        } else {
            currentAdjacentLine = theLines[i - 1];
        }


        //process each line along it's length

        while (currentStartDistanceAlongLine < lenghtOfCurrentInspectionLine - rulerLength) {

            var res = currentInspectionLine.GetPointAtDistance(currentStartDistanceAlongLine, true);
            if (res.ErrorCode == 1) {  //lines is shorter than distance
                continue;
            }
            var currentStartPoint = res.Point;

            res = currentInspectionLine.GetPointAtDistance(currentStartDistanceAlongLine + rulerLength, true);
            if (res.ErrorCode == 1) {  //lines is shorter than distance
                continue;
            }
            var currentEndPoint = res.Point;

            res = currentInspectionLine.GetPointAtDistance(currentStartDistanceAlongLine + (rulerLength / 2), true);
            if (res.ErrorCode == 1) {  //lines is shorter than distance
                continue;
            }
            var currentMidPoint = res.Point;

            currentAdjacentPoint = currentAdjacentLine.Proj3D(currentMidPoint).Point;
            currentPlane = SPlane.New(currentStartPoint, currentAdjacentPoint, currentEndPoint);

            //uncomment the following line to see all of the plane created
            //currentPlane.AddToDoc();

            var theResult = SVector.Dot(upVector, currentPlane.GetNormal());
            //if the plane is pointing down swap it's vector
            if (theResult < 0)
                currentPlane.Invert();
            //currentPlane.AddToDoc();
            thePlanes.push(currentPlane);  //add the plane to the planes array

            //read in the points above the plane for comparison
            var pointsToCompareToThePlane = readPointsAbovePlane(currentInspectionLine, currentStartDistanceAlongLine, currentStartDistanceAlongLine + rulerLength, currentPlane);

            currentStartDistanceAlongLine += increment;
        }

        //evaluate the points against the tolerance and put them into the correct cloud container
        var cloudStruct = evaluateDeviationsSortPoints(theDeviations, theInspectedPoints, flatTol);
        redcloudArray.push(cloudStruct.RedCloud);
        greencloudArray.push(cloudStruct.GreenCloud);
        bluecloudArray.push(cloudStruct.BlueCloud);

        //start at the beginning of the next line
        currentStartDistanceAlongLine = 0;

    }

    var mergeRed = SCloud.Merge(redcloudArray);
    var mergeGreen = SCloud.Merge(greencloudArray);
    var mergeBlue = SCloud.Merge(bluecloudArray);

    var allRedCloud = mergeRed.Cloud;
    allRedCloud.SetName('Red');
    allRedCloud.SetColors(1, 0, 0);
    allRedCloud.SetCloudRepresentation(SCloud.CLOUD_FLAT);
    allRedCloud.AddToDoc();
    var allGreenCloud = mergeGreen.Cloud;
    allGreenCloud.SetName('Green');
    allGreenCloud.SetColors(0, 1, 0);
    allGreenCloud.SetCloudRepresentation(SCloud.CLOUD_FLAT);
    allGreenCloud.AddToDoc();
    var allBlueCloud = mergeBlue.Cloud;
    allBlueCloud.SetName('Blue');
    allBlueCloud.SetColors(0, 0, 1);
    allBlueCloud.SetCloudRepresentation(SCloud.CLOUD_FLAT);
    allBlueCloud.AddToDoc();
}

//now that we have an array of planes and an array of clouds of points above the planes we will evaluate the points against the flatness tolearance.


//this function iterates the points in the line and the planes (ruler) as it moved down the line and keeps only the wost deviation point for each point on the line
//this function updates the global arrays;  theDeviations and theInspectedPoints
function readPointsAbovePlane(multilineToRead, startDist, endDist, planeToCompareTo) {
    var lengthAlongLine = 0;
    var thisPoint = SPoint.New();

    for (var l = 0; l < multilineToRead.GetNumber(); l++) {
        //read a point from the line
        thisPoint = multilineToRead.GetPoint(l);


        if (lengthAlongLine >= startDist && lengthAlongLine <= endDist) {

            //compare this point to the currentPlane
            var devToPlane = planeToCompareTo.Distance(thisPoint)


            //see if it is the worst deviation for that point so far
            if (Math.abs(devToPlane) >= Math.abs(theDeviations[l])) {

                theDeviations[l] = devToPlane;
                theInspectedPoints[l] = thisPoint;
            }


        }


        if (l != 0) {
            lengthAlongLine += thisPoint.Distance(multilineToRead.GetPoint(l - 1));
        }


        if (lengthAlongLine >= endDist) {  // no need to continue looping if at end dist.

            return;
        }
    }
}

// this function creates three clouds of points to add to the document; red, green, blue
function evaluateDeviationsSortPoints(deviations, points, tolerance) {

    var redCloud = SCloud.New();
    var greenCloud = SCloud.New();
    var blueCloud = SCloud.New();


    for (var m = 0; m < deviations.length; m++) {

        if (deviations[m] > tolerance) {
            redCloud.AddPoint(points[m]);
        }
        else if (deviations[m] < (tolerance * -1)) {
            blueCloud.AddPoint(points[m]);
        }
        else {
            greenCloud.AddPoint(points[m]);
        }

    }

    return { 'RedCloud': redCloud, 'GreenCloud': greenCloud, 'BlueCloud': blueCloud };

}