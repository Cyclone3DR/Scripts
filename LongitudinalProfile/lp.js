//Launch the script and click on the polyline
var myAxis = SMultiline.FromClick();
//Project vertically the 3D polyline on a horizontal plane (Z=0)
var zenith = SVector.New(0, 0, 1)
var hzPlane = SPlane.New(SPoint.New(0, 0, 0), zenith);
var hzAxis = hzPlane.ProjDir(myAxis.Multi, zenith);
//Compute the height between 2D and 3D polylines
var inspectedHzAxis = hzAxis.Multi.Compare(myAxis.Multi, 0, zenith, 1, false, true);
//Create the longitudinale profile
var res = SMultiline.New();
var lineRef = SMultiline.New();
for (var i = 0; i < inspectedHzAxis.Multi.GetNumber(); i = i + 1) {
	//Compute abscissa
	var cutPoint = inspectedHzAxis.Multi.GetPoint(i);
	var bothEnds = SMultiline.Cut(inspectedHzAxis.Multi, cutPoint);
	var x = bothEnds.MultiTbl[0].GetLength();
	//Create points of longitudinal profile and reference line
	var z = inspectedHzAxis.Multi.GetDeviation(i);
	var myPoint = SPoint.New(x, 0, z);
	var myRefPoint = SPoint.New(x, 0, 0);
	res.InsertLast(myPoint, 0);
	lineRef.InsertLast(myRefPoint, 0);
}
var lp = res.Compare(lineRef, 0, zenith, 1, false, true);
//Insert  longitudinal profile and reference line
lp.Multi.AddToDoc();
lineRef.AddToDoc();
