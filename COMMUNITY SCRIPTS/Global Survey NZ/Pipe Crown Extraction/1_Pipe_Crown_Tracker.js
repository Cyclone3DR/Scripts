// Extract Top of Pipe (Crown) with Continuous Loop - Look Down Algorithm
// Description: Extracts the highest point (crown) of pipes. Automatically loops for rapid extraction.

// Define default settings outside the loop so they are remembered for subsequent pipes!
var defaultStep = 0.25;
var defaultSearchMult = 0.20; // Tight default to hug the crown and ignore adjacent trench walls
var defaultGap = 5.0;

while (true) {
    print("--- Starting Pipe Extractor ---");

    var clickCloud = SCloud.FromClick();
    if (!clickCloud || clickCloud.ErrorCode !== 0) {
        print("Extraction cancelled by user.");
        break;
    }
    
    var mainCloud = clickCloud.Cloud || clickCloud.Comp;
    
    // --- 1. User Clicks ---
    print("Please click the START point on the pipe...");
    var startPtRes = SPoint.FromClick();
    if (!startPtRes || startPtRes.ErrorCode !== 0) {
        print("Extraction cancelled by user.");
        break;
    }
    var startPt = startPtRes.Point;
    
    print("Please click 3 points on the surface of the pipe to define its initial circle/diameter...");
    var pt1Res = SPoint.FromClick();
    if (!pt1Res || pt1Res.ErrorCode !== 0) { print("Extraction cancelled"); break; }
    print("Point 1 registered. Click Point 2...");
    var pt2Res = SPoint.FromClick();
    if (!pt2Res || pt2Res.ErrorCode !== 0) { print("Extraction cancelled"); break; }
    print("Point 2 registered. Click Point 3...");
    var pt3Res = SPoint.FromClick();
    if (!pt3Res || pt3Res.ErrorCode !== 0) { print("Extraction cancelled"); break; }
    print("Point 3 registered.");
    
    var initCircle = SCircle.New(pt1Res.Point, pt2Res.Point, pt3Res.Point);
    if (!initCircle) {
        throw new Error("Error: Could not construct a valid circle from those 3 points.");
    }
    
    var calculatedRadius = initCircle.GetRadius();
    var calculatedDiameter = calculatedRadius * 2.0;
    
    print("Please click the END point where tracking should stop...");
    var endPtRes = SPoint.FromClick();
    if (!endPtRes || endPtRes.ErrorCode !== 0) {
        print("Extraction cancelled by user.");
        break;
    }
    var endPt = endPtRes.Point;
    
    // The vector from the Start Point to the End Point is a mathematically perfect initial trajectory
    var initialDir = SVector.New(startPt, endPt);
    initialDir.Normalize();
    
    // --- 2. Configuration Dialog ---
    var dlg = SDialog.New("Pipe Extractor Settings");
    dlg.AddText("The script has mathematically determined the start of your pipe from your 3 clicks.");
    dlg.AddText("Calculated Pipe Diameter: " + calculatedDiameter.toFixed(3) + " m");
    dlg.AddText("You can adjust the tracking parameters below before proceeding:");
    dlg.AddFloat({id: "diam", name: "Pipe Diameter (m)", value: parseFloat(calculatedDiameter.toFixed(3)), saveValue: false, min: 0.01});
    dlg.AddFloat({id: "step", name: "Step Interval (m)", value: defaultStep, min: 0.05});
    dlg.AddFloat({id: "searchMult", name: "Search Radius Multiplier", value: defaultSearchMult, min: 0.1});
    dlg.AddFloat({id: "gap", name: "Max Gap Distance (m)", value: defaultGap, min: 0.1});
    
    var result = dlg.Run();
    if (result.ErrorCode !== 0) {
        print("User cancelled extraction at settings dialog.");
        break;
    }
    
    // Save settings for the next pipe in the workflow!
    defaultStep = result.step;
    defaultSearchMult = result.searchMult;
    defaultGap = result.gap;
    
    var pipeDiameter = result.diam;
    var stepInterval = result.step;
    var maxGapDistance = result.gap;
    var searchRadius = pipeDiameter * result.searchMult;
    var verticalDir = SVector.New(0, 0, 1);
    
    // We compute a rough initial 2D direction based on the user's raw clicks
    var roughDir = SVector.New(endPt.GetX() - startPt.GetX(), endPt.GetY() - startPt.GetY(), 0);
    roughDir.Normalize();
    
    // --- HELPER FUNCTION: Snap a raw user click to the true pipe crown ---
    function SnapToCrown(rawPt, pipeDir) {
        try {
            var cacheRadius = pipeDiameter * 0.80;
            var cylCenter = SPoint.New(rawPt.GetX(), rawPt.GetY(), rawPt.GetZ() - pipeDiameter);
            var cropCyl = SCylinder.New(cylCenter, verticalDir, cacheRadius, pipeDiameter * 3.0);
            var cropRes = mainCloud.SeparateFeature(cropCyl, 0.0, SCloud.FILL_IN_ONLY);
            
            if (cropRes.ErrorCode !== 0 || !cropRes.InCloud || cropRes.InCloud.GetNumber() === 0) return rawPt;
            
            var localCloud = cropRes.InCloud;
            var shiftX = rawPt.GetX();
            var shiftY = rawPt.GetY();
            var currentMaxZ = rawPt.GetZ();
            var searchR = pipeDiameter * defaultSearchMult;
            
            for (var iter = 0; iter < 3; iter++) {
                var innerCyl = SCylinder.New(SPoint.New(shiftX, shiftY, rawPt.GetZ() - pipeDiameter), verticalDir, searchR, pipeDiameter * 3.0);
                var innerRes = localCloud.SeparateFeature(innerCyl, 0.0, SCloud.FILL_IN_ONLY);
                if (innerRes.ErrorCode !== 0 || !innerRes.InCloud || innerRes.InCloud.GetNumber() < 3) break;
                
                var innerCloud = innerRes.InCloud;
                var absMaxZ = innerCloud.GetBoundingBox().UpPoint.GetZ();
                currentMaxZ = absMaxZ;
                var capCloud = null;
                var densityThreshold = Math.min(100, Math.max(15, innerCloud.GetNumber() * 0.03));
                
                for (var sliceDrop = 0; sliceDrop < 0.40; sliceDrop += 0.02) {
                    var testZ = absMaxZ - sliceDrop;
                    var slicePlane = SPlane.New(SPoint.New(0, 0, testZ - 0.02), verticalDir);
                    var sliceRes = innerCloud.SeparateFeature(slicePlane, 0.02, SCloud.FILL_IN_ONLY);
                    if (sliceRes.ErrorCode === 0 && sliceRes.InCloud && sliceRes.InCloud.GetNumber() > densityThreshold) {
                        currentMaxZ = testZ;
                        capCloud = sliceRes.InCloud;
                        break;
                    }
                }
                
                if (capCloud) {
                    var centroid = capCloud.GetCentroid().Point;
                    var dx = centroid.GetX() - shiftX;
                    var dy = centroid.GetY() - shiftY;
                    
                    // Project the shift vector onto the PERPENDICULAR direction to prevent longitudinal edge-drift!
                    var perpDir = SVector.New(-pipeDir.GetY(), pipeDir.GetX(), 0);
                    var dot = dx * perpDir.GetX() + dy * perpDir.GetY();
                    
                    shiftX = shiftX + dot * perpDir.GetX();
                    shiftY = shiftY + dot * perpDir.GetY();
                } else {
                    break;
                }
            }
            
            var preciseMaxZ = currentMaxZ;
            var tightCyl = SCylinder.New(SPoint.New(shiftX, shiftY, rawPt.GetZ() - pipeDiameter), verticalDir, 0.03, pipeDiameter * 3.0);
            var tightCloudRes = localCloud.SeparateFeature(tightCyl, 0, SCloud.FILL_IN_ONLY);
            if (tightCloudRes.ErrorCode === 0 && tightCloudRes.InCloud && tightCloudRes.InCloud.GetNumber() > 0) {
                var tightCloud = tightCloudRes.InCloud;
                var zRestrictPlane = SPlane.New(SPoint.New(0, 0, currentMaxZ - 1.0), verticalDir); 
                var zRestrictRes = tightCloud.SeparateFeature(zRestrictPlane, 1.04, SCloud.FILL_IN_ONLY); 
                if (zRestrictRes.ErrorCode === 0 && zRestrictRes.InCloud && zRestrictRes.InCloud.GetNumber() > 0) {
                    preciseMaxZ = zRestrictRes.InCloud.GetBoundingBox().UpPoint.GetZ();
                }
            }
            return SPoint.New(shiftX, shiftY, preciseMaxZ);
        } catch(e) {
            print("Warning: Could not snap point: " + e);
            return rawPt;
        }
    }
    
    // Snapping the Start and End points mathematically guarantees the initial tracking vector is flawless!
    startPt = SnapToCrown(startPt, roughDir);
    endPt = SnapToCrown(endPt, roughDir);
    
    // --- 3. Run the Tracking Loop ---
    var crownPoints = [];
    crownPoints.push(startPt);
    
    var globalDir = SVector.New(endPt.GetX() - startPt.GetX(), endPt.GetY() - startPt.GetY(), endPt.GetZ() - startPt.GetZ());
    var totalDistance = globalDir.GetLength();
    globalDir.Normalize();
    
    var currentPt = startPt;
    var currentDir = SVector.New(globalDir.GetX(), globalDir.GetY(), globalDir.GetZ());
    
    var gapDistance = 0;
    var consecutiveCoastSteps = 0;
    var stepCount = 0;
    
    print("Starting extraction for total distance: " + totalDistance.toFixed(3) + " m");
    
    while (gapDistance < maxGapDistance) {
        stepCount++;
        
        // Calculate remaining longitudinal distance to the End Plane
        var vecFromCurrent = SVector.New(currentPt, endPt);
        var distRemaining = SVector.Dot(vecFromCurrent, globalDir);
        
        if (distRemaining <= 0.001) {
            print("Successfully reached the End Point plane!");
            break;
        }
        
        if (stepCount % 10 === 0) print("Extraction step " + stepCount + " (" + distRemaining.toFixed(2) + "m remaining)");
        
        // Calculate the exact step size needed for this iteration to perfectly snap to the end!
        var currentStepSize = stepInterval;
        var isLastStep = false;
        if (distRemaining <= stepInterval) {
            currentStepSize = distRemaining;
            isLastStep = true;
        }
        
        try {
            // 1. Predict next position based on tracking direction
            var predictedPt = SPoint.New(
                currentPt.GetX() + currentDir.GetX() * currentStepSize,
                currentPt.GetY() + currentDir.GetY() * currentStepSize,
                currentPt.GetZ() + currentDir.GetZ() * currentStepSize
            );
            
            // 2. Crop a wide local cache to allow the Mean Shift loop to wander and find the true center
            var cacheRadius = pipeDiameter * 0.80; // Wide enough to allow centering, small enough to be fast
            var cylCenter = SPoint.New(predictedPt.GetX(), predictedPt.GetY(), predictedPt.GetZ() - pipeDiameter);
            var cropCyl = SCylinder.New(cylCenter, verticalDir, cacheRadius, pipeDiameter * 3.0);
            var cropRes = mainCloud.SeparateFeature(cropCyl, 0.0, SCloud.FILL_IN_ONLY);
            var localCloud = null;
            if (cropRes) localCloud = cropRes.InCloud || (cropRes.InCloudTbl && cropRes.InCloudTbl.length > 0 ? cropRes.InCloudTbl[0] : null);
            
            if (!localCloud || localCloud.GetNumber() < 3) {
                gapDistance += currentStepSize;
                consecutiveCoastSteps++;
                currentPt = predictedPt;
                crownPoints.push(currentPt);
                continue;
            }
            
            // 2b. CRITICAL: Filter out ceilings, scaffolding, or floating noise by restricting to expected Z!
            var expectedZPlane = SPlane.New(predictedPt, verticalDir);
            // Aggressive noise rejection: Keep only points strictly near the expected crown height. 
            // Max allowed vertical deviation per 25cm step is calculated as Math.max(0.10, pipeDiameter * 0.15)
            var maxZJump = Math.max(0.10, pipeDiameter * 0.15);
            var zFilterRes = localCloud.SeparateFeature(expectedZPlane, maxZJump, SCloud.FILL_IN_ONLY);
            var filteredCloud = null;
            if (zFilterRes) filteredCloud = zFilterRes.InCloud || (zFilterRes.InCloudTbl && zFilterRes.InCloudTbl.length > 0 ? zFilterRes.InCloudTbl[0] : null);
            
            if (!filteredCloud || filteredCloud.GetNumber() < 3) {
                // Coasting (No pipe found near expected height)
                gapDistance += currentStepSize;
                consecutiveCoastSteps++;
                currentPt = predictedPt;
                crownPoints.push(currentPt);
                continue;
            }
            
            var shiftX = predictedPt.GetX();
            var shiftY = predictedPt.GetY();
            var finalCentroidX = shiftX;
            var finalCentroidY = shiftY;
            var currentMaxZ = predictedPt.GetZ();
            
            var dynamicSearchRadius = searchRadius;
            
            // 3. MEAN SHIFT LOOP: Iterate up to 3 times to perfectly center the search cylinder on the true physical crown.
            for (var iter = 0; iter < 3; iter++) {
                // Drop a tight search cylinder (using the strict searchRadius!) at the current shifted position
                var innerCyl = SCylinder.New(SPoint.New(shiftX, shiftY, predictedPt.GetZ() - pipeDiameter), verticalDir, dynamicSearchRadius, pipeDiameter * 3.0);
                var innerRes = filteredCloud.SeparateFeature(innerCyl, 0.0, SCloud.FILL_IN_ONLY);
                
                if (innerRes.ErrorCode !== 0 || !innerRes.InCloud || innerRes.InCloud.GetNumber() < 3) {
                    if (iter === 0 && dynamicSearchRadius < pipeDiameter * 0.5) {
                        dynamicSearchRadius = pipeDiameter * 0.5; // Emergency expansion! We missed the curve, throw a wide net!
                        iter--; // Retry this first iteration
                        continue;
                    }
                    break;
                }
                dynamicSearchRadius = searchRadius; // Reset to tight radius for subsequent centering iterations!
                
                var innerCloud = innerRes.InCloud;
                var bbox = innerCloud.GetBoundingBox();
                var absMaxZ = bbox.UpPoint.GetZ();
                currentMaxZ = absMaxZ;
                
                var capThickness = 0.04;
                var capCloud = null;
                
                // Dynamic density threshold: scales with point cloud density to guarantee we only lock onto the massive pipe surface, never floating noise clusters
                var densityThreshold = Math.min(100, Math.max(15, innerCloud.GetNumber() * 0.03));
                
                // Robust Z-Slicing: Slice down from absMaxZ in 2cm steps to find the first dense physical surface, ignoring sparse floating noise!
                for (var sliceDrop = 0; sliceDrop < 0.40; sliceDrop += 0.02) {
                    var testZ = absMaxZ - sliceDrop;
                    var slicePlane = SPlane.New(SPoint.New(0, 0, testZ - capThickness / 2.0), verticalDir);
                    var sliceRes = innerCloud.SeparateFeature(slicePlane, capThickness / 2.0, SCloud.FILL_IN_ONLY);
                    if (sliceRes.ErrorCode === 0 && sliceRes.InCloud && sliceRes.InCloud.GetNumber() > densityThreshold) {
                        currentMaxZ = testZ;
                        capCloud = sliceRes.InCloud;
                        break;
                    }
                }
                
                if (capCloud) {
                    var centroid = capCloud.GetCentroid().Point;
                    finalCentroidX = centroid.GetX();
                    finalCentroidY = centroid.GetY();
                    
                    // Move the search center for the next iteration perfectly onto the found centroid
                    shiftX = finalCentroidX;
                    shiftY = finalCentroidY;
                } else {
                    break;
                }
            }
            
            // 4. Validate results from mean shift
            var distMoved = Math.sqrt(Math.pow(finalCentroidX - predictedPt.GetX(), 2) + Math.pow(finalCentroidY - predictedPt.GetY(), 2));
            if (distMoved < 0.5) { // Ensure mean shift didn't jump to a distant noise cluster
                gapDistance = 0;
                consecutiveCoastSteps = 0;
                
                // CRITICAL LIMITER: Enforce a physical bending limit (max ~9 degree turn per step).
                // This acts as a massive momentum stabilizer, allowing the tracker to plow straight through 
                // intersecting pipes or heavy dirt clumps without violently swerving, while retaining enough agility to track real curves.
                var maxCorrection = currentStepSize * 0.16;
                var dx = finalCentroidX - predictedPt.GetX();
                var dy = finalCentroidY - predictedPt.GetY();
                var distXY = Math.sqrt(dx*dx + dy*dy);
                
                var smoothedFinalX = finalCentroidX;
                var smoothedFinalY = finalCentroidY;
                
                if (distXY > maxCorrection) {
                    var scale = maxCorrection / distXY;
                    smoothedFinalX = predictedPt.GetX() + dx * scale;
                    smoothedFinalY = predictedPt.GetY() + dy * scale;
                }
                
                var smoothedX = predictedPt.GetX();
                var smoothedY = predictedPt.GetY();
                
                // Do NOT steer X/Y on the last step to ensure we snap perfectly to the end distance without swerving!
                if (!isLastStep) {
                    var alpha = 0.80; // 80% pull to exact centroid to ensure it never drifts off the pipe
                    smoothedX = (predictedPt.GetX() * (1.0 - alpha)) + (smoothedFinalX * alpha);
                    smoothedY = (predictedPt.GetY() * (1.0 - alpha)) + (smoothedFinalY * alpha);
                }
                
                // CRITICAL FIX: Snapping Z to the true local crown while ignoring floating noise!
                var preciseMaxZ = currentMaxZ; // Fallback to the Mean Shift's last valid maxZ
                var tightCyl = SCylinder.New(SPoint.New(smoothedX, smoothedY, predictedPt.GetZ() - pipeDiameter), verticalDir, 0.03, pipeDiameter * 3.0);
                var tightCloudRes = filteredCloud.SeparateFeature(tightCyl, 0, SCloud.FILL_IN_ONLY);
                if (tightCloudRes.ErrorCode === 0 && tightCloudRes.InCloud && tightCloudRes.InCloud.GetNumber() > 0) {
                    var tightCloud = tightCloudRes.InCloud;
                    // Filter tight cylinder to exclude any floating noise higher than our robustly found currentMaxZ + 4cm!
                    // This perfectly isolates the true cross-section crown and completely decapitates floating noise spikes.
                    var zRestrictPlane = SPlane.New(SPoint.New(0, 0, currentMaxZ - 1.0), verticalDir); 
                    var zRestrictRes = tightCloud.SeparateFeature(zRestrictPlane, 1.04, SCloud.FILL_IN_ONLY); 
                    
                    if (zRestrictRes.ErrorCode === 0 && zRestrictRes.InCloud && zRestrictRes.InCloud.GetNumber() > 0) {
                        preciseMaxZ = zRestrictRes.InCloud.GetBoundingBox().UpPoint.GetZ();
                    }
                }
                
                currentPt = SPoint.New(smoothedX, smoothedY, preciseMaxZ);
                crownPoints.push(currentPt);
                
                // 6. Update tracking direction to smoothly follow horizontal curves!
                // Use a dynamic look-behind so we immediately correct bad initial directions on Step 1, 
                // but gain stability up to 5 steps (1.25m) as we progress.
                if (!isLastStep && crownPoints.length > 1) {
                    var lookBehind = Math.min(5, crownPoints.length - 1);
                    var oldPt = crownPoints[crownPoints.length - 1 - lookBehind]; 
                    
                    var dxDir = currentPt.GetX() - oldPt.GetX();
                    var dyDir = currentPt.GetY() - oldPt.GetY();
                    var dzDir = currentPt.GetZ() - oldPt.GetZ();
                    var newDir = SVector.New(dxDir, dyDir, dzDir);
                    newDir.Normalize();
                    
                    var inertia = 0.75; // Standard inertia to track S-curves smoothly
                    currentDir = SVector.New(
                        (currentDir.GetX() * inertia) + (newDir.GetX() * (1.0 - inertia)),
                        (currentDir.GetY() * inertia) + (newDir.GetY() * (1.0 - inertia)),
                        (currentDir.GetZ() * inertia) + (newDir.GetZ() * (1.0 - inertia))
                    );
                    currentDir.Normalize();
                }
            } else {
                // If we hit this else, it means the Mean Shift loop completely failed to find a valid centroid (coasting needed)
                gapDistance += currentStepSize;
                if (gapDistance > maxGapDistance) {
                    print("Max gap distance exceeded. Stopping tracking.");
                    break;
                }
                // Coast blindly forward along currentDir
                var coastZ = currentPt.GetZ(); // Keep the last known valid Z height
                currentPt = SPoint.New(predictedPt.GetX(), predictedPt.GetY(), coastZ);
                crownPoints.push(currentPt);
            }
            
        } catch (loopError) {
            print("CRITICAL CRASH at step " + stepCount + ": " + loopError);
            break;
        }
    }
    
    if (gapDistance >= maxGapDistance) {
        print("Tracking stopped because the gap distance exceeded the maximum (" + maxGapDistance + "m).");
        print("This usually means the physical end of the pipe was reached.");
    } else {
        print("Tracking completed all steps to exactly match your End Point.");
    }
    
    // --- 4. Draw the Polyline ---
    print("Drawing polyline with " + crownPoints.length + " vertices...");
    if (crownPoints.length > 1) {
        try {
            var finalLine = SMultiline.New();
            finalLine.InsertLast(crownPoints[0]);
            var lastAdded = crownPoints[0];
            
            for (var i = 1; i < crownPoints.length; i++) {
                var pt = crownPoints[i];
                var dist = SVector.New(lastAdded, pt).GetLength();
                if (dist > 0.001) { // Prevent duplicates from crashing the polyline
                    finalLine.InsertLast(pt);
                    lastAdded = pt;
                }
            }
            
            finalLine.SetName("Extracted Pipe Crown");
            finalLine.SetColors(0, 255, 0); // Green color
            finalLine.AddToDoc();
            print("Success! The polyline has been added to the document.");
        } catch(drawError) {
            print("Crash while drawing polyline: " + drawError);
        }
    } else {
        print("Error: Not enough points generated to create a polyline.");
    }
    
    // --- 5. Ask user if they want to track another pipe ---
    var nextDlg = SDialog.New("Pipe Extractor Workflow");
    nextDlg.AddText("Pipe extracted successfully and drawn to document.");
    nextDlg.AddText("");
    nextDlg.AddText("Would you like to extract another pipe?");
    nextDlg.AddText("");
    nextDlg.AddText("Click 'OK' to select a new pipe.");
    nextDlg.AddText("Click 'Cancel' to finish and exit the script.");
    
    var nextRes = nextDlg.Run();
    if (nextRes.ErrorCode !== 0) {
        print("Finished extracting pipes. Have a great day!");
        break;
    }
} // End of main workflow while(true) loop
