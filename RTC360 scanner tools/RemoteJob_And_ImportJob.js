// ===================================================================
// --- RTC360 Full Workflow Script ---
// This script automates the entire process from job creation to import,
// with detailed error handling at every step based on the final binding.
// ===================================================================
print("--- Initializing RTC360 Full Workflow ---");

// Helper function to interpret and print detailed error messages for all functions
function handleError(functionName, errorCode) {
    if (errorCode == 0) return true; // Success, no message needed.
    
    var errorMessage = "An unknown or unhandled error occurred.";
    // Add all possible error codes here for a comprehensive handler
    switch (errorCode) {
        // Shared
        case 1: errorMessage = "An unknown or unhandled error occurred."; break;
        case 2: errorMessage = "The scanner is disconnected."; break;
        // CreateJob / SelectJob
        case 3: errorMessage = "Job-related error: could not find or retrieve job list."; break;
        case 4: errorMessage = "Could not create a job with the specified name (it may be invalid)."; break;
        case 5: errorMessage = "Job already exists or was not found."; break;
        // StartScan
        case 3: errorMessage = "No job was selected prior to starting the scan."; break;
        case 4: errorMessage = "The measurement operation failed to start."; break;
        // ImportJob
        case 6: errorMessage = "The download operation failed as part of the import."; break;
    }
    print("FATAL ERROR in function '" + functionName + "' (Code " + errorCode + "): " + errorMessage + ". Workflow stopped.");
    return false;
}

// --- Configuration ---
var localDownloadPath = "C:/Temp";
// --- End Configuration ---

try {
    // 1. Connect
    var rtc = SRTC360Interface.New();
    if (!rtc || !rtc.IsConnected()) {
        throw new Error("Failed to connect to scanner. Please check connection.");
    }
    print("--> Step 1: Successfully connected to scanner.");

    // 2. Create Job
    var newJobName = "Workflow_Job_" + new Date().getTime();
    print("--> Step 2: Creating new job named '" + newJobName + "'...");
    var createResult = rtc.CreateJob(newJobName);
    if (!handleError("CreateJob", createResult.ErrorCode)) {
        throw new Error("Job creation failed.");
    }
    print("--> Step 2: Successfully created job.");

    // 3. Select Job
    print("--> Step 3: Selecting job '" + newJobName + "'...");
    var selectResult = rtc.SelectJob(newJobName);
    if (!handleError("SelectJob", selectResult.ErrorCode)) {
        throw new Error("Job selection failed.");
    }
    print("--> Step 3: Successfully selected job.");

    // 4. Start Scan
    var scanOptions = {
        resolution: 0, // Low
        imaging: true,
        doubleScan: false,
        vis: false,
    };
    print("--> Step 4: Starting scan...");
    var scanResult = rtc.StartScan(scanOptions);
    if (!handleError("StartScan", scanResult.ErrorCode)) {
        throw new Error("Start scan failed.");
    }
    print("--> Step 4: Scan completed successfully.");

    // 5. Import Job
    print("--> Step 5: Importing scan data from job '" + newJobName + "'...");
    var importOptions = {
        jobName: newJobName,
        dirName: localDownloadPath,
        cloud: true,
        color: true
    };
    var importResult = rtc.ImportJob(importOptions);
    if (!handleError("ImportJob", importResult.ErrorCode)) {
        throw new Error("Job import failed.");
    }
    print("--> Step 5: Import process completed.");

    // 6. Add Clouds to Document
    if (importResult.CloudTbl && importResult.CloudTbl.length > 0) {
        print("--> Step 6: Adding " + importResult.CloudTbl.length + " point cloud(s) to the document...");
        for (var i = 0; i < importResult.CloudTbl.length; i++) {
            var aCloud = importResult.CloudTbl[i];
            var cloudName = newJobName + "_Setup_" + (i + 1);
            aCloud.SetName(cloudName);
            aCloud.SetCloudRepresentation(importOptions.color ? 'rgb' : 'intensity');
            aCloud.AddToDoc();
            print("     - Added '" + cloudName + "' to the document.");
        }
        ZoomAll();
        print("--> Step 6: Workflow complete!");
    } else {
        print("Warning: Import was successful, but no point clouds were found in the job.");
    }

} catch (e) {
    print("SCRIPT HALTED: " + e.message);
}

print("--- End of script ---");
