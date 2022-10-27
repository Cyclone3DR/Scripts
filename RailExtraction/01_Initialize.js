/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

//--------------------------------------------------------------
// define variables	
var GROUND_PER_CENT = 0.33; // 33% of the cloud to remove in the best plane (correspond to the track and the noise)
var LINE_PER_CENT = 0.33; // 33% of the track cloud to use to create a best line

function GetTrack(
    _iInitialCloud // [in] the cloud to extract the track
    , _iExtractPt // [in] the initial seed, the point clicked by the user (must be near to a track)
    , _iPathDirection // [in] path direction to follow
    , _iDebug // [in] true: use debug
) {

    //--------------------------------------------------------------
    // Extract part of the cloud
    var sphere = SSphere.New(_iExtractPt, C_SPHERE_RADIUS);
    if (_iDebug == true) {
        sphere.SetName("Sphere_iExtractPt");
        sphere.AddToDoc();
    }

    var result = _iInitialCloud.SeparateFeature(sphere, /*Tolerance*/0, SCloud.FILL_IN_ONLY);

    if (result.ErrorCode != 0)
        throw new Error("Impossible to separate the cloud with the sphere.");

    // the cloud outside the sphere is cleared
    var cloudSphere = result.InCloud; // the cloud inside the sphere
    //       _
    //    /     \
    //   |___n___|
    //    \     /
    //       -

    //--------------------------------------------------------------
    // compute a best plane corresponding to the ground
    if (_iDebug == true) {
        print("Points in sphere: " + cloudSphere.GetNumber());
    }
    result = cloudSphere.BestPlane(cloudSphere.GetNumber() * GROUND_PER_CENT);

    if (result.ErrorCode != 0)
        throw new Error("Impossible to do a best plane.");

    var plane = result.Plane;
    if (_iDebug == true) {
        var planeLocal = SPlane.New(plane);
        planeLocal.SetName("PlaneLocal");
        planeLocal.AddToDoc();
        cloudSphere.SetName("CloudSphere");
        cloudSphere.AddToDoc();
    }

    //--------------------------------------------------------------
    // translate negatively the plane corresponding to the ground 
    // to be sure to remove all the point under the ground
    var planeNormal = plane.GetNormal();
    planeNormal.Normalize();
    if (SVector.Dot(planeNormal, SVector.New(0, 0, 1)) > 0) // if the plane normal is up
        planeNormal.Opposite();
    var TRANSLATION = C_SPHERE_RADIUS * 0.5;
    planeNormal = planeNormal.Mult(TRANSLATION);
    plane.Translate(planeNormal); // translate the plane at (R/2) beside the ground
    if (_iDebug == true) {
        plane.SetName("plane")
        plane.AddToDoc();
    }

    //--------------------------------------------------------------
    // separate the cloud with the plane with a tolerance of (R/2)+C_STACK_HEIGHT_TO_DELETE
    // => this will remove all the point under the ground, and the ground included
    var TolToSeparate = TRANSLATION + C_STACK_HEIGHT_TO_DELETE
    if (_iDebug == true)
        print("Tolerance to Separate" + TolToSeparate)
    result = cloudSphere.SeparateFeature(plane, /*Tolerance*/TolToSeparate, SCloud.FILL_OUT_ONLY);
    if (_iDebug != true)
        cloudSphere.Clear();

    var cloudTrack = result.OutCloud;
    if (_iDebug == true) {
        cloudTrack.SetName("cloudTrack")
        cloudTrack.AddToDoc();
    }

    //--------------------------------------------------------------
    // compute a best line corresponding to the direction of the track
    result = cloudTrack.BestLine(cloudTrack.GetNumber() * LINE_PER_CENT, SCloud.LINE_FORCE_DIRECTION, SPoint.New(), _iPathDirection);

    if (result.ErrorCode != 0) {
        return {
            "ErrorCode": 1
        };
    }

    var line = result.Line;
    if (_iDebug == true) {
        line.SetName("lineIni")
        line.AddToDoc();
    }

    var firstPt = line.GetFirstPoint();
    var lastPt = line.GetLastPoint();

    var it = 0;
    var NB_ITER = 3;
    while (it < NB_ITER) {
        it++;
        //--------------------------------------------------------------
        // Create a cylinder with the direction of the last track and radius of the stack
        var cylinder = SCylinder.New(
            firstPt
            , SVector.New(firstPt, lastPt)
            , C_STACK_WIDTH /* radius = 6.5cm */
            , firstPt.Distance(lastPt) /*length*/
        );

        //--------------------------------------------------------------
        // Separate the cloud with this cylinder to work only on the stack part
        var result = _iInitialCloud.SeparateFeature(cylinder, /*Tolerance*/0, SCloud.FILL_IN_ONLY);
        var cloudTrackIter = result.InCloud;

        //--------------------------------------------------------------
        // check if the number of point is usable
        if (_iDebug == true) {
            print(cloudTrackIter.GetNumber());
        }
        if (cloudTrackIter.GetNumber() < 4) {
            print("End of the line.");
            return {
                "ErrorCode": 1
            };
        }

        //--------------------------------------------------------------
        // compute a best line with this cloud to find the new direction
        result = cloudTrackIter.BestLine(
            0.2 * cloudTrackIter.GetNumber() // [in]	NbPointElim	The number of points to eliminate. 
            // The worst points are eliminated. This number should not be greater than the total number of points -3
        );

        if (result.ErrorCode != 0)
            throw new Error("Impossible to do a best line.");

        var lineLocal = result.Line;
        var nbPts = cloudTrackIter.GetNumber();
        if (_iDebug == true) {
            lineLocal.SetName("LineIter" + it)
            lineLocal.AddToDoc();
            cloudTrackIter.SetName("cloudTrackIter");
            if (it == NB_ITER - 1) // only display the last cloud
                cloudTrackIter.AddToDoc();
        }
        else {
            cloudTrackIter.Clear();
        }

        firstPt = lineLocal.GetFirstPoint();
        lastPt = lineLocal.GetLastPoint();
    }

    return {
        "ErrorCode": 0
        , "Point0": firstPt
        , "Point1": lastPt
        , "NbPts": nbPts
    };
}

