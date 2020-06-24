/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// ------------------------ HOW TO USE IT --------------------------------------------
// (!) Make sure that your cloud is displayed and also your 3 polylines corresponding to the rails.
// You can select an electric line before going through the script. If this is the case, you won't go through the steps 2 and 3.
// 1. Choose the parameters for data extraction.
// 		Parameter explanations:
// 		Sampling step: the algorithm extracts the catenary data at individual points. This parameter defines the interval between the individual points which will be extracted. The more straight, the higher this value can be. The more curved, a lower value will be required.
// 2. Select a cloud then a point to start the electric line extraction.
// 3. The electric line is extracted using a point on the line.
// 4. Select the different rails needed for catenary data extraction: left, right and then the track axis.
// 5. The catenary data are computed for each individual point on the track axis.
// 6. Choose the file path where to save the *.csv file containing the catenary data.
// At the end, there are two multilines inspected, you can double click on it and check "Show quotations" to get the values that you have in your csv file.

//-------------------------------------------------------------------------------
/**
* @typedef {Object} CatenaryParam
* @property {number} Step the step for the catenary extraction in document unit
* @property {boolean} _DEBUG boolean indicating if we want to debug and add temporary objects to the document
*/

/**
* Launches a dialog box allowing to enter the parameters of the curb
* @returns {CatenaryParam} All input parameters from user
*/

function GetParam() {
    // Default values if no other values found
    var defaultValue = 1;
    var InputStep = defaultValue;

    // Looks for an existing file with previous param
    var filename = TempPath() + "/CatenaryScriptParams.js";
    var thefile = SFile.New(filename);

    if (thefile.Exists()) {
        thefile.Open(SFile.ReadOnly);
        var alllines = thefile.ReadAll();
        thefile.Close()
        try {
            eval(alllines);
        }
        catch (e) {
            print("Values used during the previous run of the script could not be re-used. Please delete the file CatenaryScriptParams.js in your temp folder ");
            InputStep = defaultValue;
        }
    }

    //Enter the sampling step
    var theDialog = SDialog.New("Catenary data extraction parameter");
    theDialog.AddLine("Sampling step (in document unit): ", true, {}, InputStep);
    var result = theDialog.Execute();
    if (result.ErrorCode != 0)// result == 0 means the user click on the "OK" button
        StopWithMessage("Operation canceled");

    while (isNaN(Number(result.InputTbl[0]))) // only store if valid number
    {
        print("Please enter a valid step number");
        result = theDialog.Execute();

        if (result.ErrorCode != 0)// result == 0 means the user click on the "OK" button
            StopWithMessage("Operation canceled");
    }

    InputStep = result.InputTbl[0];

    // Save parameters
    var line = "InputStep = " + InputStep + "\n";
    thefile.Open(SFile.WriteOnly);
    thefile.Write(line);
    thefile.Close();

    return {
        "Step": InputStep
        , "_DEBUG": false
    }
}

//-------------------------------------------------------------------------------
// Function to write a string character in a file
function SaveData(
    fileName // the file path
    , content // the content to write in the file
) {
    var file = SFile.New(fileName);
    // save the data
    if (!file.Open(SFile.WriteOnly))
        StopWithMessage('Failed to write file:' + fileName); // test if we can open the file

    // write the content in the file
    file.Write(content);
    // Close the file
    file.Close();
}

//-------------------------------------------------------------------------------
// function to stop and display the current message
function StopWithMessage(message) {
    var theDialog = SDialog.New('Catenary');
    theDialog.AddLine(message, false);
    var result = theDialog.Execute();

    throw new Error(message)
}

//-------------------------------------------------------------------------------
/**
 * @returns {SMultiline} The electric line extracted.
 */
function ExtractElectricLine() {
    // Cloud and point selection
    var visibleClouds = SCloud.All(1);
    if (visibleClouds.length > 0) {
        print("Click the cloud");
        var cloud = SCloud.FromClick().Cloud;
        print("Click a seed point on the cloud to extract the electric line.");
        var point = SPoint.FromClick().Point;

        var samplingStep = 0.5;

        // Electric line extraction  
        var res = cloud.RegionGrowFreePolyline(point, samplingStep);
        if (res.ErrorCode == 0) {
            res.Multi.SetName("Electric Polyline");
            res.Multi.SetColors(1.0, 0.0, 0.0);
            res.Multi.AddToDoc();

            return res.Multi;
        }
        else
            StopWithMessage("An error occured during electric line extraction.");
    }
    else
        StopWithMessage("No clouds displayed");
}

