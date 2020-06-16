/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>


// ------------------------ HOW TO USE IT --------------------------------------------
// 1. The algorithm uses the displayed cloud (or Cloudworx cloud) to extract the curb! => Make sure only 1 cloud (or CWxCloud) is displayed before launching the script
// 2. At least 1 polyline should be selected. But 2 polylines can be selected.
// 3. The first selected polyline is used to extract the top of the curb.
//   a. If it contains only 2 points, the first point is used to start the curb extraction and the second point is used to show the extraction direction
//   b. If it contains more than 3 points, the point used to start the curb extraction is the last point of the polyline prolongated according to the last segment of the polyline. In this case, the points extracted will be added to the input polyline
// 4. The second polyline is optional and corresponds to the bottom of the curb: the points extracted at the bottom of the curb wil be added to this polyline
// 5. THIS MEANS THAT THE 2 POLYLINES HAVE TO BE ORIENTED IN THE SAME WAY
// 
// Parameter explanations:
// 1. Sampling step: the algorithm extracts the curbs at individual points. This parameter defines the interval between the individual points which will be extarcted. The more straight, the higher this value can be. The more curved, a lower value will be required
// 2. Curb width: this parameter defines the width of the curb to extract. The longer it is the better, as long as the data is clean
// 3. Curb height: this parameter defines the approximate height of the curb. It has a limited impact on the results
// 4. Curb angle to vertical (in °): the vertical part of the curb might not always be perpendicular to the curb itself. This angle allows to adjust according to the real angle
// 5. Min Curb Height: this is a threshold used to stop the curb extraction. Actually, when the height difference between the curn and the street is almost null, there is no way to extract a curb on the point cloud
// 6. Max Curb Length: this is also a parameter used to stop the curb extraction at some point. This allows to define that we are not looking for curbs which length are greater than this value
// 7. Input Units Conversion: unit factor conversion to meter. This allows the algorithm works in other units than meter (the default). If the document is in millimeter, this value should be 1000.
/**
 *  @type {CurbParam} Param
 */
var Param = getParam();
var cellWidth=33*Param.Step; //one cell every 15 steps
var cellHeight=3.5*Param.Step; //21% slope
var maxPointPerCell=100*100*33*Param.Step*33*Param.Step; //1 point every 1cm if document unit is meters

var allCloud = SCloud.All(1);
var allCWCloud=SCwCloud.All(1);
var allMulti = SMultiline.FromSel();
var currentCenterPoint = SPoint.New();
var theCloud = SCloud.New();

if(allMulti.length<1 || allMulti.length>2)
	StopWithMessage("Select 1 line (or 2 lines) to initiate the curb extraction")
if(allCloud.length+allCWCloud.length!=1)
	StopWithMessage("One point cloud should be displayed so that the algorithm knows on which point cloud to extract the curb")
if(allCloud.length==1){
	theCloud = allCloud[0];
}else{
	theCloud=useCWCloud(allCWCloud[0],maxPointPerCell,allMulti[0].GetPoint(0),cellHeight,cellWidth);
	currentCenterPoint=SPoint.New(allMulti[0].GetPoint(0));
}

/**
 * @type {SMultiline} theLine
 * @type {boolean} curbOnRight
 */
var theLine = CreateInitLine(allMulti[0]);
var curbOnRight = IsOnRight(theCloud, theLine);
var theMeshes = createTheo(theLine, curbOnRight)

var outMultis = createOutMulti(allMulti)
outMultis.MultiOnTop.AddToDoc()
outMultis.outMultiDown.AddToDoc()

allMulti[0].SetVisibility(false)
if(allMulti.length>1)
	allMulti[1].SetVisibility(false)

main(allCWCloud, theCloud, theMeshes, theLine, outMultis)

/**
 * @param {SCWCloud} allCWCloud All cloud worx cloud visible
 * @param {SCloud} theCloud The cloud
 * @param {SPoly} theMeshes The Mesh created as a theoretical mesh
 * @param {SMultiline[]} outMultis The array of multiline 
 */