/// @brief
/// Extract from an initial point the direction of the track
function InitializeTrackWithLine(
    _iInitialCloud // [in] the cloud to extract the track
    , _iPathLine //[in] the line to follow, use first point to initialize first extraction
    , _iPathIndex // [in] index of the line to begin extraction
) {
    var _DEBUG = false;

    var initialPt = _iPathLine.GetPoint(_iPathIndex);
    var nextPt = _iPathLine.GetPoint(_iPathIndex + 3);
    var pathDirection = SVector.New(initialPt, nextPt);
    var translateDirection = SVector.Cross(pathDirection, SVector.New(0, 0, -1));
    translateDirection.Normalize();
    translateDirection = translateDirection.Mult(C_STACK_SPACING * C_STACK_TRACK_RATIOPOSITION);
    if (_DEBUG == true) {
        var initLine = SLine.New(initialPt, nextPt);
        initLine.SetName("initLine");
        initLine.AddToDoc();
        var tDirLine = SLine.New(initialPt, translateDirection, translateDirection.GetLength());
        tDirLine.SetName("tDirLine");
        tDirLine.AddToDoc();
    }
    initialPt.Translate(translateDirection);
    var result = _iInitialCloud.ProjDir(initialPt, SVector.New(0, 0, -1), 0.15/*Aperture*/, true/*signed direction*/);

    if (result.ErrorCode != 0)
        throw new Error("Impossible to project initial point on the cloud");

    if (_DEBUG) {
        initialPt.SetName("InitialPoint1stTrack");
        initialPt.AddToDoc();
        result.Point.SetName("projectedPoint1stTrack");
        result.Point.AddToDoc();
    }

    var firstTrack = GetTrack(
        _iInitialCloud // [in] the cloud to extract the track
        , result.Point // [in] the initial seed, the point clicked by the user (must be near to a track)
        , pathDirection // [in] path direction to follow
        , _DEBUG // [in] true: use debug
    );

    if (firstTrack.ErrorCode != 0)
        throw new Error("Impossible to initialize the first track.");

    translateDirection.Opposite();
    translateDirection = translateDirection.Mult(1 / C_STACK_TRACK_RATIOPOSITION);
    initialPt.Translate(translateDirection);
    var result = _iInitialCloud.ProjDir(initialPt, SVector.New(0, 0, -1), 0.15/*Aperture*/, true/*signed direction*/);

    if (result.ErrorCode != 0)
        throw new Error("Impossible to project initial point on the cloud");

    if (_DEBUG) {
        initialPt.SetName("InitialPoint2ndTrack");
        initialPt.AddToDoc();
        result.Point.SetName("projectedPoint2ndTrack");
        result.Point.AddToDoc();
    }

    var secondTrack = GetTrack(
        _iInitialCloud // [in] the cloud to extract the track
        , result.Point // [in] the initial seed, the point clicked by the user (must be near to a track)
        , pathDirection // [in] path direction to follow
        , _DEBUG // [in] true: use debug
    );

    if (secondTrack.ErrorCode != 0)
        throw new Error("Impossible to initialize the second track.");

    // Find the second point of the first track
    var dirFirstTrack = SVector.New(firstTrack.Point0, firstTrack.Point1);
    var leftSecondPt = firstTrack.Point1;
    if (SVector.Dot(pathDirection, dirFirstTrack) < 0) {
        leftSecondPt = firstTrack.Point0;
    }
    var result = _iPathLine.Proj3D(leftSecondPt);
    if (result.ErrorCode != 0)
        throw new Error("Impossible to find projection on the multiline.");
    var leftDistance = DistanceBtwnPt(result.Point, leftSecondPt);

    // Find the second point of the second track
    var dirSecTrack = SVector.New(secondTrack.Point0, secondTrack.Point1);
    var rightSecondPt = secondTrack.Point1;
    if (SVector.Dot(pathDirection, dirSecTrack) < 0) {
        rightSecondPt = secondTrack.Point0;
    }
    var result = _iPathLine.Proj3D(rightSecondPt);
    if (result.ErrorCode != 0)
        throw new Error("Impossible to find projection on the multiline.");
    var rightDistance = DistanceBtwnPt(result.Point, rightSecondPt);

    return {
        "LeftPt": leftSecondPt
        , "RightPt": rightSecondPt
        , 'LeftHeight': leftDistance.Height
        , 'RightHeight': rightDistance.Height
        , 'LeftWidth': leftDistance.Width
        , 'RightWidth': rightDistance.Width
        , "Index": _iPathIndex + 3
    };
}

function DistanceBtwnPt(_iInitialPt, _iTrackPt) {
    var direction = SVector.New(_iInitialPt, _iTrackPt);
    direction.SetZ(0);

    return {
        "Width": direction.GetLength()
        , "Height": Math.abs(_iInitialPt.GetZ() - _iTrackPt.GetZ())
    };
}

