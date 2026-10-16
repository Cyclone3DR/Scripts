// Cloud Separation by Height
// Author: Justin Scholz <jscholz@bcf-engr.com>

// // Cyclone 3DR — Colorize & Separate points above a Z height.
// Patched: center clipping box in XY over cloud + activate correctly.
// Compatible with Cyclone 3DR 2025.1+
// Select one Cloud before running.
// Justin Scholz 2025-10-02
(function () {
  // ---------- Helpers ----------
  function fail(msg) { throw new Error(msg); }
  function num(v) { var n = parseFloat(v); if (isNaN(n)) fail("Height must be a valid number."); return n; }
  function askHeightZDialog(defaultVal) {
    var dlg = SDialog.New("Colorize & Separate Above Height");
    // Newer API: typed inputs + Run()
    if (typeof dlg.AddLength === "function" || typeof dlg.AddFloat === "function") {
      var add = dlg.AddLength || dlg.AddFloat;
      add.call(dlg, { id: "heightZ", name: "Height (Z)", value: defaultVal || 0.0 });
      var res = (typeof dlg.Run === "function") ? dlg.Run() : dlg.Execute();
      if (!res || res.ErrorCode !== 0) fail("Canceled by user.");
      if (res.Values && typeof res.Values["heightZ"] !== "undefined") return num(res.Values["heightZ"]);
      if (typeof res["heightZ"] !== "undefined") return num(res["heightZ"]);
      if (res.InputTbl && res.InputTbl.length) return num(res.InputTbl[0]);
      fail("Dialog returned no usable value.");
    }
    // Legacy API: AddLine + Execute()
    if (typeof dlg.AddLine === "function" && typeof dlg.Execute === "function") {
      dlg.AddLine("Height (Z):", true);
      var out = dlg.Execute();
      if (!out || out.ErrorCode !== 0) fail("Canceled by user.");
      return num(out.InputTbl[0]);
    }
    fail("This version of Cyclone 3DR is too old, please upgrade");
  }

  // ---------- 1) Input cloud ----------
  var sel = SCloud.FromSel();
  if (!sel || sel.length === 0) fail("Select at least one point cloud and rerun.");
  var cloud = sel[0];

  // ---------- 2) Get bounding box and suggest height ----------
  var bbox = cloud.GetBoundingBox();

  // Variables we may need later
  var minX = 0, minY = 0, maxX = 0, maxY = 0;
  var rangeX = 1.0, rangeY = 1.0, midX = 0.0, midY = 0.0;
  var heightZ;

  if (!bbox || bbox.ErrorCode !== 0) {
    print("WARNING: Could not get bounding box. Using default height and XY center at (0,0)." );
    heightZ = askHeightZDialog(0.0);
  } else {
    // 2025.x uses LowPoint and UpPoint - try different property access patterns
    var minZ, maxZ;
    // Z
    if (typeof bbox.LowPoint.z !== "undefined") { minZ = bbox.LowPoint.z; maxZ = bbox.UpPoint.z; }
    else if (typeof bbox.LowPoint.Z !== "undefined") { minZ = bbox.LowPoint.Z; maxZ = bbox.UpPoint.Z; }
    else if (typeof bbox.LowPoint.GetZ === "function") { minZ = bbox.LowPoint.GetZ(); maxZ = bbox.UpPoint.GetZ(); }
    else {
      print("LowPoint properties:");
      for (var k in bbox.LowPoint) { print(" - " + k + ": " + bbox.LowPoint[k]); }
      fail("Could not access Z coordinate from LowPoint/UpPoint.");
    }

    // X/Y (same pattern as Z)
    if (typeof bbox.LowPoint.x !== "undefined") {
      minX = bbox.LowPoint.x; minY = bbox.LowPoint.y;
      maxX = bbox.UpPoint.x;  maxY = bbox.UpPoint.y;
    } else if (typeof bbox.LowPoint.X !== "undefined") {
      minX = bbox.LowPoint.X; minY = bbox.LowPoint.Y;
      maxX = bbox.UpPoint.X;  maxY = bbox.UpPoint.Y;
    } else if (typeof bbox.LowPoint.GetX === "function") {
      minX = bbox.LowPoint.GetX(); minY = bbox.LowPoint.GetY();
      maxX = bbox.UpPoint.GetX();  maxY = bbox.UpPoint.GetY();
    } else {
      // If XY cannot be read (very unlikely if Z worked), keep defaults at (0,0)
      print("WARNING: Could not access X/Y from bounding box. Center will default to (0,0).");
    }

    rangeX = Math.max(1.0, maxX - minX);
    rangeY = Math.max(1.0, maxY - minY);
    midX   = (minX + maxX) / 2.0;
    midY   = (minY + maxY) / 2.0;

    var rangeZ = maxZ - minZ;
    var midZ = minZ + (rangeZ / 2.0);
    print("Cloud Z-bounds: Min=" + minZ.toFixed(2) + ", Max=" + maxZ.toFixed(2) + ", Range=" + rangeZ.toFixed(2));
    print("Suggested heights:");
    print(" - Middle (50%): " + midZ.toFixed(2));
    print(" - Lower third (33%): " + (minZ + rangeZ * 0.33).toFixed(2));
    print(" - Upper third (67%): " + (minZ + rangeZ * 0.67).toFixed(2));

    // 3) Ask for height (default to middle)
    heightZ = askHeightZDialog(midZ);
  }

  // ---------- 3b) Capture source cloud's current representation ----------
  var srcRepresentation = null;
  if (typeof cloud.GetCloudRepresentation === "function") {
    srcRepresentation = cloud.GetCloudRepresentation();
    print("Source cloud representation: " + srcRepresentation);
  }

  // ---------- 4) Create an 'infinite up' clipping box above Z = heightZ ----------
  // Size the box in XY to the cloud extent (+5%) and very tall in Z
  var BIG = Math.max(rangeX, rangeY) * 10.0; // tall enough in Z
  var halfZ = BIG / 2.0;
  var box = SClippingBox.New();

  // Ensure some minimal size in XY
  var len = Math.max(rangeX * 1.05, 1.0);
  var wid = Math.max(rangeY * 1.05, 1.0);

  box.SetLength(len);
  box.SetWidth(wid);
  box.SetHeight(BIG);

  // Position box so its BOTTOM face is at heightZ; center in XY over the cloud
  box.SetCenter(SPoint.New(midX, midY, heightZ + halfZ));

  // Add to doc and ACTIVATE (official API)
  box.AddToDoc();
  if (typeof box.ActivateInAllScenes === "function") {
    box.ActivateInAllScenes();
  } else if (typeof box.ActivateInScene === "function") {
    box.ActivateInScene(0);
  }

  // Ensure the cloud is clippable
  if (typeof cloud.SetClippable === "function") {
    cloud.SetClippable(true);
  }

  // Sanity logs
  if (typeof SClipping !== "undefined" && typeof SClipping.GetAllActivated === "function") {
    var act = SClipping.GetAllActivated();
    print("Activated clipping objs: " + (act ? act.length : 0));
  }

  print("Clipping box positioned with bottom at Z=" + heightZ.toFixed(2) +
        ", centered at X=" + midX.toFixed(2) + ", Y=" + midY.toFixed(2) +
        ", L/W/H=" + len.toFixed(2) + "/" + wid.toFixed(2) + "/" + BIG.toFixed(2));

  // ---------- 5) Separate with clipping objects (single call) ----------
  print("Original cloud has " + cloud.GetNumber() + " points");

  var above = null, below = null;
  var sepBoth = SCloud.SeparateWithClippingObjects([cloud], SCloud.BothClipping);

  if (sepBoth && sepBoth.ErrorCode === 0 && sepBoth.CloudTbl && sepBoth.CloudTbl.length >= 2) {
    above = sepBoth.CloudTbl[0];
    below = sepBoth.CloudTbl[1];
    print("Clipped (above) has " + (above ? above.GetNumber() : 0) + " points");
    print("Unclipped (below) has " + (below ? below.GetNumber() : 0) + " points");
  } else {
    // Fallback: try individual modes to salvage results
    print("WARNING: BothClipping returned no/partial results. Trying individual modes...");
    var sepClipped = SCloud.SeparateWithClippingObjects([cloud], SCloud.Clipped);
    if (sepClipped && sepClipped.ErrorCode === 0 && sepClipped.CloudTbl && sepClipped.CloudTbl.length > 0) {
      above = sepClipped.CloudTbl[0];
      print("Clipped cloud has " + above.GetNumber() + " points");
    }
    var sepUnclipped = SCloud.SeparateWithClippingObjects([cloud], SCloud.Unclipped);
    if (sepUnclipped && sepUnclipped.ErrorCode === 0 && sepUnclipped.CloudTbl && sepUnclipped.CloudTbl.length > 0) {
      below = sepUnclipped.CloudTbl[0];
      print("Unclipped cloud has " + below.GetNumber() + " points");
    }
  }

  // Check results and create empty clouds if needed
  if (!above && !below) {
    fail("Neither clipped nor unclipped clouds were returned. Check if clipping box is positioned and activated correctly.");
  }
  if (!above) { above = SCloud.New(); above.AddToDoc(); print("Created empty 'above' cloud (no points above Z=" + heightZ + ")"); }
  if (!below) { below = SCloud.New(); below.AddToDoc(); print("Created empty 'below' cloud (no points below Z=" + heightZ + ")"); }

  // ---------- 6) Style results ----------
  above.AddToDoc();
  below.AddToDoc();

  // Clean up cloud name (strip previous suffixes if re-running)
  var baseName = cloud.GetName();
  try {
    baseName = baseName.replace(/_AboveZ_[0-9.]+$/g, "").replace(/_BelowZ_[0-9.]+$/g, "");
  } catch (e) { /* keep original if regex fails */ }

  above.SetName(baseName + "_AboveZ_" + heightZ.toFixed(2));
  below.SetName(baseName + "_BelowZ_" + heightZ.toFixed(2));

  if (srcRepresentation !== null && typeof above.SetCloudRepresentation === "function") {
    try {
      above.SetCloudRepresentation(srcRepresentation);
      below.SetCloudRepresentation(srcRepresentation);
    } catch (e) { print("SetCloudRepresentation failed: " + e); }
  }

  // ---------- 7) Tidy up ----------
  cloud.SetVisibility(false);
  box.RemoveFromDoc();
  print("Done. Created clouds: " + above.GetName() + " and " + below.GetName() + ".");
})();

