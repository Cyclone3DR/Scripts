/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

// 1. Picking points
print("Picking points...");

// Loop to pick as many points as we want
let doContinue = true;

while(doContinue)
{
    let retFromClick = SPoint.FromClick();

    if(retFromClick.ErrorCode == 0)
    {
        let clickedPt = retFromClick.Point;
        clickedPt.AddToDoc();

        clickedPt.SetColors(1, 0, 0); // red
        clickedPt.SetName("PT"); // "PT" name
        clickedPt.ShowName(true); // show the name in the scene
        clickedPt.SetPointSize(10); // big points
    }
    else // No point 
    {
        print("No point have been selected!");
    }

    // Check if the loop need to be exit
    if(retFromClick.ErrorCode != 0)
        doContinue = false;
}


// 2. Exporting to CSV
print("Export...");

// Ask to save a file
let filePath = GetSaveFileName("Select file to save", "CSV files (*.CSV", "D:/ScriptDemo/");

// Create the file and save it
if(filePath.length > 0)
{
    var file = new SFile(filePath);
    if(file.Open(SFile.WriteOnly))
    {
        // Write header
        file.Write("Name;X;Y;Z\n");

        // Write point data
        for(let pt of SPoint.All())
        {
            let row = pt.GetName() +";";
            row += pt.GetX() +";";
            row += pt.GetY() +";";
            row += pt.GetZ() +"\n";

            file.Write(row);
        }

        file.Close();

        // Open the file once it's done
        OpenUrl(filePath);
    }
}