//-------------------------------------------------------------------------------
/**
* @typedef {Object} Axes
* @property {SMultiline} LeftRail The selected left rail
* @property {SMultiline} RightRail The selected right rail
* @property {SMultiline} TrackAxis The selected track axis
*/

/**
 * @returns {Axes} A structure containing the axes selected
 */

function SelectAxes() {
    var visibleLines = SMultiline.All(1);

    var leftRail;
    var rightRail;
    var trackAxis;

    if (visibleLines.length >= 4) {
        print("Click the left rail");
        var leftRailClicked = SMultiline.FromClick();
        while (leftRailClicked.ErrorCode != 0) {
            print("Failed to select the multiline. Please click the left rail");
            leftRailClicked = SMultiline.FromClick();
        }
        leftRail = leftRailClicked.Multi;

        print("Click the right rail");
        var rightRailClicked = SMultiline.FromClick();
        while (rightRailClicked.ErrorCode != 0) {
            print("Failed to select the multiline. Please click the right rail");
            rightRailClicked = SMultiline.FromClick();
        }
        rightRail = rightRailClicked.Multi;

        print("Click the track axis");
        var trackAxisClicked = SMultiline.FromClick();
        while (trackAxisClicked.ErrorCode != 0) {
            print("Failed to select the multiline. Please click the track axis");
            trackAxisClicked = SMultiline.FromClick();
        }
        trackAxis = trackAxisClicked.Multi;
    }
    else
        StopWithMessage("Not enough multilines displayed");

    if (leftRail.GetLength() <= 0 || rightRail.GetLength() <= 0 || trackAxis.GetLength() <= 0)
        StopWithMessage("Problem with multilines selection");

    return {
        "LeftRail": leftRail
        , "RightRail": rightRail
        , "TrackAxis": trackAxis
    }
}

//-------------------------------------------------------------------------------
/**
* @typedef {Object} IntersectionPoints
* @property {Number} ErrorCode the error code, 0 if no error, 1 a point is missing
* @property {SPoint} LeftPt The point on the left rail
* @property {SPoint} RightPt The point on the right rail
* @property {SPoint} TrackAxisPt The point on the track axis
* @property {SPoint} ElectricLinePt The point on the electricLine
*/

/**
 * The points are the intersection between a plane and the multilines: left and right rails, the track axis and the electric line
 * @param {SPoint} CurvPt The current curvilinear point. It will be the center of the plane.
 * @param {SVector} CurvDir The tangent at the current curvilinear point. It will be the normal of the plane.
 * @param {number} PlaneHeight The height of the plane
 * @param {number} PlaneWidth The width of the plane
 * @param {SMultiline} LeftRail The left rail selected by the user.
 * @param {SMultiline} RightRail The right rail selected by the user.
 * @param {SMultiline} TrackAxis The original track axis selected by the user.
 * @param {SMultiline} ElectricLine The original electric line.
 * @param {number} CurIndex The index of the current station.
 * @param {boolean} Debug True if we want debug elements.
 * @returns {IntersectionPoints} A structure containing an error code and the points on each multilines
 */
