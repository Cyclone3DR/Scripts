/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

//Input selection: here select lines before running the script
var iLinesTbl = SLine.FromSel();

//Pseudo theoretical length of the lines
let _lengthRef = 1.145;

// Measure counter
let _counter = 0;

/*
 * Add basic information from a single Line object
 * 
 */
function AddLengthInfos(iLine)
{
    let length = iLine.GetLength();
    let p1 = iLine.GetFirstPoint();
    let p2 = iLine.GetLastPoint();

    let attachPoint = SPoint.New(0.5 * (p1.GetX() + p2.GetX()), 0.5 * (p1.GetY() + p2.GetY()), 0.5 * (p1.GetZ() + p2.GetZ()));    

    let meas = SMeasure.New(`Measure of ${iLine.GetName()}`, attachPoint, _counter++);

    meas.AddRow({
        "key": "meas"+iLine.GetName(),
        "name": "Length",
        "unit": "m",
        "values" : [{
            "key": "meas"+iLine.GetName()+"_value",
            "value": length
        }]
    });

    meas.AddRow({
        "key": "meas"+iLine.GetName()+"center",
        "name": "Center",
        "unit": "m",
        "values" : [{
            "key": "meas"+iLine.GetName()+"_cx",
            "prefix": "X",
            "value": attachPoint.GetX()
        },
        {
            "key": "meas"+iLine.GetName()+"_cy",
            "prefix": "Y",
            "value": attachPoint.GetY()
        },
        {
            "key": "meas"+iLine.GetName()+"_cz",
            "prefix": "Z",
            "value": attachPoint.GetZ()
        }]
    });

    meas.AddToDoc();
}

/*
 * Add comparison information on a selected Line
 * 
 */
function AddComparisonInfos(iLine)
{
    let length = iLine.GetLength();
    let p1 = iLine.GetFirstPoint();
    let p2 = iLine.GetLastPoint();

    let attachPoint = SPoint.New(0.5 * (p1.GetX() + p2.GetX()), 0.5 * (p1.GetY() + p2.GetY()), 0.5 * (p1.GetZ() + p2.GetZ()));    

    let meas = SMeasure.New(`Line inspection (${iLine.GetName()})`, attachPoint, _counter++);

    meas.AddRow({
        "key": "meas"+iLine.GetName(),
        "name": "Length",
        "unit": "m",
        "values" : [{
            "key": "meas"+iLine.GetName()+"_value",
            "value": length
        }]
    });

    let lineDiff = length - _lengthRef;
    let tol = 0.01;
    meas.AddRow({
        "key": "meas"+iLine.GetName(),
        "name": "∆ Length",
        "unit": "m",
        "tolMin": -tol,
        "tolMax": tol,
        "values" : [{
            "key": "meas"+iLine.GetName()+"_delta",
            "value": lineDiff
        }]
    });
    meas.AddToDoc();

    if(Math.abs(lineDiff) > tol)
    {
        meas.SetComment("⚠️This line is too large.");
    }
}

/*
 * Main
 */

var allLines = SLine.All();
if(allLines.length != 5)
{
    print(`Script is expecting 5 lines in the document. Found ${allLines.length}.`);
}

print(`Selected ${allLines.length} lines.`)

print("1. Add basic geometry infos...")
AddLengthInfos(allLines[0]);
AddLengthInfos(allLines[1]);

print("2. Add comparison infos...")
AddComparisonInfos(allLines[2]);
AddComparisonInfos(allLines[3]);
AddComparisonInfos(allLines[4]);