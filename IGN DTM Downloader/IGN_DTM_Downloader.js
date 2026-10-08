/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

/******** HOW TO USE IT ******
 *
 * This script downloads elevation tiles from the IGN Geoplateforme (cartes.gouv.fr)
 * for a given bounding box and builds a 3D point cloud from them in the document.
 *
 * It illustrates the Cyclone 3DR script engine's new capabilities: async/await, fetch
 * (HTTP requests) and dynamic import() of ES modules (see
 * DocScript/_async_and_modules_page.html). The whole pipeline stays within documented
 * capabilities: fetch() downloads, the GeoTIFF is decoded ourselves in memory (no
 * binary write to disk, no external tool).
 *
 * Follow the steps below:
 * 1) Run the script and enter the Northeast and Southwest corners of the area to
 *    import (longitude/latitude, WGS 84).
 * 2) Optionally adjust the max number of parallel downloads in the "Performance" group.
 * 3) The script queries the Geoplateforme WFS layer "IGNF_MNT-LIDAR-HD:dalle" to list
 *    the matching 1 km x 1 km GeoTIFF tiles (50 cm resolution), downloads each one
 *    (WMS GetMap request, image/geotiff format), decodes it directly from the
 *    in-memory ArrayBuffer using the "./modules/geotiff_reader.js" module (loaded
 *    dynamically with await import(...)), and builds one point cloud per tile.
 */

var WFS_TYPENAME = "IGNF_MNT-LIDAR-HD:dalle";
var TEMP_DIR_NAME = "Cyclone3DR_CartesGouv";

// ---------------------------------------------------------------------------
// 1. User parameters
// ---------------------------------------------------------------------------

var LOGO_FILE_NAME = "cartes-gouv-logo-dark.svg";

// Resolves a path next to this script (e.g. "res/<file>"), regardless of where the
// script itself was copied/run from. CurrentScriptPath() returns the script's own
// directory (not the .js file path itself), so it is used as-is.
function getResourcePath(fileName)
{
    var scriptDir = CurrentScriptPath().replace(/\\/g, "/");
    return scriptDir + "/res/" + fileName;
}

function askParameters()
{
    var dialog = SDialog.New("Import MNT LiDAR HD from cartes.gouv.fr");
    dialog.SetHeader(
        "Downloads elevation tiles from the IGN Geoplateforme (" +
        "<a href=\"https://www.cartes.gouv.fr/\">cartes.gouv.fr</a>) for the area below, " +
        "and builds a 3D point cloud from them in the document.",
        getResourcePath(LOGO_FILE_NAME),
        80
    );

    // saveValue: true - each field keeps its last entered value across sessions.
    dialog.BeginGroup("Southwest corner (WGS 84)");
    dialog.AddAngle({ id: "xmin", name: "Longitude", value: 2.29, min: -180, max: 180, saveValue: true });
    dialog.AddAngle({ id: "ymin", name: "Latitude", value: 48.85, min: -90, max: 90, saveValue: true });

    dialog.BeginGroup("Northeast corner (WGS 84)");
    dialog.AddAngle({ id: "xmax", name: "Longitude", value: 2.31, min: -180, max: 180, saveValue: true });
    dialog.AddAngle({ id: "ymax", name: "Latitude", value: 48.87, min: -90, max: 90, saveValue: true });

    dialog.BeginGroup("Performance");
    dialog.AddInt({ id: "maxConcurrentDownloads", name: "Max parallel downloads", value: 2, min: 1, saveValue: true });

    var res = dialog.Run();
    if (res.ErrorCode !== 0)
    {
        return null;
    }

    return {
        bbox: [res.xmin, res.ymin, res.xmax, res.ymax],
        maxConcurrentDownloads: res.maxConcurrentDownloads
    };
}

// ---------------------------------------------------------------------------
// 2. Listing the tiles on cartes.gouv.fr (Geoplateforme)
// ---------------------------------------------------------------------------

