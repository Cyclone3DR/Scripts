/// <reference path="C:\\Program Files\\Leica Geosystems\\Cyclone 3DR\\Script\\JsDoc\\Reshaper.d.ts" />
//
// import_panos_by_folder.js  -  Cyclone 3DR 2026.1
// ============================================================================
// Batch-import NavVis panoramas from a ROOT folder and pose each one from the
// NavVis poses CSV. Select ONE root folder and every scan subfolder's panos are
// imported automatically.
//
// Expected on-disk layout per scan:
//     <root>/<scanFolder>/pano/00000-pano.jpg, 00001-pano.jpg, ...
//     <root>/<scanFolder>/pano/pano-poses-registered.csv   (preferred)
//     <root>/<scanFolder>/pano/pano-poses.csv              (fallback)
//
// Resulting Cyclone tree (per scan, kept in its OWN group):
//     /<topGroup>/<scanFolderName>/images/00000-pano.jpg, ...
//     /<topGroup>/<scanFolderName>/points/00000-pano.jpg, ...   (optional)
//
// The per-scan group is load-bearing: the ortho exporter reads the scan name
// back out of this path. Keep the tree per-scan (never flat /<topGroup>/images/...)
// or NavVis's 00000-restart filenames collapse into one folder and overwrite.
//
// Progress: a throttled console bar + ETA, plus a disk heartbeat log you can
// tail live (Cyclone's console only repaints between operations).
// ============================================================================

// ============================================================================
// QUATERNION HELPERS
// ============================================================================
function quatMul(w1, x1, y1, z1, w2, x2, y2, z2) {
    return [
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2
    ];
}