function GetPointsOnAxes(CurvPt, CurvDir, PlaneHeight, PlaneWidth, LeftRail, RightRail, TrackAxis, ElectricLine, CurIndex, Debug) {
    var plane = SPlane.New(CurvPt, CurvDir, SVector.New(0, 0, 1), PlaneHeight, PlaneWidth);

    if (Debug) {
        plane.SetName("Plane " + CurIndex);
        plane.AddToDoc();
        plane.MoveToGroup("/Debug", false);
    }

    var leftIntersection = LeftRail.IntersectionWithPlane(plane);
    if (leftIntersection.ErrorCode != 0)
        StopWithMessage("An error occurred during intersection computation.");

    var rightIntersection = RightRail.IntersectionWithPlane(plane);
    if (rightIntersection.ErrorCode != 0)
        StopWithMessage("An error occurred during intersection computation.");

    var trackAxisIntersection = TrackAxis.IntersectionWithPlane(plane);
    if (trackAxisIntersection.ErrorCode != 0)
        StopWithMessage("An error occurred during intersection computation.");

    var electricLineIntersection = ElectricLine.IntersectionWithPlane(plane);
    if (electricLineIntersection.ErrorCode != 0)
        StopWithMessage("An error occurred during intersection computation.");

    if (leftIntersection.PointTbl.length == 0 || rightIntersection.PointTbl.length == 0 || trackAxisIntersection.PointTbl.length == 0 || electricLineIntersection.PointTbl.length == 0) {
        return {
            "ErrorCode": 1
            , "LeftPt": SPoint.New()
            , "RightPt": SPoint.New()
            , "TrackAxisPt": SPoint.New()
            , "ElectricLinePt": SPoint.New()
        }
    }

    return {
        "ErrorCode": 0
        , "LeftPt": leftIntersection.PointTbl[0]
        , "RightPt": rightIntersection.PointTbl[0]
        , "TrackAxisPt": trackAxisIntersection.PointTbl[0]
        , "ElectricLinePt": electricLineIntersection.PointTbl[0]
    }
}

//-------------------------------------------------------------------------------
/**
 * Function to round a number
 * @param {number} Number The number to round
 * @param {number} Digits The number of digits
 * @returns {number} The rounded number
 */
function Round(Number, Digits) {
    var roundNumber = Math.round(Number * Math.pow(10, Digits));
    roundNumber = roundNumber / Math.pow(10, Digits);
    return roundNumber;
}

//-------------------------------------------------------------------------------
/**
 * Function to update a color gradient. Set a peg for positive value and negative ones.
 * @param {SColorGradient} The color gradient to update
 */
function UpdateColorGradient(ColorGradient) {
    //change the coloring method (refer to the help center)
    ColorGradient.SetInterpolation(SColorGradient.Linear);
    var curNbOfCursors = ColorGradient.GetNbCursor();

    //remove current cursors
    while (ColorGradient.GetNbCursor() > 2) {
        ColorGradient.DeleteCursor(1);
    }

    // Add new cursors
    var range = ColorGradient.GetRange();
    if (range.Max * range.Min < 0) {
        ColorGradient.AddCursor(0.0);

        var r1 = 0.0;
        var g1 = 0.0;
        var b1 = 1.0;

        var r2 = 1.0;
        var g2 = 0.0;
        var b2 = 0.0;

        ColorGradient.SetColAfter(0, r1, g1, b1);
        ColorGradient.SetColBefore(1, r1, g1, b1);

        ColorGradient.SetColAfter(1, r2, g2, b2);
        ColorGradient.SetColBefore(2, r2, g2, b2);
    }
    else {
        var r = 1.0;
        var g = 0.0;
        var b = 0.0;

        if (range.Max > 0) {
            r = 0.0;
            b = 1.0;
        }

        ColorGradient.SetColAfter(0, r, g, b);
        ColorGradient.SetColBefore(1, r, g, b);
    }
}

//-------------------------------------------------------------------------------
/**
* @typedef {Object} MultinesResampled
* @property {SMultiline} TrackAxisResampled The resampled track axis.
* @property {SMultiline} ElectricLineResampled The resampled electric line.
* @property {SMultiline} HorizontalMulti The multiline corresponding to the horizontal distances at each stations.
* @property {SMultiline} OrthoMulti The multiline corresponding to the ortho heights at each stations.
* @property {SMultiline} RightRailResampled The resampled right rail.
* @property {number[]} CurvilinearAbsc The curvilinear abscissas.
*/

/**
* @typedef {Object} CatenaryParam
* @property {number} Step the step for the catenary extraction in document unit
* @property {boolean} _DEBUG boolean indicating if we want to debug and add temporary objects to the document
*/

