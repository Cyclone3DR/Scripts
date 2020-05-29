/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>


var curPath = CurrentScriptPath() + '\\'; 

Include( curPath + "00_Util.js" );
Include( curPath + "00_Variables.js" );
Include( curPath + "01_Initialize.js" );
Include( curPath + "02_NextExtraction.js" );

function main()
{

	var cloudIndex = 1;

	var linePath = SMultiline.All(0)[0]; // path followed by the scanner
	var theSCwCloud = SCwCloud.All(0)[0]; // the CWCloud to process

	var lineLength = linePath.GetLength();
	
	// creating the clipping plane along the path
	var clipPlane = SClippingPlane.New(linePath);
	var CLIP_STEP = 200;
	clipPlane.AddToDoc();
	clipPlane.SetDepth(CLIP_STEP)
	clipPlane.SetStep(cloudIndex * CLIP_STEP);
	clipPlane.ClipAll();
	clipPlane.SetVisibility(false);
	
	var cloudToTreat = theSCwCloud.ToCloud(60000000).Cloud;
	print("Number of points in the converted cloud: " + cloudToTreat.GetNumber())
	theSCwCloud.SetVisibility(false);
	clipPlane.UnclipAll();
	cloudToTreat.AddToDoc();
	
	ZoomOn([cloudToTreat],2000);

	//--------------------------------------------------------------
	// Compute the track direction with the first point of the trajectory
	result = InitializeTrackWithLine(cloudToTreat, linePath, 0);

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
		cloudIndex++;
		nextCloud = false;
		
		if (ExtractionIsOk == true && (cloudIndex*CLIP_STEP*0.95) < lineLength)
		{
			cloudToTreat.Clear();
			cloudToTreat.RemoveFromDoc();
			TrackData.push(lastTrack);
			clipPlane.Move(CLIP_STEP*0.95);
			clipPlane.ClipAll();

			var resToCloud = theSCwCloud.ToCloud(60000000);
			if(resToCloud.ErrorCode==0 || resToCloud.ErrorCode==2 || resToCloud.ErrorCode==3)
			{
				cloudToTreat = resToCloud.Cloud;
				cloudToTreat.AddToDoc();
				print("Number of points in the converted cloud: " + cloudToTreat.GetNumber())
				nextCloud = cloudToTreat.GetNumber()>1000;
				clipPlane.UnclipAll();
			}
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

main(); // call of the main function





