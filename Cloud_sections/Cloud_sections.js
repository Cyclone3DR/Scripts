//This script is suitable to cut a cloud into slices according to planar polylines
//Select one cloud to segment and all polylines
var clouds = SCloud.FromSel();
var myPolylines = SMultiline.FromSel();

if(clouds.length==0)
{
    SDialog.Message("One cloud should be selected",SDialog.EMessageSeverity.Error,"Error");
}
else if(clouds.length>1)
{
    SDialog.Message("Only one cloud should be selected",SDialog.EMessageSeverity.Error,"Error");
}
else if(myPolylines.length==0)
{
    SDialog.Message("No polylines selected",SDialog.EMessageSeverity.Error,"Error");
}
else
{
    var myCloud =clouds[0];

    //Open the threeshold dialog box to define the thickness of the slices (thickness=2*Threeshold)
    var myDialog = SDialog.New('Cut slices');
    myDialog.AddLength({ id: "threshold", name: 'Threshold:', tooltip: "Define the thickness of the slices (thickness=2*Threeshold)", value: 0.1, saveValue: true, readOnly: false});
    var parameters = myDialog.Run();
    if (parameters.ErrorCode == 0) {
        var threeshold = parameters.threshold;

        //Create one cloud around each polyline's plane
        for (var i = 0; i < myPolylines.length; i = i + 1) {
            //process only planar polylines
            if (myPolylines[i].IsPlanar() == true) {
                //define the plane corresponding to the polyline
                var myPoly = myPolylines[i].GetNormal();
                var myPt = myPoly.Point;
                var myVector = myPoly.Vector;
                var myPlane = SPlane.New(myPt, myVector);
                //Create the slices
                var splitCloud = myCloud.SeparateFeature(myPlane, threeshold, SCloud.FILL_IN_ONLY)
                if (splitCloud.ErrorCode == 0) {
                    if (splitCloud.InCloud.GetNumber() > 0) {
                        splitCloud.InCloud.AddToDoc();
                    }
                }
            }
        }
    }
}