/**
 * Create the multilines from information at each station: track axis, electric line, horizontal distances and ortho heights. 
 * @param {SMultiline} LeftRail The left rail selected by the user.
 * @param {SMultiline} RightRail The right rail selected by the user.
 * @param {SMultiline} TrackAxis The original track axis selected by the user.
 * @param {SMultiline} ElectricLine The original electric line.
 * @param {CatenaryParam} Param The parameters of the script.
 * @returns {MultinesResampled} A structure containing the multilines computed.
 */
function CreateResampledMultilines(LeftRail, RightRail, TrackAxis, ElectricLine, Param) {
    // Get projection in 2D of trackAxis: this projection will be used for curvilinear points computation
    var hzPlane = SPlane.New(TrackAxis.GetPoint(0), SVector.New(0, 0, 1), SVector.New(1, 0, 0), 1, 1);
    var proj2D = hzPlane.ProjDir(TrackAxis, SVector.New(0, 0, 1));

    if (proj2D.ErrorCode != 0)
        StopWithMessage("Error during track axis projection");

    var trackAxis2D = proj2D.Multi;

    // Reverse trackAxis2D direction if different than trackAxis
    var vectTrackAxis2D = SVector.New(trackAxis2D.GetPoint(0), trackAxis2D.GetPoint(1));
    var vectorTrackAxis = SVector.New(TrackAxis.GetPoint(0), TrackAxis.GetPoint(1));
    if (SVector.Dot(vectTrackAxis2D, vectorTrackAxis) < 0)
        trackAxis2D.Reverse();

    if (Param._DEBUG) {
        trackAxis2D.SetName("trackAxis2D");
        trackAxis2D.SetColors(0.0, 0.0, 1.0);
        trackAxis2D.AddToDoc();
        trackAxis2D.MoveToGroup("/Debug", false);
    }

    // Output multilines
    var trackAxisResampled = SMultiline.New();
    var electricLineResampled = SMultiline.New();
    var orthoMulti = SMultiline.New();
    var horizontalMulti = SMultiline.New();
    var rightRailResampled = SMultiline.New();

    var curvAbsc = new Array();

    var i = 0;
    var stop = false;
    var indexCurvTbl = 0;

    // Plane dimensions, used to get points on each axes corresponding to curvPt0
    var planeWidth = Math.abs(LeftRail.GetPoint(0).Distance(RightRail.GetPoint(0)));
    var planeHeight = planeWidth;

    // Do until there is no more curvilinear point
    do {
        var step = Param.Step * i;
        var curvilinearPoint = trackAxis2D.GetPointAtDistance(step, true);
        if (curvilinearPoint.ErrorCode == 0) {
            var curvPt = curvilinearPoint.Point;
            var curvDir = curvilinearPoint.Vector;

            //Get points on the 3 rails, one on each, corresponding to curvPt and on the electric line
            var outputPts = GetPointsOnAxes(curvPt, curvDir, planeHeight, planeWidth, LeftRail, RightRail, TrackAxis, ElectricLine, i, Param._DEBUG);

            if (outputPts.ErrorCode == 0) {
                var leftPoint = outputPts.LeftPt;
                var rightPoint = outputPts.RightPt;
                var trackAxisPoint = outputPts.TrackAxisPt;
                var electricLinePoint = outputPts.ElectricLinePt;

                rightRailResampled.InsertLast(rightPoint, 0);

                if (Param._DEBUG) {
                    leftPoint.SetName("Left Point " + i);
                    rightPoint.SetName("Right Point " + i);
                    trackAxisPoint.SetName("Track Axis Point " + i);
                    electricLinePoint.SetName("Electric Line Point " + i);

                    leftPoint.AddToDoc();
                    rightPoint.AddToDoc();
                    trackAxisPoint.AddToDoc();
                    electricLinePoint.AddToDoc();

                    leftPoint.MoveToGroup("/Debug", false);
                    rightPoint.MoveToGroup("/Debug", false);
                    trackAxisPoint.MoveToGroup("/Debug", false);
                    electricLinePoint.MoveToGroup("/Debug", false);
                }

                // Add the point to the output multilines
                trackAxisResampled.InsertLast(trackAxisPoint, 0);
                electricLineResampled.InsertLast(electricLinePoint, 0);

                // Axes computation 
                var firstAxis = SVector.New(leftPoint, rightPoint).SetNormed();
                var thirdAxis = SVector.Cross(firstAxis, curvDir).SetNormed();

                // Points projection: Horizontal distance
                var multiHz = SMultiline.New();

                // Create two points on both sides of the trackAxisPoint in the direction of the firstAxis
                // With these points, a multiline will be created to project the electricLinePoint on it
                var distX = SVector.New(leftPoint, rightPoint).GetLength();
                var pointOnFirstAxis1 = trackAxisPoint.Add(SPoint.New(firstAxis.GetX(), firstAxis.GetY(), firstAxis.GetZ()).Mult(-0.7 * distX));
                var pointOnFirstAxis2 = trackAxisPoint.Add(SPoint.New(firstAxis.GetX(), firstAxis.GetY(), firstAxis.GetZ()).Mult(0.7 * distX));

                multiHz.InsertLast(pointOnFirstAxis1, 0);
                multiHz.InsertLast(pointOnFirstAxis2, 0);

                if (Param._DEBUG) {
                    multiHz.SetName("First Axis " + i);
                    multiHz.AddToDoc();
                    multiHz.MoveToGroup("/Debug", false);
                }

                var projHzDistance = multiHz.ProjDir(electricLinePoint, thirdAxis.Mult(-1), 0);

                if (projHzDistance.ErrorCode != 0)
                    StopWithMessage("Error with projection of the electric line point on first axis");

                var projHzDistancePt = projHzDistance.Point;

                // Add the point to the output multiline
                horizontalMulti.InsertLast(projHzDistancePt, 0);

                // Points projection: Ortho height
                var distZ = Math.abs(trackAxisPoint.Distance(electricLinePoint));
                var pointOnThirdAxis = trackAxisPoint.Add(SPoint.New(thirdAxis.GetX(), thirdAxis.GetY(), thirdAxis.GetZ()).Mult(1.3 * distZ));

                var multiThirdAxis = SMultiline.New();
                multiThirdAxis.InsertFirst(trackAxisPoint, 0);
                multiThirdAxis.InsertLast(pointOnThirdAxis, 0);

                if (Param._DEBUG) {
                    multiThirdAxis.SetName("Third Axis " + i);
                    multiThirdAxis.AddToDoc();
                    multiThirdAxis.MoveToGroup("/Debug", false);
                }

                var projOrthoHeight = multiThirdAxis.ProjDir(electricLinePoint, firstAxis, 0);
                if (projOrthoHeight.ErrorCode != 0) {
                    projOrthoHeight = multiThirdAxis.ProjDir(electricLinePoint, firstAxis.Mult(-1), 0);
                    if (projOrthoHeight.ErrorCode != 0)
                        StopWithMessage("Error with projection of the electric line point on third axis");
                }

                var projOrthoHeightPt = projOrthoHeight.Point;

                // Add the point to the output multiline
                orthoMulti.InsertLast(projOrthoHeightPt, 0);

                // Save curvilinear abscissa
                curvAbsc[indexCurvTbl] = step;
                indexCurvTbl++;
            }

            i++;
        }
        else if (curvilinearPoint.ErrorCode == 1) // Case where we can't reach the next curvilinear point
            stop = true;
        else
            StopWithMessage("An error occurred in GetPointAtDistance");

    }
    while (!stop)

    if (trackAxisResampled.GetNumber() != curvAbsc.length)
        StopWithMessage("An error occurred in CreateResampledMultilines");

    if (Param._DEBUG) {
        horizontalMulti.SetName("Horizontal distance");
        horizontalMulti.SetColors(1.0, 1.0, 0.0);
        horizontalMulti.AddToDoc();
        horizontalMulti.MoveToGroup("/Debug", false);

        orthoMulti.SetName("Ortho height");
        orthoMulti.SetColors(1.0, 0.0, 0.0);
        orthoMulti.AddToDoc();
        orthoMulti.MoveToGroup("/Debug", false);
    }

    return {
        "TrackAxisResampled": trackAxisResampled
        , "ElectricLineResampled": electricLineResampled
        , "HorizontalMulti": horizontalMulti
        , "OrthoMulti": orthoMulti
        , "RightRailResampled": rightRailResampled
        , "CurvilinearAbsc": curvAbsc
    };
}

