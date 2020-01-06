/// <reference path="C:\Program Files\3DReshaper_18.1_x64\docScript\Reshaper.d.ts"/>
	
function Extract(
			_iCloud // [in] The cloud to treat
			, _iTrackData // [in] the previous data of the track
			, _iPathLine //[in] the line to follow, use first point to initialize first extraction
			)
{
	_DEBUG = false;
	
	//--------------------------------------------------------------
	// compute path direction with the path line
	var initialPt = _iPathLine.GetPoint(_iTrackData.Index);
	var nextPt = _iPathLine.GetPoint(_iTrackData.Index+3);
	var pathDirection = SVector.New(initialPt, nextPt);
	pathDirection.SetNormed();
	//--------------------------------------------------------------
	// compute normal with the previous point
	var ToRight = SVector.New(_iTrackData.LeftPt, _iTrackData.RightPt);
	ToRight.SetNormed();
	var Normal = SVector.Cross( pathDirection, ToRight ); // from top to bot
	Normal.SetNormed();
	
	{
		//--------------------------------------------------------------
		// compute translation to the right
		var ToRight = SVector.Cross( Normal, pathDirection );
		ToRight.SetNormed();
		ToRight.SetZ(0);
		ToRight = ToRight.Mult(_iTrackData.RightWidth);
		
		//--------------------------------------------------------------
		// compute translation to the left
		var ToLeft = SVector.New(ToRight);
		ToLeft.Opposite();
		ToLeft.SetNormed();
		ToLeft.SetZ(0);
		ToLeft = ToLeft.Mult(_iTrackData.LeftWidth);
		
		//--------------------------------------------------------------
		// compute translation to the bot
		var ToBotLeft = SVector.New(0, 0, -_iTrackData.LeftHeight);
		var ToBotRight = SVector.New(0, 0, -_iTrackData.RightHeight);
	}
	
	//--------------------------------------------------------------
	// translate initial point with the previous values
	var RightPt = SPoint.New(initialPt); // right point
	RightPt.Translate(ToBotRight);
	RightPt.Translate(ToRight);
	var LeftPt = SPoint.New(initialPt); // left point
	LeftPt.Translate(ToBotLeft);
	LeftPt.Translate(ToLeft);	
	
	if (_DEBUG == true)
	{
		var sphere = SSphere.New(RightPt, 0.1);
		sphere.AddToDoc();
		var sphere = SSphere.New(LeftPt, 0.1);
		sphere.AddToDoc();
	}
	//--------------------------------------------------------------
	// compute the left track
	var track = {
				'Direction': pathDirection
				, 'Point': LeftPt
				, 'Normal': Normal
				};
	var resultLeft = NextTrack(_iCloud, track, 3/*iterations*/);
	
	if (resultLeft.ErrorCode == 1)
		return {"ErrorCode": 1};
	
	
	//--------------------------------------------------------------
	// compute the right track
	var track = {
				'Direction': pathDirection
				, 'Point': RightPt
				, 'Normal': Normal
				};
	var resultRight = NextTrack(_iCloud, track, 3/*iterations*/);
	
	if (resultRight.ErrorCode == 1)
		return {"ErrorCode": 1};
	
	//--------------------------------------------------------------
	// compute scalar product between the two new direction found
	var firstDirection = SVector.New(_iTrackData.LeftPt, resultLeft.Point);
	firstDirection.SetNormed();
	var secDirection = SVector.New(_iTrackData.RightPt, resultRight.Point);
	secDirection.SetNormed();
	
	// scalar product
	var scalarProduct = SVector.Dot(firstDirection, secDirection);
	
	//--------------------------------------------------------------
	// ? Is scalar product too important
	if ( scalarProduct < 0.998 ) // deviation > 1.14� between the two tracks
	{		
		return {
			"ErrorCode": 0
			, "LeftPt": _iTrackData.LeftPt
			, "RightPt": _iTrackData.RightPt
			, 'LeftHeight': _iTrackData.LeftHeight
			, 'RightHeight': _iTrackData.RightHeight
			, 'LeftWidth': _iTrackData.LeftWidth
			, 'RightWidth': _iTrackData.RightWidth
			, "Index": _iTrackData.Index + 3
			}; // return the previous data, index incremented of 3
	}
	

	//--------------------------------------------------------------
	// Project the found points on the guide line to compute the distance
	var result = _iPathLine.Proj3D(resultLeft.TrackPt);
	if (result.ErrorCode != 0)
		throw new Error( "Impossible to find projection on the multiline." ); 
	var leftDistance = DistanceBtwnPt(result.Point, resultLeft.TrackPt); // compute distance
	
	var result = _iPathLine.Proj3D(resultRight.TrackPt);
	if (result.ErrorCode != 0)
		throw new Error( "Impossible to find projection on the multiline." ); 
	var rightDistance = DistanceBtwnPt(result.Point, resultRight.TrackPt); // compute distance
	
	var EAV = 1.5; // evanescence average value
	return {
		"ErrorCode": 0
		, "LeftPt": resultLeft.TrackPt
		, "RightPt": resultRight.TrackPt
		, 'LeftHeight':  ( (_iTrackData.LeftHeight*EAV) + leftDistance.Height )/(EAV+1)
		, 'RightHeight':  ( (_iTrackData.RightHeight*EAV) + rightDistance.Height )/(EAV+1)
		, 'LeftWidth': ( (_iTrackData.LeftWidth*EAV) + leftDistance.Width )/(EAV+1)
		, 'RightWidth': ( (_iTrackData.RightWidth*EAV) + rightDistance.Width )/(EAV+1)
		, "Index": _iTrackData.Index + 3
		};		
	
}

