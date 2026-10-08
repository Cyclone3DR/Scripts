// ==============================================================================
// LEICA CYCLONE 3DR - STRUCTURAL PLATE & BOLT EXTRACTION TOOL v2.0
// ==============================================================================
// Features:
// 1. Single Face & Multi-Face (Bent Plate) Extraction Modes
// 2. High-Precision Planar Extraction & Surface Orientation
// 3. Real-Time Contour Digitizer: Shows Live Polyline & Closed Polygon Shape
//    with Undo Last Corner Support (no need to restart on misclick)
// 4. Exact Planar Surface Mesh Generation (SPoly.ConstraintMesh2D strictly bounded by perimeter)
// 5. In-Contour Spatial Bolt Clustering (+3mm to +35mm Proud Height)
// 6. Live 3D Viewport Preview with + Add / - Remove Bolt Assist
//    (Removing a bolt removes its circle, cylinder, AND center cross)
// 7. Multi-Face Fold-Line Snapping & 2D Flat Unfolding for CNC
// 8. 1:1 Scale DXF Template Export
// ==============================================================================

var PlateExtractorV2 = {
    config: {
        surfaceTolerance: 0.008,    // 8.0mm plane fitting tolerance
        boltMinHeight: 0.003,       // +3.0mm proud height above plate face
        boltMaxHeight: 0.035,       // +35.0mm proud height above plate face
        boltClusterDist: 0.004,     // 4.0mm distance clustering threshold
        minBoltPoints: 20,          // Minimum points to accept bolt cluster
        minBoltSpacing: 0.025,      // 25.0mm deduplication threshold
        defaultPrimaryHoleMm: 24.0, // 24.0mm CAD hole diameter
        defaultSecondaryHoleMm: 20.0, // 20.0mm CAD hole diameter
        circleNumSegments: 36,      // Segments for CAD circle polyline
        defaultExportDir: "C:/Users/Thomas/Developer/3DR Scipting/exports/",
        groupPrefix: "Plate_Extraction_v2_"
    },

    dot: function(v1, v2) {
        return v1.GetX() * v2.GetX() + v1.GetY() * v2.GetY() + v1.GetZ() * v2.GetZ();
    },

    cross: function(v1, v2) {
        return SVector.New(
            v1.GetY() * v2.GetZ() - v1.GetZ() * v2.GetY(),
            v1.GetZ() * v2.GetX() - v1.GetX() * v2.GetZ(),
            v1.GetX() * v2.GetY() - v1.GetY() * v2.GetX()
        );
    },

    norm: function(v) {
        return Math.sqrt(this.dot(v, v));
    },

    normalize: function(v) {
        var n = this.norm(v);
        if (n < 1e-9) return SVector.New(0, 0, 1);
        return SVector.New(v.GetX() / n, v.GetY() / n, v.GetZ() / n);
    },

    dist: function(p1, p2) {
        var dx = p1.GetX() - p2.GetX();
        var dy = p1.GetY() - p2.GetY();
        var dz = p1.GetZ() - p2.GetZ();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    intersectLines: function(o1, d1, o2, d2) {
        var w0 = SVector.New(o1.GetX() - o2.GetX(), o1.GetY() - o2.GetY(), o1.GetZ() - o2.GetZ());
        var a = this.dot(d1, d1);
        var b = this.dot(d1, d2);
        var c = this.dot(d2, d2);
        var d = this.dot(d1, w0);
        var e = this.dot(d2, w0);
        var denom = a * c - b * b;
        if (Math.abs(denom) < 1e-9) return null;
        var sc = (b * e - c * d) / denom;
        var tc = (a * e - b * d) / denom;
        var p1 = SPoint.New(o1.GetX() + sc * d1.GetX(), o1.GetY() + sc * d1.GetY(), o1.GetZ() + sc * d1.GetZ());
        var p2 = SPoint.New(o2.GetX() + tc * d2.GetX(), o2.GetY() + tc * d2.GetY(), o2.GetZ() + tc * d2.GetZ());
        return SPoint.New((p1.GetX() + p2.GetX()) / 2, (p1.GetY() + p2.GetY()) / 2, (p1.GetZ() + p2.GetZ()) / 2);
    },

    projectPointToLine: function(pt, lineOrigin, lineDir) {
        var v = SVector.New(pt.GetX() - lineOrigin.GetX(), pt.GetY() - lineOrigin.GetY(), pt.GetZ() - lineOrigin.GetZ());
        var d = this.dot(v, lineDir);
        return SPoint.New(
            lineOrigin.GetX() + d * lineDir.GetX(),
            lineOrigin.GetY() + d * lineDir.GetY(),
            lineOrigin.GetZ() + d * lineDir.GetZ()
        );
    },

    // Standard Ray-Casting Point-in-Polygon test (assumes 2D coordinates X and Y)
    isPointInPolygon2D: function(pt2d, poly2d) {
        var inside = false;
        var j = poly2d.length - 1;
        for (var i = 0; i < poly2d.length; i++) {
            if (((poly2d[i].y > pt2d.y) !== (poly2d[j].y > pt2d.y)) &&
                (pt2d.x < (poly2d[j].x - poly2d[i].x) * (pt2d.y - poly2d[i].y) / (poly2d[j].y - poly2d[i].y) + poly2d[i].x)) {
                inside = !inside;
            }
            j = i;
        }
        return inside;
    },

    rotatePointAroundAxis: function(pt, axisOrigin, axisDir, angle) {
        var u = this.normalize(axisDir);
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        var t = 1.0 - c;

        var x = pt.GetX() - axisOrigin.GetX();
        var y = pt.GetY() - axisOrigin.GetY();
        var z = pt.GetZ() - axisOrigin.GetZ();

        var ux = u.GetX();
        var uy = u.GetY();
        var uz = u.GetZ();

        var rx = (t * ux * ux + c) * x + (t * ux * uy - s * uz) * y + (t * ux * uz + s * uy) * z;
        var ry = (t * ux * uy + s * uz) * x + (t * uy * uy + c) * y + (t * uy * uz - s * ux) * z;
        var rz = (t * ux * uz - s * uy) * x + (t * uy * uz + s * ux) * y + (t * uz * uz + c) * z;

        return SPoint.New(rx + axisOrigin.GetX(), ry + axisOrigin.GetY(), rz + axisOrigin.GetZ());
    },

    getCoordinateFrame: function(normal) {
        var n = this.normalize(normal);
        var ref = (Math.abs(n.GetZ()) < 0.9) ? SVector.New(0, 0, 1) : SVector.New(1, 0, 0);
        var u = this.normalize(this.cross(n, ref));
        var v = this.cross(n, u);
        return { n: n, u: u, v: v };
    },

    projectPointToPlane: function(pt, p0, normal) {
        var n = this.normalize(normal);
        var v = SVector.New(pt.GetX() - p0.GetX(), pt.GetY() - p0.GetY(), pt.GetZ() - p0.GetZ());
        var d = this.dot(v, n);
        return SPoint.New(
            pt.GetX() - d * n.GetX(),
            pt.GetY() - d * n.GetY(),
            pt.GetZ() - d * n.GetZ()
        );
    },

    snapPolylineToPlane: function(poly, p0, normal) {
        var num = poly.GetNumber ? poly.GetNumber() : poly.length;
        var snapped = SMultiline.New();
        for (var i = 0; i < num; i++) {
            var pt = poly.GetPoint ? poly.GetPoint(i) : poly[i];
            var pProj = this.projectPointToPlane(pt, p0, normal);
            snapped.InsertLast(pProj);
        }
        snapped.Close();
        return snapped;
    },

    // Generates an exact planar mesh strictly constrained by the boundary perimeter
    createPlanarMeshFromContour: function(contourPoly, p0, normal) {
        var num = contourPoly.GetNumber();
        if (num < 3) return null;

        var n = this.normalize(normal);
        var cloud = SCloud.New();
        for (var i = 0; i < num; i++) {
            cloud.AddPoint(contourPoly.GetPoint(i));
        }

        var mRes = SPoly.ConstraintMesh2D(cloud, [contourPoly], n, 0.0, SPoly.INSIDE_CLOSED);
        if (mRes.ErrorCode === 0 && mRes.PolyTbl && mRes.PolyTbl.length > 0) {
            return mRes.PolyTbl[0];
        }
        return null;
    },

    createDashedLine: function(p1, p2, dashLen, gapLen) {
        dashLen = dashLen || 0.100;
        gapLen = gapLen || 0.050;
        
        var v = SVector.New(p2.GetX() - p1.GetX(), p2.GetY() - p1.GetY(), p2.GetZ() - p1.GetZ());
        var totalLen = this.norm(v);
        if (totalLen < 1e-4) return [];
        
        var dir = this.normalize(v);
        var segments = [];
        var currDist = 0;
        
        while (currDist < totalLen) {
            var nextDist = Math.min(currDist + dashLen, totalLen);
            var sp1 = SPoint.New(p1.GetX() + dir.GetX()*currDist, p1.GetY() + dir.GetY()*currDist, p1.GetZ() + dir.GetZ()*currDist);
            var sp2 = SPoint.New(p1.GetX() + dir.GetX()*nextDist, p1.GetY() + dir.GetY()*nextDist, p1.GetZ() + dir.GetZ()*nextDist);
            
            var line = SMultiline.New();
            line.InsertLast(sp1); line.InsertLast(sp2);
            segments.push(line);
            
            currDist = nextDist + gapLen;
        }
        return segments;
    },

    createCirclePoly: function(center, normal, radius, numSegs, name) {
        numSegs = numSegs || 36;
        name = name || "Bolt_Circle";
        var frame = this.getCoordinateFrame(normal);
        var poly = SMultiline.New();
        for (var i = 0; i <= numSegs; i++) {
            var ang = (i * 2.0 * Math.PI) / numSegs;
            var px = center.GetX() + radius * (Math.cos(ang) * frame.u.GetX() + Math.sin(ang) * frame.v.GetX());
            var py = center.GetY() + radius * (Math.cos(ang) * frame.u.GetY() + Math.sin(ang) * frame.v.GetY());
            var pz = center.GetZ() + radius * (Math.cos(ang) * frame.u.GetZ() + Math.sin(ang) * frame.v.GetZ());
            poly.InsertLast(SPoint.New(px, py, pz));
        }
        poly.Close();
        poly.SetName(name);
        return poly;
    },

    createCenterCross: function(center, normal, armLength, namePrefix) {
        armLength = armLength || 0.012;
        namePrefix = namePrefix || "Bolt_Cross";
        var frame = this.getCoordinateFrame(normal);
        
        var c1 = SMultiline.New();
        c1.InsertLast(SPoint.New(center.GetX() - armLength * frame.u.GetX(), center.GetY() - armLength * frame.u.GetY(), center.GetZ() - armLength * frame.u.GetZ()));
        c1.InsertLast(SPoint.New(center.GetX() + armLength * frame.u.GetX(), center.GetY() + armLength * frame.u.GetY(), center.GetZ() + armLength * frame.u.GetZ()));
        c1.SetName(namePrefix + "_A");
        c1.SetColors(1.0, 1.0, 0.0);
        c1.SetLineWidth(2);

        var c2 = SMultiline.New();
        c2.InsertLast(SPoint.New(center.GetX() - armLength * frame.v.GetX(), center.GetY() - armLength * frame.v.GetY(), center.GetZ() - armLength * frame.v.GetZ()));
        c2.InsertLast(SPoint.New(center.GetX() + armLength * frame.v.GetX(), center.GetY() + armLength * frame.v.GetY(), center.GetZ() + armLength * frame.v.GetZ()));
        c2.SetName(namePrefix + "_B");
        c2.SetColors(1.0, 1.0, 0.0);
        c2.SetLineWidth(2);

        return [c1, c2];
    },

    cleanupPreview: function(groupName) {
        groupName = groupName || "Preview_Plate_Extraction_v2";
        var comps = SComp.All();
        for (var i = comps.length - 1; i >= 0; i--) {
            var name = comps[i].GetName();
            var path = comps[i].GetPath ? comps[i].GetPath() : "";
            if (name.indexOf(groupName) !== -1 ||
                name.indexOf("Preview_") !== -1 ||
                name.indexOf("Live_") !== -1 ||
                path.indexOf(groupName) !== -1 ||
                path.indexOf("Live_Contour_Drawing") !== -1) {
                try { comps[i].RemoveFromDoc(); } catch (e) {}
            }
        }
    },

    extractPlaneFromClick: function(ptPlate, rawCloud, surfTol) {
        surfTol = surfTol || this.config.surfaceTolerance;
        var planeRes = rawCloud.ExtractPlane([ptPlate], surfTol);
        if (planeRes.ErrorCode !== 0 || !planeRes.Plane) {
            throw new Error("Could not extract plane at clicked point.");
        }
        var plane = planeRes.Plane;
        var n = this.normalize(plane.GetNormal());
        var p0 = plane.GetCenter();
        return {
            plane: plane,
            normal: n,
            center: p0,
            inCloud: planeRes.InCloud
        };
    },

    getPlaneInteractive: function(faceName, rawCloud, surfTol) {
        var previewGroup = "Preview_Planes";
        while (true) {
            SDialog.Message("Click directly on the " + faceName + " plate face in the 3D viewport.", ["OK"], SDialog.Instruction);
            var pClick = SPoint.FromClick();
            if (pClick.ErrorCode !== 0 || !pClick.Point) {
                throw new Error("Plate selection cancelled.");
            }
            var planeData = this.extractPlaneFromClick(pClick.Point, rawCloud, surfTol);
            
            // The geometric center of the extracted plane might be far away if the flange is huge.
            // Let's draw the visual patch exactly where the user clicked!
            var visCenter = this.projectPointToPlane(pClick.Point, planeData.center, planeData.normal);

            // Create a preview circular patch to show the extracted plane
            var circle = this.createCirclePoly(visCenter, planeData.normal, 0.500, 36, "Preview_" + faceName + "_Plane");
            circle.SetColors(0.0, 1.0, 1.0);
            circle.SetLineWidth(5); // Make it very thick and visible!
            circle.AddToDoc(); circle.MoveToGroup(previewGroup);

            // Create a cross grid to visualize the plane surface
            var crosses = this.createCenterCross(visCenter, planeData.normal, 0.500, "Preview_" + faceName + "_Grid");
            for(var c=0; c<crosses.length; c++) {
                crosses[c].SetColors(0.0, 1.0, 1.0);
                crosses[c].SetLineWidth(3);
                crosses[c].AddToDoc(); crosses[c].MoveToGroup(previewGroup);
            }
            Repaint();

            var confDlg = SDialog.New("Confirm " + faceName + " Plane");
            confDlg.SetHeader("A Cyan circular target and grid representing the mathematically extracted plane is now visible in the viewport.\n\nPlease inspect the 3D viewport. Does this flat grid perfectly align with the plate face point cloud?", "", 70);
            confDlg.SetButtons(["Accept Plane", "Redo (Click Again)", "Cancel"]);
            var res = confDlg.Run();
            this.cleanupPreview(previewGroup); // Remove it after decision
            Repaint();

            if (res.ErrorCode === 0) {
                return planeData; // Accepted!
            } else if (res.ErrorCode === 1) {
                continue; // Redo!
            } else {
                throw new Error("Plane extraction cancelled.");
            }
        }
    },

    // Interactive real-time contour digitizer with live polyline & closed polygon shape preview and undo support
    getManualContour: function(planeData, snapLines, snapPoints) {
        var liveGroup = "Live_Contour_Drawing";
        var hasSnaps = (snapLines && snapLines.length > 0);
        var hasPointSnaps = (snapPoints && snapPoints.length > 0);

        SDialog.Message(
            "Draw Plate Perimeter Contour:\n\n" +
            "1. Click each perimeter corner around the plate in the 3D viewport.\n" +
            (hasSnaps ? "   * Note: Click near red Boundary Lines to edge-snap, or near their intersection to corner-snap!\n" : "") +
            (hasPointSnaps ? "   * Note: Click near corners from the previous face to snap directly to them!\n" : "") +
            "2. Both the open polyline (Magenta) and closing polygon shape (Cyan) display live.\n" +
            "3. Right-Click or press Enter/Escape when done (you can also Undo last point).",
            ["Start Drawing"],
            SDialog.Instruction
        );

        var pts = [];

        var redrawLiveEntities = function() {
            // Clean previous live entities
            var comps = SComp.All();
            for (var i = comps.length - 1; i >= 0; i--) {
                var name = comps[i].GetName();
                if (name.indexOf("Live_") !== -1) {
                    try { comps[i].RemoveFromDoc(); } catch (e) {}
                }
            }

            if (pts.length === 0) {
                Repaint();
                return;
            }

            // Main active polyline (Magenta)
            var livePoly = SMultiline.New();
            livePoly.SetName("Live_Perimeter_Path");
            livePoly.SetColors(1.0, 0.0, 1.0); // Bright Magenta
            livePoly.SetLineWidth(4);
            for (var i = 0; i < pts.length; i++) {
                livePoly.InsertLast(pts[i]);
            }
            livePoly.AddToDoc();
            livePoly.MoveToGroup(liveGroup);

            // Live closing segment to complete polygon preview (Cyan)
            if (pts.length >= 2) {
                var closeSeg = SMultiline.New();
                closeSeg.SetName("Live_Closing_Segment");
                closeSeg.SetColors(0.0, 1.0, 1.0); // Cyan
                closeSeg.SetLineWidth(2);
                closeSeg.InsertLast(pts[pts.length - 1]);
                closeSeg.InsertLast(pts[0]);
                closeSeg.AddToDoc();
                closeSeg.MoveToGroup(liveGroup);
            }

            Repaint();
        };

        var collecting = true;
        while (collecting) {
            var pRes = SPoint.FromClick();
            if (pRes.ErrorCode === 0 && pRes.Point) {
                var pProj = this.projectPointToPlane(pRes.Point, planeData.center, planeData.normal);
                
                var snappedToPoint = false;

                // 1. Point Snapping (Highest Priority)
                if (hasPointSnaps) {
                    var closestPt = null;
                    var minDist = 0.050; // 50mm
                    for (var k = 0; k < snapPoints.length; k++) {
                        var dPt = this.dist(pProj, snapPoints[k]);
                        if (dPt < minDist) {
                            minDist = dPt;
                            closestPt = snapPoints[k];
                        }
                    }
                    if (closestPt) {
                        pProj = closestPt; // No need to project back to plane since they should share the fold axis
                        snappedToPoint = true;
                        print("  [SNAP] Snapped exactly to existing corner from previous face!");
                    }
                }

                // 2. Multi-line Edge and Corner Snapping
                if (hasSnaps && !snappedToPoint) {
                    var closeLines = [];
                    for (var i = 0; i < snapLines.length; i++) {
                        var sl = snapLines[i];
                        var pLineProj = this.projectPointToLine(pProj, sl.pointOnLine, sl.direction);
                        var d = this.dist(pProj, pLineProj);
                        if (d < 0.050) { // 50mm snap radius
                            closeLines.push({ line: sl, proj: pLineProj, dist: d });
                        }
                    }

                    if (closeLines.length >= 2) {
                        // Corner Snap! (Intersection of closest 2 lines)
                        closeLines.sort(function(a, b) { return a.dist - b.dist; });
                        var corner = this.intersectLines(closeLines[0].line.pointOnLine, closeLines[0].line.direction,
                                                         closeLines[1].line.pointOnLine, closeLines[1].line.direction);
                        if (corner) {
                            pProj = this.projectPointToPlane(corner, planeData.center, planeData.normal);
                            print("  [SNAP] Point snapped exactly to 3D Corner Intersection!");
                        }
                    } else if (closeLines.length === 1) {
                        // Edge Snap
                        pProj = closeLines[0].proj;
                        print("  [SNAP] Point snapped to Boundary Edge.");
                    }
                }

                pts.push(pProj);
                redrawLiveEntities();
            } else {
                // User right-clicked or pressed Enter/Escape
                if (pts.length < 3) {
                    var smallDlg = SDialog.New("Contour Incomplete (" + pts.length + " points)");
                    smallDlg.SetHeader("You have clicked " + pts.length + " point(s). A plate boundary polygon needs at least 3 corners.\n\nWhat would you like to do?", "", 70);
                    smallDlg.SetButtons(["Continue Clicking Corners", "Redraw from Start", "Cancel"]);
                    var sRes = smallDlg.Run();
                    if (sRes.ErrorCode === 0) {
                        continue;
                    } else if (sRes.ErrorCode === 1) {
                        pts = [];
                        redrawLiveEntities();
                        continue;
                    } else {
                        this.cleanupPreview(liveGroup);
                        throw new Error("Contour drawing cancelled.");
                    }
                }

                // Show action dialog with Undo option
                var confDlg = SDialog.New("Contour Complete (" + pts.length + " Corners)");
                confDlg.SetHeader("Perimeter defined with " + pts.length + " corners.\nPolygon shape is shown in viewport.\n\nChoose an action:", "", 75);
                confDlg.SetButtons([
                    "Validate & Extract Mesh",              // ErrorCode 0
                    "Undo Last Corner (#" + pts.length + ")", // ErrorCode 1
                    "Add More Corners",                     // ErrorCode 2
                    "Redraw from Start",                    // ErrorCode 3
                    "Cancel"                                // ErrorCode 4
                ]);
                var cRes = confDlg.Run();

                if (cRes.ErrorCode === 0) { // Validate & Extract Mesh
                    this.cleanupPreview(liveGroup);
                    var finalPoly = SMultiline.New();
                    for (var i = 0; i < pts.length; i++) {
                        finalPoly.InsertLast(pts[i]);
                    }
                    finalPoly.Close();
                    return finalPoly;
                } else if (cRes.ErrorCode === 1) { // Undo Last Corner
                    pts.pop();
                    print("  [UNDO] Removed last corner. Current points: " + pts.length);
                    redrawLiveEntities();
                    continue;
                } else if (cRes.ErrorCode === 2) { // Add More Corners
                    continue;
                } else if (cRes.ErrorCode === 3) { // Redraw from Start
                    pts = [];
                    redrawLiveEntities();
                    continue;
                } else {
                    this.cleanupPreview(liveGroup);
                    throw new Error("Contour drawing cancelled.");
                }
            }
        }
    },

    extractBoltsInContour: function(planeData, contourPoly, rawCloud, options) {
        options = options || {};
        var minH = options.boltMinHeight || this.config.boltMinHeight; // +3mm
        var maxH = options.boltMaxHeight || this.config.boltMaxHeight; // +35mm
        var clusterDist = options.boltClusterDist || this.config.boltClusterDist; // 4mm
        var minPoints = options.minBoltPoints || this.config.minBoltPoints; // 20 pts
        var minSpacing = options.minBoltSpacing || this.config.minBoltSpacing; // 25mm

        var nPlate = planeData.normal;
        var pPlateCenter = planeData.center;

        print("--- Slicing points strictly inside bounded contour (+3mm to +35mm) ---");

        var pProud1 = SPoint.New(pPlateCenter.GetX() + nPlate.GetX() * minH, pPlateCenter.GetY() + nPlate.GetY() * minH, pPlateCenter.GetZ() + nPlate.GetZ() * minH);
        var pProud2 = SPoint.New(pPlateCenter.GetX() + nPlate.GetX() * maxH, pPlateCenter.GetY() + nPlate.GetY() * maxH, pPlateCenter.GetZ() + nPlate.GetZ() * maxH);
        var sepRes = rawCloud.Separate(contourPoly, nPlate, pProud1, pProud2, SCloud.FILL_IN_ONLY);
        var proudCloud = (sepRes.ErrorCode === 0 && sepRes.InCloud) ? sepRes.InCloud : null;

        if (!proudCloud || proudCloud.GetNumber() < 20) {
            var pOpp1 = SPoint.New(pPlateCenter.GetX() - nPlate.GetX() * minH, pPlateCenter.GetY() - nPlate.GetY() * minH, pPlateCenter.GetZ() - nPlate.GetZ() * minH);
            var pOpp2 = SPoint.New(pPlateCenter.GetX() - nPlate.GetX() * maxH, pPlateCenter.GetY() - nPlate.GetY() * maxH, pPlateCenter.GetZ() - nPlate.GetZ() * maxH);
            var sepRes2 = rawCloud.Separate(contourPoly, nPlate, pOpp1, pOpp2, SCloud.FILL_IN_ONLY);
            if (sepRes2.ErrorCode === 0 && sepRes2.InCloud && sepRes2.InCloud.GetNumber() > (proudCloud ? proudCloud.GetNumber() : 0)) {
                proudCloud = sepRes2.InCloud;
            }
        }

        if (!proudCloud || proudCloud.GetNumber() < 20) {
            print("  No proud bolt clusters found inside bounded contour.");
            return [];
        }

        print("  Found " + proudCloud.GetNumber() + " proud points inside boundary.");

        var explodeRes = proudCloud.Explode(clusterDist, 15, 150);
        var rawClusters = explodeRes.CloudTbl || [];

        // Project the 3D contour to local 2D plane for Point-In-Polygon testing
        var frame = this.getCoordinateFrame(nPlate);
        var poly2d = [];
        for (var i = 0; i < contourPoly.GetNumber(); i++) {
            var pt = contourPoly.GetPoint(i);
            var v = SVector.New(pt.GetX() - pPlateCenter.GetX(), pt.GetY() - pPlateCenter.GetY(), pt.GetZ() - pPlateCenter.GetZ());
            poly2d.push({ x: this.dot(v, frame.u), y: this.dot(v, frame.v) });
        }

        var candidateBolts = [];
        for (var c = 0; c < rawClusters.length; c++) {
            var cCloud = rawClusters[c];
            var nPts = cCloud.GetNumber();
            if (nPts < minPoints) continue;

            var boxRes = cCloud.GetBoundingBox();
            if (boxRes.ErrorCode !== 0 || !boxRes.LowPoint || !boxRes.UpPoint) continue;
            var pMinB = boxRes.LowPoint;
            var pMaxB = boxRes.UpPoint;
            var dx = pMaxB.GetX() - pMinB.GetX();
            var dy = pMaxB.GetY() - pMinB.GetY();
            var dz = pMaxB.GetZ() - pMinB.GetZ();
            var span = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (span > 0.140 || span < 0.010) continue;

            var seedCenter = SPoint.New((pMinB.GetX() + pMaxB.GetX()) * 0.5, (pMinB.GetY() + pMaxB.GetY()) * 0.5, (pMinB.GetZ() + pMaxB.GetZ()) * 0.5);
            var finalCenter = seedCenter;
            var fittedCyl = null;
            var fittedRadius = 0.012;

            var cylRes = cCloud.ExtractCylinder([seedCenter], 0.004, SCloud.CYL_FORCE_DIRECTION, seedCenter, nPlate);
            if (cylRes.ErrorCode === 0 && cylRes.Cylinder) {
                var cyl = cylRes.Cylinder;
                var r = cyl.GetRadius();
                if (r >= 0.007 && r <= 0.035) {
                    fittedCyl = cyl;
                    fittedRadius = r;
                    finalCenter = cyl.GetCenter();
                }
            }

            var projCenter = this.projectPointToPlane(finalCenter, pPlateCenter, nPlate);

            // Point-In-Polygon Check
            var vCent = SVector.New(projCenter.GetX() - pPlateCenter.GetX(), projCenter.GetY() - pPlateCenter.GetY(), projCenter.GetZ() - pPlateCenter.GetZ());
            var pt2d = { x: this.dot(vCent, frame.u), y: this.dot(vCent, frame.v) };
            if (!this.isPointInPolygon2D(pt2d, poly2d)) {
                continue; // Bolt is outside the plate contour!
            }

            candidateBolts.push({
                cylinder: fittedCyl,
                fittedRadius: fittedRadius,
                headDiaMm: (fittedRadius * 2000).toFixed(1),
                center: projCenter,
                points: nPts,
                isLarge: fittedRadius >= 0.015
            });
        }

        candidateBolts.sort(function(a, b) { return b.points - a.points; });
        var uniqueBolts = [];
        for (var i = 0; i < candidateBolts.length; i++) {
            var cand = candidateBolts[i];
            var isDup = false;
            for (var j = 0; j < uniqueBolts.length; j++) {
                if (this.dist(cand.center, uniqueBolts[j].center) < minSpacing) {
                    isDup = true;
                    break;
                }
            }
            if (!isDup) uniqueBolts.push(cand);
        }

        print("  [SUCCESS] Validated " + uniqueBolts.length + " bolts inside bounded contour.");
        return uniqueBolts;
    },

    addManualBolt: function(clickPt, planeData, primaryHoleDiaMm, rawCloud) {
        var nPlate = planeData.normal;
        var pPlateCenter = planeData.center;
        var holeRad = (primaryHoleDiaMm || 24.0) / 2000.0;
        var cropRadius = 0.035;

        var boxContour = this.createCirclePoly(clickPt, nPlate, cropRadius, 24, "Temp_Crop");
        var p1 = SPoint.New(clickPt.GetX() - 0.05*nPlate.GetX(), clickPt.GetY() - 0.05*nPlate.GetY(), clickPt.GetZ() - 0.05*nPlate.GetZ());
        var p2 = SPoint.New(clickPt.GetX() + 0.05*nPlate.GetX(), clickPt.GetY() + 0.05*nPlate.GetY(), clickPt.GetZ() + 0.05*nPlate.GetZ());

        var localRes = rawCloud.Separate(boxContour, nPlate, p1, p2, SCloud.FILL_IN_ONLY);
        var localCloud = (localRes.ErrorCode === 0 && localRes.InCloud) ? localRes.InCloud : null;

        var finalCenter = clickPt;
        var fittedCyl = null;
        var rFit = holeRad;

        if (localCloud && localCloud.GetNumber() >= 15) {
            var boxRes = localCloud.GetBoundingBox();
            if (boxRes.ErrorCode === 0 && boxRes.LowPoint && boxRes.UpPoint) {
                finalCenter = SPoint.New(
                    (boxRes.LowPoint.GetX() + boxRes.UpPoint.GetX()) * 0.5,
                    (boxRes.LowPoint.GetY() + boxRes.UpPoint.GetY()) * 0.5,
                    (boxRes.LowPoint.GetZ() + boxRes.UpPoint.GetZ()) * 0.5
                );
            }
            var cylRes = localCloud.ExtractCylinder([finalCenter], 0.004, SCloud.CYL_FORCE_DIRECTION, finalCenter, nPlate);
            if (cylRes.ErrorCode === 0 && cylRes.Cylinder) {
                fittedCyl = cylRes.Cylinder;
                var r = fittedCyl.GetRadius();
                if (r >= 0.007 && r <= 0.035) {
                    rFit = r;
                    finalCenter = fittedCyl.GetCenter();
                }
            }
        }

        var projCenter = this.projectPointToPlane(finalCenter, pPlateCenter, nPlate);

        return {
            cylinder: fittedCyl,
            fittedRadius: rFit,
            headDiaMm: (rFit * 2000).toFixed(1),
            center: projCenter,
            points: localCloud ? localCloud.GetNumber() : 0,
            isLarge: rFit >= 0.015
        };
    },

    computePlaneIntersection: function(p1, n1, p2, n2) {
        var vFold = this.cross(n1, n2);
        var lenFold = this.norm(vFold);
        if (lenFold < 1e-4) return null;

        vFold = this.normalize(vFold);

        var d1 = this.dot(SVector.New(p1.GetX(), p1.GetY(), p1.GetZ()), n1);
        var d2 = this.dot(SVector.New(p2.GetX(), p2.GetY(), p2.GetZ()), n2);

        var n1n2 = this.dot(n1, n2);
        var det = 1.0 - n1n2 * n1n2;
        var c1 = (d1 - d2 * n1n2) / det;
        var c2 = (d2 - d1 * n1n2) / det;

        var pLine = SPoint.New(
            c1 * n1.GetX() + c2 * n2.GetX(),
            c1 * n1.GetY() + c2 * n2.GetY(),
            c1 * n1.GetZ() + c2 * n2.GetZ()
        );

        var bendAngleDeg = Math.acos(Math.max(-1, Math.min(1, n1n2))) * (180.0 / Math.PI);

        return {
            pointOnLine: pLine,
            direction: vFold,
            bendAngleDeg: bendAngleDeg
        };
    },

    // --- Main Workflow Runner ---
    run: function() {
        print("==================================================================");
        print(" LEICA CYCLONE 3DR - PLATE & BOLT EXTRACTION TOOL v2.0");
        print("==================================================================");

        var modeDlg = SDialog.New("Plate Extraction Tool v2.0 - Select Mode");
        modeDlg.SetHeader("Select Plate Extraction Workflow:\n\n" +
                          "1. Single Face Plate: Click plate face, live-draw boundary contour, auto-snap & extract bolts.\n" +
                          "2. Multi-Face / Bent Plate: Click two connected plate faces, auto-snap fold axis & unfold.", "", 80);
        modeDlg.SetButtons(["Single Face Plate", "Multi-Face / Bent Plate", "Cancel"]);
        var mRes = modeDlg.Run();

        if (mRes.ErrorCode === 0) {
            this.runSingleFaceWorkflow();
        } else if (mRes.ErrorCode === 1) {
            this.runMultiFaceWorkflow();
        } else {
            print("Operation cancelled by user.");
        }
    },

    runSingleFaceWorkflow: function() {
        var clouds = SCloud.All(SComp.VISIBLE_ONLY);
        if (!clouds || clouds.length === 0) clouds = SCloud.All();
        if (!clouds || clouds.length === 0) {
            SDialog.Message("No point cloud found in document.", ["OK"], SDialog.Error);
            return;
        }
        var rawCloud = clouds[0];

        // Step 1: Settings
        var setDlg = SDialog.New("Plate Extraction Settings");
        setDlg.AddFloat({ id: "surfTolMm", name: "Plane Fitting Tolerance (mm)", value: 8.0, min: 2.0, max: 30.0 });
        setDlg.AddFloat({ id: "primaryHoleMm", name: "Primary Bolt Hole CAD Dia (mm)", value: 24.0, min: 8.0, max: 50.0 });
        setDlg.AddFloat({ id: "secondaryHoleMm", name: "Secondary Bolt Hole CAD Dia (mm)", value: 20.0, min: 8.0, max: 50.0 });
        setDlg.AddBoolean({ id: "exportDxf", name: "Export 1:1 Scale DXF Template", value: true });
        setDlg.AddTextField({ id: "dxfName", name: "DXF File Name", value: "Plate_Template_" + (new Date()).getTime() + ".dxf" });

        var sRes = setDlg.Run();
        if (sRes.ErrorCode !== 0) return;

        var surfTol = (sRes.surfTolMm || 8.0) / 1000.0;
        var primaryHoleMm = sRes.primaryHoleMm || 24.0;
        var secondaryHoleMm = sRes.secondaryHoleMm || 20.0;
        var exportDxf = sRes.exportDxf;
        var dxfName = sRes.dxfName;

        // Step 2: Extract Plane (Interactive)
        var planeData;
        try {
            planeData = this.getPlaneInteractive("Main", rawCloud, surfTol);
        } catch(e) {
            print(e.message);
            return;
        }
        print("  Plate plane extracted: Normal = (" + planeData.normal.GetX().toFixed(3) + ", " + planeData.normal.GetY().toFixed(3) + ", " + planeData.normal.GetZ().toFixed(3) + ")");

        var snapLines = [];

        // Step 3b: Optional Boundary Faces (e.g. Beam flanges for edge snapping)
        var addingBoundaries = true;
        while (addingBoundaries) {
            var bDlg = SDialog.New("Boundary Plane Snapping");
            bDlg.SetHeader("Do you want to define Boundary Faces (like a supporting beam flange)?\nThis will compute automatic snapping edges and corners for your plate boundaries.", "", 65);
            bDlg.SetButtons(["Define Boundary Face", "No / Done"]);
            var bRes = bDlg.Run();
            if (bRes.ErrorCode === 0) {
                var bpPlane;
                try {
                    bpPlane = this.getPlaneInteractive("Boundary Face", rawCloud, surfTol);
                } catch(e) {
                    break;
                }
                    
                    // Compute intersection with the plate face
                    var bIntersect = this.computePlaneIntersection(planeData.center, planeData.normal, bpPlane.center, bpPlane.normal);
                    if (bIntersect) snapLines.push(bIntersect);

                    print("  [BOUNDARY] Extracted boundary plane and computed edge snap lines.");
            } else {
                addingBoundaries = false;
            }
        }

        // Display all snap lines visually (center them near the plates so they are visible!)
        var previewGroup = "Preview_Plate_Extraction_v2";
        var previewSnapPolys = [];
        for (var i = 0; i < snapLines.length; i++) {
            var sl = snapLines[i];
            
            // Project planeData's center onto the line to ensure the visual red line is drawn exactly where the user is looking!
            var localCenter = this.projectPointToLine(planeData.center, sl.pointOnLine, sl.direction);
            var p1 = SPoint.New(localCenter.GetX() - sl.direction.GetX() * 2.0, localCenter.GetY() - sl.direction.GetY() * 2.0, localCenter.GetZ() - sl.direction.GetZ() * 2.0);
            var p2 = SPoint.New(localCenter.GetX() + sl.direction.GetX() * 2.0, localCenter.GetY() + sl.direction.GetY() * 2.0, localCenter.GetZ() + sl.direction.GetZ() * 2.0);
            
            var dashed = this.createDashedLine(p1, p2, 0.100, 0.050); // 100mm dash, 50mm gap
            for (var d = 0; d < dashed.length; d++) {
                var sp = dashed[d];
                sp.SetName("SnapAssist_Boundary_Edge_" + i + "_Segment_" + d);
                sp.SetColors(1.0, 0.0, 0.0);
                sp.SetLineWidth(2);
                sp.AddToDoc(); sp.MoveToGroup(previewGroup);
                previewSnapPolys.push(sp);
            }
        }
        Repaint();

        // Step 4: Draw Manual Contour with live real-time polygon shape rendering & undo support
        SDialog.Message("Draw Perimeter in the 3D viewport.\nCorners near red lines will edge-snap. Corners near intersections will corner-snap!", ["OK"], SDialog.Instruction);
        var snappedContour = this.getManualContour(planeData, snapLines, []);

        // Step 5: Exact Planar Mesh Generation strictly bounded by contour perimeter
        var planarMesh = this.createPlanarMeshFromContour(snappedContour, planeData.center, planeData.normal);

        // Step 6: Extract Bolts strictly inside contour
        var bolts = this.extractBoltsInContour(planeData, snappedContour, rawCloud, {});

        // Step 7: Live Viewport Preview & Interactive Review
        var previewGroup = "Preview_Plate_Extraction_v2";
        var self = this;

        var updatePreview = function() {
            self.cleanupPreview(previewGroup);

            if (planarMesh) {
                planarMesh.SetName("Preview_Planar_Mesh");
                planarMesh.SetColors(1.0, 0.8, 0.2); // Golden Yellow
                planarMesh.SetTransparency(100);
                planarMesh.AddToDoc();
                planarMesh.MoveToGroup(previewGroup);
            }

            snappedContour.SetName("Preview_Validated_Contour");
            snappedContour.SetColors(1.0, 0.0, 1.0); // Magenta
            snappedContour.SetLineWidth(4);
            snappedContour.AddToDoc();
            snappedContour.MoveToGroup(previewGroup);

            for (var b = 0; b < bolts.length; b++) {
                var bolt = bolts[b];
                var bId = b + 1;
                var holeDia = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
                var holeRad = holeDia / 2000.0;

                if (bolt.cylinder) {
                    bolt.cylinder.SetName("Preview_Bolt_Cyl_" + bId);
                    bolt.cylinder.SetColors(1.0, 0.5, 0.0);
                    bolt.cylinder.AddToDoc();
                    bolt.cylinder.MoveToGroup(previewGroup + "/Bolts");
                }

                var circle = self.createCirclePoly(bolt.center, planeData.normal, holeRad, 36, "Preview_Hole_" + bId);
                circle.SetColors(1.0, 0.0, 0.0);
                circle.SetLineWidth(3);
                circle.AddToDoc();
                circle.MoveToGroup(previewGroup + "/Bolts");

                var crosses = self.createCenterCross(bolt.center, planeData.normal, 0.012, "Preview_Cross_" + bId);
                for (var cx = 0; cx < crosses.length; cx++) {
                    crosses[cx].AddToDoc();
                    crosses[cx].MoveToGroup(previewGroup + "/Bolts");
                }
            }
            Repaint();
        };

        updatePreview();

        var reviewing = true;
        while (reviewing) {
            var revDlg = SDialog.New("Review Extracted Plate & Bolts");
            revDlg.SetHeader("Extraction Live Preview Active in 3D Viewport!\n\n" +
                             "• Boundary Perimeter: " + (snappedContour.GetLength() * 1000).toFixed(1) + " mm\n" +
                             "• Extracted Bolts: " + bolts.length + " (Primary Hole: " + primaryHoleMm + "mm, Secondary: " + secondaryHoleMm + "mm)\n\n" +
                             "Inspect the viewport overlay. Click below to add/remove bolts or finish.", "", 90);
            revDlg.SetButtons(["Accept & Export DXF", "+ Add Missed Bolt", "- Remove Incorrect Bolt", "Cancel"]);
            var rRes = revDlg.Run();

            if (rRes.ErrorCode === 1) { // + Add Missed Bolt
                SDialog.Message("Click directly on the missed bolt head in the 3D viewport.", ["OK"], SDialog.Instruction);
                var mClick = SPoint.FromClick();
                if (mClick.ErrorCode === 0 && mClick.Point) {
                    var newB = this.addManualBolt(mClick.Point, planeData, primaryHoleMm, rawCloud);
                    bolts.push(newB);
                    updatePreview();
                }
            } else if (rRes.ErrorCode === 2) { // - Remove Incorrect Bolt
                SDialog.Message("Click on or near the bolt you want to remove in the 3D viewport.", ["OK"], SDialog.Instruction);
                var remClick = SPoint.FromClick();
                if (remClick.ErrorCode === 0 && remClick.Point) {
                    var clickP = remClick.Point;
                    var closestIdx = -1;
                    var minDist = 0.080;
                    for (var b = 0; b < bolts.length; b++) {
                        var d = this.dist(bolts[b].center, clickP);
                        if (d < minDist) {
                            minDist = d;
                            closestIdx = b;
                        }
                    }
                    if (closestIdx !== -1) {
                        print("  [USER REMOVE] Removed bolt #" + (closestIdx + 1));
                        bolts.splice(closestIdx, 1);
                        // Clean preview and refresh: removes circle, cylinder, AND crosses for deleted bolt!
                        updatePreview();
                    } else {
                        SDialog.Message("No bolt found within 80mm of click point.", ["OK"], SDialog.Warning);
                    }
                }
            } else if (rRes.ErrorCode === 0) { // Accept & Export
                reviewing = false;
            } else {
                this.cleanupPreview(previewGroup);
                Repaint();
                return;
            }
        }

        // Step 7: Finalize Output
        // We will keep the 3D preview objects in the document as the final 3D extraction!
        var comps = SComp.All();
        for (var i = 0; i < comps.length; i++) {
            if (comps[i].GetName().indexOf("Preview_") !== -1) {
                comps[i].SetName(comps[i].GetName().replace("Preview_", "Extracted_"));
            }
        }

        var finalGroup = this.config.groupPrefix + "SinglePlate_Flat_" + (new Date()).getTime();

        if (planarMesh) {
            planarMesh.SetName("Plate_Planar_Mesh");
            planarMesh.SetColors(1.0, 0.8, 0.2);
            planarMesh.SetTransparency(100);
            planarMesh.AddToDoc();
            planarMesh.MoveToGroup(finalGroup);
        }

        snappedContour.SetName("Plate_Boundary_Contour");
        snappedContour.SetColors(0.0, 1.0, 0.0); // Green
        snappedContour.SetLineWidth(4);
        snappedContour.AddToDoc();
        snappedContour.MoveToGroup(finalGroup);

        var dxfEntities = [snappedContour];

        for (var b = 0; b < bolts.length; b++) {
            var bolt = bolts[b];
            var bId = b + 1;
            var holeDia = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
            var holeRad = holeDia / 2000.0;

            if (bolt.cylinder) {
                bolt.cylinder.SetName("Bolt_Cylinder_" + bId);
                bolt.cylinder.SetColors(1.0, 0.5, 0.0);
                bolt.cylinder.AddToDoc();
                bolt.cylinder.MoveToGroup(finalGroup + "/Bolts");
            }

            var circle = this.createCirclePoly(bolt.center, planeData.normal, holeRad, this.config.circleNumSegments, "Bolt_Hole_" + bId + "_[Dia_" + holeDia.toFixed(1) + "mm]");
            circle.SetColors(1.0, 0.0, 0.0);
            circle.SetLineWidth(3);
            circle.AddToDoc();
            circle.MoveToGroup(finalGroup + "/Bolts");
            dxfEntities.push(circle);

            var crosses = this.createCenterCross(bolt.center, planeData.normal, 0.012, "Bolt_Cross_" + bId);
            for (var cx = 0; cx < crosses.length; cx++) {
                crosses[cx].AddToDoc();
                crosses[cx].MoveToGroup(finalGroup + "/Bolts");
                dxfEntities.push(crosses[cx]);
            }
        }

        if (exportDxf) {
            var exportPath = this.config.defaultExportDir + dxfName;
            try {
                var expRes = SSurveyingFormat.ExportProject(exportPath, dxfEntities);
                if (expRes.ErrorCode === 0) {
                    print("  [SUCCESS] 1:1 Scale DXF Template Exported to: " + exportPath);
                }
            } catch(e) {
                print("  DXF export warning: " + e.toString());
            }
        }

        Repaint();
        SDialog.Message("Extraction Complete!\n\n• The 3D extracted plates and bolts have been kept in their physical 3D locations.\n• The flattened 2D DXF Template (for CNC cutting) was saved to disk and placed at the global coordinate origin (0,0,0) in your tree.\n\n(Tip: Right-click the Flat template in the tree and select 'Zoom' to see it!)", ["Finish"], SDialog.Success);
    },

    runMultiFaceWorkflow: function() {
        var clouds = SCloud.All(SComp.VISIBLE_ONLY);
        if (!clouds || clouds.length === 0) clouds = SCloud.All();
        if (!clouds || clouds.length === 0) {
            SDialog.Message("No point cloud found in document.", ["OK"], SDialog.Error);
            return;
        }
        var rawCloud = clouds[0];

        // Step 1: Settings
        var setDlg = SDialog.New("Bent Plate Settings");
        setDlg.AddFloat({ id: "surfTolMm", name: "Plane Fitting Tolerance (mm)", value: 8.0, min: 2.0, max: 30.0 });
        setDlg.AddFloat({ id: "primaryHoleMm", name: "Primary Bolt Hole CAD Dia (mm)", value: 24.0, min: 8.0, max: 50.0 });
        setDlg.AddFloat({ id: "secondaryHoleMm", name: "Secondary Bolt Hole CAD Dia (mm)", value: 20.0, min: 8.0, max: 50.0 });
        setDlg.AddBoolean({ id: "exportDxf", name: "Export 1:1 Scale Flat Pattern DXF", value: true });
        setDlg.AddTextField({ id: "dxfName", name: "DXF File Name", value: "BentPlate_FlatPattern_" + (new Date()).getTime() + ".dxf" });

        var sRes = setDlg.Run();
        if (sRes.ErrorCode !== 0) return;

        var surfTol = (sRes.surfTolMm || 8.0) / 1000.0;
        var primaryHoleMm = sRes.primaryHoleMm || 24.0;
        var secondaryHoleMm = sRes.secondaryHoleMm || 20.0;
        var exportDxf = sRes.exportDxf;
        var dxfName = sRes.dxfName;
        // Step 2: Extract Planes (Interactive)
        var plane1, plane2;
        try {
            plane1 = this.getPlaneInteractive("Face 1", rawCloud, surfTol);
            plane2 = this.getPlaneInteractive("Face 2", rawCloud, surfTol);
        } catch (e) {
            print(e.message);
            return;
        }
        // Compute Main Intersection Fold Line
        var foldRes = this.computePlaneIntersection(plane1.center, plane1.normal, plane2.center, plane2.normal);
        if (!foldRes) {
            SDialog.Message("Planes are parallel or do not intersect cleanly.", ["OK"], SDialog.Warning);
            return;
        }
        print("  Bent Plate Fold Axis computed! Bend angle = " + foldRes.bendAngleDeg.toFixed(1) + "°");

        var snapLines = [];
        snapLines.push(foldRes);

        // Step 3: Optional Boundary Faces (e.g. Beam flanges for edge snapping)
        var boundaryPlanes = [];
        var addingBoundaries = true;
        while (addingBoundaries) {
            var bDlg = SDialog.New("Boundary Plane Snapping");
            bDlg.SetHeader("Do you want to define Boundary Faces (like a supporting beam flange)?\nThis will compute automatic snapping edges and corners for your plate boundaries.", "", 65);
            bDlg.SetButtons(["Define Boundary Face", "No / Done"]);
            var bRes = bDlg.Run();
            if (bRes.ErrorCode === 0) {
                var bpPlane;
                try {
                    bpPlane = this.getPlaneInteractive("Boundary Face", rawCloud, surfTol);
                } catch(e) {
                    break;
                }
                boundaryPlanes.push(bpPlane);
                    
                    // Compute intersection with Face 1
                    var bIntersect1 = this.computePlaneIntersection(plane1.center, plane1.normal, bpPlane.center, bpPlane.normal);
                    if (bIntersect1) snapLines.push(bIntersect1);
                    // Compute intersection with Face 2
                    var bIntersect2 = this.computePlaneIntersection(plane2.center, plane2.normal, bpPlane.center, bpPlane.normal);
                    if (bIntersect2) snapLines.push(bIntersect2);

                    print("  [BOUNDARY] Extracted boundary plane and computed edge snap lines.");
            } else {
                addingBoundaries = false;
            }
        }

        // Display all snap lines visually (center them near the plates so they are visible!)
        var previewGroup = "Preview_Plate_Extraction_v2";
        var previewSnapPolys = [];
        for (var i = 0; i < snapLines.length; i++) {
            var sl = snapLines[i];
            
            // Project plane1's center onto the line to ensure the visual red line is drawn exactly where the user is looking!
            var localCenter = this.projectPointToLine(plane1.center, sl.pointOnLine, sl.direction);
            var p1 = SPoint.New(localCenter.GetX() - sl.direction.GetX() * 2.0, localCenter.GetY() - sl.direction.GetY() * 2.0, localCenter.GetZ() - sl.direction.GetZ() * 2.0);
            var p2 = SPoint.New(localCenter.GetX() + sl.direction.GetX() * 2.0, localCenter.GetY() + sl.direction.GetY() * 2.0, localCenter.GetZ() + sl.direction.GetZ() * 2.0);
            
            var dashed = this.createDashedLine(p1, p2, 0.100, 0.050); // 100mm dash, 50mm gap
            for (var d = 0; d < dashed.length; d++) {
                var sp = dashed[d];
                sp.SetName((i === 0 ? "SnapAssist_Fold_Axis" : "SnapAssist_Boundary_Edge_" + i) + "_Segment_" + d);
                sp.SetColors(1.0, 0.0, 0.0);
                sp.SetLineWidth(i === 0 ? 4 : 2); // Thicker for main fold axis
                sp.AddToDoc(); sp.MoveToGroup(previewGroup);
                previewSnapPolys.push(sp);
            }
        }
        Repaint();

        // Step 4: Draw Contours
        SDialog.Message("Draw Perimeter for Face 1 in the 3D viewport.\nCorners near red lines will edge-snap. Corners near intersections will corner-snap!", ["OK"], SDialog.Instruction);
        var contour1 = this.getManualContour(plane1, snapLines, []);

        // Extract Face 1 corners to pass as snap points to Face 2
        var c1Points = [];
        for (var i = 0; i < contour1.GetNumber(); i++) {
            c1Points.push(contour1.GetPoint(i));
        }

        SDialog.Message("Draw Perimeter for Face 2 in the 3D viewport.\nClick near corners from Face 1 along the fold line to snap perfectly to them!", ["OK"], SDialog.Instruction);
        var contour2 = this.getManualContour(plane2, snapLines, c1Points);

        for (var i = 0; i < previewSnapPolys.length; i++) {
            try { previewSnapPolys[i].RemoveFromDoc(); } catch (e) {}
        }

        // Step 5: Extract Meshes & Bolts
        var mesh1 = this.createPlanarMeshFromContour(contour1, plane1.center, plane1.normal);
        var mesh2 = this.createPlanarMeshFromContour(contour2, plane2.center, plane2.normal);

        var bolts1 = this.extractBoltsInContour(plane1, contour1, rawCloud, {});
        var bolts2 = this.extractBoltsInContour(plane2, contour2, rawCloud, {});

        // Step 6: Live Viewport Preview for BOTH Faces
        var self = this;
        var updateMultiPreview = function() {
            self.cleanupPreview(previewGroup);

            // Draw Face 1
            if (mesh1) {
                mesh1.SetName("Preview_Face1_Mesh");
                mesh1.SetColors(1.0, 0.8, 0.2);
                mesh1.SetTransparency(100);
                mesh1.AddToDoc(); mesh1.MoveToGroup(previewGroup);
            }
            contour1.SetName("Preview_Face1_Contour");
            contour1.SetColors(0.0, 1.0, 0.0); contour1.SetLineWidth(4);
            contour1.AddToDoc(); contour1.MoveToGroup(previewGroup);

            for (var b = 0; b < bolts1.length; b++) {
                var bolt = bolts1[b];
                if (bolt.cylinder) {
                    bolt.cylinder.SetName("Preview_F1_Cyl_" + b);
                    bolt.cylinder.SetColors(1.0, 0.5, 0.0);
                    bolt.cylinder.AddToDoc(); bolt.cylinder.MoveToGroup(previewGroup + "/Bolts");
                }
                var hD = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
                var circle = self.createCirclePoly(bolt.center, plane1.normal, hD/2000.0, 36, "Preview_F1_Hole_" + b);
                circle.SetColors(1.0, 0.0, 0.0); circle.SetLineWidth(3);
                circle.AddToDoc(); circle.MoveToGroup(previewGroup + "/Bolts");

                var crosses = self.createCenterCross(bolt.center, plane1.normal, 0.012, "Preview_F1_Cross_" + b);
                for (var cx = 0; cx < crosses.length; cx++) {
                    crosses[cx].AddToDoc(); crosses[cx].MoveToGroup(previewGroup + "/Bolts");
                }
            }

            // Draw Face 2
            if (mesh2) {
                mesh2.SetName("Preview_Face2_Mesh");
                mesh2.SetColors(0.2, 0.8, 1.0);
                mesh2.SetTransparency(100);
                mesh2.AddToDoc(); mesh2.MoveToGroup(previewGroup);
            }
            contour2.SetName("Preview_Face2_Contour");
            contour2.SetColors(0.0, 1.0, 0.0); contour2.SetLineWidth(4);
            contour2.AddToDoc(); contour2.MoveToGroup(previewGroup);

            for (var b = 0; b < bolts2.length; b++) {
                var bolt = bolts2[b];
                if (bolt.cylinder) {
                    bolt.cylinder.SetName("Preview_F2_Cyl_" + b);
                    bolt.cylinder.SetColors(1.0, 0.5, 0.0);
                    bolt.cylinder.AddToDoc(); bolt.cylinder.MoveToGroup(previewGroup + "/Bolts");
                }
                var hD = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
                var circle = self.createCirclePoly(bolt.center, plane2.normal, hD/2000.0, 36, "Preview_F2_Hole_" + b);
                circle.SetColors(1.0, 0.0, 0.0); circle.SetLineWidth(3);
                circle.AddToDoc(); circle.MoveToGroup(previewGroup + "/Bolts");

                var crosses = self.createCenterCross(bolt.center, plane2.normal, 0.012, "Preview_F2_Cross_" + b);
                for (var cx = 0; cx < crosses.length; cx++) {
                    crosses[cx].AddToDoc(); crosses[cx].MoveToGroup(previewGroup + "/Bolts");
                }
            }

            // Draw Fold Line
            var pF1 = SPoint.New(foldRes.pointOnLine.GetX() - foldRes.direction.GetX() * 0.4, foldRes.pointOnLine.GetY() - foldRes.direction.GetY() * 0.4, foldRes.pointOnLine.GetZ() - foldRes.direction.GetZ() * 0.4);
            var pF2 = SPoint.New(foldRes.pointOnLine.GetX() + foldRes.direction.GetX() * 0.4, foldRes.pointOnLine.GetY() + foldRes.direction.GetY() * 0.4, foldRes.pointOnLine.GetZ() + foldRes.direction.GetZ() * 0.4);
            var fPoly = SMultiline.New();
            fPoly.InsertLast(pF1); fPoly.InsertLast(pF2);
            fPoly.SetName("Preview_Fold_Axis"); fPoly.SetColors(1.0, 0.0, 0.0); fPoly.SetLineWidth(3);
            fPoly.AddToDoc(); fPoly.MoveToGroup(previewGroup);

            Repaint();
        };

        updateMultiPreview();

        var reviewing = true;
        while (reviewing) {
            var revDlg = SDialog.New("Review Multi-Face Bent Plate");
            revDlg.SetHeader("Extraction Live Preview Active in 3D Viewport!\n\n" +
                             "• Bend Angle: " + foldRes.bendAngleDeg.toFixed(1) + "°\n" +
                             "• Extracted Bolts (Face 1): " + bolts1.length + "\n" +
                             "• Extracted Bolts (Face 2): " + bolts2.length + "\n\n" +
                             "Click below to finish and unfold flat.", "", 90);
            revDlg.SetButtons(["Unfold Flat & Export DXF", "+ Add Missed Bolt", "- Remove Incorrect Bolt", "Cancel"]);
            var rRes = revDlg.Run();

            if (rRes.ErrorCode === 1) { // + Add Missed Bolt
                SDialog.Message("Click directly on the missed bolt head in the 3D viewport.", ["OK"], SDialog.Instruction);
                var mClick = SPoint.FromClick();
                if (mClick.ErrorCode === 0 && mClick.Point) {
                    var clickP = mClick.Point;
                    var dist1 = Math.abs(this.dot(SVector.New(clickP.GetX() - plane1.center.GetX(), clickP.GetY() - plane1.center.GetY(), clickP.GetZ() - plane1.center.GetZ()), plane1.normal));
                    var dist2 = Math.abs(this.dot(SVector.New(clickP.GetX() - plane2.center.GetX(), clickP.GetY() - plane2.center.GetY(), clickP.GetZ() - plane2.center.GetZ()), plane2.normal));
                    
                    if (dist1 <= dist2) {
                        var newB = this.addManualBolt(clickP, plane1, primaryHoleMm, rawCloud);
                        bolts1.push(newB);
                        print("  [USER ADD] Added bolt to Face 1");
                    } else {
                        var newB = this.addManualBolt(clickP, plane2, primaryHoleMm, rawCloud);
                        bolts2.push(newB);
                        print("  [USER ADD] Added bolt to Face 2");
                    }
                    updateMultiPreview();
                }
            } else if (rRes.ErrorCode === 2) { // - Remove Incorrect Bolt
                SDialog.Message("Click on or near the bolt you want to remove in the 3D viewport.", ["OK"], SDialog.Instruction);
                var remClick = SPoint.FromClick();
                if (remClick.ErrorCode === 0 && remClick.Point) {
                    var clickP = remClick.Point;
                    
                    var closest1Idx = -1; var minDist1 = 0.080;
                    for (var b = 0; b < bolts1.length; b++) {
                        var d = this.dist(bolts1[b].center, clickP);
                        if (d < minDist1) { minDist1 = d; closest1Idx = b; }
                    }
                    var closest2Idx = -1; var minDist2 = 0.080;
                    for (var b = 0; b < bolts2.length; b++) {
                        var d = this.dist(bolts2[b].center, clickP);
                        if (d < minDist2) { minDist2 = d; closest2Idx = b; }
                    }

                    if (minDist1 < minDist2 && closest1Idx !== -1) {
                        print("  [USER REMOVE] Removed Face 1 bolt.");
                        bolts1.splice(closest1Idx, 1);
                    } else if (closest2Idx !== -1) {
                        print("  [USER REMOVE] Removed Face 2 bolt.");
                        bolts2.splice(closest2Idx, 1);
                    } else {
                        SDialog.Message("No bolt found near click.", ["OK"], SDialog.Warning);
                    }
                    updateMultiPreview();
                }
            } else if (rRes.ErrorCode === 0) { // Accept & Export
                reviewing = false;
            } else {
                this.cleanupPreview(previewGroup);
                Repaint();
                return;
            }
        }

        // Step 7: Unfolding Math
        // We will keep the 3D preview objects in the document as the final 3D extraction!
        // Just rename them to remove "Preview_"
        var comps = SComp.All();
        for (var i = 0; i < comps.length; i++) {
            if (comps[i].GetName().indexOf("Preview_") !== -1) {
                comps[i].SetName(comps[i].GetName().replace("Preview_", "Extracted_"));
            }
        }
        
        var finalGroup = this.config.groupPrefix + "BentPlate_Unfolded_" + (new Date()).getTime();
        var dxfEntities = [];

        // Determine rotation angle to make Plane 2 normal align with Plane 1 normal
        var cosTheta = this.dot(plane1.normal, plane2.normal);
        var angle = Math.acos(cosTheta);
        var ptN2 = SPoint.New(plane2.normal.GetX(), plane2.normal.GetY(), plane2.normal.GetZ());
        var rotN2_pos = this.rotatePointAroundAxis(ptN2, SPoint.New(0,0,0), foldRes.direction, angle);
        var rotN2_neg = this.rotatePointAroundAxis(ptN2, SPoint.New(0,0,0), foldRes.direction, -angle);
        var matchPos = this.dot(SVector.New(rotN2_pos.GetX(), rotN2_pos.GetY(), rotN2_pos.GetZ()), plane1.normal);
        var matchNeg = this.dot(SVector.New(rotN2_neg.GetX(), rotN2_neg.GetY(), rotN2_neg.GetZ()), plane1.normal);
        var unfoldAngle = (matchPos > matchNeg) ? angle : -angle;

        print("  Applying unfold rotation angle: " + (unfoldAngle * 180 / Math.PI).toFixed(1) + "°");

        // Helper to rotate a polyline
        var rotatePoly = function(poly, origin, dir, ang) {
            var rotPoly = SMultiline.New();
            for (var i = 0; i < poly.GetNumber(); i++) {
                var rpt = self.rotatePointAroundAxis(poly.GetPoint(i), origin, dir, ang);
                rotPoly.InsertLast(rpt);
            }
            if (poly.IsClosed()) rotPoly.Close();
            return rotPoly;
        };

        // Flatten Face 2 onto Plane 1
        var flatContour2 = rotatePoly(contour2, foldRes.pointOnLine, foldRes.direction, unfoldAngle);
        // (We only need to rotate the contours and bolts for the DXF, not the 3D mesh)

        // We now have Contour1, FlatContour2, Mesh1, FlatMesh2, Bolts1, FlatBolts2 all coplanar on Plane1.
        // Step 8: Rigid Transform to XY Plane (Z=0)
        // Align DXF so the Fold Axis is perfectly horizontal (X-axis) for CNC operators.
        var uDir = this.normalize(foldRes.direction);
        var nDir = this.normalize(plane1.normal);
        var vDir = this.normalize(this.cross(nDir, uDir));

        var flattenPointToXY = function(pt) {
            var vec = SVector.New(pt.GetX() - foldRes.pointOnLine.GetX(), pt.GetY() - foldRes.pointOnLine.GetY(), pt.GetZ() - foldRes.pointOnLine.GetZ());
            var px = self.dot(vec, uDir);
            var py = self.dot(vec, vDir);
            return SPoint.New(px, py, 0);
        };

        var flattenPolyToXY = function(poly) {
            var fPoly = SMultiline.New();
            for (var i = 0; i < poly.GetNumber(); i++) fPoly.InsertLast(flattenPointToXY(poly.GetPoint(i)));
            if (poly.IsClosed()) fPoly.Close();
            return fPoly;
        };

        // Create Final DXF Flat Pattern Entities
        var dxfContour1 = flattenPolyToXY(contour1);
        dxfContour1.SetName("Face1_Boundary"); dxfContour1.SetColors(0.0, 1.0, 0.0); dxfContour1.SetLineWidth(4);
        dxfContour1.AddToDoc(); dxfContour1.MoveToGroup(finalGroup);
        dxfEntities.push(dxfContour1);

        var dxfContour2 = flattenPolyToXY(flatContour2);
        dxfContour2.SetName("Face2_Boundary"); dxfContour2.SetColors(0.0, 1.0, 0.0); dxfContour2.SetLineWidth(4);
        dxfContour2.AddToDoc(); dxfContour2.MoveToGroup(finalGroup);
        dxfEntities.push(dxfContour2);

        // Trim Fold Axis to plate extents
        var minX = 999999, maxX = -999999;
        var checkPoints = function(poly) {
            for (var i = 0; i < poly.GetNumber(); i++) {
                var pt = poly.GetPoint(i);
                if (Math.abs(pt.GetY()) < 0.015) { // Within 15mm of fold axis
                    if (pt.GetX() < minX) minX = pt.GetX();
                    if (pt.GetX() > maxX) maxX = pt.GetX();
                }
            }
        };
        checkPoints(dxfContour1);
        checkPoints(dxfContour2);
        if (minX > maxX) { minX = -0.5; maxX = 0.5; } // Fallback if no points snapped

        var dxfFold = SMultiline.New();
        dxfFold.InsertLast(SPoint.New(minX, 0, 0));
        dxfFold.InsertLast(SPoint.New(maxX, 0, 0));
        dxfFold.SetName("Flat_Bend_Axis_[Angle_" + foldRes.bendAngleDeg.toFixed(1) + "deg]");
        dxfFold.SetColors(1.0, 0.0, 0.0); dxfFold.SetLineWidth(2);
        dxfFold.AddToDoc(); dxfFold.MoveToGroup(finalGroup);
        dxfEntities.push(dxfFold);

        // Bolts Face 1
        for (var b = 0; b < bolts1.length; b++) {
            var bolt = bolts1[b];
            var fCenter = flattenPointToXY(bolt.center);
            var hD = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
            var circle = self.createCirclePoly(fCenter, SVector.New(0,0,1), hD/2000.0, 36, "F1_Bolt_Hole_" + (b+1));
            circle.SetColors(1.0, 0.0, 0.0); circle.SetLineWidth(3);
            circle.AddToDoc(); circle.MoveToGroup(finalGroup + "/Bolts"); dxfEntities.push(circle);

            var crosses = self.createCenterCross(fCenter, SVector.New(0,0,1), 0.012, "F1_Cross_" + (b+1));
            for (var cx = 0; cx < crosses.length; cx++) {
                crosses[cx].AddToDoc(); crosses[cx].MoveToGroup(finalGroup + "/Bolts"); dxfEntities.push(crosses[cx]);
            }
        }

        // Bolts Face 2
        for (var b = 0; b < bolts2.length; b++) {
            var bolt = bolts2[b];
            var fCenter = flattenPointToXY(self.rotatePointAroundAxis(bolt.center, foldRes.pointOnLine, foldRes.direction, unfoldAngle));
            var hD = bolt.isLarge ? primaryHoleMm : secondaryHoleMm;
            var circle = self.createCirclePoly(fCenter, SVector.New(0,0,1), hD/2000.0, 36, "F2_Bolt_Hole_" + (b+1));
            circle.SetColors(1.0, 0.0, 0.0); circle.SetLineWidth(3);
            circle.AddToDoc(); circle.MoveToGroup(finalGroup + "/Bolts"); dxfEntities.push(circle);

            var crosses = self.createCenterCross(fCenter, SVector.New(0,0,1), 0.012, "F2_Cross_" + (b+1));
            for (var cx = 0; cx < crosses.length; cx++) {
                crosses[cx].AddToDoc(); crosses[cx].MoveToGroup(finalGroup + "/Bolts"); dxfEntities.push(crosses[cx]);
            }
        }

        // Re-mesh flat pattern (Optional visualization)
        var fMesh1Cloud = SCloud.New(); for (var i=0; i<dxfContour1.GetNumber(); i++) fMesh1Cloud.AddPoint(dxfContour1.GetPoint(i));
        var fmRes1 = SPoly.ConstraintMesh2D(fMesh1Cloud, [dxfContour1], SVector.New(0,0,1), 0.0, SPoly.INSIDE_CLOSED);
        if (fmRes1.ErrorCode === 0 && fmRes1.PolyTbl.length > 0) {
            fmRes1.PolyTbl[0].SetName("Face1_Flat_Mesh"); fmRes1.PolyTbl[0].SetColors(1.0, 0.8, 0.2);
            fmRes1.PolyTbl[0].AddToDoc(); fmRes1.PolyTbl[0].MoveToGroup(finalGroup);
        }
        var fMesh2Cloud = SCloud.New(); for (var i=0; i<dxfContour2.GetNumber(); i++) fMesh2Cloud.AddPoint(dxfContour2.GetPoint(i));
        var fmRes2 = SPoly.ConstraintMesh2D(fMesh2Cloud, [dxfContour2], SVector.New(0,0,1), 0.0, SPoly.INSIDE_CLOSED);
        if (fmRes2.ErrorCode === 0 && fmRes2.PolyTbl.length > 0) {
            fmRes2.PolyTbl[0].SetName("Face2_Flat_Mesh"); fmRes2.PolyTbl[0].SetColors(0.2, 0.8, 1.0);
            fmRes2.PolyTbl[0].AddToDoc(); fmRes2.PolyTbl[0].MoveToGroup(finalGroup);
        }

        if (exportDxf) {
            var exportPath = this.config.defaultExportDir + dxfName;
            try {
                var expRes = SSurveyingFormat.ExportProject(exportPath, dxfEntities);
                if (expRes.ErrorCode === 0) {
                    print("  [SUCCESS] 1:1 Scale DXF Flat Pattern Exported to: " + exportPath);
                }
            } catch(e) {
                print("  DXF export warning: " + e.toString());
            }
        }

        Repaint();
        SDialog.Message("Multi-Face Unfolding Complete!\n\n• The 3D extracted bent plates have been kept in their physical 3D locations.\n• The flattened 2D DXF Template (for CNC cutting) was saved to disk and placed at the global coordinate origin (0,0,0) in your tree.\n\n(Tip: Right-click the Flat template in the tree and select 'Zoom' to see it!)", ["Finish"], SDialog.Success);
    }
};

// Run if called directly
PlateExtractorV2.run();
