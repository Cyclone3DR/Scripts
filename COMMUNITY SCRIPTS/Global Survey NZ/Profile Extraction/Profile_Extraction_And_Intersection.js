/**
 * @name Profile Section Extraction & Intersection
 * @author Thomas (Global Survey NZ)
 * @description Automates the extraction of a cross-section profile and calculates a theoretical intersection point.
 * Features:
 * 1. Automatically creates a custom UCS aligned with a user-defined direction line.
 * 2. Extracts and flattens a 1cm point cloud slice for easy tracing.
 * 3. Auto-orients the camera to the optimal view.
 * 4. Calculates the theoretical intersection between two traced profile lines.
 * @version 1.0
 */
function main() {
    // INTERACTIVE SCRIPT: Integrated Profile & Direction Generator
    // Leica Cyclone 3DR Scripting
    
    // 1. Get the massive 3D cloud WITHOUT requiring tree selection (to avoid visual noise)
    var allClouds = SCloud.All();
    var selCloud = null;
    
    if (allClouds.length === 1) {
        // Automatically use the only cloud in the document
        selCloud = allClouds[0];
    } else if (allClouds.length > 1) {
        // Multiple clouds exist: ask the user to click the one they want
        print("Multiple clouds detected. Please CLICK on the cloud you want to use...");
        selCloud = SCloud.FromClick();
    }
    
    if (!selCloud) {
        throw new Error("No point cloud found. Please ensure a point cloud is loaded.");
    }
    
    // 2. Define Direction
    print("Waiting for user to click FIRST point to define Profile Direction...");
    var pDir1 = SPoint.FromClick().Point;
    print("Waiting for user to click SECOND point to define Profile Direction...");
    var pDir2 = SPoint.FromClick().Point;
    
    if (!pDir1 || !pDir2) {
        throw new Error("Direction points missed.");
    }
    
    var dirVec = SVector.New(pDir1, pDir2);
    
    // Output the Direction Line as requested
    var directionPoly = SMultiline.New();
    directionPoly.InsertLast(pDir1);
    directionPoly.InsertLast(pDir2);
    directionPoly.SetName("Profile Direction Line");
    directionPoly.AddToDoc();
    
    // Create and activate a custom Coordinate System (UCS) aligned with the profile edge
    print("Creating UCS...");
    try {
        // We invert the X axis so pressing 'X' looks from the OTHER side
        var xAxis = SVector.New(-dirVec.GetX(), -dirVec.GetY(), -dirVec.GetZ());
        xAxis.Normalize();
        var globalZ = SVector.New(0, 0, 1);
        var yAxis = SVector.Cross(globalZ, xAxis);
        yAxis.Normalize();
        var zAxis = SVector.Cross(xAxis, yAxis);
        zAxis.Normalize();
        
        var row1 = [xAxis.GetX(), xAxis.GetY(), xAxis.GetZ(), pDir1.GetX()];
        var row2 = [yAxis.GetX(), yAxis.GetY(), yAxis.GetZ(), pDir1.GetY()];
        var row3 = [zAxis.GetX(), zAxis.GetY(), zAxis.GetZ(), pDir1.GetZ()];
        
        var ucsMatrix = SMatrix.New(row1, row2, row3);
        ucsMatrix.AddToDocAsUCS("Profile Edge UCS", true);
    } catch (e) {
        print("Notice: Could not automatically set UCS. Error: " + e.message);
    }
    
    // 3. Slice and Flatten (The Neat Trick)
    print("Extracting 1cm slice (0.5cm either end) and flattening...");
    
    // The slice plane must be perpendicular to the direction line (Transverse slice)
    var slicePlane = SPlane.New(pDir1, dirVec);
    // OPTIMIZATION: Extract a razor-thin 1cm slice (0.005m on either side)
    var chunkRes = selCloud.SeparateFeature(slicePlane, 0.005, SCloud.FILL_IN_ONLY);
    
    if (!chunkRes || !chunkRes.InCloud) {
        throw new Error("Could not extract points around your click. Did you click on the cloud?");
    }
    
    var flatCloud = chunkRes.InCloud;
    
    // Flatten the slice onto the plane instantly using C++ engine
    flatCloud.ProjectOnPlane(slicePlane);
    
    if (flatCloud.GetNumber() < 10) {
        throw new Error("Not enough points found in the slice. Ensure you clicked on a dense area of the cloud.");
    }
    
    flatCloud.SetName("Temporary Flat Profile Cloud");
    flatCloud.AddToDoc(); // MUST be added to document before coloring!
    
    // Color it bright red so it stands out against the dark background!
    try { if (flatCloud.ClearColors) flatCloud.ClearColors(); } catch(e){}
    try { flatCloud.SetColors(1.0, 0.0, 0.0); } catch(e) {}
    
    // UX IMPROVEMENT: Hide the massive original cloud and zoom to the slice!
    selCloud.SetVisibility(false);
    
    // 5. Automated Camera Alignment (Local Coordinates!)
    print("Auto-orienting and zooming camera...");
    
    // Because the custom UCS is active, the engine expects LOCAL coordinates.
    // Looking down the local -X axis with local +Z as up guarantees perfect alignment.
    var localCamDir = SVector.New(-1, 0, 0);
    var localUpDir = SVector.New(0, 0, 1);
    
    if (typeof SetCameraDirection === "function") {
        SetCameraDirection(localCamDir, localUpDir);
    }
    
    if (typeof ZoomOn === "function") {
        ZoomOn([directionPoly]);
    }
    
    try { FlushDisplay(); Repaint(); } catch(e) {}
    print("Flat profile generated and zoomed! Please look at the flat cloud for the next steps.");
    
    // 4. Generate the Template (The 4 Clicks)
    print("Waiting for user to click the FAR END of the TOP surface...");
    var pTop1 = SPoint.FromClick().Point; 
    print("Waiting for user to click a point NEAR THE CORNER on the TOP surface...");
    var pTop2 = SPoint.FromClick().Point; 
    
    print("Waiting for user to click the FAR END of the SIDE surface...");
    var pSide1 = SPoint.FromClick().Point; 
    print("Waiting for user to click a point NEAR THE CORNER on the SIDE surface...");
    var pSide2 = SPoint.FromClick().Point; 
    
    var topLine = SLine.New(pTop1, pTop2);
    var sideLine = SLine.New(pSide1, pSide2);
    
    var intersectionResult = topLine.IntersectionBetween2Lines(sideLine);
    
    if (intersectionResult && intersectionResult.ErrorCode === 0) {
        var theoreticalCorner = intersectionResult.Point;
        
        // Build L-Shaped Profile
        // Extend the downward side line to be twice as long
        var downVec = SVector.New(theoreticalCorner, pSide1);
        var extendedSide = SPoint.New(
            theoreticalCorner.GetX() + downVec.GetX() * 2.0,
            theoreticalCorner.GetY() + downVec.GetY() * 2.0,
            theoreticalCorner.GetZ() + downVec.GetZ() * 2.0
        );
    
        var profile = SMultiline.New();
        profile.InsertLast(pTop1);
        profile.InsertLast(theoreticalCorner);
        profile.InsertLast(extendedSide);
        
        profile.SetName("Generated CAD Profile");
        try { profile.SetColors(0.1, 0.9, 0.3); } catch(e) {}
        profile.AddToDoc();
        
        // Build Theoretical Point
        var guidePoint = SPoint.New(theoreticalCorner);
        guidePoint.SetName("Theoretical Guide Point");
        guidePoint.AddToDoc();
        
        // We intentionally leave the massive original cloud hidden so you only see the L-shape and flat slice!
        
        print("SUCCESS! Direction Line, CAD Profile, and Guide Point have all been saved to the document.");
    } else {
        print("ERROR: Lines are perfectly parallel and do not intersect.");
    }
}
main();