//-------------------------------------------------------------------------------
/**
* @typedef {Object} InspectedMultis
* @property {SMultiline} HorizontalInspected The inspected multiline corresponding to the horizontal distances.
* @property {SMultiline} OrthoInspected The inspected multiline corresponding to the ortho heights.
*/

/**
 * Create the inspected multilines which are the comparison between HorizontalMulti/OrthoMulti and the track axis resampled
 * @param {SMultiline} HorizontalMulti The multiline corresponding to the horizontal distances at each stations.
 * @param {SMultiline} OrthoMulti The multiline corresponding to the ortho heights at each stations.
 * @param {SMultiline} TrackAxisResampled The resampled track axis.
 * @returns {InspectedMultis} A table containing the multilines inspected.
 */
function ComputeComparisonMultis(HorizontalMulti, OrthoMulti, TrackAxisResampled) {
    // Horizontal
    var comparisonHorizontal = HorizontalMulti.Compare(TrackAxisResampled, 0, SVector.New(), 1, false, true, true);

    if (comparisonHorizontal.ErrorCode != 0)
        StopWithMessage("An error occured during horizontal comparison.");

    var horizontalInspected = comparisonHorizontal.Multi;

    UpdateColorGradient(horizontalInspected.GetColorGradient().Gradient);

    // Ortho
    var comparisonOrtho = OrthoMulti.Compare(TrackAxisResampled, 0, SVector.New(), 1, false, true, true);

    if (comparisonOrtho.ErrorCode != 0)
        StopWithMessage("An error occured during horizontal comparison.");

    var orthoInspected = comparisonOrtho.Multi;

    UpdateColorGradient(orthoInspected.GetColorGradient().Gradient);

    return {
        "HorizontalInspected": horizontalInspected
        , "OrthoInspected": orthoInspected
    };
}