function NextTrack(
			_iCloud // [in] The cloud to treat
			, _iTrackData // the previous data of the track
			, _iNbIter //[in] the number of iteration 
			)
{
	var _DEBUG = false;
	
	//--------------------------------------------------------------
	// define variables
	var TRANSLATION = 0.25; // 25cm
	var CYLINDER_RADIUS = C_STACK_WIDTH;
	var CYLINDER_LENGTH = 2; // 2 m
	var ANGLE_DEVIATION = 0.998; // ~2.5�
	
	var cylinderPt = _iTrackData.Point;
	var cylinderDir = _iTrackData.Direction;
	var previousPlaneNormal = _iTrackData.Normal;
	
	var it = 0;
	var NB_ITER = _iNbIter;
	var debug = false;
	while(it < NB_ITER)
	{
		it++;
		if (_DEBUG == true)
		{
			if(/*it == 0 || */it == NB_ITER-1)
				debug = true;
			else
				debug = false;
		}
		//--------------------------------------------------------------
		// Create a cylinder with the direction of the last track and radius of the stack
		var cylinder = SCylinder.New(
			cylinderPt
			, cylinderDir
			, CYLINDER_RADIUS /* radius = 6.5cm */
			, CYLINDER_LENGTH /*length*/
			);
		if (debug == true)
		{
			cylinder.AddToDoc();
		}
		
		//--------------------------------------------------------------
		// Separate the cloud with this cylinder to work only on the stack part
		var result = _iCloud.SeparateFeature(cylinder, /*Tolerance*/0);
			
		// the cloud outside the cylinder is cleared to save RAM
		result.OutCloud.Clear();
		var cloudTrack = result.InCloud;
		
		//--------------------------------------------------------------
		// check if the number of point is usable
		if (cloudTrack.GetNumber() < 2)
		{
			print("End of the line.");
			return {
				"ErrorCode": 1
				, "Point": _iTrackData.Point
				};
		}
		
		//--------------------------------------------------------------
		// Create a plane with the previous normal
		
		var result = cloudTrack.BestPlane(
			cloudTrack.GetNumber()*0.5 // [in]	NbPointElim	The number of points to eliminate. 
			// The worst points are eliminated. This number should not be greater than the total number of points -3
			, SCloud.PLANE_FORCE_NORMAL // [in] Force	Bit mask to know which parameter(s) are forced and do not need to be computed.
			// PLANE_FORCE_POINT (Force & PLANE_FORCE_POINT) Average point is forced (a plane passing by this point should be found)
			// PLANE_FORCE_NORMAL (Force & PLANE_FORCE_NORMAL) Normal is forced (a plane with this normal should be found)
			, SPoint.New() // [in] AveragePoint	The average point of the cloud
			, previousPlaneNormal // [in] DirectionVector	Normed Normal vector of the plane.
			);
		if (result.ErrorCode != 0)
			throw new Error( "Impossible to do a best plane." ); 
			
		var plane = result.Plane;
		if (debug == true)
		{
			plane.AddToDoc();
		}
		
		//--------------------------------------------------------------
		// Separate the cloud with this plane to work only on the TOP stack part
		var result = cloudTrack.SeparateFeature(plane, /*Tolerance*/CYLINDER_RADIUS*0.4);
			
		// the cloud outside the cylinder is cleared to save RAM
		result.OutCloud.Clear();
		var cloudTrack = result.InCloud;

		//--------------------------------------------------------------
		// compute a best line with this cloud to find the new direction
		result = cloudTrack.BestLine(
				0.2*cloudTrack.GetNumber() // [in]	NbPointElim	The number of points to eliminate. 
				// The worst points are eliminated. This number should not be greater than the total number of points -3
//				, SCloud.LINE_FORCE_POINT // [in]	Force	Bit mask to know which parameter(s) are forced and do not need to be computed.
//				//LINE_FORCE_POINT (Force & LINE_FORCE_POINT) Average point is forced (a line passing by this point should be found)
//				//LINE_FORCE_DIRECTION (Force & LINE_FORCE_DIRECTION) Line direction is forced (a line with this direction should be found)
//				, _iTrackData.Point //[in]	AveragePoint	The point of the cloud that the line pass through
				);
		
		if (result.ErrorCode != 0)
			throw new Error( "Impossible to do a best line." ); 
			
		var line = result.Line;
		if (debug == true)
		{
			line.SetColors(1, 1, 0);
			line.AddToDoc();
		}
		
		var firstPt = line.GetFirstPoint();
		var lastPt = line.GetLastPoint();
		
		//--------------------------------------------------------------
		// compute the new direction
		var ptDirection = SVector.New(firstPt, lastPt);
		ptDirection.SetNormed();
		
		var direction = _iTrackData.Direction;
		direction.SetNormed();
		
		//--------------------------------------------------------------
		// Test if the new direction is valid 
		// the direction must be really to the previous direction
		
		// scalar product
		var scalarProduct = SVector.Dot(direction, ptDirection);
		
		if ( scalarProduct > ANGLE_DEVIATION)
		{	
			cylinderPt = firstPt;
			cylinderDir = SVector.New(firstPt, lastPt);
		}		
		else if ( scalarProduct < -ANGLE_DEVIATION)
		{
			cylinderPt = lastPt;
			cylinderDir = SVector.New(lastPt, firstPt);
		}
		else
		{
			if (debug == true)
			{
				print("nb iter: " + it + " , scalar product:" + scalarProduct);
			}
			break;
		}
		
		if(it < NB_ITER-1)
			cloudTrack.Clear();
	}
		
	//--------------------------------------------------------------
	// find the planar top part of the track
	var result = cloudTrack.BestPlane(
		cloudTrack.GetNumber()*0.5 // [in]	NbPointElim	The number of points to eliminate. 
		// The worst points are eliminated. This number should not be greater than the total number of points -3
		, SCloud.PLANE_FORCE_NORMAL // [in] Force	Bit mask to know which parameter(s) are forced and do not need to be computed.
		// PLANE_FORCE_POINT (Force & PLANE_FORCE_POINT) Average point is forced (a plane passing by this point should be found)
		// PLANE_FORCE_NORMAL (Force & PLANE_FORCE_NORMAL) Normal is forced (a plane with this normal should be found)
		, SPoint.New() // [in] AveragePoint	The average point of the cloud
		, previousPlaneNormal // [in] DirectionVector	Normed Normal vector of the plane.
		);
	
	if (result.ErrorCode != 0)
		throw new Error( "Impossible to do a best plane." ); 
		
	var topPlane = result.Plane;
	var planeNormal = topPlane.GetNormal();
	
	if (_DEBUG == true)
	{
		topPlane.SetColors(1, 1, 0);
		topPlane.AddToDoc();
		cloudTrack.AddToDoc();
	}
	else
	{
		cloudTrack.Clear();
	}
		
	if ( scalarProduct > ANGLE_DEVIATION)
	{	
		// last point
		var ptDirection = SVector.New(firstPt, lastPt);
		ptDirection.SetNormed();
		ptDirection = ptDirection.Mult(TRANSLATION);
		lastPt.Translate(ptDirection);
		
		return {
			"ErrorCode": 0
			, "Point": lastPt
			, "TrackPt": topPlane.GetCenter()
			};
	}
	
	if ( scalarProduct < -ANGLE_DEVIATION)
	{
		// first point
		var ptDirection = SVector.New(lastPt, firstPt);
		ptDirection.SetNormed();
		ptDirection = ptDirection.Mult(TRANSLATION);
		firstPt.Translate(ptDirection);
		
		return {
			"ErrorCode": 0
			, "Point": firstPt
			, "TrackPt": topPlane.GetCenter()
			};
	}
		
	//--------------------------------------------------------------
	// if the deviation is upper than the angle allowed return the previous point 
	// translated with the previous direction
	direction = direction.Mult(TRANSLATION);
	var returnPt = SPoint.New(_iTrackData.Point);
	returnPt.Translate(direction);
	return {
		"ErrorCode": 0
		, "Point": returnPt
		, "TrackPt": topPlane.GetCenter()
		};
}




