/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>
//
// export_ortho_with_panos.js  -  Cyclone 3DR 2026.1
// ============================================================================
// Produce an organized, multi-folder dataset to feed a 360-pano viewer app.
// For each BUILDING (= a selected point cloud) and each LEVEL (= a clicked floor):
//   - a georeferenced floor-plan orthophoto (TIFF + .tfw) of that level's slab,
//   - the panos that belong to that level (positions read from the scene),
//   - the actual pano image files saved directly from the posed SImage (optional),
//   - level.json / building.json / manifest.json metadata,
//   - an optional self-contained web QC viewer (preview PNG + viewer.html).
//
// Output layout:
//   <outputRoot>/manifest.json
//   <outputRoot>/viewer.html                      (optional)
//   <outputRoot>/Building_<name>/building.json
//   <outputRoot>/Building_<name>/Level_<n>/plan_L<n>_Z<z>.tif  (+ .tfw, + .tif.json)
//   <outputRoot>/Building_<name>/Level_<n>/preview.png         (optional)
//   <outputRoot>/Building_<name>/Level_<n>/level.json
//   <outputRoot>/Building_<name>/Level_<n>/panos/<scan>/<uid>__<name>.jpg
//
// Pano positions come FROM THE SCENE (posed spherical SImages):
//   GetCameraExternalParameters -> GetPosition / GetOrientationQuaternion.
// Pano pixels are exported DIRECTLY from each posed SImage via SImage.Save().
//
// Depends on the companion importer's per-scan tree (/PANOS/<scan>/images/...):
// the scan name is recovered from that path so identical NavVis filenames (each
// scan restarts at 00000) don't collide. Each saved pano also gets a globally
// unique "<uid>__<name>.jpg" filename as a hard collision guard.
//
// Requires the Survey license (SImage.ExportOrthoImage and SImage.Save both need it).
// ============================================================================

// ============================================================================
// CONFIG
// ============================================================================

// Size guards keep the peak ortho buffer bounded (very large buildings can
// otherwise exhaust RAM). GSD is auto-coarsened when a plan would exceed these,
// trading a little sharpness for correctness. Raise on high-RAM machines.
var MAX_PIXELS_PER_SIDE = 12000;   // warn/guard above this on either side
var MAX_TOTAL_MP        = 100;     // warn/guard above this many megapixels

var GSD_PRESETS = [0.001, 0.002, 0.005, 0.010, 0.020];
var GSD_LABELS  = ["1 mm", "2 mm", "5 mm (default)", "10 mm", "20 mm", "Custom"];
var GSD_DEFAULT_INDEX = 2;

var BG_LABELS = ["White", "Black", "Light grey", "Custom RGB"];
var BG_PRESETS = [[255, 255, 255], [0, 0, 0], [220, 220, 220], null];

var STYLE_LABELS = ["RGB (Real Color)", "Intensity (greyscale)", "Classification", "Ghost / X-ray (CAD plan)"];
var STYLE_RGB = 0, STYLE_INTENSITY = 1, STYLE_CLASSIFICATION = 2, STYLE_GHOST = 3;
var STYLE_REP_NAME = ["real_color", "intensity", "classification", "flat"];

// Output format is fixed to GeoTIFF (the viewer needs .tif + .tfw).
var FORMAT_EXT = ["tif"], FORMAT_WORLD = "tfw", FORMAT_IDX = 0;

// Merge floor clicks whose Z are closer than this fraction of the band thickness.
var LEVEL_MERGE_FRACTION = 0.5;

// Pano->building assignment tolerance: a pano counts as "inside" a building if its
// XY is within this margin of the cloud bbox. Keep SMALL so exporting one building
// never grabs an adjacent building's panos.
var BUILDING_MARGIN_M = 1.0;

// Web QC viewer: downscaled preview PNG so a browser can render it (full TIFFs are huge).
var PREVIEW_MAX_PX = 2000;

// 0-picks behavior.
var EMPTY_LEVEL_LABELS = ["0 picks = single level at cloud minZ", "0 picks = skip building"];
var EMPTY_SINGLE = 0, EMPTY_SKIP = 1;

// ============================================================================
// ORTHO HELPERS
// ============================================================================

function getTimestamp() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var s = now.getSeconds();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

