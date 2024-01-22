

//be sure the user has selected a mesh and a polyline  ++++++++++++++++++++++++++
var testForMesh = SPoly.FromSel()

if (testForMesh.length != 1)
    throw new Error('No mesh selected.\nSelect a mesh and run the script again!');

var testForOnePoly = SMultiline.FromSel();

if ((testForOnePoly.length == 0) || (testForOnePoly.length > 1))
    throw new Error('No polyline selected, or more than one polyline selected.\nSelect one  polyline and run the script again!');



//Enter the number of offsets required and the height at which the radials are to be created
var theDialog = SDialog.New('Pavement Inspection');
theDialog.AddInt({id: 'nbOfOffsets',name: "Number of offsets needed",value: 8,saveValue: true,readOnly: false,min: 0});
theDialog.AddLength({id: 'offset',name: "Offset increment",value: 2,saveValue: true,readOnly: false,});

var result = theDialog.Run();

if (result.ErrorCode == 0) { // result == 0 means the user click on the "OK" button
    //if there is no data entered for the radial height, wait while we ask the user to click a point

    var numberOfOffsets = result.nbOfOffsets;
    var offsetIncrement = result.offset;

    //Offset the polyline as many times as needed on each side of the line
    createLines(testForMesh[0], testForOnePoly, numberOfOffsets, offsetIncrement);
}




//function to offset polylines outboard in Z view
function createLines(thePoly, thePolyline, howMany, howFar) {

    var theView = SVector.New(0, 0, 1);
    print('click a point on the side of the line where the offsets are needed');

    var aSide = SMultiline.SAME_SIDE;
    var step = howFar;
    var aPoint = SPoint.FromClick();
    if (aPoint.ErrorCode != 0)
        throw new Error('no point selected on mesh');

    for (var i = 0; i < howMany; i++) {

        var resultLine = thePolyline[0].Offset(theView, howFar, aSide, aPoint.Point);
        //Check for errors
        if (resultLine.ErrorCode != 0)
            throw new Error('Offsetting centerline failed.');

        var projResult = thePoly.ProjDir(resultLine.Multi, theView, true, false);
        if (projResult.ErrorCode == 2)
            throw new Error('projection of line onto mesh failed');

        //no errors add the offset line

        for (var j = 0; j < projResult.MultiTbl.length; j++) {
            var theLineToAdd = projResult.MultiTbl[j];
            theLineToAdd.AddArrows(1, 1);
            theLineToAdd.AddToDoc();
        }

        //resultLine.Multi.AddToDoc();
        howFar += step;
    }
}