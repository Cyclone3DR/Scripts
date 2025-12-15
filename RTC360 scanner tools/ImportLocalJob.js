/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

// ===================================================================
// --- RTC360 Import Local Job Script ---
// This script retrieves a job stored locally and imports its point
// clouds into 3DR with detailed error handling based on the final binding.
// ===================================================================
print("--- RTC360 Test: Import Local Job ---");

// Helper function to interpret and print detailed error messages for ImportLocalJob
function handleError(functionName, errorCode) {
    var errorMessage = "An unknown or unhandled error occurred.";
    switch (errorCode) {
        case 0: return true; // Success
        case 1: errorMessage = "An unknown or unhandled error occurred."; break;
        case 2: errorMessage = "The job's path is invalid. Please select a valid job folder."; break;
        case 3: errorMessage = "The API failed to mount the path. Check folder permissions."; break;
        case 4: errorMessage = "Failed to retrieve the list of jobs from the mounted directory."; break;
        case 5: errorMessage = "An operation failed during the import process (e.g., reading a setup)."; break;
    }
    print("Error in function '" + functionName + "' (Code " + errorCode + "): " + errorMessage);
    return false;
}

// 1. Create the file browser window to select the job directory.
var dialog = SDialog.New("Select RTC360 Job Directory");
var options = { 'id': 'myFilePath', 'name': 'Job Folder', 'mode': SDialog.EMode.OpenDirectory, 'saveValue': true};
dialog.AddFileSelector(options);
var res = dialog.Run();

if (res.ErrorCode == 0 && res.myFilePath) {
    var jobPath = new String(res.myFilePath);
    var last = jobPath.lastIndexOf("-");

    jobPath = jobPath.slice(0, last);

    // 2. Define the import options.
    var importOptions = {
        dirName: jobPath,
        cloud: true,
        color: true // Set to true to import color, false otherwise
    };

    print("Starting import from directory: " + importOptions.dirName);

    // 3. Call the static ImportLocalJob function.
    var result = SRTC360Interface.ImportLocalJob(importOptions);

    print("--- Results ---");
    if (handleError("ImportLocalJob", result.ErrorCode)) {
        if (result.CloudTbl && result.CloudTbl.length > 0) {
            print("Success! " + result.CloudTbl.length + " point cloud(s) were imported.");
            for (var i = 0; i < result.CloudTbl.length; i++) {
                var aCloud = result.CloudTbl[i];
                var newName = "RTC360_Local_Setup_" + (i + 1);
                aCloud.SetName(newName);
                aCloud.SetCloudRepresentation('intensity');
                aCloud.AddToDoc();
                ZoomAll();
                print("Added '" + newName + "' to the document.");
            }
        } else {
            print("Import was successful, but no point clouds were found or created.");
        }
    }
} else {
    print("Import cancelled by user.");
}

print("--- End of script ---");