function main(allCWCloud, theCloud, theMeshes, theLine, outMultis)
{
	var DZ = Param.MinCurbHeight*2;//Math.abs(DeltaZ(theCloud, theLine))
	var iter=0;
	var maxIter = Param.MaxCurbLength / Param.Step
	print([iter + " " + Math.ceil(DZ*1000)/1000])
	while(DZ>Param.MinCurbHeight && iter<maxIter)
	{
		var newLine = SLine.New(theLine)
		
		var theLocalCloud = theCloud.SeparateFeature(newLine,Param.CurbWidth,SCloud.FILL_IN_ONLY).InCloud
		if(theLocalCloud.GetNumber<100)
			StopWithMessage("Not Enough points in the cloud close to the line")

		if(theLocalCloud.GetNumber()>10000)
			theLocalCloud = theLocalCloud.Reduce(10000).Cloud;

		var ResMesh = SPoly.Direct3DMesh(theLocalCloud,0, 0, SPoly.INSIDE_CLOSED, -1)
		if(ResMesh.ErrorCode!=0)
			StopWithMessage("Impossible to create mesh in this area")
		var theLocalPoly = ResMesh.Poly
		theLocalPoly.SetName('localMesh_' + iter)
		
		if(Param._DEBUG)
		{
			theLocalPoly.AddToDoc();
			var copyMesh = SPoly.New(theMeshes.TopMesh)
			copyMesh.AddToDoc()
		}

		var resBF = SMatrix.BestFitCompute([theLocalPoly, theMeshes.TopMesh],0.1*Param.unitsConv)
		if(resBF.ErrorCode!=0)
			StopWithMessage("Did not manage to best fit")

		newLine.ApplyTransformation(resBF.MatrixTbl[1])
		theMeshes.TopMesh.ApplyTransformation(resBF.MatrixTbl[1])
		theMeshes.TopLine.ApplyTransformation(resBF.MatrixTbl[1])
		
		if(Param._DEBUG)
		{
			var copyMesh = SPoly.New(theMeshes.TopMesh)
			copyMesh.AddToDoc()
			var copyLine = SLine.New(theMeshes.TopLine)
			copyLine.AddToDoc()
		}

		var pointToInsert = newLine.GetCenter()
		outMultis.MultiOnTop.InsertLast(pointToInsert)
		
		var LowPoint = extractLowCurbPoint(pointToInsert, theLocalCloud, newLine, theMeshes.TopLine)
		outMultis.outMultiDown.InsertLast(LowPoint)
		
		Repaint()
		
		// translating the mesh for next iteration
		var vect = newLine.GetNormal()
		vect.SetNormed()
		vect = vect.Mult(Param.Step)
		
		theLine = SLine.New(newLine);
		theLine.Translate(vect)
		theMeshes.TopMesh.Translate(vect)
		theMeshes.TopLine.Translate(vect)
		
		DZ = Math.abs(pointToInsert.GetZ() - LowPoint.GetZ())
		// DZ = Math.abs(DeltaZ(theCloud, theLine))
		iter++
		print([iter + " " + Math.ceil(DZ*1000)/1000])
		
		if (allCWCloud.length==1 &&
				(Math.abs(theLine.GetLastPoint().GetX()-currentCenterPoint.GetX())>(-1.5*Param.Step+cellWidth/2) || Math.abs(theLine.GetLastPoint().GetY()-currentCenterPoint.GetY())>(-1.5*Param.Step+cellWidth/2))){
			theCloud=useCWCloud(allCWCloud[0], maxPointPerCell,theLine.GetLastPoint(),cellHeight,cellWidth);
			currentCenterPoint=theLine.GetLastPoint();
		}
	}
	
	if(DZ<=Param.MinCurbHeight)
		StopWithMessage(["Curb extraction stopped because the difference between the curb and street level is " + Math.ceil(DZ*1000)/1000 + " which is lower than input parameter"])
}

/**
 * @param {SMultiline} theLine The multiline
 * @param {boolean} curbOnRight The is the curb on the right of the multiline
 * @returns {any} a structure containing a mesh
 */