//-------------------------------------------------------------------------------
/**
 * Function to get the separator used for the thousands.
 * @returns {string} The separator.
 */
function GetSeparatorThousand() {
    var thousand = ToLocaleString(1000);
    if (Number(thousand.charAt(1)) == 0)
        return "";

    return thousand.charAt(1);
}

//-------------------------------------------------------------------------------
/**
 * Convert the string of the number by deleting the separator used for the thousands.
 * @returns {string} The number converted into local string.
 */
function ConvertNumberString(NumberToConvert) {
    var thousandSeparator = GetSeparatorThousand();
    var str = ToLocaleString(NumberToConvert);
    if (thousandSeparator != "") 
    {    
        var newStr = str.replace(thousandSeparator, "");
        while(newStr != str)
        {
            str = newStr;
            newStr = str.replace(thousandSeparator, "");
        }
        
        return newStr;
    }

    return str;
}

//-------------------------------------------------------------------------------
/**
 * Depending on the separator used for the thousands, return the local separator list.
 * @returns {string} The local separator list.
 */
function GetLocalSeparator() {
    var thousandSeparator = GetSeparatorThousand();

    var breakingSpace = " ";

    if (thousandSeparator == breakingSpace || thousandSeparator == "."
        || thousandSeparator == " ")
        return ";";
    else
        return ",";
}

//-------------------------------------------------------------------------------
/**
 * Create the csv file with the data: 3D coordinates of the station, the height of the wire, the horizontal distance and the curvilinear abscissa
 * @param {MultinesResampled} MultisResampled A structure containing the multilines computed in CreateResampledMultilines()
 * @param {number} Digits Number of digits in the csv file
 * @param {number[]} CurvilinearAbsc The curvilinear abscissas
 */