// WFS servers commonly cap the number of features returned per request (this one
// defaults to 20) unless a higher COUNT is requested explicitly. This must stay well
// above the number of 1 km tiles any reasonable bounding box can match.
var WFS_MAX_TILE_COUNT = 2000;

async function listTiles(bbox, tempDir)
{
    var bboxParam = bbox[0] + "," + bbox[1] + "," + bbox[2] + "," + bbox[3] + ",EPSG:4326";
    var url = "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature" +
              "&TYPENAMES=" + encodeURIComponent(WFS_TYPENAME) +
              "&BBOX=" + encodeURIComponent(bboxParam) +
              "&COUNT=" + WFS_MAX_TILE_COUNT +
              "&outputFormat=application/json";

    print("Querying the Geoplateforme WFS (MNT LiDAR HD tiles)...");
    var response = await fetch(url);
    if (!response.ok)
    {
        throw new Error("Failed to query the WFS tile listing (HTTP " + response.status + ").");
    }
    var featureCollection = await response.json();

    // Save the response for inspection/debugging: JSON is still text, so it is
    // compatible with SFile, which only opens in text mode.
    var listingFile = new SFile(tempDir + "/tiles_listing.json");
    if (listingFile.Open(SFile.WriteOnly))
    {
        listingFile.Write(JSON.stringify(featureCollection, null, 2));
        listingFile.Close();
    }

    var features = featureCollection.features || [];

    // Detect silent truncation even with COUNT set (e.g. if the bounding box matches
    // more tiles than WFS_MAX_TILE_COUNT), rather than repeating the same silent
    // under-count.
    var totalMatched = featureCollection.numberMatched !== undefined
        ? featureCollection.numberMatched
        : featureCollection.totalFeatures;
    if (totalMatched !== undefined && totalMatched > features.length)
    {
        print("Warning: the WFS reports " + totalMatched + " matching tile(s) but only " +
              features.length + " were returned (WFS_MAX_TILE_COUNT=" + WFS_MAX_TILE_COUNT +
              "). Increase WFS_MAX_TILE_COUNT or narrow the bounding box.");
    }

    return features.map(function(feature)
    {
        return { name: feature.properties.name, url: feature.properties.url };
    });
}

// ---------------------------------------------------------------------------
// 3-4. Download a tile, decode the GeoTIFF, build the point cloud
// ---------------------------------------------------------------------------

// Serializes access to a critical section across concurrent async callers. Used below
// to avoid calling AddToDoc()/FlushDisplay() concurrently from several in-flight
// tiles at once, which appeared to make some point clouds silently fail to show up
// in the document when many tiles were downloaded in parallel.
var displayLockQueue = Promise.resolve();

function withDisplayLock(action)
{
    var resultPromise = displayLockQueue.then(action);
    displayLockQueue = resultPromise.catch(function() {});
    return resultPromise;
}