function createTheo(theLine, curbOnRight)
{
	var vect = theLine.GetNormal()
	vect.SetNormed()
	
	var YCoord = Param.CurbWidth
	var side = 1;
	if (curbOnRight)
		side = -1
	var theMulti = SMultiline.New()
	theMulti.InsertLast(SPoint.New(0,side * YCoord,0))
	theMulti.InsertLast(SPoint.New(0,0,0))
	var CurbOff1 = Math.sin(Param.CurbAngle*Math.PI/180)*Param.CurbHeight*side*-1
	var CurbOff2 = -Math.cos(Param.CurbAngle*Math.PI/180)*Param.CurbHeight;
	theMulti.InsertLast(SPoint.New(0,CurbOff1,CurbOff2))
	// theMulti.AddToDoc();
	// StopWithMessage("")
	
	var FirstZ = theLine.GetFirstPoint()
	FirstZ.Translate(SVector.New(0,0,-0.1))
	var matrix = SMatrix.New()
	matrix.InitAlign(theLine.GetFirstPoint(), theLine.GetLastPoint(), FirstZ, SPoint.New(0,0,0), SPoint.New(1,0,0), SPoint.New(0,0,-0.1))
	
	theMulti.ApplyTransformation(matrix)
	var otherMulti = SMultiline.New(theMulti)
	vect = vect.Mult(Param.Step)
	otherMulti.Translate(vect)
	
	var TopMesh = SPoly.JoinContour([theMulti, otherMulti], []).Poly
	var TopLine = SLine.New(SPoint.New(0,0,0), SVector.New(0,CurbOff1,CurbOff2), Param.CurbHeight)
	TopLine.ApplyTransformation(matrix)
	vect = vect.Mult(0.5)
	TopLine.Translate(vect)
	if(Param._DEBUG)
	{
		TopMesh.AddToDoc()
		TopLine.AddToDoc()
	}
	//StopWithMessage("")
	return {
		"TopMesh": TopMesh,
		"TopLine": TopLine
			}
}

/**
 * @param {SCloud} theCloud The cloud
 * @param {SMultiline} theLine The multiline
 * @returns {boolean} boolean defining if the curb is on the right of the line 
 */
function IsOnRight(theCloud, theLine)
{
	return DeltaZ(theCloud, theLine)>0
}
function DeltaZ(theCloud, theLine)
{
	var theLocalCloud = theCloud.SeparateFeature(theLine,Param.CurbWidth*2,SCloud.FILL_IN_ONLY).InCloud
	if(theLocalCloud.GetNumber()<100)
		throw new Error("Not enough points in the cloud close to the line")
	
	var vect = theLine.GetNormal()
	vect.SetNormed()
	
	var FirstZ = theLine.GetFirstPoint()
	FirstZ.Translate(SVector.New(0,0,-1))
	var matrix = SMatrix.New()
	matrix.InitAlign(SPoint.New(0,0,0), SPoint.New(1,0,0), SPoint.New(0,0,-1), theLine.GetFirstPoint(), theLine.GetLastPoint(), FirstZ)
	
	theLocalCloud.ApplyTransformation(matrix)
	
	var theSphereP = SSphere.New(SPoint.New(Param.Step/2, Param.CurbWidth, 0), Param.CurbWidth/2)
	var cloudYP = theLocalCloud.SeparateFeature(theSphereP,0,SCloud.FILL_IN_ONLY).InCloud
	if(cloudYP.GetNumber()<20)
	{
		if(Param._DEBUG)
		{
			var InvMat = SMatrix.New()
			InvMat.InitInverse(matrix)
			cloudYP.ApplyTransformation(InvMat)
			cloudYP.AddToDoc()
			var tmpSphere = SSphere.New(theSphereP);
			tmpSphere.ApplyTransformation(InvMat)
			tmpSphere.AddToDoc();
		}
		StopWithMessage(["Only " + cloudYP.GetNumber() + " points in the cloud on the left the line"])
	}
	var theSphereM = SSphere.New(SPoint.New(Param.Step/2, -Param.CurbWidth, 0), Param.CurbWidth/2)
	var cloudYM = theLocalCloud.SeparateFeature(theSphereM ,0,SCloud.FILL_IN_ONLY).InCloud
	if(cloudYM.GetNumber()<20)
	{
		if(Param._DEBUG)
		{
			var InvMat = SMatrix.New()
			InvMat.InitInverse(matrix)
			cloudYM.ApplyTransformation(InvMat)
			cloudYM.AddToDoc()
			var tmpSphere = SSphere.New(theSphereM);
			tmpSphere.ApplyTransformation(InvMat)
			tmpSphere.AddToDoc();
		}
		StopWithMessage(["Only " + cloudYM.GetNumber() + " points in the cloud on the right the line"])
	}
	
	var planeP = cloudYP.BestPlane(0, SCloud.PLANE_FORCE_NORMAL, SPoint.New(), SVector.New(0,0,1),SCloud.FILL_NONE).Plane
	var planeM = cloudYM.BestPlane(0, SCloud.PLANE_FORCE_NORMAL, SPoint.New(), SVector.New(0,0,1),SCloud.FILL_NONE).Plane
	var ZP = planeP.GetCenter().GetZ()
	var ZM = planeM.GetCenter().GetZ()
	
	return ZM-ZP
}

