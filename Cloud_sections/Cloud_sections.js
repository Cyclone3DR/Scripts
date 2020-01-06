//This script is suitable to cut a cloud into slices according to planar polylines

//Select one cloud to segment and all polylines
var myCloud=SCloud.FromSel()[0];
var myPolylines=SMultiline.FromSel();

//Open the threeshold dialog box to define the thickness of the slices (thickness=2*Threeshold)
var myDialog = SDialog.New('Threeshold');
myDialog.AddLine('Threeshold:', true, Array(), 0);	
var parameters = myDialog.Execute();
if( parameters.ErrorCode == 0)
	{
	threeshold=parseFloat(parameters.InputTbl[0]);		
	}

//Create one cloud around each polyline's plane
for (i=0;i<myPolylines.length;i=i+1){
	//process only planar polylines
	if (myPolylines[i].IsPlanar()==true){
		//define the plane corresponding to the polyline
		myPoly=myPolylines[i].GetNormal();
		myPt=myPoly.Point;
		myVector=myPoly.Vector;
		myPlane=SPlane.New(myPt,myVector);
		//Create the slices
		splitCloud=myCloud.SeparateFeature(myPlane, threeshold,SCloud.FILL_IN_ONLY)
		if (splitCloud.ErrorCode==0){
			if (splitCloud.InCloud.GetNumber()>0){
				splitCloud.InCloud.AddToDoc();
			}
		}
	}
}