function formatByteSize(bytes)
{
    if (bytes < 1024)
    {
        return bytes + " B";
    }
    if (bytes < 1024 * 1024)
    {
        return (bytes / 1024).toFixed(1) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function downloadTileCloud(tile, geotiffModule, index, total)
{
    var label = "[" + (index + 1) + "/" + total + "] " + (tile.name || tile.url);

    print(label + " - downloading...");
    var startTime = Date.now();
    var response = await fetch(tile.url);
    if (!response.ok)
    {
        throw new Error("Download failed (HTTP " + response.status + ").");
    }
    var bytes = await response.arrayBuffer();
    var elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    print(label + " - downloaded " + formatByteSize(bytes.byteLength) + " in " + elapsedSeconds + "s");

    var grid = geotiffModule.readElevationGrid(bytes);
    if (!grid.hasGeoreferencing)
    {
        throw new Error("GeoTIFF file has no georeferencing information.");
    }

    print(label + " - converting to point cloud...");
    var conversionStartTime = Date.now();

    // Sampling step is not exposed as a dialog option here (always 1: every pixel
    // becomes a point) - it stays available as a parameter of forEachPoint() for
    // scripts that need to trade point density for speed.
    var cloud = SCloud.New();
    geotiffModule.forEachPoint(grid, 1, function(x, y, z)
    {
        cloud.AddPoint(new SPoint(x, y, z));
    });

    var conversionSeconds = ((Date.now() - conversionStartTime) / 1000).toFixed(1);
    print(label + " - point cloud ready in " + conversionSeconds + "s");

    // AddToDoc()/FlushDisplay() are serialized across tiles (see withDisplayLock):
    // calling them concurrently from several in-flight tiles appeared to make some
    // clouds silently fail to show up in the document. FlushDisplay() waits for the
    // cloud's optimized structure (computed asynchronously in another thread) so it
    // actually appears now instead of only once the whole script has finished.
    await withDisplayLock(function()
    {
        cloud.SetName("Cloud_" + tile.name);
        cloud.AddToDoc();
        FlushDisplay();
    });

    return cloud;
}

// ---------------------------------------------------------------------------
// 5. Overall orchestration
// ---------------------------------------------------------------------------

/**
 * Runs worker(item, index) over every item, allowing at most `limit` calls to be
 * in flight at once. Results are returned in the same order as items, using the
 * same {status, value}/{status, reason} shape as Promise.allSettled().
 * @param {any[]} items
 * @param {number} limit Max number of concurrent worker() calls.
 * @param {(item: any, index: number) => Promise<any>} worker
 * @returns {Promise<Array<{status: string, value?: any, reason?: any}>>}
 */
async function processWithConcurrencyLimit(items, limit, worker)
{
    var results = new Array(items.length);
    var nextIndex = 0;

    async function runNext()
    {
        while (nextIndex < items.length)
        {
            var currentIndex = nextIndex++;
            try
            {
                var value = await worker(items[currentIndex], currentIndex);
                results[currentIndex] = { status: "fulfilled", value: value };
            }
            catch (err)
            {
                results[currentIndex] = { status: "rejected", reason: err };
            }
        }
    }

    var workerCount = Math.min(limit, items.length);
    var workers = [];
    for (var i = 0; i < workerCount; i++)
    {
        workers.push(runNext());
    }
    await Promise.all(workers);

    return results;
}

async function main()
{
    var params = askParameters();
    if (!params)
    {
        print("Cancelled by the user.");
        return;
    }

    var tempDir = TempPath() + "/" + TEMP_DIR_NAME;
    MkDir(tempDir);

    var tiles = await listTiles(params.bbox, tempDir);
    if (tiles.length === 0)
    {
        print("No MNT LiDAR HD tile found for this bounding box.");
        return;
    }
    print(tiles.length + " tile(s) found.");

    // Dynamic import of the GeoTIFF decoding module (once, cached by the engine).
    var geotiffModule = await import("./modules/geotiff_reader.js");

    // Download and process tiles with at most params.maxConcurrentDownloads in flight
    // at once. Each result keeps the {status, value}/{status, reason} shape of
    // Promise.allSettled() so that a failing tile (network error, unsupported
    // TIFF, ...) does not interrupt the processing of the others.
    var completedCount = 0;
    var total = tiles.length;
    var cloudOutcomes = await processWithConcurrencyLimit(tiles, params.maxConcurrentDownloads, function(tile, index)
    {
        return downloadTileCloud(tile, geotiffModule, index, total).finally(function()
        {
            completedCount++;
            print("Progress: " + completedCount + "/" + total + " tile(s) processed.");
        });
    });

    var successCount = 0;
    for (var i = 0; i < cloudOutcomes.length; i++)
    {
        if (cloudOutcomes[i].status === "fulfilled")
        {
            successCount++;
        }
        else
        {
            print("Tile skipped (" + tiles[i].url + "): " + cloudOutcomes[i].reason);
        }
    }

    ZoomAll();

    if (successCount === 0)
    {
        print("No tile could be processed.");
        return;
    }

    print("Done: " + successCount + " cloud(s) added to the document.");
}

main().catch(function(err)
{
    print("Error: " + err);
});