function sanitizeFilename(name) {
    return ("" + name).replace(/[\/\\:*?"<>|]/g, "_");
}

// Cyclone packs the background color as BGR (NOT RGB): blue*2^16 + green*2^8 + red.
function packBackgroundColorBGR(r, g, b) {
    return (b * 65536) + (g * 256) + r;
}

// Union bounding box over an array of clouds. Returns {minX,...,maxZ} or null on error.
function unionBBox(clouds) {
    var box = null;
    for (var i = 0; i < clouds.length; i++) {
        var bb = clouds[i].GetBoundingBox();
        if (!bb || bb.ErrorCode !== 0) {
            print("  ERROR: Could not get bounding box for cloud " + (i + 1) + " (" + clouds[i].GetName() + ")");
            return null;
        }
        var lo = bb.LowPoint, up = bb.UpPoint;
        if (box === null) {
            box = {
                minX: lo.GetX(), minY: lo.GetY(), minZ: lo.GetZ(),
                maxX: up.GetX(), maxY: up.GetY(), maxZ: up.GetZ()
            };
        } else {
            box.minX = Math.min(box.minX, lo.GetX());
            box.minY = Math.min(box.minY, lo.GetY());
            box.minZ = Math.min(box.minZ, lo.GetZ());
            box.maxX = Math.max(box.maxX, up.GetX());
            box.maxY = Math.max(box.maxY, up.GetY());
            box.maxZ = Math.max(box.maxZ, up.GetZ());
        }
    }
    return box;
}

// Read back Cyclone's actual world file. Reads only the FIRST 6 numeric lines.
function readWorldFile(path) {
    var f = SFile.New(path);
    if (!f.Exists()) return null;
    if (!f.Open(SFile.ReadOnly)) return null;
    var nums = [];
    while (!f.AtEnd() && nums.length < 6) {
        var line = f.ReadLine();
        if (line === undefined || line === null) break;
        var trimmed = ("" + line).replace(/^\s+|\s+$/g, "");
        if (trimmed.length === 0) continue;
        var v = parseFloat(trimmed);
        if (isNaN(v)) continue;
        nums.push(v);
    }
    f.Close();
    if (nums.length < 6) return null;
    return {
        pixelSizeX: nums[0], rotationY: nums[1], rotationX: nums[2],
        pixelSizeY: nums[3], originX: nums[4], originY: nums[5]
    };
}

// Crop a cloud to a horizontal Z-slab [zLo, zHi]. Returns a NEW temporary InCloud or null.
function sliceCloudZ(cloud, box, zLo, zHi) {
    var buf = 1.0;
    var contour = SMultiline.New();
    contour.InsertLast(SPoint.New(box.minX - buf, box.minY - buf, 0));
    contour.InsertLast(SPoint.New(box.maxX + buf, box.minY - buf, 0));
    contour.InsertLast(SPoint.New(box.maxX + buf, box.maxY + buf, 0));
    contour.InsertLast(SPoint.New(box.minX - buf, box.maxY + buf, 0));
    contour.Close();

    var sep = cloud.Separate(
        contour, SVector.New(0, 0, 1),
        SPoint.New(0, 0, zLo), SPoint.New(0, 0, zHi),
        SCloud.FILL_IN_ONLY
    );
    if (sep && (sep.ErrorCode === 0 || sep.ErrorCode === 2) && sep.InCloud != null) {
        if (sep.InCloud.GetNumber() > 0) return sep.InCloud;
    }
    return null;
}

function writeTextFile(path, text) {
    var f = SFile.New(path);
    if (!f.Open(SFile.WriteOnly)) {
        print("  ERROR: Could not open for writing: " + path);
        return false;
    }
    f.Write(text);
    f.Close();
    return true;
}

// Apply a render style to a cloud. Ghost/X-ray = 'flat' rep + dark color + transparency
// (on a white background) for the CAD "x-ray" plan look.
function applyCloudStyle(cloud, style, ghostRGB, ghostAlpha) {
    var repName = STYLE_REP_NAME[style];
    var status = cloud.SetCloudRepresentation(repName);
    if (status !== 0) {
        print("  WARNING: '" + cloud.GetName() + "' could not switch to '" + repName +
              "' (status " + status + "); continuing.");
    }
    if (style === STYLE_GHOST) {
        cloud.SetColors(ghostRGB[0] / 255, ghostRGB[1] / 255, ghostRGB[2] / 255);
        cloud.SetTransparency(ghostAlpha);
    }
}

// Reset a cloud to a clean, opaque, neutral default (natural rep for its data).
function resetCloudToDefault(cloud) {
    if (!cloud) return;
    try { cloud.SetTransparency(0); } catch (e) {}
    try { cloud.SetColors(1.0, 1.0, 1.0); } catch (e) {}
    var repName;
    if (cloud.HasColor()) {
        repName = "real_color";
    } else if (cloud.HasAttribute("intensity")) {
        repName = "intensity";
    } else {
        repName = "flat";
    }
    try { cloud.SetCloudRepresentation(repName); } catch (e) {}
}

// Replace the image extension with the world-file extension.
function deriveWorldFilePath(imagePath, worldExt) {
    var dot = imagePath.lastIndexOf(".");
    var slash = Math.max(imagePath.lastIndexOf("/"), imagePath.lastIndexOf("\\"));
    if (dot > slash) return imagePath.substring(0, dot + 1) + worldExt;
    return imagePath + "." + worldExt;
}

// Interactive floor-level picker (clouds must be VISIBLE). Pushes amber markers
// into vizPoints. Returns [{z, viz}] sorted ascending, or null if ESC before any pick.
function pickLevels(vizPoints, buildingName) {
    var levels = [];
    SDialog.Message(
        "FLOOR PICKING - " + buildingName + "\n\n" +
        "Click ONE point on this building at each floor level.\n" +
        "The clicked Z becomes that floor's datum.\n\n" +
        "Pick floor 1, then floor 2, ...\n" +
        "Press ESC when done (ESC before any pick = use a single level).",
        SDialog.Instruction, "Floor picking: " + buildingName
    );

    while (true) {
        var res = SPoint.FromClick();
        if (res.ErrorCode === 2) break;
        if (res.ErrorCode !== 0) {
            SDialog.Message(
                "No point picked.\nClick directly on the point cloud surface,\n" +
                "or press ESC to finish.", SDialog.Warning, "Retry");
            continue;
        }
        var p = res.Point, z = p.GetZ(), n = levels.length + 1;
        var viz = SPoint.New(p.GetX(), p.GetY(), z);
        viz.SetName(buildingName + " floor " + n + " (Z=" + z.toFixed(2) + ")");
        viz.SetPointSize(8);
        viz.SetColors(1.0, 0.85, 0.0);
        viz.ShowName(true);
        viz.AddToDoc();
        vizPoints.push(viz);
        levels.push({ z: z, viz: viz });
        print("  Picked floor " + n + ": Z = " + z.toFixed(3) +
              "  (X=" + p.GetX().toFixed(3) + " Y=" + p.GetY().toFixed(3) + ")");
    }

    if (levels.length === 0) return null;
    levels.sort(function (a, b) { return a.z - b.z; });
    return levels;
}

// Levels from PRE-SELECTED scene points (one SPoint per floor), by Z. Does NOT
// create temp markers and does NOT touch vizPoints, so the user's real selected
// points survive cleanup. Returns [{z, name, viz:null}] sorted ascending, or null.
function levelsFromSelectedPoints() {
    var pts = SPoint.FromSel();
    if (!pts || pts.length === 0) return null;   // caller shows error + stops
    var levels = [];
    for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        levels.push({ z: p.GetZ(), name: p.GetName(), viz: null });
    }
    levels.sort(function (a, b) { return a.z - b.z; });
    var zs = [];
    for (var j = 0; j < levels.length; j++) zs.push(levels[j].z.toFixed(3));
    print("Levels from " + levels.length + " selected point(s): Z = " + zs.join(", "));
    return levels;
}

// Export ONE georeferenced orthophoto. Returns {ok, code, worldFileActual, worldPath}.
function exportOnePlan(opts) {
    print("\n[" + getTimestamp() + "] Exporting" +
        (opts.levelInfo ? " " + opts.levelInfo.buildingName + " L" + (opts.levelInfo.index + 1) +
            "/" + opts.levelInfo.total : "") + " plan...");
    print("  -> " + opts.outPath);

    var ret = SImage.ExportOrthoImage(
        opts.outPath,
        SVector.New(0, 0, -1),
        SVector.New(1, 0, 0),
        opts.upperLeft,
        opts.bgPacked,
        opts.width, opts.height,
        opts.gsd,
        opts.effPLS,
        opts.quality
    );

    if (!ret || ret.ErrorCode !== 0) {
        var code = ret ? ret.ErrorCode : -999;
        print("  Export failed (code " + code + ").");
        return { ok: false, code: code, worldFileActual: null, worldPath: null };
    }
    print("  Export OK.");

    var worldPath = deriveWorldFilePath(opts.outPath, opts.worldExt);
    print("  Image file : " + (SFile.New(opts.outPath).Exists() ? "OK  " : "MISSING  ") + opts.outPath);
    print("  World file : " + (SFile.New(worldPath).Exists() ? "OK  " : "MISSING  ") + worldPath);

    var realWorld = readWorldFile(worldPath);
    var worldFileActual = realWorld ? {
        source: "tfw",
        line1_pixelSizeX: realWorld.pixelSizeX, line2_rotationY: realWorld.rotationY,
        line3_rotationX: realWorld.rotationX, line4_pixelSizeY: realWorld.pixelSizeY,
        line5_originX_topLeftCorner: realWorld.originX,
        line6_originY_topLeftCorner: realWorld.originY
    } : {
        source: "computed",
        line1_pixelSizeX: opts.gsd, line2_rotationY: 0, line3_rotationX: 0,
        line4_pixelSizeY: -opts.gsd,
        line5_originX_topLeftCorner: opts.box.minX, line6_originY_topLeftCorner: opts.box.maxY
    };
    if (!realWorld) print("  WARNING: could not read back " + worldPath + "; worldFileActual is COMPUTED.");

    if (opts.writeSidecar) {
        var box = opts.box;
        var li = opts.levelInfo;
        var sidecar = {
            generator: "export_ortho_with_panos.js (Cyclone 3DR 2026.1)",
            createdUtc: new Date().toISOString(),
            image: {
                path: opts.outPath, format: "TIFF",
                worldFile: worldPath, style: STYLE_LABELS[opts.style],
                widthPx: opts.pixW, heightPx: opts.pixH,
                megapixels: Number(opts.totalMP.toFixed(3)),
                backgroundColorRGB: opts.bgRGB, backgroundColorPackedBGR: opts.bgPacked,
                pointLineSize: opts.effPLS, quality: opts.quality
            },
            georeference: {
                gsdMeters: opts.gsd, pixelSizeX: opts.gsd, pixelSizeY: -opts.gsd,
                viewDirection: [0, 0, -1], horizontalNormal: [1, 0, 0], northUp: true,
                upperLeftCornerWorld: { x: box.minX, y: box.maxY, z: box.maxZ },
                worldFileActual: worldFileActual,
                worldBBox: { minX: box.minX, minY: box.minY, minZ: box.minZ,
                             maxX: box.maxX, maxY: box.maxY, maxZ: box.maxZ },
                widthMeters: opts.width, heightMeters: opts.height
            },
            level: li ? {
                building: li.buildingName, index: li.index + 1, levelOf: li.total,
                datumZ: li.datumZ, bandAbsoluteZLo: li.zLo, bandAbsoluteZHi: li.zHi
            } : null,
            projection: {
                epsg: null, note: "Local UTM-like coordinates. EPSG unknown - fill in manually.",
                falseOriginHint: { x: box.minX, y: box.minY }
            },
            viewerOverlay: {
                note: "CORNER convention; no half-pixel offset. col east (+X); row downward = south (-Y).",
                pixelCol: "(worldX - minX) / gsd",
                pixelRow: "(maxY - worldY) / gsd",
                inverse_worldX: "minX + (col + 0.5) * gsd",
                inverse_worldY: "maxY - (row + 0.5) * gsd"
            }
        };
        if (writeTextFile(opts.outPath + ".json", JSON.stringify(sidecar, null, 2)))
            print("  Sidecar    : OK  " + opts.outPath + ".json");
    }
    return { ok: true, code: 0, worldFileActual: worldFileActual, worldPath: worldPath };
}

// ============================================================================
// PANO-PIPELINE HELPERS
// ============================================================================

// True if 'path' is an existing, accessible DIRECTORY. ListEntries is the reliable
// directory probe (SFile.Exists() is documented for files). ErrorCode 0 => accessible dir.
function dirExists(path) {
    if (!path || path.length === 0) return false;
    var r = SFile.ListEntries(path, SFile.Files, false);
    return !!(r && r.ErrorCode === 0);
}

// Immediate sub-directory ABSOLUTE paths of 'path' (empty array on error/none).
function listSubdirs(path) {
    var r = SFile.ListEntries(path, SFile.Directories, false);
    if (!r || r.ErrorCode !== 0 || !r.Entries) return [];
    return r.Entries;
}

// Recursively delete a directory tree (Windows rmdir /s /q) with heavy safety
// guards. Returns true iff the dir is gone after. Only ever call on folders we own
// (Building_*/Level_*), NEVER on outputRoot.
function removeDirRecursive(path) {
    var p = ("" + path).replace(/\//g, "\\").replace(/\\+$/, "");
    if (!p || p.length <= 3) {
        print("  SAFETY: refusing to delete (path too short): '" + p + "'"); return false;
    }
    if (/^[A-Za-z]:\\?$/.test(p)) {
        print("  SAFETY: refusing to delete a drive root: '" + p + "'"); return false;
    }
    if (p.indexOf("\\") <= 2) {
        print("  SAFETY: refusing to delete (no sub-path beyond drive): '" + p + "'"); return false;
    }
    if (/^\\\\[^\\]+\\?$/.test(p) || /^\\\\[^\\]+\\[^\\]+\\?$/.test(p)) {
        print("  SAFETY: refusing to delete a UNC server/share root: '" + p + "'"); return false;
    }
    if (!dirExists(p)) { print("  (nothing to delete; not present): " + p); return true; }
    print("  Deleting existing folder (recursive): " + p);
    var code = Execute("cmd", ["/c", "rmdir", "/s", "/q", "\"" + p + "\""]);
    if (!dirExists(p)) return true;
    print("  WARNING: rmdir did not remove '" + p + "' (exit " + code +
          "). Folder may be locked/open. Stale files may remain.");
    return false;
}

// Remove every immediate "Level_*" sub-directory of 'dir' (DIRECT case: must NOT
// delete the whole output root). Each Level_* is ours to recreate.
function wipeLevelDirs(dir) {
    var subs = listSubdirs(dir);
    for (var i = 0; i < subs.length; i++) {
        var leaf = SFile.GetFileName(subs[i]);
        if (/^Level_\d+$/.test(leaf)) removeDirRecursive(subs[i]);
    }
}

// Create a full directory chain. MkDir creates ONE level (parent must exist,
// returns true if it already exists), so walk the path segment by segment.
function makeDirs(path) {
    if (!path || path.length === 0) return false;
    var norm = ("" + path).replace(/\//g, "\\").replace(/\\+$/, "");
    var parts = norm.split("\\");
    var acc, start;
    if (norm.substring(0, 2) === "\\\\") {       // UNC: \\server\share\...
        acc = "\\\\" + parts[2] + "\\" + parts[3];
        start = 4;
    } else {
        acc = parts[0];                           // drive root e.g. "C:"
        start = 1;
    }
    for (var i = start; i < parts.length; i++) {
        if (parts[i].length === 0) continue;
        acc = acc + "\\" + parts[i];
        if (!MkDir(acc)) {
            print("  ERROR: MkDir failed at '" + acc + "'");
            return false;
        }
    }
    return true;
}

// Extract the scan-folder name from an SImage's full Cyclone tree path.
// Expected shape: "/PANOS/<scanName>/images/00000-pano.jpg" (see the importer).
// The scan name is the segment two above the image name. Returns "" if unexpected
// (collision-safety then becomes a no-op).
function scanNameFromPath(p) {
    if (!p) return "";
    var s = ("" + p).replace(/^[\/\\]+/, "").replace(/[\/\\]+$/, "");
    var parts = s.split(/[\/\\]+/);
    if (parts.length < 3) return "";
    return parts[parts.length - 3] || "";
}

// Strip filesystem-illegal chars from a scan name so it survives Windows paths and URLs.
function sanitisePathSegment(s) {
    var t = ("" + s).replace(/[\/\\:*?"<>|]+/g, "_").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    return t || "default";
}

// Collect every spherical posed SImage with world XYZ + quaternion.
// Returns [{ name, scan, x, y, z, qw, qx, qy, qz, image }].
function gatherScenePanos() {
    var out = [];
    var skippedType = 0, skippedPose = 0;
    var imgs = SImage.All(SComp.ANY_VISIBILITY);
    for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var t = img.GetImageType();
        if (!t || t.ImageType !== SImage.SPHERICAL) { skippedType++; continue; }
        var ext = img.GetCameraExternalParameters();
        if (!ext || ext.ErrorCode !== 0 || !ext.CameraExternal) { skippedPose++; continue; }
        var cam = ext.CameraExternal;
        var posR = cam.GetPosition();
        if (!posR || !posR.Point) { skippedPose++; continue; }
        var p = posR.Point;
        var q = cam.GetOrientationQuaternion();
        out.push({
            name: img.GetName(),
            scan: scanNameFromPath(img.GetPath()),   // per-scan namespace (see importer)
            x: p.GetX(), y: p.GetY(), z: p.GetZ(),
            qw: q ? q.QuatW : null, qx: q ? q.QuatX : null,
            qy: q ? q.QuatY : null, qz: q ? q.QuatZ : null,
            image: img
        });
    }
    print("Spherical posed panos: " + out.length +
          "  (skipped " + skippedType + " non-spherical, " + skippedPose + " unposed)");
    return out;
}

// Assign a pano to a building by STRICT XY-in-bbox (expanded by BUILDING_MARGIN_M).
//   - inside one or more buildings -> nearest-CENTER tiebreak (handles overlap strips).
//   - inside none -> -1 (unassigned, flagged). No distance fallback: that would grab a
//     neighbor building's panos when exporting one building at a time.
function assignPanoToBuilding(pano, buildings) {
    var best = -1, bestD2 = Infinity;
    for (var b = 0; b < buildings.length; b++) {
        var bx = buildings[b].box;
        if (pano.x >= bx.minX - BUILDING_MARGIN_M && pano.x <= bx.maxX + BUILDING_MARGIN_M &&
            pano.y >= bx.minY - BUILDING_MARGIN_M && pano.y <= bx.maxY + BUILDING_MARGIN_M) {
            var dx = pano.x - buildings[b].centerX, dy = pano.y - buildings[b].centerY;
            var d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = b; }
        }
    }
    return best; // -1 if inside no building's (margin-expanded) bbox
}

// Assign a pano Z to a level: highest floor whose Z <= panoZ. Below lowest -> L1 flagged.
function assignPanoToLevel(panoZ, floorZs) {
    var idx = -1;
    for (var i = 0; i < floorZs.length; i++) {
        if (floorZs[i] <= panoZ) idx = i; else break;
    }
    if (idx === -1) return { index: 0, belowLowest: true };
    return { index: idx, belowLowest: false };
}

// World (X,Y) -> pixel (col,row) on a plan. CORNER convention (matches the sidecar):
// no half-pixel offset. Getting this wrong misplaces every pano dot.
function worldToPixel(worldX, worldY, box, gsd) {
    return {
        pixelCol: (worldX - box.minX) / gsd,
        pixelRow: (box.maxY - worldY) / gsd
    };
}

// Export a small DOWNSCALED PNG of the current (already-in-doc, already-styled) slab
// for the offline web QC viewer. Call BETWEEN exportOnePlan() and slab removal.
// Returns { ok, previewW, previewH }.
function exportPreviewPng(opts2) {
    var previewGsd = Math.max(opts2.width, opts2.height) / PREVIEW_MAX_PX;
    if (previewGsd < opts2.gsd) previewGsd = opts2.gsd;
    var previewW = Math.ceil(opts2.width / previewGsd);
    var previewH = Math.ceil(opts2.height / previewGsd);
    // Point/line size is in OUTPUT pixels, so scale it to the coarser grid (min 1).
    var previewPLS = Math.max(1, Math.round(opts2.effPLS * (opts2.gsd / previewGsd)));

    print("  [" + getTimestamp() + "] Preview PNG -> " + previewW + " x " + previewH +
          " px @ " + previewGsd.toFixed(4) + " m/px");

    var ret = SImage.ExportOrthoImage(
        opts2.previewPath,
        SVector.New(0, 0, -1), SVector.New(1, 0, 0),
        opts2.upperLeft, opts2.bgPacked,
        opts2.width, opts2.height,
        previewGsd, previewPLS, 85
    );
    var ok = !!(ret && ret.ErrorCode === 0);
    if (ok) print("  Preview OK : " + opts2.previewPath);
    else    print("  Preview FAILED (code " + (ret ? ret.ErrorCode : "?") + "): " + opts2.previewPath);
    return { ok: ok, previewW: previewW, previewH: previewH };
}

// ============================================================================
// WEB QC VIEWER
// ============================================================================
// Write a single self-contained viewer.html (no server, no CDN). Opens via file://.
// viewerData = { generatedUtc, source, buildings:[ {name, levels:[
//   {index, floorZ, preview, previewW, previewH, panoCount, panos:[{name,fx,fy}]} ]} ] }
function writeViewerHtml(outputRoot, viewerData) {
    var dataJson = JSON.stringify(viewerData).replace(/<\//g, "<\\/"); // </script> safety
    var html =
'<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>Pano QC Viewer</title>\n' +
'<style>\n' +
'  * { box-sizing: border-box; }\n' +
'  html, body { margin:0; height:100%; font-family: Segoe UI, Arial, sans-serif; color:#1d1f23; }\n' +
'  #app { display:flex; height:100vh; }\n' +
'  #sidebar { width:280px; min-width:220px; background:#1d2129; color:#e6e8ec; overflow-y:auto; padding:10px 0; }\n' +
'  #sidebar h1 { font-size:14px; margin:6px 14px 12px; color:#8fb6ff; font-weight:600; }\n' +
'  .bld > .bld-hd { padding:7px 14px; cursor:pointer; font-weight:600; background:#262c37; display:flex; justify-content:space-between; }\n' +
'  .bld > .bld-hd:hover { background:#2f3744; }\n' +
'  .bld .lvls { display:none; }\n' +
'  .bld.open .lvls { display:block; }\n' +
'  .bld .caret { transition: transform .12s; }\n' +
'  .bld.open .caret { transform: rotate(90deg); }\n' +
'  .lvl { padding:6px 14px 6px 28px; cursor:pointer; font-size:13px; color:#c7ccd4; border-left:3px solid transparent; }\n' +
'  .lvl:hover { background:#2a313c; }\n' +
'  .lvl.active { background:#33405a; color:#fff; border-left-color:#5b8cff; }\n' +
'  .lvl .meta { color:#8b93a1; font-size:11px; }\n' +
'  #main { flex:1; display:flex; flex-direction:column; min-width:0; background:#f3f4f6; }\n' +
'  #header { padding:10px 16px; background:#fff; border-bottom:1px solid #dfe2e6; font-size:14px; display:flex; gap:18px; align-items:center; flex-wrap:wrap; }\n' +
'  #header b { color:#0b57d0; }\n' +
'  #note { font-size:12px; color:#666; }\n' +
'  #stage { flex:1; overflow:auto; padding:18px; display:flex; align-items:flex-start; justify-content:center; }\n' +
'  #imgwrap { position:relative; display:inline-block; line-height:0; box-shadow:0 2px 10px rgba(0,0,0,.18); background:#fff; }\n' +
'  #plan { display:block; max-width:100%; height:auto; }\n' +
'  .dot { position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px; border-radius:50%;\n' +
'         background:rgba(255,45,45,.78); border:1px solid #fff; cursor:pointer; }\n' +
'  .dot:hover { background:rgba(255,200,0,.95); transform:scale(1.5); z-index:5; }\n' +
'  #tip { position:fixed; pointer-events:none; background:#111; color:#fff; padding:3px 7px;\n' +
'         font-size:12px; border-radius:4px; white-space:nowrap; display:none; z-index:50; }\n' +
'  #empty { color:#888; font-size:15px; margin:auto; }\n' +
'  #imgerr { color:#b00020; font-size:14px; padding:20px; display:none; white-space:pre-wrap; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="app">\n' +
'  <div id="sidebar"><h1>PANO QC VIEWER</h1><div id="tree"></div></div>\n' +
'  <div id="main">\n' +
'    <div id="header">\n' +
'      <span>Building: <b id="hBld">-</b></span>\n' +
'      <span>Level: <b id="hLvl">-</b></span>\n' +
'      <span>Panos: <b id="hCnt">-</b></span>\n' +
'      <span id="note">QC preview - dots are pano positions; hover for name.</span>\n' +
'    </div>\n' +
'    <div id="stage">\n' +
'      <div id="empty">Select a level from the left to load its plan.</div>\n' +
'      <div id="imgwrap" style="display:none"><img id="plan" alt="level plan"></div>\n' +
'      <div id="imgerr"></div>\n' +
'    </div>\n' +
'  </div>\n' +
'</div>\n' +
'<div id="tip"></div>\n' +
'<script>\n' +
'var DATA = ' + dataJson + ';\n' +
'var tree=document.getElementById("tree"), tip=document.getElementById("tip");\n' +
'var imgwrap=document.getElementById("imgwrap"), plan=document.getElementById("plan");\n' +
'var emptyMsg=document.getElementById("empty"), imgerr=document.getElementById("imgerr");\n' +
'function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}\n' +
'function buildTree(){\n' +
'  if(!DATA.buildings||!DATA.buildings.length){tree.appendChild(el("div","lvl","No buildings exported."));return;}\n' +
'  DATA.buildings.forEach(function(b,bi){\n' +
'    var box=el("div","bld"), hd=el("div","bld-hd");\n' +
'    hd.appendChild(el("span",null,b.name)); hd.appendChild(el("span","caret","\\u25B6"));\n' +
'    box.appendChild(hd);\n' +
'    var lvls=el("div","lvls");\n' +
'    (b.levels||[]).forEach(function(l,li){\n' +
'      var item=el("div","lvl");\n' +
'      item.appendChild(el("div",null,"Level "+l.index));\n' +
'      item.appendChild(el("div","meta","Z="+(l.floorZ!=null?Number(l.floorZ).toFixed(2):"?")+"  -  "+(l.panoCount||0)+" panos"));\n' +
'      item.onclick=function(ev){ev.stopPropagation();selectLevel(bi,li,item);};\n' +
'      lvls.appendChild(item);\n' +
'    });\n' +
'    box.appendChild(lvls);\n' +
'    hd.onclick=function(){box.classList.toggle("open");};\n' +
'    tree.appendChild(box);\n' +
'    if(bi===0) box.classList.add("open");\n' +
'  });\n' +
'}\n' +
'function selectLevel(bi,li,node){\n' +
'  var b=DATA.buildings[bi], l=b.levels[li];\n' +
'  var act=tree.querySelector(".lvl.active"); if(act)act.classList.remove("active");\n' +
'  if(node)node.classList.add("active");\n' +
'  document.getElementById("hBld").textContent=b.name;\n' +
'  document.getElementById("hLvl").textContent=l.index;\n' +
'  document.getElementById("hCnt").textContent=(l.panoCount||0);\n' +
'  emptyMsg.style.display="none"; imgerr.style.display="none"; imgwrap.style.display="none"; clearDots();\n' +
'  if(!l.preview){imgerr.textContent="No preview image for this level.";imgerr.style.display="block";return;}\n' +
'  plan.onload=function(){imgwrap.style.display="inline-block";drawDots(l);};\n' +
'  plan.onerror=function(){imgwrap.style.display="none";imgerr.textContent="Preview image not found:\\n"+l.preview;imgerr.style.display="block";};\n' +
'  plan.src=l.preview;\n' +
'}\n' +
'function clearDots(){var d=imgwrap.querySelectorAll(".dot");for(var i=0;i<d.length;i++)d[i].parentNode.removeChild(d[i]);}\n' +
'function drawDots(l){\n' +
'  clearDots();\n' +
'  (l.panos||[]).forEach(function(p){\n' +
'    var dot=el("div","dot");\n' +
'    dot.style.left=(p.fx*100)+"%"; dot.style.top=(p.fy*100)+"%";\n' +
'    dot.addEventListener("mousemove",function(ev){tip.textContent=(p.scan?p.scan+" / ":"")+p.name;tip.style.display="block";tip.style.left=(ev.clientX+12)+"px";tip.style.top=(ev.clientY+12)+"px";});\n' +
'    dot.addEventListener("mouseleave",function(){tip.style.display="none";});\n' +
'    imgwrap.appendChild(dot);\n' +
'  });\n' +
'}\n' +
'buildTree();\n' +
'</script>\n' +
'</body>\n' +
'</html>\n';

    var ok = writeTextFile(outputRoot + "\\viewer.html", html);
    if (ok) print("  Viewer HTML written: " + outputRoot + "\\viewer.html");
    return ok;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
    print("\n========================================================");
    print("   PANO-VIEWER DATASET EXPORT");
    print("   Cyclone 3DR 2026.1");
    print("========================================================\n");

    var selCount = SCloud.FromSel().length;

    // ---- DIALOG ----
    var dlg = SDialog.New("Pano-Viewer Dataset Export");
    dlg.AddText(
        "Per building (= cloud) + per level: floor-plan ortho + that level's panos + JSON.\n" +
        "Selected clouds: " + selCount,
        SDialog.Instruction
    );
    dlg.AddChoices({
        id: "source", name: "Buildings (source clouds)",
        choices: ["Selected clouds", "All visible clouds"],
        value: (selCount > 0 ? 0 : 1), style: SDialog.ComboBox, saveValue: true,
        tooltip: "Each cloud is treated as one building."
    });
    dlg.AddChoices({
        id: "style", name: "Plan render style",
        choices: STYLE_LABELS, value: STYLE_GHOST, style: SDialog.ComboBox, saveValue: true,
        tooltip: "Ghost gives the cleanest CAD-style floor plan."
    });
    dlg.AddText("--- Ghost / X-ray options (Ghost style only) ---", SDialog.Instruction);
    dlg.AddInt({ id: "ghostR", name: "Ghost color R", value: 32, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "ghostG", name: "Ghost color G", value: 32, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "ghostB", name: "Ghost color B", value: 32, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "ghostTransparency", name: "Ghost transparency (0-255)", value: 120, min: 0, max: 255, saveValue: true,
        tooltip: "LOWER = stronger/contrastier lines." });

    dlg.AddText("--- Plan resolution / background ---", SDialog.Instruction);
    dlg.AddChoices({ id: "gsdPreset", name: "Pixel size (GSD)", choices: GSD_LABELS,
        value: GSD_DEFAULT_INDEX, style: SDialog.ComboBox, saveValue: true });
    dlg.AddLength({ id: "gsdCustom", name: "Custom pixel size", value: 0.005, min: 0.0001, max: 5.0, saveValue: true });
    dlg.AddChoices({ id: "bgPreset", name: "Background color", choices: BG_LABELS,
        value: 0, style: SDialog.ComboBox, saveValue: true });
    dlg.AddInt({ id: "bgR", name: "Custom bg R", value: 255, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "bgG", name: "Custom bg G", value: 255, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "bgB", name: "Custom bg B", value: 255, min: 0, max: 255, saveValue: true });
    dlg.AddInt({ id: "pointLineSize", name: "Point/line render size (px)", value: 1, min: 1, max: 10, saveValue: true,
        tooltip: "Ghost auto-raises this to >=2." });

    dlg.AddText("--- Levels ---", SDialog.Instruction);
    dlg.AddLength({ id: "bandAboveLo", name: "Band from (m above floor)", value: 1.0, min: 0.0, max: 1000.0, saveValue: true });
    dlg.AddLength({ id: "bandAboveHi", name: "Band to (m above floor)", value: 1.5, min: 0.0, max: 1000.0, saveValue: true });
    dlg.AddChoices({ id: "emptyLevelMode", name: "If no floors picked", choices: EMPTY_LEVEL_LABELS,
        value: EMPTY_SINGLE, style: SDialog.ComboBox, saveValue: true });
    dlg.AddChoices({ id: "levelsFrom", name: "Levels from",
        choices: ["Click floors (interactive)", "Selected points (by Z)"],
        value: 0, style: SDialog.ComboBox, saveValue: true,
        tooltip: "Interactive: click one point per floor on the building. " +
                 "Selected points: pre-select one SPoint per floor (plus the building cloud); their Z values " +
                 "become the levels (lowest Z = Level 1). Run building-by-building when using selected points." });

    dlg.AddText("--- Panos / output ---", SDialog.Instruction);
    dlg.AddBoolean({ id: "exportImages", name: "Export pano images", value: true, saveValue: true,
        tooltip: "On = save each pano's pixels from the scene via SImage.Save. Off = JSON only (fast dry run)." });
    dlg.AddBoolean({ id: "makeViewer", name: "Make web QC viewer (preview PNG + viewer.html)", value: true, saveValue: true,
        tooltip: "Exports a small downscaled PNG per level and a self-contained viewer.html at the output root." });
    dlg.AddBoolean({ id: "openViewer", name: "Open viewer in browser when done", value: true, saveValue: true,
        tooltip: "Ignored if 'Make web QC viewer' is off." });
    // Keep this tooltip SHORT: an extra AddText note here shifts Cyclone's
    // saved-value cache by one widget slot, blanking the following AddInt/AddLength.
    dlg.AddFileSelector({ id: "outputRoot", name: "Output root folder", mode: SDialog.EMode.OpenDirectory,
        saveValue: true, tooltip: "Pick the PARENT folder (e.g. 'MyProject'). Picking Building_<name> works but writes the manifest inside that folder." });

    dlg.AddText("--- Scene cleanup ---", SDialog.Instruction);
    dlg.AddBoolean({ id: "isolate", name: "Hide other objects during export", value: true, saveValue: true });
    dlg.AddChoices({ id: "afterExport", name: "After export",
        choices: ["Reset clouds to default look", "Leave clouds as-is"],
        value: 0, style: SDialog.ComboBox, saveValue: true });
    dlg.AddBoolean({ id: "writeSidecar", name: "Write plan .tif.json sidecar", value: true, saveValue: true });

    var res = dlg.Run();
    if (!res) { print("Cancelled by user."); return; }

    // ---- resolve values ----
    var gsd = (res.gsdPreset >= GSD_PRESETS.length) ? res.gsdCustom : GSD_PRESETS[res.gsdPreset];
    if (!(gsd > 0)) { SDialog.Message("Invalid pixel size.", SDialog.Error, "Error"); return; }

    var style = res.style;
    var ghostRGB = [res.ghostR, res.ghostG, res.ghostB];
    var ghostAlpha = res.ghostTransparency;
    var effectivePointLineSize = (style === STYLE_GHOST) ? Math.max(res.pointLineSize, 2) : res.pointLineSize;

    var bandAboveLo = res.bandAboveLo, bandAboveHi = res.bandAboveHi;
    if (!(bandAboveHi > bandAboveLo)) {
        SDialog.Message("Band: 'Band to' must be greater than 'Band from'.", SDialog.Error, "Error"); return;
    }

    var bgRGB;
    if (style === STYLE_GHOST && res.bgPreset !== 3) bgRGB = [255, 255, 255];
    else if (BG_PRESETS[res.bgPreset] !== null) bgRGB = BG_PRESETS[res.bgPreset];
    else bgRGB = [res.bgR, res.bgG, res.bgB];
    var bgPacked = packBackgroundColorBGR(bgRGB[0], bgRGB[1], bgRGB[2]);

    var exportImages = res.exportImages;
    var makeViewer = res.makeViewer;
    var openViewer = res.openViewer && makeViewer;   // open only if a viewer was built
    var outputRoot = res.outputRoot;
    if (!outputRoot || outputRoot.length === 0) {
        SDialog.Message("No output root folder selected.", SDialog.Error, "Error"); return;
    }
    // Normalize to backslashes + strip trailing separator (dialog may return / on Windows).
    outputRoot = ("" + outputRoot).replace(/\//g, "\\").replace(/\\+$/, "");

    // ---- acquire clouds ----
    var clouds = (res.source === 0) ? SCloud.FromSel() : SCloud.All(SComp.ANY_VISIBILITY);
    if (!clouds || clouds.length === 0) {
        SDialog.Message("No point cloud found.\nSelect one or more clouds (or choose 'All visible clouds').",
                        SDialog.Error, "Error");
        return;
    }
    print("Buildings (clouds): " + clouds.length);

    // ---- gather panos from the scene (BEFORE any hide/isolate) ----
    var allPanos = gatherScenePanos();

    if (!makeDirs(outputRoot)) {
        SDialog.Message("Could not create output root:\n" + outputRoot, SDialog.Error, "Error"); return;
    }

    // ---- build buildings model ----
    var buildings = [];
    var globalMinX = Infinity, globalMinY = Infinity;
    for (var ci = 0; ci < clouds.length; ci++) {
        var cloud = clouds[ci];
        var box = unionBBox([cloud]);
        if (box === null) { print("  Skipping '" + cloud.GetName() + "' (no bbox)."); continue; }
        var width = box.maxX - box.minX, height = box.maxY - box.minY;
        if (!(width > 0) || !(height > 0)) {
            print("  Skipping '" + cloud.GetName() + "' (degenerate footprint)."); continue;
        }
        var gsdB = gsd;
        var pixW = Math.ceil(width / gsdB), pixH = Math.ceil(height / gsdB);
        var totalMP = (pixW * pixH) / 1e6;
        // per-building size guard (auto-coarsen if huge)
        if (pixW > MAX_PIXELS_PER_SIDE || pixH > MAX_PIXELS_PER_SIDE || totalMP > MAX_TOTAL_MP) {
            var gsdForSide = Math.max(width, height) / MAX_PIXELS_PER_SIDE;
            var gsdForMP = Math.sqrt((width * height) / (MAX_TOTAL_MP * 1e6));
            gsdB = Math.ceil(Math.max(gsdB, gsdForSide, gsdForMP) * 1000) / 1000;
            pixW = Math.ceil(width / gsdB); pixH = Math.ceil(height / gsdB);
            totalMP = (pixW * pixH) / 1e6;
            print("  '" + cloud.GetName() + "': image too large; pixel size auto-increased to " +
                  gsdB + " m/px -> " + pixW + " x " + pixH + " px.");
        }
        var rawName = cloud.GetName();
        var safeName = sanitizeFilename(rawName);
        // DOUBLE-NEST GUARD: if the output root's own leaf folder already equals
        // "Building_<safeName>", the user pointed Output root AT the building folder;
        // write directly in outputRoot instead of nesting another Building_<safeName>.
        var rootLeaf = SFile.GetFileName(outputRoot);
        var isDirect = (rootLeaf === ("Building_" + safeName));
        if (isDirect) {
            print("  WARNING: output root '" + outputRoot + "' IS the building folder.");
            print("           Manifest will be written INSIDE Building_" + safeName + "/.");
            print("           For a cleaner layout, pick the PARENT folder next time.");
        }
        buildings.push({
            rawName: rawName, safeName: safeName, cloud: cloud, box: box,
            centerX: (box.minX + box.maxX) / 2, centerY: (box.minY + box.maxY) / 2,
            // relFolder = the RELATIVE path from the manifest to the building folder.
            // isDirect -> manifest sits inside Building_<name>/ so relFolder is ".".
            // otherwise -> manifest is one level up so relFolder is "Building_<name>".
            dir: (isDirect ? outputRoot : (outputRoot + "\\Building_" + safeName)),
            relFolder: (isDirect ? "." : ("Building_" + safeName)),
            direct: isDirect,
            width: width, height: height, gsd: gsdB,
            pixW: pixW, pixH: pixH, totalMP: totalMP,
            upperLeft: SPoint.New(box.minX, box.maxY, box.maxZ),
            levels: [], panos: [], skipped: false
        });
        globalMinX = Math.min(globalMinX, box.minX);
        globalMinY = Math.min(globalMinY, box.minY);
    }
    if (buildings.length === 0) {
        SDialog.Message("No valid buildings (all clouds degenerate or no bbox).", SDialog.Error, "Error"); return;
    }

    // ---- STALE-OUTPUT WARNING (non-blocking) ----
    // We wipe each building's folder, but we CANNOT see/clean a stale manifest in a
    // PARENT of outputRoot (the double-nest case). Warn so the user can fix it.
    (function () {
        var anyDirect = false, want = {};
        for (var k = 0; k < buildings.length; k++) {
            want["Building_" + buildings[k].safeName] = true;
            if (buildings[k].direct) anyDirect = true;
        }
        var warn = [];
        if (SFile.New(outputRoot + "\\manifest.json").Exists())
            warn.push("an existing manifest.json here (overwritten this run)");
        if (!anyDirect) {
            var subs = listSubdirs(outputRoot), orphan = [];
            for (var i = 0; i < subs.length; i++) {
                var leaf = SFile.GetFileName(subs[i]);
                if (/^Building_/.test(leaf) && !want[leaf]) orphan.push(leaf);
            }
            if (orphan.length > 0)
                warn.push("pre-existing building folder(s) not in this run: " + orphan.join(", "));
        }
        if (warn.length > 0) {
            print("\n  *** STALE-OUTPUT WARNING ***");
            for (var w = 0; w < warn.length; w++) print("    - " + warn[w]);
            print("    The viewer reads ONE manifest.json. A stale manifest in a PARENT of this");
            print("    output root is invisible to this script and may be read by the viewer instead.");
            print("    Tip: point 'Output root' at a clean/empty folder OR at the Building_<name> folder.\n");
        }
    })();

    // ---- assign panos to buildings by XY ----
    var unassignedPanos = [];
    for (var pi = 0; pi < allPanos.length; pi++) {
        var bi = assignPanoToBuilding(allPanos[pi], buildings);
        if (bi >= 0) buildings[bi].panos.push(allPanos[pi]);
        else unassignedPanos.push(allPanos[pi]);
    }
    print("Panos assigned to buildings: " + (allPanos.length - unassignedPanos.length) +
          " ; unassigned: " + unassignedPanos.length);

    // ---- per-building / per-level export (one try/finally for the whole batch) ----
    var vizPoints = [];
    var activeSlabs = [];
    var savedVisibility = null;
    var totals = { levels: 0, panosAssigned: 0, panosUnassigned: unassignedPanos.length,
                   imagesSaved: 0, imagesFailed: 0 };
    // A GLOBAL, monotonic per-pano id. Prefixing the on-disk filename with this uid
    // makes every saved image unique even when the scene tree is flat (scan collapses
    // to "PANOS") or two scans share a name. Without it, colliding NavVis filenames
    // (each scan restarts at 00000) would silently OVERWRITE each other via SImage.Save.
    var panoUid = 0;
    // Count panos that landed in a "collapsed" scan namespace so we can warn at the end.
    var collapsedScanCount = 0;
    var manifestBuildings = [];
    var viewerData = { generatedUtc: new Date().toISOString(), source: CurrentDocPath(), buildings: [] };

    try {
        for (var b = 0; b < buildings.length; b++) {
            var B = buildings[b];
            print("\n=== Building: " + B.rawName + " ===");

            // WIPE BEFORE WRITE: clear this building's output so no stale manifest or
            // mixed panos survive a re-run.
            if (!B.direct) {
                // Nested: B.dir is our own Building_<name> folder -> safe to nuke whole tree.
                if (dirExists(B.dir)) removeDirRecursive(B.dir);
            } else {
                // DIRECT: B.dir === outputRoot. NEVER rmdir the whole root (it holds the
                // manifest we will write). Wipe only what we manage.
                wipeLevelDirs(B.dir);
                var staleBJson = B.dir + "\\building.json";
                if (SFile.New(staleBJson).Exists()) SFile.Remove(staleBJson);
            }

            if (!makeDirs(B.dir)) { print("  ERROR: could not create " + B.dir + "; skipping."); B.skipped = true; continue; }

            // Acquire this building's floor levels.
            var levels;
            if (res.levelsFrom === 1) {
                // --- Levels from PRE-SELECTED scene points (by Z) ---
                // SCloud.FromSel() took the cloud(s); SPoint.FromSel() takes the points
                // from the same mixed selection. Run building-by-building so the selected
                // points are THIS building's levels.
                if (buildings.length > 1) {
                    print("  NOTE: 'Selected points' mode with " + buildings.length +
                          " buildings -> the SAME selected points are used as levels for each. " +
                          "Run building-by-building for distinct levels.");
                }
                levels = levelsFromSelectedPoints();
                if (levels === null) {
                    SDialog.Message(
                        "No points selected.\n\n'Levels from' is 'Selected points (by Z)', but no scene " +
                        "points are selected.\n\nSelect one SPoint per floor (plus the building cloud), or " +
                        "switch 'Levels from' to 'Click floors (interactive)'.",
                        SDialog.Error, "No points selected");
                    return;   // hard stop; finally{} still runs (restores visibility, etc.)
                }
            } else {
                // --- Interactive floor picking (clouds still visible — no isolate yet) ---
                levels = pickLevels(vizPoints, B.rawName);
                if (levels === null) {
                    if (res.emptyLevelMode === EMPTY_SKIP) {
                        print("  No floors picked -> skipping building.");
                        B.skipped = true;
                        manifestBuildings.push({ name: B.rawName, folder: B.relFolder, skipped: true, levelCount: 0, panoCount: B.panos.length });
                        continue;
                    }
                    levels = [{ z: B.box.minZ }];
                    print("  No floors picked -> single level at minZ=" + B.box.minZ.toFixed(3));
                } else {
                    // merge near-duplicate clicks
                    var bandThick = bandAboveHi - bandAboveLo, mergeTol = bandThick * LEVEL_MERGE_FRACTION;
                    var merged = [levels[0]];
                    for (var lv = 1; lv < levels.length; lv++) {
                        if ((levels[lv].z - merged[merged.length - 1].z) < mergeTol) {
                            print("  Merging floor pick at Z=" + levels[lv].z.toFixed(3));
                        } else merged.push(levels[lv]);
                    }
                    levels = merged;
                }
            }
            B.levels = levels;
            var floorZs = [];
            for (var fz = 0; fz < levels.length; fz++) floorZs.push(levels[fz].z);

            // Bucket this building's panos to levels + compute pixel coords.
            for (var pp = 0; pp < B.panos.length; pp++) {
                var pano = B.panos[pp];
                var a = assignPanoToLevel(pano.z, floorZs);
                pano._level = a.index;
                pano._belowLowest = a.belowLowest;
                var px = worldToPixel(pano.x, pano.y, B.box, B.gsd);
                pano._col = px.pixelCol; pano._row = px.pixelRow;
            }

            // Isolate once (on the first building) — hide everything, then per-level show the slab.
            if (res.isolate && savedVisibility === null) {
                savedVisibility = [];
                var allComps = SComp.All(SComp.ANY_VISIBILITY);
                for (var k = 0; k < allComps.length; k++) {
                    savedVisibility.push({ comp: allComps[k], vis: allComps[k].IsVisible() });
                    allComps[k].SetVisibility(false);
                }
            }

            var buildingLevelsJson = [];
            var viewerBld = { name: B.rawName, levels: [] };
            for (var L = 0; L < levels.length; L++) {
                var datumZ = floorZs[L];
                var zLo = datumZ + bandAboveLo, zHi = datumZ + bandAboveHi;
                var levelDir = B.dir + "\\Level_" + (L + 1);
                var panosDir = levelDir + "\\panos";
                makeDirs(panosDir); // creates Level_<n> then panos
                print("\n--- " + B.rawName + " Level " + (L + 1) + "/" + levels.length +
                      "  floorZ=" + datumZ.toFixed(3) + "  band " + zLo.toFixed(3) + ".." + zHi.toFixed(3) + " ---");

                // Defensive teardown BEFORE creating the new slab (avoids stale slabs and
                // possible render caching that can yield byte-identical plans across levels):
                //   - remove every tracked slab from the prior level
                //   - remove any straggler matching this building's slab naming pattern
                //   - print to flush the UI thread, then a brief busy-loop to let Cyclone
                //     release the previous render buffer
                for (var rsX = 0; rsX < activeSlabs.length; rsX++) {
                    try { activeSlabs[rsX].RemoveFromDoc(); } catch (e) {}
                }
                activeSlabs = [];
                try {
                    var stragglers = SCloud.All(SComp.ANY_VISIBILITY);
                    var slabPrefix = B.safeName + "_L";
                    for (var sx = 0; sx < stragglers.length; sx++) {
                        var sname = stragglers[sx].GetName();
                        if (sname && sname.indexOf(slabPrefix) === 0) {
                            try { stragglers[sx].RemoveFromDoc(); } catch (e2) {}
                        }
                    }
                } catch (e3) { /* SCloud.All may throw if doc state weird; ignore */ }
                print("  [L" + (L + 1) + "] pre-render flush: SCloud.All=" +
                      SCloud.All(SComp.ANY_VISIBILITY).length +
                      " SImage.All=" + SImage.All(SComp.ANY_VISIBILITY).length);
                var __yieldNoop = 0;
                for (var __yi = 0; __yi < 10000; __yi++) __yieldNoop += __yi;

                // Build slab + export plan.
                var planExported = false, planFileName = null, worldFileName = null, planResult = null, previewInfo = null;
                var slab = sliceCloudZ(B.cloud, B.box, zLo, zHi);
                if (slab !== null) {
                    slab.SetName(B.safeName + "_L" + (L + 1));
                    slab.AddToDoc();
                    activeSlabs = [slab];
                    slab.SetVisibility(true);
                    applyCloudStyle(slab, style, ghostRGB, ghostAlpha);
                    // Dot-free elevation tag: Cyclone truncates the world-file name at the
                    // first dot, so "Z12.18" would yield a mismatched "...Z12.tfw". Use
                    // "Z12p18" (dot -> p, minus -> m) so the .tfw stem matches the .tif.
                    var zTag = datumZ.toFixed(2).replace(/[.\-]/g, function (c) { return c === "." ? "p" : "m"; });
                    var planBase = "plan_L" + (L + 1) + "_Z" + zTag;
                    var planPath = levelDir + "\\" + planBase + ".tif";
                    // Vary upperLeft.Z per level: the ortho render is top-down (Z doesn't
                    // change pixels), but a per-level Z forces a fresh render if the renderer
                    // caches by input signature.
                    var levelUpperLeft = SPoint.New(B.box.minX, B.box.maxY, zHi);
                    planResult = exportOnePlan({
                        box: B.box, gsd: B.gsd, width: B.width, height: B.height,
                        pixW: B.pixW, pixH: B.pixH, totalMP: B.totalMP, upperLeft: levelUpperLeft,
                        bgPacked: bgPacked, bgRGB: bgRGB, style: style,
                        effPLS: effectivePointLineSize, quality: -1,
                        outPath: planPath, ext: "tif", worldExt: FORMAT_WORLD,
                        writeSidecar: res.writeSidecar, formatIdx: FORMAT_IDX,
                        sliceInfo: null,
                        levelInfo: { buildingName: B.rawName, index: L, total: levels.length,
                                     datumZ: datumZ, zLo: zLo, zHi: zHi }
                    });
                    planExported = planResult.ok;
                    if (planExported) { planFileName = planBase + ".tif"; worldFileName = planBase + ".tfw"; }
                    // Web QC viewer: downscaled preview PNG from the SAME (still-in-doc, styled) slab.
                    if (makeViewer && planExported) {
                        previewInfo = exportPreviewPng({
                            previewPath: levelDir + "\\preview.png",
                            upperLeft: levelUpperLeft, bgPacked: bgPacked,
                            width: B.width, height: B.height,
                            gsd: B.gsd, effPLS: effectivePointLineSize
                        });
                    }
                    // cleanup slab now (before next level)
                    for (var rs = 0; rs < activeSlabs.length; rs++) { try { activeSlabs[rs].RemoveFromDoc(); } catch (e) {} }
                    activeSlabs = [];
                } else {
                    print("  WARNING: level band has no points; no plan for this level (panos still recorded).");
                }

                // Copy + record this level's panos.
                var levelPanoRecords = [];
                var viewerPanos = [];
                var levelPanoCount = 0;
                // Hoist per-scan makeDirs out of the per-pano loop: one make-dir per scan
                // is enough. ES5-ish host, so use a plain object as a set (key=true).
                var ensuredScanDirs = {};
                for (var pq = 0; pq < B.panos.length; pq++) {
                    var pn = B.panos[pq];
                    if (pn._level !== L) continue;
                    levelPanoCount++;

                    // Per-scan subfolder under panos/ so identical raw NavVis filenames
                    // across scans (each scan starts at 00000) never overwrite on disk.
                    var scanDir = sanitisePathSegment(pn.scan || "default");

                    // Global unique id -> "<uid>__<name>.jpg" is unique even if scanDir
                    // collapsed to "PANOS"/"default" or two scans share a name, so
                    // SImage.Save can NEVER overwrite another pano's pixels.
                    var uid = panoUid++;
                    var uidStr = "" + uid;
                    while (uidStr.length < 7) uidStr = "0" + uidStr;
                    // Flag a collapsed / missing scan namespace so we can warn loudly.
                    var rawScan = ("" + (pn.scan || "")).toLowerCase();
                    if (rawScan === "" || rawScan === "panos" || rawScan === "default") {
                        collapsedScanCount++;
                    }

                    if (makeViewer) {
                        // Position as a FRACTION of the full grid -> resolution/zoom independent.
                        viewerPanos.push({
                            name: ("" + pn.name),
                            scan: scanDir,
                            uid: uidStr,
                            fx: pn._col / B.pixW, fy: pn._row / B.pixH
                        });
                    }
                    // Output filename = <uid>__<SImage name>. SImage name already carries
                    // .jpg; guard a missing/unsupported extension by appending .jpg.
                    var baseName = ("" + pn.name);
                    if (!/\.(jpg|jpeg|bmp|png|tif|tiff)$/i.test(baseName)) baseName += ".jpg";
                    var outName = uidStr + "__" + baseName;   // collision-proof
                    var imageSaved = false, imageRelPath = null;
                    if (exportImages && pn.image) {
                        var perScanDir = panosDir + "\\" + scanDir;
                        if (!ensuredScanDirs[scanDir]) {
                            makeDirs(perScanDir);
                            ensuredScanDirs[scanDir] = true;
                        }
                        // SImage.Save exports pixel data (not a viewport render), so it works
                        // even though isolate has hidden this image.
                        var sr = pn.image.Save(perScanDir + "\\" + outName);
                        imageSaved = (sr && sr.ErrorCode === 0);
                        if (imageSaved) {
                            imageRelPath = "panos/" + scanDir + "/" + outName;
                            totals.imagesSaved++;
                        } else {
                            totals.imagesFailed++;
                            print("  IMAGE SAVE FAIL (code " + (sr ? sr.ErrorCode : "?") + "): " +
                                  scanDir + "/" + outName);
                        }
                    }
                    levelPanoRecords.push({
                        name: pn.name,
                        scan: scanDir,                   // collision-safety namespace
                        uid: uidStr,                     // hidden globally-unique id
                        worldX: pn.x, worldY: pn.y, worldZ: pn.z,
                        quatW: pn.qw, quatX: pn.qx, quatY: pn.qy, quatZ: pn.qz,
                        building: B.rawName, level: L + 1,
                        belowLowestFloor: !!pn._belowLowest,
                        pixelCol: pn._col, pixelRow: pn._row,
                        imageSaved: imageSaved, imageRelPath: imageRelPath
                    });
                    totals.panosAssigned++;
                }

                // Write level.json
                var levelJson = {
                    schema: "pano-viewer-level/1.1",
                    building: B.rawName, index: L + 1, floorZ: datumZ,
                    sourcePointName: (levels[L] && levels[L].name != null) ? levels[L].name : null,
                    band: { aboveLo: bandAboveLo, aboveHi: bandAboveHi, absoluteZLo: zLo, absoluteZHi: zHi },
                    planExported: planExported,
                    plan: planExported ? {
                        image: planFileName, worldFile: worldFileName,
                        sidecar: res.writeSidecar ? (planFileName + ".json") : null,
                        widthPx: B.pixW, heightPx: B.pixH, gsdMeters: B.gsd,
                        upperLeftCornerWorld: { x: B.box.minX, y: B.box.maxY, z: B.box.maxZ },
                        worldFileActual: planResult ? planResult.worldFileActual : null,
                        pixelConvention: { pixelCol: "(worldX-minX)/gsd", pixelRow: "(maxY-worldY)/gsd" }
                    } : null,
                    panoCount: levelPanoCount,
                    panos: levelPanoRecords
                };
                writeTextFile(levelDir + "\\level.json", JSON.stringify(levelJson, null, 2));
                print("  Level " + (L + 1) + ": " + levelPanoCount + " pano(s)" +
                      (planExported ? ", plan OK" : ", NO plan") + ".");

                buildingLevelsJson.push({
                    index: L + 1, floorZ: datumZ, folder: "Level_" + (L + 1),
                    levelJson: "Level_" + (L + 1) + "/level.json",
                    planImage: planExported ? ("Level_" + (L + 1) + "/" + planFileName) : null,
                    panoCount: levelPanoCount
                });
                if (makeViewer && previewInfo && previewInfo.ok) {
                    // Browser-safe RELATIVE url: encode each segment (space -> %20), join with raw "/".
                    var relParts = B.direct
                        ? ["Level_" + (L + 1), "preview.png"]
                        : ["Building_" + B.safeName, "Level_" + (L + 1), "preview.png"];
                    for (var rp = 0; rp < relParts.length; rp++) relParts[rp] = encodeURIComponent(relParts[rp]);
                    viewerBld.levels.push({
                        index: L + 1, floorZ: datumZ,
                        preview: relParts.join("/"),
                        previewW: previewInfo.previewW, previewH: previewInfo.previewH,
                        fullWidthPx: B.pixW, fullHeightPx: B.pixH,
                        panoCount: levelPanoCount, panos: viewerPanos
                    });
                }
                totals.levels++;
                // GC hint + checkpoint at end of each level: release local refs so the JS
                // engine can reclaim memory, and log scene-object counts to spot leaks
                // (counts climbing level-by-level = leak; stable = healthy).
                slab = null; planResult = null; previewInfo = null;
                levelPanoRecords = null; viewerPanos = null;
                try {
                    print("  [checkpoint] B=" + B.rawName + " L=" + (L + 1) +
                          " SCloud.All=" + SCloud.All(SComp.ANY_VISIBILITY).length +
                          " SImage.All=" + SImage.All(SComp.ANY_VISIBILITY).length);
                } catch (eC) { /* ignore */ }
            }

            // Write building.json
            var buildingJson = {
                schema: "pano-viewer-building/1.1",
                name: B.rawName, cloudName: B.rawName, folder: B.relFolder, skipped: false,
                bbox: { minX: B.box.minX, minY: B.box.minY, minZ: B.box.minZ,
                        maxX: B.box.maxX, maxY: B.box.maxY, maxZ: B.box.maxZ },
                center: { x: B.centerX, y: B.centerY },
                grid: { gsdMeters: B.gsd, widthMeters: B.width, heightMeters: B.height,
                        widthPx: B.pixW, heightPx: B.pixH, megapixels: Number(B.totalMP.toFixed(3)),
                        upperLeftCornerWorld: { x: B.box.minX, y: B.box.maxY, z: B.box.maxZ },
                        note: "Shared grid for every level plan in this building (they overlay)." },
                panoCount: B.panos.length,
                levels: buildingLevelsJson
            };
            writeTextFile(B.dir + "\\building.json", JSON.stringify(buildingJson, null, 2));
            manifestBuildings.push({
                name: B.rawName, folder: B.relFolder, skipped: false,
                buildingJson: (B.direct ? "building.json" : (B.relFolder + "/building.json")),
                levelCount: buildingLevelsJson.length, panoCount: B.panos.length
            });
            if (makeViewer && viewerBld.levels.length > 0) viewerData.buildings.push(viewerBld);
        }
    } catch (e) {
        print("  EXCEPTION during export: " + e);
    } finally {
        for (var af = 0; af < activeSlabs.length; af++) { try { activeSlabs[af].RemoveFromDoc(); } catch (e) {} }
        activeSlabs = [];
        for (var vf = 0; vf < vizPoints.length; vf++) { try { vizPoints[vf].RemoveFromDoc(); } catch (e) {} }
        if (res.afterExport === 0) {
            for (var rc = 0; rc < buildings.length; rc++) {
                try { resetCloudToDefault(buildings[rc].cloud); } catch (e) {}
            }
        }
        if (savedVisibility !== null) {
            for (var v = 0; v < savedVisibility.length; v++) {
                try { savedVisibility[v].comp.SetVisibility(savedVisibility[v].vis); } catch (e) {}
            }
        }
    }

    // ---- write manifest.json ----
    var unassignedRecords = [];
    for (var u = 0; u < unassignedPanos.length; u++) {
        var up = unassignedPanos[u];
        // Unassigned panos record `scan` for forensic clarity but the export NEVER
        // writes their JPGs. Any future "unassigned" image sink MUST use the same
        // panos/<scan>/<name>.jpg layout or collisions reappear there.
        unassignedRecords.push({
            name: up.name,
            scan: sanitisePathSegment(up.scan || ""),
            worldX: up.x, worldY: up.y, worldZ: up.z,
            quatW: up.qw, quatX: up.qx, quatY: up.qy, quatZ: up.qz,
            reason: "xy-outside-all-building-bboxes"
        });
    }
    var manifest = {
        schema: "pano-viewer-dataset/1.1",
        generator: "export_ortho_with_panos.js (Cyclone 3DR 2026.1)",
        generatedUtc: new Date().toISOString(),
        sourceDocument: CurrentDocPath(),
        projection: { epsg: null, note: "Local UTM-like coords; set CRS in the viewer.",
                      falseOriginHint: { x: (globalMinX === Infinity ? null : globalMinX),
                                         y: (globalMinY === Infinity ? null : globalMinY) } },
        render: { style: STYLE_LABELS[style], gsdMetersRequested: gsd,
                  band: { aboveLo: bandAboveLo, aboveHi: bandAboveHi },
                  imageFormat: "TIFF", worldFile: "tfw" },
        pixelConvention: { note: "CORNER convention, no half-pixel offset.",
                           pixelCol: "(worldX - building.bbox.minX) / building.grid.gsdMeters",
                           pixelRow: "(building.bbox.maxY - worldY) / building.grid.gsdMeters" },
        totals: { buildings: manifestBuildings.length, levels: totals.levels,
                  panosTotal: allPanos.length, panosAssigned: totals.panosAssigned,
                  panosUnassigned: totals.panosUnassigned,
                  imagesSaved: totals.imagesSaved, imagesFailed: totals.imagesFailed },
        unassignedPanos: unassignedRecords,
        buildings: manifestBuildings
    };
    writeTextFile(outputRoot + "\\manifest.json", JSON.stringify(manifest, null, 2));

    // ---- web QC viewer ----
    var viewerHtmlPath = null;
    if (makeViewer) {
        if (writeViewerHtml(outputRoot, viewerData)) {
            viewerHtmlPath = outputRoot + "\\viewer.html";
            if (openViewer) {
                // file:/// + forward slashes + %20 for spaces (Windows-safe for the default browser).
                var fileUrl = "file:///" + viewerHtmlPath.replace(/\\/g, "/").replace(/ /g, "%20");
                var opened = OpenUrl(fileUrl);
                print("  Open viewer  : " + (opened ? "OK  " : "FAILED  ") + fileUrl);
                if (!opened) print("  (If it did not open, double-click: " + viewerHtmlPath + ")");
            }
        }
    }

    // ---- summary ----
    print("\n========================================================");
    print("   DONE");
    print("========================================================");
    print("Output root  : " + outputRoot);
    print("Buildings    : " + manifestBuildings.length);
    print("Levels       : " + totals.levels);
    print("Panos total  : " + allPanos.length +
          "  (assigned " + totals.panosAssigned + ", unassigned " + totals.panosUnassigned + ")");
    if (exportImages) print("Images saved : " + totals.imagesSaved + "  (failed " + totals.imagesFailed + ")");
    print("Manifest     : " + outputRoot + "\\manifest.json");
    if (viewerHtmlPath) print("Viewer       : " + viewerHtmlPath);
    // Loud warning when the scene tree was FLAT so the per-scan namespace collapsed.
    // Images are still safe (unique <uid>__ filenames), but every pano landed under
    // one "PANOS" folder and the viewer list can't group by scan. Fix by re-importing
    // so the tree is /PANOS/<scanName>/images/... (see the companion importer).
    if (collapsedScanCount > 0) {
        print("\n  *** SCAN NAMESPACE WARNING ***");
        print("    " + collapsedScanCount + " pano(s) had an empty/'PANOS'/'default' scan -> flat scene tree.");
        print("    Images are SAFE (unique per-pano filenames), but they are NOT grouped by scan.");
        print("    To restore per-scan grouping, re-import so the tree is /PANOS/<scanName>/images/...");
        print("    (import_panos_by_folder.js guarantees this.)\n");
    }
    print("Note: projection EPSG is unknown (local coords). Set the CRS in your viewer.");
    print("========================================================\n");
}

main();