function ComputeCSVFile(MultisResampled, Digits, CurvAbsc) {
    var dataValues = "";
    var separator = GetLocalSeparator();

    for (var index = 0; index < MultisResampled.TrackAxisResampled.GetNumber(); index++) {
        var trackAxisPoint = MultisResampled.TrackAxisResampled.GetPoint(index);
        var projHzDistancePt = MultisResampled.HorizontalMulti.GetPoint(index);
        var projOrthoHeightPt = MultisResampled.OrthoMulti.GetPoint(index);

        var firstAxis = SVector.New(trackAxisPoint, MultisResampled.RightRailResampled.GetPoint(index));

        // Distances computation
        var hzDist = projHzDistancePt.Distance(trackAxisPoint);
        if (SVector.Dot(SVector.New(trackAxisPoint, projHzDistancePt), firstAxis) < 0)
            hzDist *= -1;
        var orthoHeight = projOrthoHeightPt.Distance(trackAxisPoint);

        // Data for csv file
        dataValues += ConvertNumberString(Round(trackAxisPoint.GetX(), Digits))
            + separator + ConvertNumberString(Round(trackAxisPoint.GetY(), Digits))
            + separator + ConvertNumberString(Round(trackAxisPoint.GetZ(), Digits))
            + separator + ConvertNumberString(Round(hzDist, Digits))
            + separator + ConvertNumberString(Round(orthoHeight, Digits))
            + separator + ConvertNumberString(CurvAbsc[index]) + "\n";
    }

    // First line of the csv file while contain the column title
    var Data = "X" + separator + "Y" + separator + "Z" + separator + "Height" + separator + "Distance" + separator + "Station\n";

    Data += dataValues;

    // Get from the user the filepath to save the csv
    var fileName = GetSaveFileName("Save file", "Text files (*.csv)");

    if (fileName.length == 0)
        StopWithMessage("No csv file saved.");

    // Add the suffix .csv at the end of your filename if necessary
    if (fileName.lastIndexOf(".csv") != (fileName.length - 4))
        fileName += ".csv";
    print(fileName); // display the filepath in the ouput window

    // Save the data in the file
    SaveData(fileName, Data);
    // Open the folder where the csv file is
    var urlFilename = "file:///" + fileName.replace("\\", "/");
    var index = urlFilename.lastIndexOf("/")
    var urlFolder = urlFilename.substring(0, index + 1);
    OpenUrl(urlFolder);
}

//-------------------------------------------------------------------------------
/**
 * The main function
 */
function main() {
    var digits = 3; // Round value in mm

    // Step 1: Get parameters
    var Param = GetParam();

    var electricLine = SMultiline.New();
    var multis = SMultiline.FromSel();

    // Step 2 & 3: Electric line
    if (multis.length > 0 && multis[0].GetLength() > 0)
        electricLine = multis[0];
    else
        electricLine = ExtractElectricLine();

    if (!electricLine.IsVisible())
        electricLine.SetVisibility(true);

    // Step 4: Select elements for catenary script computation: left rail, right rail and track axis
    var multilinesSelected = SelectAxes();

    var leftRail = multilinesSelected.LeftRail;
    var rightRail = multilinesSelected.RightRail;
    var trackAxis = multilinesSelected.TrackAxis;

    // Step 5: Computation

    var multisResampled = CreateResampledMultilines(leftRail, rightRail, trackAxis, electricLine, Param);

    multisResampled.TrackAxisResampled.SetName("Track axis resampled");
    multisResampled.TrackAxisResampled.AddToDoc();
    multisResampled.TrackAxisResampled.MoveToGroup("/Output/", false);

    multisResampled.ElectricLineResampled.SetName("Electric line resampled");
    multisResampled.ElectricLineResampled.AddToDoc();
    multisResampled.ElectricLineResampled.MoveToGroup("/Output/", false);

    var inspectedMultis = ComputeComparisonMultis(multisResampled.HorizontalMulti, multisResampled.OrthoMulti, multisResampled.TrackAxisResampled);

    inspectedMultis.HorizontalInspected.SetName("Horizontal inspected");
    inspectedMultis.HorizontalInspected.AddToDoc();
    inspectedMultis.HorizontalInspected.MoveToGroup("/Output/", false);

    inspectedMultis.OrthoInspected.SetName("Ortho inspected");
    inspectedMultis.OrthoInspected.AddToDoc();
    inspectedMultis.OrthoInspected.MoveToGroup("/Output/", false);

    // Step 6: Save csv file
    ComputeCSVFile(multisResampled, digits, multisResampled.CurvilinearAbsc);
}

//-------------------------------------------------------------------------------
// MAIN
//-------------------------------------------------------------------------------

main();