/**
* @param {SMultiline} inMulti The first multiline selected by the user (top of the curb)
* @returns {SMultiline} The multiline on the top of the curb in which new points will be added
*/
function CreateInitLine(inMulti)
{
	if(inMulti.GetNumber()<2)// !! check that the length of the multiline is >2
		StopWithMessage("The input polyline should contain at least 2 points to indicate the direction")
	
	var LastPoint = inMulti.GetPoint(inMulti.GetNumber()-1)
	var PrevPoint = inMulti.GetPoint(inMulti.GetNumber()-2)
	var lineVect = SVector.New(PrevPoint, LastPoint)
	lineVect.SetNormed()
	lineVect=lineVect.Mult(Param.Step)
	var lineCenter = SPoint.New()
	if(inMulti.GetNumber()>2)
	{
		lineCenter = LastPoint
		lineCenter.Translate(lineVect)
	}
	else
		lineCenter = PrevPoint
	
	lineVect.SetNormed()
	var theLine = SLine.New(lineCenter, lineVect, Param.Step)
	if(Param._DEBUG)
		theLine.AddToDoc();
	return theLine
}

function createOutMulti(inMultis)
{
	// creating the multiline which is the result of this script
	var inMultiUp = inMultis[0]
	var outMultiUp = SMultiline.New()
	if(inMultiUp.GetNumber()>2)
		outMultiUp = SMultiline.New(inMultiUp)
	else
		outMultiUp = SMultiline.New()
	
	outMultiUp.SetName("Curb Top")
	outMultiUp.SetColors(1,0,0)
	outMultiUp.SetLineWidth(3)

	var outMultiDown = SMultiline.New()
	outMultiDown.SetName("Curb Down")
	if(inMultis.length>1 && inMultis[1].GetNumber()>2)
		outMultiDown = SMultiline.New(inMultis[1])
	outMultiDown.SetLineWidth(3)

	return {
		"MultiOnTop": outMultiUp
		, "outMultiDown": outMultiDown
		}
}

function StopWithMessage(message)
{
	var theDialog = SDialog.New('Curb extraction');
	theDialog.AddLine(message, false);
	var result = theDialog.Execute();
	
	throw new Error (message)
}

function extractLowCurbPoint(pointToInsert, theLocalCloud, theLine, theVector)
{
	var FirstZ = theLine.GetFirstPoint()
	FirstZ.Translate(SVector.New(0,0,-1))
	var matrix = SMatrix.New()
	matrix.InitAlign(SPoint.New(0,0,0), SPoint.New(1,0,0), SPoint.New(0,0,-1), theLine.GetFirstPoint(), theLine.GetLastPoint(), FirstZ)
	var InvMat = SMatrix.New()
	InvMat.InitInverse(matrix)
	
	var LeftRight = 1
	if(!curbOnRight)
		LeftRight = -1
	var theFeatureP = SPoint.New(Param.Step/2, LeftRight*Param.CurbWidth/3, -Param.CurbHeight)
	theFeatureP.ApplyTransformation(InvMat)
	theFeatureP.SetZ(pointToInsert.GetZ()-2*Param.CurbHeight)
	
	var theFeature = SCylinder.New(theFeatureP, SVector.New(0,0,1), Param.CurbWidth/4, Param.CurbHeight*3)
	
	if(Param._DEBUG)
		theFeature.AddToDoc()

	var cloudY = theLocalCloud.SeparateFeature(theFeature,0,SCloud.FILL_IN_ONLY).InCloud
	if(cloudY.GetNumber()<10)
		StopWithMessage(["Only " + cloudY.GetNumber() + " points in the cloud on the street"])
	
	var ResBestPlane = cloudY.BestPlane()
	if(ResBestPlane.DistWorstPt>0.01)
	{
		print(["Removing " + Math.ceil(cloudY.GetNumber()*0.2) + " points  to cloud. Remaining points: " + (cloudY.GetNumber() - Math.ceil(cloudY.GetNumber()*0.2))])
		ResBestPlane = cloudY.BestPlane(Math.ceil(cloudY.GetNumber()*0.2))
	}
	var streetPlane = ResBestPlane.Plane

	var LowCurbPoint = streetPlane.ProjDir(theVector.GetCenter(), theVector.GetNormal()).Point
	
	if(Param._DEBUG)
	{
		cloudY.AddToDoc()
		streetPlane.AddToDoc()
		LowCurbPoint.AddToDoc()
	}
	return LowCurbPoint
}

