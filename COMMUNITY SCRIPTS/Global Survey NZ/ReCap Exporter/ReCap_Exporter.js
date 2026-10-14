// ReCap_Exporter.js (v2.6 - Oct 13 2026)
// Automates exporting Cyclone 3DR Point Clouds to Autodesk ReCap (.rcp/.rcs)
// Uses Autodesk DeCap.exe in the background.
// Supports structured setups, panoramic images (SImage), and background processing.

print("Starting ReCap Exporter v2.6 (Updated Oct 13 2026)...");

// 1. Gather point clouds (selected or visible)
var clouds = SCloud.FromSel();
if (clouds.length === 0) {
    print("No clouds selected. Grabbing all visible clouds instead...");
    var allClouds = SCloud.All();
    for (var c = 0; c < allClouds.length; c++) {
        if (allClouds[c].IsVisible()) clouds.push(allClouds[c]);
    }
    
    if (clouds.length === 0) {
        throw new Error("No visible point clouds found in the project. Please load or display a cloud.");
    }
}

// 2. Inventory all components in document to discover images and object types
print("=== Component Inventory ===");
var allComps = SComp.All(SComp.ANY_VISIBILITY);
print("Total components in project: " + allComps.length);
var detectedImageSets = [];
var detectedSImages = [];

for (var ci = 0; ci < allComps.length; ci++) {
    var cType = allComps[ci].toString();
    var cName = allComps[ci].GetName();
    print("  [" + ci + "] " + cName + " (" + cType + ")");
    
    if (cType === "SImage" || typeof allComps[ci].GetImageType === "function") {
        detectedSImages.push(allComps[ci]);
        if (typeof allComps[ci].GetCameraExternalParameters === "function") {
            try {
                var cam = allComps[ci].GetCameraExternalParameters();
                if (cam && cam.CameraExternal) {
                    var ori = cam.CameraExternal.GetOrientation();
                    if (ori) {
                        print("      Camera Orientation: RotX=" + ori.RotX.toFixed(1) + "°, RotY=" + ori.RotY.toFixed(1) + "°, RotZ=" + ori.RotZ.toFixed(1) + "°");
                    }
                }
            } catch (eOri) {}
        }
    } else if (cName.toLowerCase().indexOf("image") !== -1 || cType.indexOf("Image") !== -1) {
        detectedImageSets.push(allComps[ci]);
    }
}
print("Point clouds for export: " + clouds.length);
print("Standalone SImage objects: " + detectedSImages.length);
print("Set of images (DSetImage) containers: " + detectedImageSets.length);
print("============================");

// Helper: Ensure images are spherical (Autodesk ReCap strictly requires spherical panoramas for RealViews)
function prepareSphericalImages(images, cloud) {
    if (!images || images.length === 0) return [];
    
    var spherical = [];
    var perspective = [];
    
    for (var i = 0; i < images.length; i++) {
        var img = images[i];
        if (typeof img.GetImageType === "function") {
            var tRes = img.GetImageType();
            if (tRes && tRes.ImageType === SImage.SPHERICAL) {
                spherical.push(img);
            } else {
                perspective.push(img);
            }
        }
    }
    
    if (spherical.length > 0) {
        return spherical;
    }
    
    if (perspective.length > 0) {
        try {
            print("Converting " + perspective.length + " perspective image(s) to 360 spherical panorama for ReCap...");
            var sphRes = SImage.SphericalFromPerspectiveImages(perspective, 1.0, cloud);
            if (sphRes && sphRes.ErrorCode === 0 && sphRes.ImageTbl && sphRes.ImageTbl.length > 0) {
                print("Generated " + sphRes.ImageTbl.length + " spherical panorama(s)!");
                return sphRes.ImageTbl;
            }
        } catch (err) {
            print("Spherical conversion note: " + err);
        }
    }
    
    return images;
}