// Right-multiply by the 180deg-about-X quaternion (0,1,0,0): NavVis pose convention.
function applyFlipX(qw, qx, qy, qz) {
    return quatMul(qw, qx, qy, qz, 0, 1, 0, 0);
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

// Replace path separators so a scan name can't break the group path.
function sanitizeGroupName(name) {
    return ("" + name).replace(/[\/\\]+/g, "_").replace(/^\s+|\s+$/g, "");
}

// Normalised path join: backslashes -> forward slashes, strip trailing slashes
// from `dir`, append "/" + child. Single source of truth so a trailing separator
// can never produce a "//" that SFile cannot open. `child` may be "" to just clean `dir`.
function joinPath(dir, child) {
    var d = ("" + (dir || "")).replace(/\\/g, "/").replace(/\/+$/g, "");
    if (child === undefined || child === null || child === "") return d;
    var c = ("" + child).replace(/\\/g, "/").replace(/^\/+/g, "");
    return d + "/" + c;
}

// True if `path` is absolute (drive letter "C:/..." or UNC "//server/...").
function isAbsolutePath(path) {
    var p = ("" + path).replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(p) || /^\/\//.test(p);
}

// Resolve a ListEntries entry to an ABSOLUTE path under `parentDir`.
// SFile.ListEntries may return leaf names (not absolute paths), so re-join them.
function resolveEntry(parentDir, entry) {
    return isAbsolutePath(entry) ? joinPath(entry, "") : joinPath(parentDir, entry);
}

// Return the absolute CSV path to use for a pano folder, or null if none.
// A non-null result also PROVES the pano folder exists (the file lives inside it).
function findPoseCsv(panoFolder) {
    var registered = joinPath(panoFolder, "pano-poses-registered.csv");
    var plain      = joinPath(panoFolder, "pano-poses.csv");
    if (SFile.New(registered).Exists()) return registered;
    if (SFile.New(plain).Exists())      return plain;
    return null;
}

// True if a folder directly contains at least one .jpg.
function hasJpgs(dir) {
    var r = SFile.ListEntries(joinPath(dir, ""), SFile.Files, false, ["jpg"]);
    return !!(r && r.ErrorCode === 0 && r.Entries && r.Entries.length > 0);
}

// Count valid pano rows in a CSV (filename present + 10 columns) for an accurate ETA.
function countCsvRows(csvPath) {
    var f = SFile.New(csvPath);
    if (!f.Exists() || !f.Open(SFile.ReadOnly)) return 0;
    f.ReadLine(); // header
    var n = 0;
    while (!f.AtEnd()) {
        var raw = f.ReadLine();
        if (!raw) continue;
        var line = ("" + raw).replace(/^\s+|\s+$/g, "");
        if (line === "" || line.charAt(0) === "#") continue;
        var col = line.split(";");
        if (col.length < 10) continue;
        if (!("" + col[1]).replace(/^\s+|\s+$/g, "")) continue;
        n++;
    }
    f.Close();
    return n;
}

// ============================================================================
// PROGRESS + HEARTBEAT LOGGING
// ============================================================================

// Format a duration (ms) as "MmSs" or "Ss".
function fmtDur(ms) {
    var s = Math.round(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m > 0 ? (m + "m" + (s < 10 ? "0" : "") + s + "s") : (s + "s"));
}

// Throttled console progress bar (prints on % change or every PROGRESS_EVERY images).
var PROGRESS_EVERY = 50;
var _lastPct = -1, _lastDone = 0;
function progressBar(done, total, startMs, force) {
    if (total <= 0) return;
    var pct = Math.floor((done / total) * 100);
    if (!force && pct === _lastPct && (done - _lastDone) < PROGRESS_EVERY) return;
    _lastPct = pct; _lastDone = done;
    var WIDTH = 24;
    var filled = Math.round((done / total) * WIDTH);
    if (filled > WIDTH) filled = WIDTH;
    var bar = "";
    for (var i = 0; i < WIDTH; i++) bar += (i < filled ? "#" : ".");
    var eta = "";
    var elapsed = new Date().getTime() - startMs;
    if (done > 0 && done < total) {
        var remain = elapsed * (total / done - 1);
        eta = "  ETA ~" + fmtDur(remain);
    }
    print("  [" + bar + "] " + pct + "%  " + done + "/" + total + eta);
}

// Disk heartbeat: Cyclone's console only repaints between operations, so we also
// append progress to <rootFolder>/_import_progress.log. Watch it live with
// PowerShell `Get-Content -Wait` or Git Bash `tail -f`.
var HEARTBEAT_EVERY = 25;
var _hbPath = null;
var _hbLastDone = 0;

// Pick the heartbeat file location and truncate any previous log.
function setHeartbeatRoot(rootFolder) {
    if (!rootFolder) { _hbPath = null; return; }
    _hbPath = joinPath(rootFolder, "_import_progress.log");
    var f = SFile.New(_hbPath);
    if (f.Open(SFile.WriteOnly)) {
        f.Write("# Cyclone import heartbeat. Started " + new Date().toISOString() + "\r\n");
        f.Write("# Watch live (PowerShell):  Get-Content -Wait '" + _hbPath + "'\r\n");
        f.Write("# Watch live (Git Bash):    tail -f '" + _hbPath + "'\r\n");
        f.Write("# ---------------------------------------------------------\r\n");
        f.Close();
    } else {
        print("  WARNING: could not create heartbeat log at " + _hbPath +
              " (proceeding without disk heartbeat)");
        _hbPath = null;
    }
}

// Append one line to the heartbeat log. Best-effort: disable on any I/O error.
function heartbeat(line) {
    if (!_hbPath) return;
    try {
        var f = SFile.New(_hbPath);
        if (!f.Open(SFile.ReadWrite)) { _hbPath = null; return; }
        var sz = f.GetSize ? f.GetSize() : null;
        if (sz != null && f.Seek) f.Seek(sz);
        f.Write(line + "\r\n");
        f.Close();
    } catch (e) {
        _hbPath = null;   // never crash the import for logging
    }
}

// Per-image throttle: writes every HEARTBEAT_EVERY images (plus force).
function heartbeatProgress(done, total, startMs, scanName, force) {
    if (!_hbPath) return;
    if (!force && (done - _hbLastDone) < HEARTBEAT_EVERY) return;
    _hbLastDone = done;
    var pct = total > 0 ? Math.floor((done / total) * 100) : 0;
    var elapsed = new Date().getTime() - startMs;
    var eta = "";
    if (done > 0 && done < total) {
        var remain = elapsed * (total / done - 1);
        eta = "  ETA " + fmtDur(remain);
    }
    var t = (new Date()).toISOString().substring(11, 19);   // HH:MM:SS
    heartbeat(t + "  " + pad6(done) + "/" + pad6(total) +
              "  (" + pct + "%)  scan=" + scanName + eta);
}

function pad6(n) { var s = "" + n; while (s.length < 6) s = " " + s; return s; }

// ============================================================================
// DIALOG
// ============================================================================
function askUserForInputs() {
    var dlg = SDialog.New("NavVis Pano Batch Import (by scan folder)");

    dlg.AddFileSelector({
        'id':      'rootFolder',
        'name':    'Root folder',
        'mode':    SDialog.EMode.OpenDirectory,
        'tooltip': 'Select the ROOT folder that contains the scan subfolders ' +
                   '(each scan has a "pano" subfolder with images + a poses CSV).'
    });

    dlg.AddTextField({
        'id':         'topGroup',
        'name':       'Top tree group name',
        'value':      'PANOS',
        'saveValue':  true,
        'canBeEmpty': false,
        'tooltip':    'Name of the single top-level tree group that will hold all scans.'
    });

    dlg.AddBoolean({
        'id':        'createPoints',
        'name':      'Create name points',
        'value':     false,                       // default OFF for large batches (faster, fewer objects)
        'saveValue': true,
        'tooltip':   'Create a labelled point at each pano position (in <scan>/points). ' +
                     'OFF (default) for large batches.'
    });

    dlg.AddBoolean({
        'id':        'clearFirst',
        'name':      'Clear existing images first',
        'value':     false,
        'saveValue': true,
        'tooltip':   'ON = remove ALL images from the document before importing ' +
                     '(does NOT remove existing points). OFF (default) = accumulate.'
    });

    var res = dlg.Run();
    if (!res) return null;

    return {
        rootFolder:   res.rootFolder,
        topGroup:     sanitizeGroupName(res.topGroup) || "PANOS",
        createPoints: res.createPoints,
        clearFirst:   res.clearFirst
    };
}

// ============================================================================
// SCAN DISCOVERY
// ============================================================================
// Returns [{ scanName, panoFolder, csvPath }] for every importable scan.
// Gate on the poses CSV: its existence proves the pano folder is real.
function discoverScans(root) {
    var scans = [];
    var rootClean = joinPath(root, "");   // strip any trailing separator

    // Case A: root IS a pano folder (contains jpgs + a poses CSV).
    var rootCsv = findPoseCsv(rootClean);
    if (rootCsv && hasJpgs(rootClean)) {
        scans.push({
            scanName:   sanitizeGroupName(SFile.GetFileName(rootClean)),
            panoFolder: rootClean,
            csvPath:    rootCsv
        });
        return scans;
    }

    // Case B: root IS a single scan folder (has a "pano" child).
    var rootPano = joinPath(rootClean, "pano");
    var csvB = findPoseCsv(rootPano);
    if (csvB) {
        scans.push({
            scanName:   sanitizeGroupName(SFile.GetFileName(rootClean)),
            panoFolder: rootPano,
            csvPath:    csvB
        });
        return scans;
    }

    // Case C (normal): root contains many scan subfolders.
    var sub = SFile.ListEntries(rootClean, SFile.Directories, false);
    if (!sub || sub.ErrorCode !== 0) {
        print("ERROR: cannot list subfolders of: " + rootClean +
              " (code " + (sub ? sub.ErrorCode : "?") + ")");
        return scans;
    }
    var dirs = sub.Entries || [];
    dirs.sort();

    if (dirs.length > 0) print("  First entry raw: '" + dirs[0] + "'");

    for (var i = 0; i < dirs.length; i++) {
        var scanDir  = resolveEntry(rootClean, dirs[i]);
        var scanName = sanitizeGroupName(SFile.GetFileName(scanDir));
        var panoDir  = joinPath(scanDir, "pano");
        var csv = findPoseCsv(panoDir);
        if (!csv) {
            print("  SKIP  " + scanName + " : no pano-poses CSV at " + panoDir);
            continue;
        }
        scans.push({ scanName: scanName, panoFolder: panoDir, csvPath: csv });
    }
    return scans;
}

// ============================================================================
// PER-SCAN IMPORT
// ============================================================================
// Imports one scan; mutates the shared totals object and advances progress.
function importScan(scan, idx, totalScans, opts, totals, progress) {
    // GUARANTEE a non-empty, per-scan group name so the tree is always
    // /<topGroup>/<scanName>/images/... and never the flat form (see header).
    var safeScanName = ("" + (scan.scanName || "")).replace(/^\s+|\s+$/g, "");
    if (safeScanName === "") {
        safeScanName = "scan_" + (idx + 1);
        print("  WARNING: scan " + (idx + 1) + " has an empty name; using '" + safeScanName + "'.");
    }
    scan.scanName = safeScanName;

    var imagesGroup = "/" + opts.topGroup + "/" + safeScanName + "/images";
    var pointsGroup = "/" + opts.topGroup + "/" + safeScanName + "/points";
    print("       group: " + imagesGroup);

    var csv = SFile.New(scan.csvPath);
    if (!csv.Exists() || !csv.Open(SFile.ReadOnly)) {
        print("[" + (idx + 1) + "/" + totalScans + "] " + scan.scanName +
              " : ERROR cannot open CSV - skipped.");
        totals.scansSkipped++;
        return false;
    }

    csv.ReadLine(); // skip header
    print("[" + (idx + 1) + "/" + totalScans + "] " + scan.scanName +
          "  (csv: " + SFile.GetFileName(scan.csvPath) + ")");
    heartbeat("SCAN  [" + (idx + 1) + "/" + totalScans + "] start: " + scan.scanName);

    var localImg = 0, localPosed = 0, localPts = 0, localMissing = 0, lineNo = 1;

    while (!csv.AtEnd()) {
        var raw = csv.ReadLine();
        lineNo++;
        if (!raw) continue;
        var line = ("" + raw).replace(/^\s+|\s+$/g, "");
        if (line === "" || line.charAt(0) === "#") continue;

        var col = line.split(";");
        if (col.length < 10) continue;

        var fileName = ("" + col[1]).replace(/^\s+|\s+$/g, "");
        if (!fileName) continue;

        // NavVis CSV columns: ID;filename;timestamp;pos_x;pos_y;pos_z;ori_w;ori_x;ori_y;ori_z
        var x  = parseFloat(col[3]);
        var y  = parseFloat(col[4]);
        var z  = parseFloat(col[5]);
        var qw = parseFloat(col[6]);
        var qx = parseFloat(col[7]);
        var qy = parseFloat(col[8]);
        var qz = parseFloat(col[9]);

        if ([x, y, z, qw, qx, qy, qz].some(isNaN)) {
            print("    line " + lineNo + " ignored (invalid numeric values)");
            continue;
        }

        try {
            // ---- load image (fresh object every time) ----
            var full = joinPath(scan.panoFolder, fileName);
            var imp = SImage.FromFile(full, SImage.SPHERICAL);
            if (!imp || imp.ErrorCode !== 0 || !imp.Image) {
                print("    missing/failed: " + fileName +
                      " (code " + (imp ? imp.ErrorCode : "?") + ")");
                localMissing++;
                continue;
            }

            var img = imp.Image;
            img.SetName(fileName);              // RAW name, no prefix
            img.AddToDoc();                     // MUST precede MoveToGroup
            img.MoveToGroup(imagesGroup, false);
            localImg++;

            // ---- pose: FlipX then set external camera params ----
            var q = applyFlipX(qw, qx, qy, qz);
            var cam = SCameraExternal.New();
            cam.SetPosition(SPoint.New(x, y, z));
            cam.SetOrientationQuaternion(q[0], q[1], q[2], q[3]);

            var pr = img.SetCameraExternalParameters(cam);
            if (!pr || pr.ErrorCode !== 0) {
                print("    pose error: " + fileName +
                      " (code " + (pr ? pr.ErrorCode : "?") + ")");
            } else {
                img.SetVisibility(true);
                localPosed++;
            }

            // ---- optional name point ----
            if (opts.createPoints) {
                var p = SPoint.New(x, y, z);
                p.SetName(fileName);
                p.SetPointSize(4);
                p.AddToDoc();                   // MUST precede MoveToGroup
                p.ShowName(true);
                p.MoveToGroup(pointsGroup, false);
                localPts++;
            }
        } catch (e) {
            print("    EXCEPTION on " + fileName + ": " + e);
        }

        // ---- advance overall progress (throttled) ----
        progress.done++;
        progressBar(progress.done, progress.total, progress.startMs, false);
        heartbeatProgress(progress.done, progress.total, progress.startMs, scan.scanName, false);
    }

    csv.Close();

    print("       imported " + localImg + " | posed " + localPosed +
          " | points " + localPts + " | missing " + localMissing);
    // Force one heartbeat at scan end so the file is never stale between scans.
    heartbeatProgress(progress.done, progress.total, progress.startMs, scan.scanName, true);
    heartbeat("SCAN  [" + (idx + 1) + "/" + totalScans + "] DONE: " + scan.scanName +
              "  imported=" + localImg + " posed=" + localPosed + " missing=" + localMissing);

    totals.scansProcessed++;
    totals.images  += localImg;
    totals.posed   += localPosed;
    totals.points  += localPts;
    totals.missing += localMissing;
    return true;
}

// ============================================================================
// MAIN
// ============================================================================
function main() {
    print("================================================");
    print("NavVis Pano BATCH Import -> Cyclone 3DR (by scan folder)");
    print("================================================");

    var opts = askUserForInputs();
    if (!opts) { print("Cancelled by user."); return; }

    print("Root folder    : " + opts.rootFolder);
    print("Top tree group : " + opts.topGroup);
    print("Create points  : " + opts.createPoints);
    print("Clear first    : " + opts.clearFirst);
    print("------------------------------------------------");

    // Start the disk heartbeat immediately so the log is watchable before discovery ends.
    setHeartbeatRoot(opts.rootFolder);
    heartbeat("START  rootFolder=" + opts.rootFolder);

    if (opts.clearFirst) {
        var old = SImage.All();
        for (var i = 0; i < old.length; i++) old[i].RemoveFromDoc();
        print("Removed existing images: " + old.length + "  (existing points left untouched)");
    }

    var startMs = new Date().getTime();

    print("Discovering scans...");
    heartbeat("DISCOVER  scanning " + opts.rootFolder);
    var scans = discoverScans(opts.rootFolder);
    print("Scans to import: " + scans.length);
    heartbeat("DISCOVER  found " + scans.length + " scan(s)");

    if (scans.length === 0) {
        print("Nothing to import. Make sure the root contains scan folders, each with a " +
              "'pano' subfolder holding images and a pano-poses[-registered].csv.");
        SDialog.Message("Nothing to import.\n\nThe root has no scan folders with a 'pano' subfolder " +
                        "+ pano-poses CSV.", SDialog.Warning, "Batch import");
        return;
    }

    // ---- pre-pass: count total images for an accurate overall bar + ETA ----
    print("Counting images (pre-pass)...");
    heartbeat("PREPASS  counting CSV rows in " + scans.length + " scan(s)");
    var grandTotal = 0;
    for (var c = 0; c < scans.length; c++) grandTotal += countCsvRows(scans[c].csvPath);
    print("Total images to import: " + grandTotal);
    heartbeat("PREPASS  total images to import: " + grandTotal);
    print("------------------------------------------------");
    if (scans.length > 10 || grandTotal > 1000) {
        print("NOTE: " + scans.length + " scans / " + grandTotal + " images. Runs sequentially; " +
              "this may take several minutes. Progress bar + ETA below.");
    }

    var totals = {
        scansProcessed: 0, scansSkipped: 0,
        images: 0, posed: 0, points: 0, missing: 0
    };
    var progress = { done: 0, total: grandTotal, startMs: startMs };

    for (var s = 0; s < scans.length; s++) {
        try {
            importScan(scans[s], s, scans.length, opts, totals, progress);
        } catch (e) {
            print("[" + (s + 1) + "/" + scans.length + "] " + scans[s].scanName +
                  " : FATAL scan error: " + e + " - continuing.");
            totals.scansSkipped++;
        }
    }
    progressBar(progress.done, progress.total, startMs, true); // final 100%
    heartbeatProgress(progress.done, progress.total, startMs, "all", true);

    var elapsed = new Date().getTime() - startMs;
    var inScene = SImage.All().length;
    heartbeat("DONE  elapsed=" + fmtDur(elapsed) +
              "  imported=" + totals.images + "/" + grandTotal +
              "  posed=" + totals.posed +
              "  scansProcessed=" + totals.scansProcessed +
              "  scansSkipped=" + totals.scansSkipped);

    print("================================================");
    print("DONE in " + fmtDur(elapsed));
    print("Top group        : " + opts.topGroup);
    print("Scans processed  : " + totals.scansProcessed);
    print("Scans skipped    : " + totals.scansSkipped);
    print("Images imported  : " + totals.images);
    print("Images posed     : " + totals.posed);
    print("Name points      : " + totals.points);
    print("Missing files    : " + totals.missing);
    print("Total images now in scene: " + inScene);
    print("================================================");

    // ---- completion popup ----
    SDialog.Message(
        "Batch import DONE in " + fmtDur(elapsed) + ".\n\n" +
        "Scans processed : " + totals.scansProcessed +
        (totals.scansSkipped ? ("  (skipped " + totals.scansSkipped + ")") : "") + "\n" +
        "Images imported : " + totals.images + " / " + grandTotal +
        (totals.missing ? ("  (missing " + totals.missing + ")") : "") + "\n" +
        "Images posed    : " + totals.posed + "\n" +
        "Name points     : " + totals.points + "\n" +
        "Top tree group  : " + opts.topGroup,
        SDialog.Success, "Batch import");
}

main();
