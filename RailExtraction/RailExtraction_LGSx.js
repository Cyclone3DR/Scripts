/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>


var curPath = CurrentScriptPath() + '\\'; 

Include( curPath + "00_Util.js" );
Include( curPath + "00_Variables.js" );
Include( curPath + "01_Initialize.js" );
Include( curPath + "02_NextExtraction.js" );

function main()
{

	var cloudIndex = 0;

	var linePath = SMultiline.All()[0]; // path followed by the scanner
	var theSCwCloud = SCwCloud.All()[0]; // the CWCloud to process

	var lineLength = linePath.GetLength();
	
	// creating the clipping plane along the path
	var clipPlane = SClippingPlane.New(linePath);
	var CLIP_STEP = 200;
	clipPlane.AddToDoc();
	clipPlane.SetDepth(CLIP_STEP)
	clipPlane.SetStep(CLIP_STEP);
	clipPlane.ClipAll();
	clipPlane.SetVisibility(false);
	
	var cloudToTreat = Convert(theSCwCloud).Cloud;
	print("Number of points in the converted cloud: " + cloudToTreat.GetNumber())
	theSCwCloud.SetVisibility(false);
	clipPlane.UnclipAll();
	cloudToTreat.AddToDoc();
	
	ZoomOn([cloudToTreat],2000);

	//--------------------------------------------------------------
	// Compute the track direction with the first point of the trajectory
	var result = InitializeTrackWithLine(cloudToTreat, linePath, 0);

	var TrackData = new Array();
	TrackData.push(result);
	
	//--------------------------------------------------------------
	// begin of the iteration => extract next track
	print("=============================");
	print("Extract next track.");
	print("=============================");
	
	//--------------------------------------------------------------
	// multilines with the final result
	var LeftLine = SMultiline.New();
	LeftLine.SetName("Left Line");
	LeftLine.SetColors(1, 0, 0);
	LeftLine.AddToDoc();
	LeftLine.InsertLast(result.LeftPt);
	
	var RightLine = SMultiline.New();
	RightLine.SetName("Right Line");
	RightLine.SetColors(1, 0, 0);
	RightLine.AddToDoc();
	RightLine.InsertLast(result.RightPt);

	var nextCloud = true;
	do
	{		
		cloudIndex++;
		print("=============================");
		print("Extract on cloud number: " + cloudIndex);
		
		var initialTrack = TrackData[0];
		var lastTrack;
		var ExtractionIsOk = false;
		while(TrackData.length > 0)
		{
			// running the extraction routine
			result = Extract(cloudToTreat, TrackData[0], linePath);
			if (result.ErrorCode == 0)
			{	
				// append the new find pt
				LeftLine.InsertLast(result.LeftPt);
				RightLine.InsertLast(result.RightPt);
				
				TrackData.push(result);
				lastTrack = result;
				ExtractionIsOk = true; // if we have at least extract one track section on the current cloud
				Repaint();
			}
			TrackData.shift();
		}
		//--------------------------------------------------------------
		// Check if next cloud can be opened
		nextCloud = false;
		print("ExtractionIsOk: " + ExtractionIsOk)
		var currentValue = cloudIndex*CLIP_STEP;
		print("currentValue: " + currentValue);
		print("lineLength: " + lineLength);
		
		if (ExtractionIsOk == true && (currentValue < lineLength))
		{
			cloudToTreat.Clear();
			cloudToTreat.RemoveFromDoc();
			TrackData.push(lastTrack);
			clipPlane.Move(CLIP_STEP);
			clipPlane.ClipAll();

			var resToCloud = Convert(theSCwCloud);
            if(resToCloud.Error == 0)
            {
				cloudToTreat = resToCloud.Cloud;
				cloudToTreat.AddToDoc();
				print("Number of points in the converted cloud: " + cloudToTreat.GetNumber())
				nextCloud = cloudToTreat.GetNumber()>1000;
				print("NextCloud number: " + cloudToTreat.GetNumber())
				clipPlane.UnclipAll();
			}
			else
				print("error in converting to cloud")
		}
	}
	while (nextCloud == true)
	
	//-------------------------------------------------------
	//remove the multilines if their length is null
	var leftlinelenght = LeftLine.GetLength();
	var rightlinelenght = RightLine.GetLength();
	if (leftlinelenght==0 && rightlinelenght==0)
	{
		LeftLine.RemoveFromDoc();
		RightLine.RemoveFromDoc();
		print("=============================");
		print("No line extracted.");
		print("=============================");
	}
	
}

function Convert(iSCWCloud) 
{
    var convertOptions = {
        dataType: SCwCloud.DataType.ALL,
        objectsToConvert: SCwCloud.ObjectsToConvert.CLOUDS,
        nbPoints: 60000000
    };

    var theCloud = null;
    var error = 1;

    var resToCloud = iSCWCloud.Convert(convertOptions);
    if(resToCloud.ErrorCode == 0)
    {
        error = 0;

        var clouds2Merge = [];

        resToCloud.Tracks.forEach(function (track) {
            clouds2Merge.push(track.Cloud);
        });

        if (resToCloud.StaticData)
            clouds2Merge.push(resToCloud.StaticData.Cloud);

        if(clouds2Merge.length > 0)
            theCloud = SCloud.Merge(clouds2Merge).Cloud;
    }

    return {
        "Error": error,
        "Cloud": theCloud
    }
}

main(); // call of the main function
