/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

var curPath = CurrentScriptPath() + '\\';

Include(curPath + "00_Util.js");
Include(curPath + "00_Variables.js");
Include(curPath + "01_Initialize.js");
Include(curPath + "02_NextExtraction.js");

function main() {
    var _DEBUG = false;

    var now = new Date();
    var curDate = now.getFullYear() + "_" + now.getMonth() + "_" + now.getDate() + "_" + now.getHours() + "_" + now.getMinutes();

    //--------------------------------------------------------------
    // Load the line
    var directLineName = GetOpenFileName("Open Directrice Line", "DXF files (*.dxf)", CurrentScriptPath());
    if (directLineName.length == 0)
        throw new Error('Impossible to continue, no file selected.');

    var result = SSurveyingFormat.ImportProject(directLineName);
    if (result.ErrorCode != 0)
        throw new Error("Impossible to load the *.dxf file.");
    if (result.ShapeTbl.length > 1)
        throw new Error("Too many lines in the dxf file");
    else if (result.ShapeTbl.length == 0)
        throw new Error("No lines in the dxf file");

    var shapePath = result.ShapeTbl[0];
    var discretizeResult = SCADUtil.Discretize(shapePath);
    if (discretizeResult.ErrorCode != 0)
        throw new Error("Impossible to discretize.");
    if ("MultiTbl" in discretizeResult == false)
        throw new Error("No multiline has been discretized.");
    if (discretizeResult.MultiTbl.length != 1)
        throw new Error("The line path is composed of multiple lines.");

    var linePath = discretizeResult.MultiTbl[0];
    linePath.AddToDoc();

    //--------------------------------------------------------------
    // Load the cloud
    var fileName;

    fileName = GetOpenFileName("Open Cloud", "LAZ files (*.laz)", CurrentScriptPath());
    if (fileName.length == 0)
        throw new Error('Impossible to continue, no file selected.');

    var suffix = fileName.slice(fileName.lastIndexOf('.'), fileName.length);// print("Suffix: " + suffix)
    var prefix = fileName.slice(0, fileName.lastIndexOf('_') + 1);// print("Prefix: " + prefix)
    var CloudIdxPart = fileName.slice(fileName.lastIndexOf('_') + 1, fileName.lastIndexOf('.'));// print(CloudIdxPart)
    var cloudIndex = Math.abs(parseInt(CloudIdxPart));// print(cloudIndex)

    var cloudToTreat = LoadCloud(fileName);

    ZoomOn([cloudToTreat], 2000);

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
    do {
        print("=============================");
        print("Extract on cloud number: " + cloudIndex);

        var initialTrack = TrackData[0];
        var lastTrack;
        var ExtractionIsOk = false;
        while (TrackData.length > 0) {
            // running the extraction routine
            result = Extract(cloudToTreat, TrackData[0], linePath);
            if (result.ErrorCode == 0) {
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
        var nextFilename = prefix + cloudIndex + suffix;
        if (cloudIndex < 10)
            nextFilename = prefix + "0" + cloudIndex + suffix;

        print(nextFilename)

        var fileToTest = SFile.New(nextFilename);
        if (ExtractionIsOk == true && fileToTest.Open(SFile.ReadOnly)) {
            nextCloud = true;
            fileToTest.Close();

            cloudToTreat.RemoveFromDoc();
            cloudToTreat.Clear();
            TrackData.push(lastTrack);
            cloudToTreat = LoadCloud(nextFilename);
        }
    }
    while (nextCloud == true)

    //-------------------------------------------------------
    //remove the multilines if their length is null
    var leftlinelenght = LeftLine.GetLength();
    var rightlinelenght = RightLine.GetLength();
    if (leftlinelenght == 0 && rightlinelenght == 0) {
        LeftLine.RemoveFromDoc();
        RightLine.RemoveFromDoc();
        print("=============================");
        print("No line extracted.");
        print("=============================");
    }

}

main(); // call of the main function