/**
* @typedef {Object} CurbParam
* @property {number} Step the step for curb extraction
* @property {number} CurbWidth the curb width
* @property {number} CurbHeight the burb height
* @property {number} CurbAngle the curb angle
* @property {number} MinCurbHeight a threshold defining when the extraction should stop according to the height of the curb: if the curb is too small, no need to continue the extraction
* @property {number} MaxCurbLength a threshold defining when the extraction should stop according to the length of the curb to extract
* @property {number} unitsConv a factor allowing to convert between units
* @property {boolean} _DEBUG boolean indicating if we want to debug and add temporary objects to the document
*/

/**
* launches a doalog box allowing to enter the parameters of the curb
* @returns {CurbParam} All input parameters from user
*/
function getParam()
{
	// Default values if no other values found
	var InputStep = 1;
	var InputCurbWidth = 0.5;
	var InputCurbHeight = 0.1;
	var InputCurbAngle = 20;
	var InputMinCurbHeight = 0.01;
	var InputMaxCurbLength = 200;
	var InputUnitsConv = 1;
	
	// Looks for an existing file with previous param
	var filename = TempPath() + "\\LastCurbExtractionParameters.js";
	var thefile = SFile.New(filename)
	if(thefile.Exists())
	{
		thefile.Open(SFile.ReadOnly);
		var alllines = thefile.ReadAll();
		thefile.Close()
		try {
			eval(alllines);
		}
		catch (e)
		{
			print("Values used during the previous run of the script coule not be re-used")
		}
	}

	//Enter the sampling step
	var theDialog = SDialog.New('Curb extraction parameters');
	theDialog.AddLine("Sampling step (in m): ", true, {}, InputStep);
	theDialog.AddLine("Curb Width (in m): ", true, {}, InputCurbWidth);
	theDialog.AddLine("Curb Height (in m): ", true, {}, InputCurbHeight);
	theDialog.AddLine("Curb Angle to vertical (in °): ", true, {}, InputCurbAngle);
	theDialog.AddLine("Min Curb Height (in m): ", true, {}, InputMinCurbHeight);
	theDialog.AddLine("Max Curb Length (in m): ", true, {}, InputMaxCurbLength);
	theDialog.AddLine("Document unit to meter convertion (1000 if document in mm): ", true, {}, InputUnitsConv);
	var result = theDialog.Execute();
	if (result.ErrorCode != 0)// result == 0 means the user click on the "OK" button
		StopWithMessage( "Operation canceled" );

	// Save parameters
	var line = "\n";
	if(!isNaN(Number(result.InputTbl[0]))) // only store if valid number
		line += "InputStep = " + result.InputTbl[0] + ";\n"
	if(!isNaN(Number(result.InputTbl[1]))) // only store if valid number
		line += "InputCurbWidth = " + result.InputTbl[1] + ";\n"
	if(!isNaN(Number(result.InputTbl[2]))) // only store if valid number
		line += "InputCurbHeight = " + result.InputTbl[2] + ";\n"
	if(!isNaN(Number(result.InputTbl[3]))) // only store if valid number
		line += "InputCurbAngle = " + result.InputTbl[3] + ";\n"
	if(!isNaN(Number(result.InputTbl[4]))) // only store if valid number
		line += "InputMinCurbHeight = " + result.InputTbl[4] + ";\n"
	if(!isNaN(Number(result.InputTbl[5]))) // only store if valid number
		line += "InputMaxCurbLength = " + result.InputTbl[5] + ";\n"
	if(!isNaN(Number(result.InputTbl[6]))) // only store if valid number
		line += "InputUnitsConv = " + result.InputTbl[6] + ";\n"
	thefile.Open(SFile.WriteOnly);
	thefile.Write(line);
	thefile.Close();

	var unitsConv = result.InputTbl[6];
	return {
			"Step": result.InputTbl[0]*unitsConv
			, "CurbWidth": result.InputTbl[1]*unitsConv
			, "CurbHeight": result.InputTbl[2]*unitsConv
			, "CurbAngle": result.InputTbl[3]
			, "MinCurbHeight": result.InputTbl[4]*unitsConv
			, "MaxCurbLength": result.InputTbl[5]*unitsConv
			, "unitsConv": unitsConv
			, "_DEBUG": false
			}
}

function useCWCloud(myCWCloud, numberOfPointToExtract, centerPoint, height, width)
{
	tempClippingBox=SClippingBox.New();
	tempClippingBox.SetHeight(height);
	tempClippingBox.SetLength(width);
	tempClippingBox.SetWidth(width);
	tempClippingBox.AddToDoc();
	tempClippingBox.ActivateInAllScenes();
	tempClippingBox.SetCenter(centerPoint);
	res=myCWCloud.ToCloud(numberOfPointToExtract);
	tempClippingBox.RemoveFromDoc();
	return res.Cloud;
}