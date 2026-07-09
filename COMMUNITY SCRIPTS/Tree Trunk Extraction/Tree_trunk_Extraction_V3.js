/**
 * Tree Trunk Extractor - Optimised (V3 - 3D Cylinder Volumetric + DTM Projection)
 * 
 * Automates the extraction of tree trunks from point clouds.
 * Features:
 * - Loopable Preview Mode: Generates 3D Cylinders hovering exactly over the trunks for visual inspection.
 * - Final Export Mode: Projects the 3D axes mathematically onto the DTM topographical ground to generate 2D CAD Topo Rings!
 */
function main() {
    // --- STAGE 1: Setup & Classification ---
    var clouds = SCloud.FromSel();
    if (clouds.length !== 1) {
        SDialog.Message("Please select exactly one point cloud.", SDialog.Error);
        return;
    }
    var cloud = clouds[0];
    
    // Explode by Class
    print("Analyzing Point Cloud Classes...");
    var explodeRes = cloud.ExplodeByClass();
    if (explodeRes.ErrorCode !== 0 || !explodeRes.ClassTbl || explodeRes.ClassTbl.length === 0) {
        SDialog.Message("No classification data found.", SDialog.Error);
        return;
    }
    var availableClasses = explodeRes.ClassTbl;
    var classNames = {
        0: "Never classified", 1: "Unclassified", 2: "Ground",
        3: "Low Vegetation", 4: "Medium Vegetation", 5: "High Vegetation",
        6: "Building", 7: "Low Point (noise)", 8: "Model Key-point",
        9: "Water", 10: "Rail", 11: "Road Surface",
        13: "Wire - Guard", 14: "Wire - Conductor", 15: "Transmission Tower",
        17: "Bridge Deck", 18: "High Noise",
        66: "Hardscape",
        130: "Steel column", 131: "Steel beam", 132: "Steel stability",
        133: "Steel connection", 138: "Footing"
    };

    // Sort classes numerically
    if (availableClasses && availableClasses.length) {
        availableClasses.sort(function (a, b) { return a - b; });
    }

    // Persistent Parameters
    var p = {
        groundClass: 2, vegClass: 4, sliceHeight: 1.0, sliceThickness: 0.30,
        clusterDist: 0.20, minPoints: 25, minRadius: 0.10, maxRadius: 0.40,
        maxFitError: 0.10, maxTilt: 20.0, maxRatio: 3.0, doLabels: true,
        doCleanup: false, exportCSV: true, previewMode: true
    };

    var intermediateObjects = [];
    var previewTrunks = []; // Hold items to delete from previous loops

    while (true) {
        var dialog = SDialog.New("Tree Trunk Extractor - Pro");
        dialog.AddText("Found Classes in Point Cloud:", SDialog.Info);
        for (var i = 0; i < availableClasses.length; i++) {
            var id = availableClasses[i];
            var cName = classNames[id] || "Unknown Class";
            dialog.AddText("    [" + id + "] - " + cName);
        }
        dialog.AddText("--------------------------------------------------");
        dialog.AddInt({ id: "groundClass", name: "Ground Class ID", value: p.groundClass, min: 0, max: 255 });
        dialog.AddInt({ id: "vegClass", name: "Vegetation Class ID", value: p.vegClass, min: 0, max: 255 });
        dialog.AddText("--------------------------------------------------");
        dialog.AddText("Stage 1: Slicing");
        dialog.AddFloat({ id: "sliceHeight", name: "Slice Height (m)", value: p.sliceHeight, min: 0.1, max: 10.0 });
        dialog.AddFloat({ id: "sliceThickness", name: "Slice Thickness (m)", value: p.sliceThickness, min: 0.01, max: 10.0 });
        dialog.AddFloat({ id: "clusterDist", name: "Cluster Distance (m)", value: p.clusterDist, min: 0.01, max: 5.0 });
        dialog.AddInt({ id: "minPoints", name: "Min Points/Cluster", value: p.minPoints, min: 3, max: 1000 });
        dialog.AddText("--------------------------------------------------");
        dialog.AddText("Stage 2: Filters (Tolerances AUTO-SCALE natively by local slope)");
        dialog.AddFloat({ id: "minRadius", name: "Min Radius (m)", value: p.minRadius, min: 0.01, max: 2.0 });
        dialog.AddFloat({ id: "maxRadius", name: "Max Radius (m)", value: p.maxRadius, min: 0.05, max: 5.0 });
        dialog.AddFloat({ id: "maxFitError", name: "Base Max Fit Error (m)", value: p.maxFitError, min: 0.001, max: 1.0 });
        dialog.AddFloat({ id: "maxTilt", name: "Max Ground Slope / Tilt (deg)", value: p.maxTilt, min: 0.0, max: 90.0 });
        dialog.AddFloat({ id: "maxRatio", name: "Base Aspect Ratio (L/W)", value: p.maxRatio, min: 1.0, max: 20.0 });
        dialog.AddText("--------------------------------------------------");
        dialog.AddText("Output");
        dialog.AddBoolean({ id: "doLabels", name: "Create 3D Labels", value: p.doLabels });
        dialog.AddBoolean({ id: "doCleanup", name: "Delete Intermediate DB Objects", value: p.doCleanup });
        dialog.AddBoolean({ id: "exportCSV", name: "Export to CSV", value: p.exportCSV });
        dialog.AddText("--------------------------------------------------");
        dialog.AddBoolean({ id: "previewMode", name: ">>> RUN LIVE PREVIEW (Check this box, then press OK)", value: p.previewMode });
        
        var result = dialog.Run();
        
        // 1. CLEANUP PREVIOUS RUN
        // We clean up here so the trunks stay visible in the viewport *while* the dialog is open!
        for (var k = 0; k < previewTrunks.length; k++) {
            if (previewTrunks[k] && previewTrunks[k].RemoveFromDoc) previewTrunks[k].RemoveFromDoc();
        }
        previewTrunks = [];
        for (var io = 0; io < intermediateObjects.length; io++) {
            if (intermediateObjects[io] && intermediateObjects[io].RemoveFromDoc) intermediateObjects[io].RemoveFromDoc();
        }
        intermediateObjects = [];

        // 2. CHECK CANCELLATION
        if (result.ErrorCode !== 0) return; // Exit script if user cancels
        
        // --- SAFE GEOMETRY VALIDATION ---
        if (result.clusterDist > 0.25) {
            // Just output a warning to the console, don't block them entirely
            print("WARNING: Cluster Dist > 0.25m. If trees are merged together, the script will draw massive 5m+ circles and reject them. Try 0.15m if this happens.");
        }
        // ---------------------------------
        
        // Save back to persistent params
        p.groundClass = result.groundClass;
        p.vegClass = result.vegClass;
        p.sliceHeight = result.sliceHeight;
        p.sliceThickness = result.sliceThickness;
        p.clusterDist = result.clusterDist;
        p.minPoints = result.minPoints;
        p.minRadius = result.minRadius;
        p.maxRadius = result.maxRadius;
        p.maxFitError = result.maxFitError;
        p.maxTilt = result.maxTilt;
        p.maxRatio = result.maxRatio;
        p.doLabels = result.doLabels;
        p.doCleanup = result.doCleanup;
        p.exportCSV = result.exportCSV;
        p.previewMode = result.previewMode;
        
        // --- PRINT PARAMETERS FOR REVIEW ---
        print("\n=== Tree Trunk Extraction Parameters ===");
        print("Slice Height:       " + p.sliceHeight + "m");
        print("Slice Thickness:    " + p.sliceThickness + "m");
        print("Cluster Dist:       " + p.clusterDist + "m");
        print("Min Points:         " + p.minPoints);
        print("Radius:             " + p.minRadius + "m to " + p.maxRadius + "m");
        print("Base Fit Error:     " + p.maxFitError + "m");
        print("Base Aspect Ratio:  " + p.maxRatio);
        print("Max Ground Slope:   " + p.maxTilt + " deg");
        print("Preview Pass:       " + (p.previewMode ? "Yes" : "No"));
        print("========================================\n");

        if (p.previewMode) {
            print(">>> PREVIEW MODE: Drawing Physical 3D Cylinders floating at original extracted height...");
        } else {
            print(">>> FINAL CAD EXPORT MODE: Mathematics projecting to DSM Topology to generate Ground CAD Rings...");
        }

        // Extract Clouds
        var groundCloud = null;
        var vegCloud = null;
        for (var cIdx = 0; cIdx < availableClasses.length; cIdx++) {
            if (availableClasses[cIdx] === p.groundClass) groundCloud = explodeRes.CloudTbl[cIdx];
            if (availableClasses[cIdx] === p.vegClass) vegCloud = explodeRes.CloudTbl[cIdx];
        }
        if (!groundCloud || !vegCloud) {
            SDialog.Message("Error: Required classes not found. Check Class IDs.", SDialog.Error);
            continue;
        }

        // --- STAGE 2: DSM & Slicing ---
        print("Refining Ground with Points on Grid...");
        var gridParams = { gridStep: 3.0, pickingRadius: 0.3, pickingMethod: 1 };
        var refineRes = groundCloud.PointsOnGrid(gridParams);
        var cleanGround = (refineRes && refineRes.ErrorCode === 0) ? refineRes.Cloud : groundCloud;
        if (refineRes && refineRes.ErrorCode === 0) {
            cleanGround.SetName("Ground_Grid_3m");
            cleanGround.SetVisibility(false);
            if (!p.doCleanup) { cleanGround.AddToDoc(); intermediateObjects.push(cleanGround); }
        }

        print("Creating DSM from Cleaned Ground...");
        var dsmResult = SPoly.Direct3DMesh(cleanGround, 0, 0, SPoly.NO_CLOSED, 5.0);
        if (dsmResult.ErrorCode !== 0) { print("Error creating DSM"); continue; }
        var dsm = dsmResult.Poly;
        dsm.SetName("DSM_Ground");
        if (!p.doCleanup) {
            dsm.SetColors(0.5, 0.5, 0.5); dsm.SetVisibility(false);
            dsm.AddToDoc(); intermediateObjects.push(dsm);
        }

        print("Offsetting DSM by " + p.sliceHeight + "m...");
        var dsmOffset = SPoly.New(dsm);
        dsmOffset.SetName("DSM_Offset_+" + p.sliceHeight + "m");
        var transMat = SMatrix.New(SVector.New(0, 0, p.sliceHeight));
        dsmOffset.ApplyTransformation(transMat);
        if (!p.doCleanup) {
            dsmOffset.SetVisibility(false);
            dsmOffset.AddToDoc(); intermediateObjects.push(dsmOffset);
        }

        print("Computing distances...");
        var compareRes = dsmOffset.Compare(vegCloud, 2.0, 2, true);
        if (compareRes.ErrorCode !== 0) { print("Comparison failed"); continue; }
        
        var rangeMin = -p.sliceThickness / 2.0;
        var rangeMax = p.sliceThickness / 2.0;
        print("Filtering slice (" + rangeMin + "m to " + rangeMax + "m)...");
        var filterRes = SCloud.FilterWithScalarRange([compareRes.Cloud], rangeMin, rangeMax, 0);
        
        var trunkSlice = null;
        var inList = filterRes ? (filterRes.InCloudTbl || filterRes.InCloud || filterRes.In || filterRes.Inside) : null;
        if (inList && inList.length > 0) trunkSlice = inList[0];
        else if (inList && inList.GetNumber) trunkSlice = inList;
        else if (filterRes && filterRes.GetNumber) trunkSlice = filterRes;
        else if (Array.isArray(filterRes) && filterRes.length > 0) trunkSlice = filterRes[0];
        
        if (!trunkSlice || trunkSlice.GetNumber() === 0) {
            SDialog.Message("Slice extraction failed (0 points). Terrain or slice settings may be too restrictive.", SDialog.Warning);
            continue;
        }
        trunkSlice.SetName("Trunk_Slice_Raw");
        if (!p.doCleanup) {
            trunkSlice.SetColors(1.0, 0.5, 0.0); trunkSlice.SetVisibility(false);
            trunkSlice.AddToDoc(); intermediateObjects.push(trunkSlice);
        }

        // --- STAGE 3: Clustering ---
        print("Clustering slice...");
        var explodeClusters = trunkSlice.Explode(p.clusterDist);
        var clusters = (explodeClusters && explodeClusters.CloudTbl) ? explodeClusters.CloudTbl : (Array.isArray(explodeClusters) ? explodeClusters : []);
        print("Found " + clusters.length + " clusters.");
        if (trunkSlice && trunkSlice.Select) trunkSlice.Select(false);

        // --- STAGE 4: Fitting ---
        print("Fitting cylinders...");
        var validTrunks = [];
        var rejectedTrunks = [];
        var rejectedSmall = 0, rejectedRadius = 0, rejectedError = 0, rejectedTilt = 0, rejectedRatio = 0;
        
        SCloud.DeselectAll ? SCloud.DeselectAll() : null;

        for (var j = 0; j < clusters.length; j++) {
            var cluster = clusters[j];
            if (cluster.GetNumber() < p.minPoints) {
                rejectedSmall++;
                continue;
            }

            var fitResCluster = cluster.BestCylinder();
            if (fitResCluster && (fitResCluster.ErrorCode === undefined || fitResCluster.ErrorCode === 0)) {
                var cylinderGeom = fitResCluster.Cylinder || fitResCluster.Geom || fitResCluster;
                var stdDev = fitResCluster.StdDeviation !== undefined ? fitResCluster.StdDeviation : 0.0;
                
                if (cylinderGeom && cylinderGeom.GetRadius) {
                    var r = cylinderGeom.GetRadius();
                    var n = cylinderGeom.GetDirection ? cylinderGeom.GetDirection() : cylinderGeom.GetNormal();
                    var c = cylinderGeom.GetPoint ? cylinderGeom.GetPoint() : cylinderGeom.GetCenter();
                    var tiltDeg = 0;
                    
                    if (n) {
                        var dot = Math.abs(n.GetZ());
                        if (dot > 1.0) dot = 1.0;
                        tiltDeg = Math.acos(dot) * (180.0 / Math.PI);
                        if (tiltDeg > 90.0) tiltDeg = 180.0 - tiltDeg;
                    }
                    
                    // --- DYNAMIC SLOPE SCALING ---
                    var localSlopeDeg = tiltDeg;
                    var dynamicMaxError = p.maxFitError;
                    var dynamicMaxRatio = p.maxRatio;

                    dynamicMaxError += (localSlopeDeg * 0.002);

                    var safeSlope = localSlopeDeg > 75.0 ? 75.0 : localSlopeDeg;
                    var stretch = (1.0 / Math.cos(safeSlope * Math.PI / 180.0));
                    if (stretch > 1.0) {
                        dynamicMaxRatio += ((stretch - 1.0) * 2.5); 
                    }

                    // --- EVALUATE FAILURE REASONS ---
                    var bbox = cluster.GetBoundingBox();
                    var passedRatio = false;
                    var actualRatio = 0;
                    if (bbox && bbox.ErrorCode === 0) {
                        var dx = Math.abs(bbox.UpPoint.GetX() - bbox.LowPoint.GetX());
                        var dy = Math.abs(bbox.UpPoint.GetY() - bbox.LowPoint.GetY());
                        var minDim = Math.min(dx, dy);
                        var maxDim = Math.max(dx, dy);
                        if (minDim > 0.001) {
                            actualRatio = maxDim / minDim;
                            if (actualRatio <= dynamicMaxRatio) passedRatio = true;
                        }
                    }

                    var rejectReason = "";

                    if (!passedRatio) {
                        rejectedRatio++;
                        rejectReason = "Ratio (" + actualRatio.toFixed(1) + " > " + dynamicMaxRatio.toFixed(1) + ")";
                    } else if (r < p.minRadius || r > p.maxRadius) {
                        rejectedRadius++;
                        rejectReason = "Radius (" + r.toFixed(2) + "m)";
                    } else if (stdDev > dynamicMaxError) {
                        rejectedError++;
                        rejectReason = "Error (" + stdDev.toFixed(2) + " > " + dynamicMaxError.toFixed(2) + ")";
                    } else if (tiltDeg > p.maxTilt) {
                        rejectedTilt++;
                        rejectReason = "Slope (" + tiltDeg.toFixed(1) + "°)";
                    }

                    // --- CREATE OBJECTS (PREVIEW 3D CYLINDER vs FINAL CAD RING) ---
                    var outputGeom = null;
                    var groundPt = c; // Fallback to elevated point
                    var exportZ = c.GetZ();

                    if (p.previewMode) {
                        // User checked Preview Pass -> Show Raw 3D Cylinder exactly where it fitted
                        outputGeom = cylinderGeom; 
                    } else {
                        // User checked FINAL Pass -> Raycast down to the unchanged DTM to create CAD ground rings!
                        var groundZ = 0;
                        try {
                            var foundExactGround = false;
                            var highStart = SPoint.New(c.GetX(), c.GetY(), c.GetZ() + 10.0);
                            var rayRes = dsm.Intersection ? dsm.Intersection(highStart, SVector.New(0,0,-1), true) : null;
                            
                            // Parse Intersection Result
                            if (rayRes) {
                                if (rayRes.GetZ) { groundZ = rayRes.GetZ(); foundExactGround = true; }
                                else if (Array.isArray(rayRes) && rayRes.length > 0 && rayRes[0] && rayRes[0].GetZ) { groundZ = rayRes[0].GetZ(); foundExactGround = true; }
                                else if (rayRes.Point && rayRes.Point.GetZ) { groundZ = rayRes.Point.GetZ(); foundExactGround = true; }
                                else if (rayRes.Pt && rayRes.Pt.GetZ) { groundZ = rayRes.Pt.GetZ(); foundExactGround = true; }
                            }
                            
                            // If Intersection Failed, Try Proximity
                            if (!foundExactGround && dsm.Proximity) {
                                var pRes = dsm.Proximity(c); // Find closest DTM point to the trunk relative marker
                                if (pRes) {
                                    if (pRes.GetZ) { groundZ = pRes.GetZ(); foundExactGround = true; }
                                    else if (pRes.Point && pRes.Point.GetZ) { groundZ = pRes.Point.GetZ(); foundExactGround = true; }
                                    else if (pRes.Pt && pRes.Pt.GetZ) { groundZ = pRes.Pt.GetZ(); foundExactGround = true; }
                                }
                            }
                            
                            if (foundExactGround) {
                                groundPt = SPoint.New(c.GetX(), c.GetY(), groundZ);
                            } else {
                                // Ultimate Math Fallback if Native 3DR Algorithms Reject Raycast
                                var localHeightAboveGround = p.sliceHeight - (p.sliceThickness / 2.0);
                                if (bbox && bbox.LowPoint) {
                                    groundZ = bbox.LowPoint.GetZ() - localHeightAboveGround;
                                } else {
                                    groundZ = c.GetZ() - localHeightAboveGround;
                                }
                                groundPt = SPoint.New(c.GetX(), c.GetY(), groundZ);
                            }
                        } catch(e) { }

                        exportZ = groundPt.GetZ(); 

                        var upDir = SVector.New(0, 0, 1);
                        try { outputGeom = SCircle.New(groundPt, upDir, r); } catch(e) {}
                        
                        if (!outputGeom || (outputGeom.ErrorCode !== undefined && outputGeom.ErrorCode !== 0)) {
                            // Fallback: Extremely flat 1cm thickness pancake cylinder to mimic CAD Line
                            try {
                                var pTop = SPoint.New(c.GetX(), c.GetY(), groundPt.GetZ() + 0.01);
                                outputGeom = SCylinder.New(groundPt, pTop, r);
                            } catch(e) {
                                outputGeom = cylinderGeom; // Failsafe to fully generic cylinder
                            }
                        }
                    }

                    if (rejectReason === "") {
                        // Valid Trunk
                        var trunkID = validTrunks.length + 1;
                        var trunkName = "Trunk_" + trunkID;
                        
                        outputGeom.SetName(trunkName);
                        outputGeom.SetColors(0.6, 0.4, 0.2);
                        outputGeom.AddToDoc();
                        outputGeom.MoveToGroup("Extracted Trunks", false);
                        if (p.previewMode) previewTrunks.push(outputGeom);

                        if (p.doLabels && typeof SMeasure !== 'undefined' && SMeasure.New) {
                            var labelMeas = SMeasure.New("Label_" + trunkName, groundPt);
                            labelMeas.AddRow({
                                "key": "info",
                                "name": "Trunk " + trunkID,
                                "values": [{ "key": "r", "value": r, "prefix": "R=" }]
                            });
                            if (labelMeas.AddToDoc) {
                                labelMeas.AddToDoc();
                                labelMeas.MoveToGroup("Extracted Trunks", false);
                                if (p.previewMode) previewTrunks.push(labelMeas);
                            }
                        }

                        validTrunks.push({
                            name: trunkName, geom: outputGeom, cloud: cluster,
                            radius: r, error: stdDev, tilt: tiltDeg, status: "Valid", reason: "",
                            x: c.GetX(), y: c.GetY(), z: exportZ
                        });
                    } else {
                        // Rejected Trunk
                        outputGeom.SetName("Rejected_" + rejectReason);
                        outputGeom.SetColors(1.0, 0.0, 0.0); // Red
                        outputGeom.AddToDoc();
                        outputGeom.MoveToGroup("Rejected Trunks", false);
                        if (p.previewMode) previewTrunks.push(outputGeom);

                        if (p.doLabels && typeof SMeasure !== 'undefined' && SMeasure.New) {
                            var rejectLabel = SMeasure.New("Fail: " + rejectReason, groundPt);
                            rejectLabel.AddRow({
                                "key": "info",
                                "name": "Rejected",
                                "values": [{ "key": "r", "value": r, "prefix": "R=" }]
                            });
                            if (rejectLabel.AddToDoc) {
                                rejectLabel.AddToDoc();
                                rejectLabel.MoveToGroup("Rejected Trunks", false);
                                if (p.previewMode) previewTrunks.push(rejectLabel);
                            }
                        }
                        
                        rejectedTrunks.push({
                            name: "Rejected", geom: outputGeom, cloud: cluster,
                            radius: r, error: stdDev, tilt: tiltDeg, status: "Rejected", reason: rejectReason,
                            x: c.GetX(), y: c.GetY(), z: exportZ
                        });
                    }
                }
            }
        }

        // --- REJECTION STATS ---
        print("\n=== Extraction Results ===");
        print("Total Clusters Found: " + clusters.length);
        print("Trunks Extracted:     " + validTrunks.length);
        print("Trunks Rejected:      " + rejectedTrunks.length);
        print("--- Rejection Reasons ---");
        print("Too Few Points (<" + p.minPoints + "): " + rejectedSmall);
        print("Bad Aspect Ratio:        " + rejectedRatio);
        print("Bad Radius Bounds:       " + rejectedRadius);
        print("High Fit Error:          " + rejectedError);
        print("Extreme Slope / Tilt:    " + rejectedTilt);
        print("==========================\n");

        // --- STAGE 5: Preview & Export ---
        if (p.previewMode) {
            print("Preview Extraction Complete. (" + validTrunks.length + " trunks). Check the 3D scene.");
            // Do NOT popup a message!
            // Do NOT delete the objects here!
            // The objects remain in the scene, and the loop restarts, instantly opening the Dialog again.
            // When the user clicks OK or Cancel on the newly opened Dialog, the objects will be swept away!
            continue; 
        } else {
            // Final Export Mode
            var allTrunks = validTrunks.concat(rejectedTrunks);
            if (allTrunks.length > 0 && p.exportCSV) {
                var csvPath = GetSaveFileName("Save Trunk List CSV", "Trunk List (*.csv)|*.csv");
                if (csvPath && csvPath.length > 0) {
                    var file = SFile.New(csvPath);
                    if (file.Open(SFile.WriteOnly)) {
                        file.Write("Name,X,Y,Z,Radius,FitError,Tilt/Slope,Status,RejectReason\n");
                        for (var fC = 0; fC < allTrunks.length; fC++) {
                            var t = allTrunks[fC];
                            var line = t.name + "," + t.x.toFixed(4) + "," + t.y.toFixed(4) + "," + 
                                       t.z.toFixed(4) + "," + t.radius.toFixed(4) + "," + 
                                       t.error.toFixed(4) + "," + t.tilt.toFixed(2) + "," +
                                       t.status + "," + t.reason + "\n";
                            file.Write(line);
                        }
                        file.Close();
                    }
                }
            }
            
            if (p.doCleanup) {
                for (var cO = 0; cO < intermediateObjects.length; cO++) {
                    if (intermediateObjects[cO] && intermediateObjects[cO].RemoveFromDoc) {
                        intermediateObjects[cO].RemoveFromDoc();
                    }
                }
            }
            
            SDialog.Message("Detection Complete.\n\n" +
                "Valid Trunks: " + validTrunks.length + "\n" +
                "Rejected Trunks: " + rejectedTrunks.length + "\n" +
                "Output: 'Extracted Trunks' folder.\n", SDialog.Success);
                
            break; // Exit Script
        }
    }
}
main();