function ExtractClip(_iCloud, _iLine)
{
	var _DEBUG = true;
	
	//--------------------------------------------------------------
	// define variables
	var CYLINDER_RADIUS = C_CATENARY_WIDTH*30;
	var TOLERANCE = CYLINDER_RADIUS - C_CATENARY_WIDTH;
	var PLANE_TOLERANCE = C_CATENARY_WIDTH*4;
	var firstPt = _iLine.GetFirstPoint();
	var lastPt = _iLine.GetLastPoint();
	
	//--------------------------------------------------------------
	// Create a cylinder with the direction of the last track and radius of the stack
	var cylinder = SCylinder.New(
		firstPt
		, _iLine.GetNormal()
		, CYLINDER_RADIUS/* radius = 6.5cm */
		, _iLine.GetLength()/*length*/
		);
	if (_DEBUG == true)
	{
		//cylinder.AddToDoc();
	}
	
	//--------------------------------------------------------------
	// Separate the cloud with this cylinder to work only on the stack part
	var result = _iCloud.SeparateFeature(cylinder, /*Tolerance*/TOLERANCE);
		
	// the cloud outside the cylinder is cleared to save RAM
	result.OutCloud.Clear();
	var cloudClip = result.InCloud;
	
	//--------------------------------------------------------------
	// check if the number of point is usable
	if (cloudClip.GetNumber() < 25)
	{
		return;
	}
	var result = cloudClip.BestPlane();
	
	if (result.ErrorCode != 0)
		throw new Error( "Impossible to do a best plane." ); 
		
	var plane = result.Plane;
	
	//--------------------------------------------------------------
	// check normal of the plane
	// the normal of the plane must have nearly the same direction than the current line
	var planeNormal = plane.GetNormal();
	planeNormal.SetNormed();
	var lineDirection = _iLine.GetNormal();
	lineDirection.SetNormed();
	
	// scalar product
	var scalarProduct = SVector.Dot(planeNormal, lineDirection);
	
	if ( Math.abs(scalarProduct) > 0.9) // 25�
	{
		//--------------------------------------------------------------
		// Create a sphere
		var sphere = SSphere.New(
			plane.GetCenter()
			, Math.max(plane.GetLength(), plane.GetWidth()) /* radius */
			);
		//--------------------------------------------------------------
		// Separate the cloud with this sphere to work in better condition
		var result = _iCloud.SeparateFeature(sphere, /*Tolerance*/0);
		
		// the cloud outside the sphere is cleared to save RAM
		result.OutCloud.Clear();
		var sphereCloud = result.InCloud;
		
		//--------------------------------------------------------------
		// Separate the cloud with the plane to extract only the clip
		var result = sphereCloud.SeparateFeature(plane, /*Tolerance*/PLANE_TOLERANCE);
		
		// the cloud outside the sphere is cleared to save RAM
		result.OutCloud.Clear();
		var planeCloud = result.InCloud;
		
		print(planeCloud.GetNumber());
		if (planeCloud.GetNumber() > 1000)
			plane.AddToDoc();
	}
}




