/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>


var curPath = CurrentScriptPath() + '\\';

Include(curPath + "00_Util.js");
Include(curPath + "00_Variables.js");
Include(curPath + "01_Initialize.js");
Include(curPath + "02_NextExtraction.js");

function main() {
    var linePath = SMultiline.All(1)[0]; // path followed by the scanner
    var cloudToTreat = SCloud.All(1)[0]; // the Cloud to process

    var lineLength = linePath.GetLength();
    print("Number of points in the cloud: " + cloudToTreat.GetNumber())

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
    LeftLine.SetName("Left Line")
    LeftLine.SetColors(1, 0, 0);
    LeftLine.AddToDoc();
    LeftLine.InsertLast(result.LeftPt);

    var RightLine = SMultiline.New();
    RightLine.SetName("Right Line")
    RightLine.SetColors(1, 0, 0);
    RightLine.AddToDoc();
    RightLine.InsertLast(result.RightPt);

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