// Helper: Match images to a specific cloud (Index-based, Name/Folder matching, or Scanner Station Proximity)
function findImagesForCloud(cloud, cloudIndex, availableImages, allClouds) {
    if (!availableImages || availableImages.length === 0) return [];
    
    if (allClouds.length === 1) {
        return availableImages;
    }
    
    var matched = [];
    var cloudName = cloud.GetName().toLowerCase().trim();
    var cloudFolder = (typeof cloud.GetFolderName === "function") ? cloud.GetFolderName() : "";
    
    // 1. Try matching by exact/partial name or shared folder
    for (var i = 0; i < availableImages.length; i++) {
        var img = availableImages[i];
        var imgName = img.GetName().toLowerCase().trim();
        var imgFolder = (typeof img.GetFolderName === "function") ? img.GetFolderName() : "";
        if (imgName === cloudName || cloudName.indexOf(imgName) !== -1 || imgName.indexOf(cloudName) !== -1) {
            matched.push(img);
        } else if (cloudFolder !== "" && imgFolder !== "" && cloudFolder === imgFolder) {
            matched.push(img);
        }
    }
    if (matched.length > 0) return matched;
    
    // 2. Spatial Station Origin / Camera Position Matching: Pair each image with the cloud station closest to camera
    try {
        for (var j = 0; j < availableImages.length; j++) {
            var candImg = availableImages[j];
            if (typeof candImg.GetCameraExternalParameters === "function") {
                var camRes = candImg.GetCameraExternalParameters();
                if (camRes && camRes.ErrorCode === 0 && camRes.CameraExternal) {
                    var posRes = camRes.CameraExternal.GetPosition();
                    if (posRes && posRes.Point) {
                        var pX = posRes.Point.GetX();
                        var pY = posRes.Point.GetY();
                        var pZ = posRes.Point.GetZ();
                        
                        var bestCloud = null;
                        var bestDistSq = Infinity;
                        
                        for (var k = 0; k < allClouds.length; k++) {
                            var kX = 0, kY = 0, kZ = 0;
                            var foundPos = false;
                            
                            // Check native scanner station origin
                            if (typeof allClouds[k].GetScanningPositions === "function") {
                                var scanPosRes = allClouds[k].GetScanningPositions();
                                if (scanPosRes && scanPosRes.ErrorCode === 0 && scanPosRes.PointTbl && scanPosRes.PointTbl.length > 0) {
                                    kX = scanPosRes.PointTbl[0].GetX();
                                    kY = scanPosRes.PointTbl[0].GetY();
                                    kZ = scanPosRes.PointTbl[0].GetZ();
                                    foundPos = true;
                                }
                            }
                            
                            // Fallback to bounding box center if scanner station origin is not present
                            if (!foundPos) {
                                var kBox = allClouds[k].GetBoundingBox();
                                if (kBox && kBox.ErrorCode === 0) {
                                    kX = (kBox.LowPoint.GetX() + kBox.UpPoint.GetX()) / 2.0;
                                    kY = (kBox.LowPoint.GetY() + kBox.UpPoint.GetY()) / 2.0;
                                    kZ = (kBox.LowPoint.GetZ() + kBox.UpPoint.GetZ()) / 2.0;
                                }
                            }
                            
                            var distSq = (pX - kX)*(pX - kX) + (pY - kY)*(pY - kY) + (pZ - kZ)*(pZ - kZ);
                            if (distSq < bestDistSq) {
                                bestDistSq = distSq;
                                bestCloud = allClouds[k];
                            }
                        }
                        
                        if (bestCloud === cloud) {
                            matched.push(candImg);
                            print("  [Auto-Pair] Matched image [" + candImg.GetName() + "] -> cloud [" + cloud.GetName() + "] (distance: " + Math.sqrt(bestDistSq).toFixed(2) + "m)");
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Fallback gracefully
    }
    
    if (matched.length > 0) return matched;
    
    // 3. Fallback: only if spatial matching found nothing (e.g. no camera parameters), match by index
    if (availableImages.length === allClouds.length && cloudIndex < availableImages.length) {
        matched.push(availableImages[cloudIndex]);
    }
    
    return matched;
}

// Helper: Apply temporary yaw rotation around Z-axis to camera external parameters for RealView alignment
function applyTemporaryImageYaw(img, yawDeg) {
    if (!img || yawDeg === 0) return null;
    if (typeof img.GetCameraExternalParameters !== "function") return null;
    
    try {
        var camRes = img.GetCameraExternalParameters();
        if (!camRes || camRes.ErrorCode !== 0 || !camRes.CameraExternal) return null;
        
        var ext = camRes.CameraExternal;
        var orient = ext.GetOrientation();
        if (!orient) return null;
        
        // Store exact primitive numbers so restoration is 100% immune to object mutation
        var origRotX = orient.RotX;
        var origRotY = orient.RotY;
        var origRotZ = orient.RotZ;
        
        var newRotZ = origRotZ + yawDeg;
        ext.SetOrientation(origRotX, origRotY, newRotZ);
        img.SetCameraExternalParameters(ext);
        
        print("  [RealView Auto-Alignment] Image [" + img.GetName() + "]: RotZ " + 
              origRotZ.toFixed(1) + "° -> " + newRotZ.toFixed(1) + "° (" + 
              (yawDeg > 0 ? "+" : "") + yawDeg + "° correction)");
        
        return {
            img: img,
            origRotX: origRotX,
            origRotY: origRotY,
            origRotZ: origRotZ
        };
    } catch (e) {
        print("  Warning: Could not adjust image yaw: " + e);
        return null;
    }
}

// Helper: Safely and accurately restore camera external orientation in Cyclone 3DR
function restoreImageYaw(record) {
    if (!record || !record.img) return;
    try {
        var camRes = record.img.GetCameraExternalParameters();
        if (camRes && camRes.ErrorCode === 0 && camRes.CameraExternal) {
            var ext = camRes.CameraExternal;
            ext.SetOrientation(record.origRotX, record.origRotY, record.origRotZ);
            record.img.SetCameraExternalParameters(ext);
            print("  [RealView Restore] Image [" + record.img.GetName() + "] restored to RotZ " + record.origRotZ.toFixed(1) + "°");
        }
    } catch (e) {
        print("  Warning: Failed to restore image yaw: " + e);
    }
}

// 3. Build the GUI
var gui = SDialog.New("Export to ReCap (RCS / RCP) v2.6");

gui.AddText("Exports point clouds to Autodesk ReCap format using DeCap.exe in the background. You can continue working in Cyclone 3DR while it processes.", SDialog.Info);

gui.BeginGroup("Options");
gui.AddChoices({
    id: "outputMode",
    name: "Output",
    choices: ["RCP project + Support folder", "RCS file(s) only"],
    style: SDialog.ChoiceRepresentationMode.RadioButtons
});
gui.AddChoices({
    id: "grouping",
    name: "Clouds",
    choices: ["Separate (Preserves Setups / RealViews)", "Combined (Flattens into one unstructured scan)"],
    style: SDialog.ChoiceRepresentationMode.RadioButtons
});

gui.AddTextField({id: "projectName", name: "Project Name (leave empty to use folder name)", value: ""});
gui.AddTextField({id: "outDir", name: "Output Folder (Paste path or leave empty to Browse)", value: ""});

gui.SetButtons(["Run Export", "Cancel"]);
var res = gui.Run();

if (res.ErrorCode !== 0) {
    print("Export cancelled by user.");
} else {
    var isRcp = res.outputMode === 0;
    var isCombined = res.grouping === 1;
    
    // Automatically apply +90° yaw alignment in background for Leica/3DR panoramas into ASTM E57
    var selectedYaw = 90;

    // Get output directory
    var outputFolder = res.outDir;
    if (!outputFolder || outputFolder.trim() === "") {
        outputFolder = GetOpenFolder("Select output folder for ReCap project", "C:/");
    }

    if (!outputFolder || outputFolder.length === 0) {
        print("Export cancelled.");
    } else {
        outputFolder = outputFolder.replace(/\\/g, "/");
        if (outputFolder.charAt(outputFolder.length - 1) !== "/") {
            outputFolder += "/";
        }
        
        var projectName = res.projectName;
        if (!projectName || projectName.trim() === "") {
            var pathParts = outputFolder.split("/");
            projectName = pathParts[pathParts.length - 2] || "Exported_Project"; 
        }

        print("Target Folder: " + outputFolder);
        print("Project Name: " + projectName);
        if (detectedSImages.length > 0) {
            print("RealView Auto-Alignment: Active (+90° yaw correction for Autodesk ReCap)");
        }

        // Export Temporary E57 files
        var e57Files = [];

        if (isCombined) {
            print("Merging clouds in 3DR (this flattens structured setups)...");
            var mergeRes = SCloud.Merge(clouds);
            if (mergeRes.ErrorCode !== 0) {
                throw new Error("Failed to merge clouds. Error code: " + mergeRes.ErrorCode);
            }
            var mergedCloud = mergeRes.Cloud;
            var tempE57 = outputFolder + projectName + "_temp.e57";
            print("Exporting merged temporary E57 to: " + tempE57);
            SSurveyingFormat.ExportE57([mergedCloud], [], tempE57);
            e57Files.push(tempE57);
        } else {
            for (var i = 0; i < clouds.length; i++) {
                var tempE57 = outputFolder + clouds[i].GetName() + "_temp.e57";
                
                // Match SImage objects (DAbstractImage3D)
                var matchedImages = findImagesForCloud(clouds[i], i, detectedSImages, clouds);
                var finalImages = prepareSphericalImages(matchedImages, clouds[i]);
                
                // Filter strictly to objects that can be cast to DAbstractImage3D
                var exportableImages = [];
                for (var f = 0; f < finalImages.length; f++) {
                    if (finalImages[f] instanceof SImage || typeof finalImages[f].GetImageType === "function") {
                        exportableImages.push(finalImages[f]);
                    }
                }
                
                if (exportableImages.length > 0) {
                    print("Exporting cloud [" + clouds[i].GetName() + "] with " + exportableImages.length + " spherical panorama(s) to: " + tempE57);
                } else {
                    if (detectedImageSets.length > 0) {
                        print("Exporting cloud [" + clouds[i].GetName() + "] (structured setup geometry). Note: 3DR DSetImage containers are preserved in setups.");
                    } else {
                        print("Exporting cloud [" + clouds[i].GetName() + "] (geometry only) to: " + tempE57);
                    }
                }

                // Apply temporary yaw adjustment directly on real document images, and guaranteed restore in finally block
                var appliedAlignments = [];
                try {
                    if (exportableImages.length > 0 && selectedYaw !== 0) {
                        for (var ex = 0; ex < exportableImages.length; ex++) {
                            var rec = applyTemporaryImageYaw(exportableImages[ex], selectedYaw);
                            if (rec) appliedAlignments.push(rec);
                        }
                    }
                    SSurveyingFormat.ExportE57([clouds[i]], exportableImages, tempE57);
                } finally {
                    for (var r = 0; r < appliedAlignments.length; r++) {
                        restoreImageYaw(appliedAlignments[r]);
                    }
                }
                e57Files.push(tempE57);
            }
        }

        // Generate Background PowerShell Script to run DeCap.exe
        var decapPath = "C:\\Program Files\\Autodesk\\Autodesk ReCap\\DeCap.exe";
        var ps1Path = outputFolder + "_recap_converter_" + (new Date()).getTime() + ".ps1";

        var psCode = "";
        psCode += "$decap = '" + decapPath + "'\n";
        psCode += "if (-Not (Test-Path $decap)) { \n";
        psCode += "   Write-Host 'ERROR: DeCap.exe not found. Is Autodesk ReCap installed?' -ForegroundColor Red\n";
        psCode += "   Read-Host 'Press Enter to exit'\n";
        psCode += "   exit\n";
        psCode += "}\n\n";

        var outDirNoSlash = outputFolder.replace(/\//g, "\\");
        if (outDirNoSlash.charAt(outDirNoSlash.length - 1) === "\\") {
            outDirNoSlash = outDirNoSlash.slice(0, -1);
        }

        psCode += "$tempFiles = @(\n";
        for (var k = 0; k < e57Files.length; k++) {
            psCode += "    '" + e57Files[k].replace(/\//g, "\\") + "'\n";
        }
        psCode += ")\n\n";

        psCode += "Write-Host '===================================================' -ForegroundColor Cyan\n";
        psCode += "Write-Host ' Autodesk ReCap (DeCap.exe) Background Conversion' -ForegroundColor Cyan\n";
        psCode += "Write-Host '===================================================' -ForegroundColor Cyan\n";
        psCode += "Write-Host 'Project: " + projectName + "'\n";
        psCode += "Write-Host 'Target Folder: " + outDirNoSlash + "'\n";
        psCode += "Write-Host 'Scans to index: ' $tempFiles.Count\n\n";

        psCode += "Write-Host 'Verifying temporary export files are ready for indexing...' -ForegroundColor Cyan\n";
        psCode += "Start-Sleep -Seconds 2\n";
        psCode += "foreach ($file in $tempFiles) {\n";
        psCode += "    $fileReady = $false\n";
        psCode += "    $attempts = 0\n";
        psCode += "    while (-not $fileReady -and ($attempts -lt 30)) {\n";
        psCode += "        try {\n";
        psCode += "            if (Test-Path $file) {\n";
        psCode += "                $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)\n";
        psCode += "                $stream.Close()\n";
        psCode += "                $fileReady = $true\n";
        psCode += "            } else {\n";
        psCode += "                Start-Sleep -Seconds 1\n";
        psCode += "                $attempts++\n";
        psCode += "            }\n";
        psCode += "        } catch {\n";
        psCode += "            Start-Sleep -Seconds 1\n";
        psCode += "            $attempts++\n";
        psCode += "        }\n";
        psCode += "    }\n";
        psCode += "}\n";
        psCode += "Write-Host 'All export files ready and unlocked.' -ForegroundColor Green\n";
        psCode += "Write-Host 'Indexing scans into ReCap database... please wait.' -ForegroundColor Yellow\n\n";

        psCode += "$decapArgs = @(\n";
        psCode += "    '--importWithLicense',\n";
        psCode += "    '" + outDirNoSlash + "',\n";
        psCode += "    '" + projectName + "',\n";
        psCode += "    '--e57EnableImageImport'\n";
        psCode += ") + $tempFiles\n\n";

        psCode += "& $decap $decapArgs\n";
        psCode += "$decapExit = $LASTEXITCODE\n\n";

        psCode += "Write-Host ''\n";
        psCode += "if ($decapExit -eq 0) {\n";
        psCode += "    Write-Host \"DeCap indexing complete. Exit code: $decapExit\" -ForegroundColor Green\n";
        psCode += "    Write-Host 'Finalizing project files and waiting for locks to release...' -ForegroundColor Cyan\n";
        psCode += "    Start-Sleep -Seconds 3\n\n";

        psCode += "    Write-Host 'Cleaning up temporary files...' -ForegroundColor Cyan\n";
        psCode += "    foreach ($file in $tempFiles) {\n";
        psCode += "        $retries = 0\n";
        psCode += "        while ((Test-Path $file) -and ($retries -lt 15)) {\n";
        psCode += "            Remove-Item $file -Force -ErrorAction SilentlyContinue\n";
        psCode += "            if (Test-Path $file) {\n";
        psCode += "                Start-Sleep -Seconds 1\n";
        psCode += "                $retries++\n";
        psCode += "            }\n";
        psCode += "        }\n";
        psCode += "        if (-not (Test-Path $file)) {\n";
        psCode += "            Write-Host \"  Removed temporary file: $(Split-Path $file -Leaf)\" -ForegroundColor Gray\n";
        psCode += "        } else {\n";
        psCode += "            Write-Host \"  Notice: $file is still locked by Windows. Please delete manually.\" -ForegroundColor Yellow\n";
        psCode += "        }\n";
        psCode += "    }\n";
        psCode += "    Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue\n\n";

        psCode += "    Write-Host ''\n";
        psCode += "    Write-Host '===================================================' -ForegroundColor Green\n";
        psCode += "    Write-Host ' ALL DONE! You can now open your project in ReCap.' -ForegroundColor Green\n";
        psCode += "    Write-Host '===================================================' -ForegroundColor Green\n";
        psCode += "} else {\n";
        psCode += "    Write-Host \"DeCap indexing encountered an issue (Exit code: $decapExit).\" -ForegroundColor Red\n";
        psCode += "    Write-Host 'Temporary E57 export files have been preserved for diagnostics.' -ForegroundColor Yellow\n";
        psCode += "    Write-Host '===================================================' -ForegroundColor Red\n";
        psCode += "}\n";
        psCode += "Start-Sleep -Seconds 2\n";

        // Write the PowerShell script
        var file = new SFile(ps1Path);
        file.Open(SFile.OpenModeEnum.WriteOnly);
        file.Write(psCode);
        file.Close();

        // Launch PowerShell visibly using cmd.exe start
        print("Launching Autodesk ReCap Converter in the background...");
        var powershellExec = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
        var psPath = ps1Path.replace(/\//g, "\\");
        
        var cmdArgs = ["/c", "start", "ReCap Export Background Task", powershellExec, "-ExecutionPolicy", "Bypass", "-NoExit", "-File", psPath];
        Execute("cmd.exe", cmdArgs);

        print("Background conversion started! A command window should have popped up.");
        print("You can continue working in Cyclone 3DR.");

        // Inform user with dialog message that they can continue working
        try {
            SDialog.Message("ReCap export has started in the background!\n\nYou can continue working, saving, or performing other exports in Cyclone 3DR.\nA command window will display live indexing progress.", SDialog.Info, "ReCap Export Started");
        } catch (e) {
            // SDialog.Message fallback
        }
    }
}