function NextCatenary(
			_iCloud // [in] The cloud to treat
			, _iTrackData // the previous data of the track
			)
{
	var _DEBUG = true;
	
	//--------------------------------------------------------------
	// define variables
	var TRANSLATION = 0.25; // 25cm
	var CYLINDER_RADIUS = 0.5; // 50cm <------ bigger cylinder
	var CYLINDER_LENGTH = 2; // 2 m
	var ANGLE_DEVIATION = 0.998; // ~2.5�
	
	var cylinderPt = _iTrackData.Point;
	var cylinderDir = _iTrackData.Direction;
	var previousPlaneNormal = _iTrackData.Normal;
	
	var it = 0;
	var NB_ITER = _iNbIter;
	var debug = false;
	while(it < NB_ITER)
	{
		it++;
		if (_DEBUG == true)
		{
			if(/*it == 0 || */it == NB_ITER-1)
				debug = true;
			else
				debug = false;
		}
		//--------------------------------------------------------------
		// Create a cylinder with the direction of the last track and radius of the stack
		var cylinder = SCylinder.New(
			cylinderPt
			, cylinderDir
			, CYLINDER_RADIUS /* radius = 6.5cm */
			, CYLINDER_LENGTH /*length*/
			);
		if (debug == true)
		{
			cylinder.AddToDoc();
		}
		
		//--------------------------------------------------------------
		// Separate the cloud with this cylinder to work only on the stack part
		var result = _iCloud.SeparateFeature(cylinder, /*Tolerance*/0);
			
		// the cloud outside the cylinder is cleared to save RAM
		result.OutCloud.Clear();
		var cloudTrack = result.InCloud;
		
		//--------------------------------------------------------------
		// check if the number of point is usable
		if (cloudTrack.GetNumber() < 4)
		{
			print("End of the line.");
			return {
				"ErrorCode": 1
				, "Point": _iTrackData.Point
				};
		}

		//--------------------------------------------------------------
		// compute a best line with this cloud to find the new direction
		result = cloudTrack.BestLine(
				0.5*cloudTrack.GetNumber() // [in]	NbPointElim	The number of points to eliminate. 
				// The worst points are eliminated. This number should not be greater than the total number of points -3
//				, SCloud.LINE_FORCE_DIRECTION // [in]	Force	Bit mask to know which parameter(s) are forced and do not need to be computed.
//				// LINE_FORCE_POINT (Force & LINE_FORCE_POINT) Average point is forced (a line passing by this point should be found)
//				// LINE_FORCE_DIRECTION (Force & LINE_FORCE_DIRECTION) Line direction is forced (a line with this direction should be found)
//				, SPoint.New() // [in]	AveragePoint	The point of the cloud that the line pass through
//				, cylinderDir // [in]	DirectionVector	Normed direction vector of the line.
				);
		
		if (result.ErrorCode != 0)
			throw new Error( "Impossible to do a best line." ); 
			
		var line = result.Line;
		if (debug == true)
		{
			line.SetColors(1, 1, 0);
			line.AddToDoc();
		}
		
		var firstPt = line.GetFirstPoint();
		var lastPt = line.GetLastPoint();
		
		//--------------------------------------------------------------
		// compute the new direction
		var ptDirection = SVector.New(firstPt, lastPt);
		ptDirection.SetNormed();
		
		var direction = _iTrackData.Direction;
		direction.SetNormed();
		
		//--------------------------------------------------------------
		// Test if the new direction is valid 
		// the direction must be really to the previous direction
		
		// scalar product
		var scalarProduct = SVector.Dot(direction, ptDirection);
		
		if ( scalarProduct > ANGLE_DEVIATION)
		{	
			cylinderPt = firstPt;
			cylinderDir = SVector.New(firstPt, lastPt);
		}		
		else if ( scalarProduct < -ANGLE_DEVIATION)
		{
			cylinderPt = lastPt;
			cylinderDir = SVector.New(lastPt, firstPt);
		}
		else
		{
			if (debug == true)
			{
				print("nb iter: " + it + " , scalar product:" + scalarProduct);
			}
			break;
		}
		
		if(it < NB_ITER-1)
			cloudTrack.Clear();
	}
	
	if (_DEBUG == true)
	{
		cloudTrack.AddToDoc();
	}
	else
	{
		cloudTrack.Clear();
	}
		
	if ( scalarProduct > ANGLE_DEVIATION)
	{	
		// last point
		var ptDirection = SVector.New(firstPt, lastPt);
		ptDirection.SetNormed();
		ptDirection = ptDirection.Mult(TRANSLATION);
		lastPt.Translate(ptDirection);
		
		return {
			"ErrorCode": 0
			, "Point": lastPt
			, "TrackPt": topPlane.GetCenter()
			};
	}
	
	if ( scalarProduct < -ANGLE_DEVIATION)
	{
		// first point
		var ptDirection = SVector.New(lastPt, firstPt);
		ptDirection.SetNormed();
		ptDirection = ptDirection.Mult(TRANSLATION);
		firstPt.Translate(ptDirection);
		
		return {
			"ErrorCode": 0
			, "Point": firstPt
			, "TrackPt": topPlane.GetCenter()
			};
	}
		
	//--------------------------------------------------------------
	// if the deviation is upper than the angle allowed return the previous point 
	// translated with the previous direction
	direction = direction.Mult(TRANSLATION);
	var returnPt = SPoint.New(_iTrackData.Point);
	returnPt.Translate(direction);
	return {
		"ErrorCode": 0
		, "Point": returnPt
		, "TrackPt": topPlane.GetCenter()
		};
}





