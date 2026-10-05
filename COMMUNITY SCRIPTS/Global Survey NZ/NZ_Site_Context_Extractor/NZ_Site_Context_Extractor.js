// LINZ_Master_Suite.js
// The ultimate automated site context tool for New Zealand Surveyors.
// Fetches Property Boundaries, Aerial Imagery, DEMs, and LiDAR directly into Cyclone 3DR.

// --- NATIONAL COUNCIL OPEN DATA REGISTRY ---
// Add new ArcGIS REST URLs here to expand the script's coverage!
var COUNCIL_REGISTRY = [
    {
        id: "auckland",
        name: "Auckland Council",
        stormwaterUrl: "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Stormwater_Pipe/FeatureServer/0/query",
        wastewaterUrl: null,
        waterUrl: null,
        schema: { diameter: "SW_DIAMETER_MM", usInvert: "SW_INVERT_LEVEL_US_M_NZVD2016", dsInvert: "SW_INVERT_LEVEL_DS_M_NZVD2016", depth: null, type: "SW_ASSET_TYPE" }
    },
    {
        id: "canterbury",
        name: "Canterbury Maps",
        stormwaterUrl: "https://services1.arcgis.com/RNxkQaMWQcgbiF98/arcgis/rest/services/Canterbury_Three_Waters_Data_2_view/FeatureServer/3/query",
        wastewaterUrl: "https://services1.arcgis.com/RNxkQaMWQcgbiF98/arcgis/rest/services/Canterbury_Three_Waters_Data_2_view/FeatureServer/4/query",
        waterUrl: "https://services1.arcgis.com/RNxkQaMWQcgbiF98/arcgis/rest/services/Canterbury_Three_Waters_Data_2_view/FeatureServer/5/query",
        schema: { diameter: "Diameter", usInvert: null, dsInvert: null, depth: "Depth", type: "Type" }
    },
    {
        id: "waimakariri",
        name: "Waimakariri District (Kaiapoi)",
        stormwaterUrl: "https://gisservices.waimakariri.govt.nz/arcgis/rest/services/3Waters/Assets_Stormwater/MapServer/12/query",
        wastewaterUrl: "https://gisservices.waimakariri.govt.nz/arcgis/rest/services/3Waters/Assets_Wastewater/MapServer/12/query",
        waterUrl: "https://gisservices.waimakariri.govt.nz/arcgis/rest/services/3Waters/Assets_Water_Supply/MapServer/10/query",
        schema: { diameter: "DIAMETER_mm", usInvert: "UPSTREAM_RL_m", dsInvert: "DOWNSTREAM_RL_m", depth: "UPSTREAM_DEPTH_m", type: "FA_CLASSIFICATION" }
    },
    {
        id: "wellington",
        name: "Wellington Water (Wellington, Hutt, Porirua)",
        stormwaterUrl: "https://services7.arcgis.com/2ECs938g489DMWjt/arcgis/rest/services/Regional_Stormwater_Pipes/FeatureServer/0/query",
        wastewaterUrl: "https://services7.arcgis.com/2ECs938g489DMWjt/arcgis/rest/services/Regional_Wastewater_Pipes/FeatureServer/0/query",
        waterUrl: "https://services7.arcgis.com/2ECs938g489DMWjt/arcgis/rest/services/Regional_Water_Pipes/FeatureServer/0/query",
        schema: { diameter: "diameter_mm", usInvert: "us_invert_level_m", dsInvert: "ds_invert_level_m", depth: "us_depth_from_cover_m", type: "system_type" }
    },
    {
        id: "hamilton",
        name: "Hamilton City Council",
        stormwaterUrl: "https://services1.arcgis.com/R6s0QqCMQdwKY6yp/arcgis/rest/services/Stormwater%20Dataset%20-%20Hamilton%20City%20Council/FeatureServer/4/query",
        wastewaterUrl: "https://services1.arcgis.com/R6s0QqCMQdwKY6yp/arcgis/rest/services/Wastewater%20Dataset%20-%20Hamilton%20City%20Council/FeatureServer/0/query",
        waterUrl: "https://services1.arcgis.com/R6s0QqCMQdwKY6yp/arcgis/rest/services/Freshwater%20Dataset%20-%20Hamilton%20City%20Council/FeatureServer/11/query",
        schema: { diameter: "Diameter_mm", usInvert: "Upstream_Invert_Level_m", dsInvert: "Downstream_Invert_Level_m", depth: null, type: "Main_Line_Type" }
    },
    {
        id: "nelson",
        name: "Nelson City Council (Top of the South Maps)",
        stormwaterUrl: "https://www.topofthesouthmaps.co.nz/arcgis/rest/services/DataServices/MapServer/7/query",
        wastewaterUrl: "https://www.topofthesouthmaps.co.nz/arcgis/rest/services/DataServices/MapServer/6/query",
        waterUrl: "https://www.topofthesouthmaps.co.nz/arcgis/rest/services/DataServices/MapServer/5/query",
        schema: { diameter: "Diameter", usInvert: null, dsInvert: null, depth: null, type: "Type" }
    },
    {
        id: "gisborne",
        name: "Gisborne District Council",
        stormwaterUrl: "https://maps.gdc.govt.nz/hosting/rest/services/GDC_Utilities/utilities_stormwater_ext/MapServer/1/query",
        wastewaterUrl: "https://maps.gdc.govt.nz/hosting/rest/services/GDC_Utilities/utilities_wastewater_ext/MapServer/2/query",
        waterUrl: "https://maps.gdc.govt.nz/hosting/rest/services/GDC_Utilities/utilities_water_ext/MapServer/3/query",
        schema: { diameter: "DIAM", usInvert: null, dsInvert: null, depth: null, type: "PIPETYPE" }
    },
    {
        id: "southland",
        name: "Southland Region (Invercargill & Gore)",
        stormwaterUrl: "https://services3.arcgis.com/v5RzLI7nHYeFImL4/arcgis/rest/services/SouthlandStormwaterLines/FeatureServer/0/query",
        wastewaterUrl: "https://services3.arcgis.com/v5RzLI7nHYeFImL4/arcgis/rest/services/SouthlandWastewaterPipes/FeatureServer/0/query",
        waterUrl: "https://services3.arcgis.com/v5RzLI7nHYeFImL4/arcgis/rest/services/SouthlandWaterSupplyPipes/FeatureServer/0/query",
        schema: { diameter: "Diameter", usInvert: null, dsInvert: null, depth: null, type: "Type" }
    }
];

function main() {
    print("========================================");
    print("       LINZ MASTER SUITE INITIALIZING   ");
    print("========================================");

    // 1. Pre-calculate Bounding Box so we can display it in the GUI
    var clouds = SCloud.FromSel();
    if (clouds.length === 0) clouds = SCloud.All();
    
    var bboxStr = "No point cloud loaded. Cannot extract extents.";
    var minPt, maxPt, drawHeight;
    var hasBbox = false;
    
    if (clouds.length > 0) {
        var clipBox = SClippingBox.New([clouds[0]]);
        minPt = clipBox.GetLowerPoint();
        maxPt = clipBox.GetUpperPoint();
        
        var pad = 50; // default 50m for OpenTopography display
        var pMinX = minPt.GetX() - pad;
        var pMinY = minPt.GetY() - pad;
        var pMaxX = maxPt.GetX() + pad;
        var pMaxY = maxPt.GetY() + pad;
        drawHeight = minPt.GetZ();
        
        bboxStr = "Xmin: " + pMinX.toFixed(2) + "   Ymin: " + pMinY.toFixed(2) + "\nXmax: " + pMaxX.toFixed(2) + "   Ymax: " + pMaxY.toFixed(2);
        hasBbox = true;
    }

    // 2. Build GUI
    var gui = SDialog.New("LINZ & Council GIS Master Suite");
    
    gui.BeginGroup("Site Bounding Box (NZTM2000)");
    gui.AddText("Extracted from your active point cloud:", SDialog.Instruction);
    gui.AddText(bboxStr);

    var DEFAULT_API_KEY = "cd9917d8d3554c078ddfb7bbf5f92d8c";
    gui.BeginGroup("Automated Site Data (Requires Point Cloud)");
    gui.AddText("DISCLAIMER: Utilities lacking surveyed depths are drawn 1.5m below surface.\nAlways verify locations via BeforeUdig before excavation.", SDialog.Warning);
    gui.AddTextField({id: "apiKey", name: "LINZ API Key", value: DEFAULT_API_KEY});
    gui.AddInt({id: "padding", name: "Buffer Radius around site (meters)", value: 30, min: 0, max: 500});
    gui.AddBoolean({id: "chkParcels", name: "Fetch Property Boundaries & Labels", value: true});
    gui.AddBoolean({id: "chkBuildings", name: "Fetch Building Outlines", value: true});
    gui.AddBoolean({id: "chkStormwater", name: "Fetch Stormwater Pipes (Dark Green)", value: true});
    gui.AddBoolean({id: "chkWastewater", name: "Fetch Wastewater Pipes (Red)", value: true});
    gui.AddBoolean({id: "chkWater", name: "Fetch Drinking Water Pipes (Blue)", value: true});
    gui.AddBoolean({id: "chkTestConnections", name: "TEST SERVER CONNECTIONS ONLY (Skip import)", value: false});

    var res = gui.Run();
    if (res.ErrorCode !== 0) {
        print("Cancelled by user.");
        return;
    }

    // Build configuration object
    var config = {
        apiKey: res.apiKey.trim(),
        fetchParcels: res.chkParcels,
        fetchBuildings: res.chkBuildings,
        fetchStormwater: res.chkStormwater,
        fetchWastewater: res.chkWastewater,
        fetchWater: res.chkWater,
        testConnections: res.chkTestConnections,
        padding: res.padding,
        // Hardcoded LINZ Layer IDs
        LAYER_PARCELS: "50772",
        LAYER_BUILDINGS: "101290"
    };

    if (config.testConnections) {
        RunConnectionTest();
        return;
    }

    if (config.apiKey === "") {
        SDialog.Message("Please provide a valid LINZ API Key.", SDialog.Error);
        return;
    }
    
    var needsBbox = config.fetchParcels || config.fetchBuildings || config.fetchStormwater;
    if (needsBbox && !hasBbox) {
        SDialog.Message("You must have a point cloud loaded to fetch boundaries/buildings/pipes (so we know where you are!).", SDialog.Warning);
        return;
    }

    // Recalculate BBox with User Padding
    var fetchMinX = minPt.GetX() - config.padding;
    var fetchMinY = minPt.GetY() - config.padding;
    var fetchMaxX = maxPt.GetX() + config.padding;
    var fetchMaxY = maxPt.GetY() + config.padding;

    RunLinzLogic(config, fetchMinX, fetchMinY, fetchMaxX, fetchMaxY, drawHeight);
}

function RunLinzLogic(config, minX, minY, maxX, maxY, drawHeight) {
    // 2. Setup Background PowerShell Queue
    var tempFolder = "C:/temp/linz_suite_" + (new Date()).getTime() + "/";
    try {
        var dirInit = new SFile(tempFolder + "_init.txt");
        dirInit.Open(SFile.OpenModeEnum.WriteOnly);
        dirInit.Close();
    } catch(e) {}

    var psCode = "";
    psCode += "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12\n";
    psCode += "Write-Host '========================================'\n";
    psCode += "Write-Host '    LINZ MASTER SUITE DOWNLOADING...    '\n";
    psCode += "Write-Host '========================================'\n";

    var tasks = [];

    // --- PROPERTY BOUNDARIES ---
    if (config.fetchParcels) {
        var cqlFilter = "BBOX(shape," + minX.toFixed(2) + "," + minY.toFixed(2) + "," + maxX.toFixed(2) + "," + maxY.toFixed(2) + ",'EPSG:2193')";
        var urlWFS = "https://data.linz.govt.nz/services;key=" + config.apiKey + "/wfs" +
                     "?service=WFS&version=2.0.0&request=GetFeature&typeNames=layer-" + config.LAYER_PARCELS +
                     "&outputFormat=application/json&srsName=EPSG:2193&cql_filter=" + cqlFilter;
        
        var jsonPath = tempFolder + "parcels.json";
        tasks.push({type: "parcels", path: jsonPath});

        psCode += "Write-Host '-> Fetching Property Boundaries...'\n";
        psCode += "try {\n";
        psCode += "    $resp = Invoke-RestMethod -Uri \"" + urlWFS + "\" -Method Get\n";
        psCode += "    $resp | ConvertTo-Json -Depth 10 | Out-File -FilePath '" + jsonPath.replace(/\//g, "\\") + "' -Encoding utf8\n";
        psCode += "} catch { Write-Error $_.Exception.Message }\n";
    }

    // --- BUILDING OUTLINES ---
    if (config.fetchBuildings) {
        var cqlFilter = "BBOX(shape," + minX.toFixed(2) + "," + minY.toFixed(2) + "," + maxX.toFixed(2) + "," + maxY.toFixed(2) + ",'EPSG:2193')";
        var urlWFS = "https://data.linz.govt.nz/services;key=" + config.apiKey + "/wfs" +
                     "?service=WFS&version=2.0.0&request=GetFeature&typeNames=layer-" + config.LAYER_BUILDINGS +
                     "&outputFormat=application/json&srsName=EPSG:2193&cql_filter=" + cqlFilter;
        
        var jsonPath = tempFolder + "buildings.json";
        tasks.push({type: "buildings", path: jsonPath});

        psCode += "Write-Host '-> Fetching Building Outlines...'\n";
        psCode += "try {\n";
        psCode += "    $resp = Invoke-RestMethod -Uri \"" + urlWFS + "\" -Method Get\n";
        psCode += "    $resp | ConvertTo-Json -Depth 10 | Out-File -FilePath '" + jsonPath.replace(/\//g, "\\") + "' -Encoding utf8\n";
        psCode += "} catch { Write-Error $_.Exception.Message }\n";
    }

    // --- UTILITIES (DYNAMIC COUNCIL REGISTRY) ---
    var utilityTasks = [];
    
    if (config.fetchStormwater || config.fetchWastewater || config.fetchWater) {
        psCode += "Write-Host '-> Fetching Underground Utilities from Council Registry...'\n";
        
        for (var i = 0; i < COUNCIL_REGISTRY.length; i++) {
            var council = COUNCIL_REGISTRY[i];
            var bboxQs = "?f=geojson&geometry=" + minX.toFixed(2) + "," + minY.toFixed(2) + "," + maxX.toFixed(2) + "," + maxY.toFixed(2) +
                         "&geometryType=esriGeometryEnvelope&inSR=2193&outSR=2193&outFields=*";
            
            var fetchList = [];
            if (config.fetchStormwater && council.stormwaterUrl) fetchList.push({type: "Stormwater", url: council.stormwaterUrl + bboxQs});
            if (config.fetchWastewater && council.wastewaterUrl) fetchList.push({type: "Wastewater", url: council.wastewaterUrl + bboxQs});
            if (config.fetchWater && council.waterUrl) fetchList.push({type: "Water", url: council.waterUrl + bboxQs});
            
            for (var u = 0; u < fetchList.length; u++) {
                var ut = fetchList[u];
                var jsonPath = tempFolder + ut.type.toLowerCase() + "_" + council.id + ".json";
                utilityTasks.push({ path: jsonPath, schema: council.schema, name: council.name, utilityType: ut.type });
                
                psCode += "try {\n";
                psCode += "    $resp = Invoke-RestMethod -Uri \"" + ut.url + "\" -Method Get\n";
                psCode += "    $resp | ConvertTo-Json -Depth 10 | Out-File -FilePath '" + jsonPath.replace(/\//g, "\\") + "' -Encoding utf8\n";
                psCode += "} catch { Write-Error $_.Exception.Message }\n";
            }
        }
    }
    
    if (utilityTasks.length > 0) {
        tasks.push({type: "utilities", councils: utilityTasks});
    }



    // 3. Execute Background Worker
    psCode += "Write-Host '========================================'\n";
    psCode += "Write-Host '    PROCESS COMPLETE! RETURNING TO 3DR  '\n";
    psCode += "Write-Host '========================================'\n";
    psCode += "Start-Sleep -Seconds 2\n";

    var ps1Path = tempFolder + "worker.ps1";
    var file = new SFile(ps1Path);
    file.Open(SFile.OpenModeEnum.WriteOnly);
    file.Write(psCode);
    file.Close();

    print("Launching Background Worker. 3DR will wait until downloads finish...");
    var powershellExec = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    Execute("cmd.exe", ["/c", "start", "/wait", "LINZ Master Suite", powershellExec, "-ExecutionPolicy", "Bypass", "-File", ps1Path.replace(/\//g, "\\")]);
    print("Background Worker Closed. Processing downloaded files...");

    // 4. Process Results in 3DR
    var resultsMsg = "";
    var successCount = 0;

    for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];

        if (t.type === "parcels") {
            var jsonFile = new SFile(t.path);
            if (jsonFile.Exists()) {
                jsonFile.Open(SFile.OpenModeEnum.ReadOnly);
                var rawJson = jsonFile.ReadAll();
                jsonFile.Close();
                try {
                    var data = JSON.parse(rawJson);
                    var features = data.features;
                        if (features && features.length > 0) {
                            var drawnCount = 0;
                            for (var f = 0; f < features.length; f++) {
                                var geom = features[f].geometry;
                                if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;
                                var polygons = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
                                for (var p = 0; p < polygons.length; p++) {
                                    var outerRing = polygons[p][0];
                                    var pts = [];
                                    for (var c = 0; c < outerRing.length; c++) pts.push(SPoint.New(outerRing[c][0], outerRing[c][1], drawHeight));
                                        if (pts.length >= 3) {
                                            var poly = SMultiline.New();
                                            
                                            var props = features[f].properties;
                                            var parcelName = "";
                                            if (props) {
                                                if (props.appellation) parcelName += props.appellation;
                                                if (props.titles) parcelName += " (Title: " + props.titles + ")";
                                            }
                                            if (parcelName === "") parcelName = "Parcel_" + (props ? props.id : f);
                                            
                                            poly.SetName(parcelName);
                                            poly.SetColors(0, 255, 0);
                                            
                                            var sumX = 0, sumY = 0;
                                            for(var p_i = 0; p_i < pts.length; p_i++) {
                                                poly.InsertLast(pts[p_i], 0.00001);
                                                sumX += pts[p_i].GetX();
                                                sumY += pts[p_i].GetY();
                                            }
                                            poly.InsertLast(pts[0], 0.00001);
                                            poly.AddToDoc();
                                            
                                            // Create a Centroid Point specifically for perfectly centered labeling
                                            var centroidPt = SPoint.New(sumX / pts.length, sumY / pts.length, drawHeight);
                                            centroidPt.SetName(parcelName);
                                            centroidPt.SetColors(0, 255, 0);
                                            centroidPt.AddToDoc();
                                            
                                            drawnCount++;
                                        }
                                }
                            }
                            resultsMsg += "- Imported " + features.length + " Property Boundaries (" + drawnCount + " polygons).\n";
                            successCount++;
                        } else {
                            resultsMsg += "WARNING: 0 Property Boundaries found.\n";
                            resultsMsg += "   -> Your cloud may NOT be in NZTM2000! (Detected X: " + minX.toFixed(0) + ", Y: " + minY.toFixed(0) + ")\n";
                        }
                    } catch(e) { print("Error parsing parcels: " + e); }
                } else {
                    resultsMsg += "ERROR: Failed to download Property Boundaries.\n";
                }
            }
            else if (t.type === "buildings") {
                var jsonFile = new SFile(t.path);
                if (jsonFile.Exists()) {
                    jsonFile.Open(SFile.OpenModeEnum.ReadOnly);
                    var rawJson = jsonFile.ReadAll();
                    jsonFile.Close();
                    
                    try {
                        var data = JSON.parse(rawJson);
                        var features = data.features;
                        if (features && features.length > 0) {
                            var drawnCount = 0;
                            for (var f = 0; f < features.length; f++) {
                                var geom = features[f].geometry;
                                if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;
                                var polygons = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
                                for (var p = 0; p < polygons.length; p++) {
                                    var outerRing = polygons[p][0];
                                    var pts = [];
                                    for (var c = 0; c < outerRing.length; c++) pts.push(SPoint.New(outerRing[c][0], outerRing[c][1], drawHeight));
                                    if (pts.length >= 3) {
                                        var poly = SMultiline.New();
                                        poly.SetName("Building_" + (features[f].properties.id || f));
                                        poly.SetColors(255, 128, 0); // Orange
                                        for(var p_i = 0; p_i < pts.length; p_i++) poly.InsertLast(pts[p_i], 0.00001);
                                        poly.InsertLast(pts[0], 0.00001);
                                        poly.AddToDoc();
                                        drawnCount++;
                                    }
                                }
                            }
                            resultsMsg += "- Imported " + features.length + " Building Outlines (" + drawnCount + " polygons).\n";
                            successCount++;
                        }
                    } catch(e) { print("Error parsing buildings: " + e); }
                } else {
                    resultsMsg += "ERROR: Failed to download Building Outlines.\n";
                }
            }
            else if (t.type === "utilities") {
                var totalStorm = 0, totalWaste = 0, totalWater = 0;
                var hitCouncils = {};
                
                for (var i = 0; i < t.councils.length; i++) {
                    var councilTask = t.councils[i];
                    var jsonFile = new SFile(councilTask.path);
                    if (jsonFile.Exists()) {
                        jsonFile.Open(SFile.OpenModeEnum.ReadOnly);
                        var rawJson = jsonFile.ReadAll();
                        jsonFile.Close();
                        
                        try {
                            var features = JSON.parse(rawJson).features || [];
                            if (features.length > 0) {
                                hitCouncils[councilTask.name] = true;
                                for (var f = 0; f < features.length; f++) {
                                    var geom = features[f].geometry;
                                    if (!geom || geom.type !== "LineString") continue;
                                    
                                    var props = features[f].properties;
                                    var schema = councilTask.schema;
                                    
                                    var parseVal = function(v) {
                                        if (v === null || v === undefined || v === " ") return null;
                                        var num = parseFloat(v);
                                        if (isNaN(num) || Math.abs(num) === 999 || num === 0) return null;
                                        return num;
                                    };
                                    
                                    var diamRaw = props[schema.diameter] || props["PIPEDIAM"] || props["DIAMETER"] || props["DIAM"] || props["Diameter"];
                                    var diameter = (parseVal(diamRaw) || 150) / 1000.0;
                                    var radius = diameter / 2.0;
                                    
                                    var usInvert = schema.usInvert ? parseVal(props[schema.usInvert]) : null;
                                    var dsInvert = schema.dsInvert ? parseVal(props[schema.dsInvert]) : null;
                                    var depth = schema.depth ? parseVal(props[schema.depth]) : null;
                                    
                                    var hasUsInvert = (usInvert !== null);
                                    var hasDsInvert = (dsInvert !== null);
                                    var hasDepth = (depth !== null);
                                    
                                    if (!hasUsInvert) usInvert = hasDepth ? drawHeight - depth : drawHeight - 1.5;
                                    if (!hasDsInvert) dsInvert = hasDepth ? drawHeight - depth : drawHeight - 1.5;
                                    
                                    var coords = geom.coordinates;
                                    for (var c = 0; c < coords.length - 1; c++) {
                                        var fractionStart = c / (coords.length - 1);
                                        var fractionEnd = (c + 1) / (coords.length - 1);
                                        var zStart = usInvert - (usInvert - dsInvert) * fractionStart;
                                        var zEnd = usInvert - (usInvert - dsInvert) * fractionEnd;
                                        
                                        var pStart = SPoint.New(coords[c][0], coords[c][1], zStart);
                                        var pEnd = SPoint.New(coords[c+1][0], coords[c+1][1], zEnd);
                                        
                                        var dx = pEnd.GetX() - pStart.GetX();
                                        var dy = pEnd.GetY() - pStart.GetY();
                                        var dz = pEnd.GetZ() - pStart.GetZ();
                                        var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                                        
                                        if (len > 0.01) {
                                            var normal = SVector.New(dx/len, dy/len, dz/len);
                                            var pipe = SCylinder.New(pStart, normal, radius, len);
                                            var typeName = props[schema.type] || councilTask.utilityType;
                                            var labelName = typeName + " " + (diameter*1000) + "mm";
                                            pipe.SetName(labelName);
                                            
                                            // Set color based on utility type
                                            if (councilTask.utilityType === "Stormwater") { pipe.SetColors(0, 128, 0); totalStorm++; } // Dark Green
                                            else if (councilTask.utilityType === "Wastewater") { pipe.SetColors(200, 0, 0); totalWaste++; } // Deep Red
                                            else if (councilTask.utilityType === "Water") { pipe.SetColors(0, 0, 255); totalWater++; } // Pure Blue
                                            else pipe.SetColors(150, 150, 150);
                                            
                                            pipe.AddToDoc();
                                        }
                                    }
                                }
                            }
                        } catch(e) { print("Error parsing " + councilTask.utilityType + " for " + councilTask.name + ": " + e); }
                    }
                }
                
                var tCount = totalStorm + totalWaste + totalWater;
                if (tCount > 0) {
                    var councilNames = [];
                    for (var cName in hitCouncils) councilNames.push(cName);
                    
                    resultsMsg += "- Imported Utilities (from " + councilNames.join(", ") + "):\n";
                    if (totalStorm > 0) resultsMsg += "    -> " + totalStorm + " Stormwater Pipes\n";
                    if (totalWaste > 0) resultsMsg += "    -> " + totalWaste + " Wastewater Pipes\n";
                    if (totalWater > 0) resultsMsg += "    -> " + totalWater + " Drinking Water Pipes\n";
                    successCount++;
                } else {
                    resultsMsg += "WARNING: 0 Utilities found in this area.\n";
                }
            }

        }

    if (successCount > 0) {
        if (config.fetchStormwater || config.fetchWastewater || config.fetchWater) {
            resultsMsg += "\n====================================\nDISCLAIMER: Utilities lacking surveyed depths are drawn 1.5m below surface. Not for engineering design. Always verify with BeforeUdig prior to excavation.\n====================================";
        }
        SDialog.Message("LINZ Master Suite finished!\n\n" + resultsMsg, SDialog.Success);
        return true;
    } else {
        print("Master Suite completed with 0 successful imports.");
        if (resultsMsg !== "") {
            SDialog.Message("Master Suite completed, but no files were imported. See breakdown:\n\n" + resultsMsg, SDialog.Warning);
        }
        return false;
    }
}

function RunConnectionTest() {
    print("========================================");
    print("      TESTING COUNCIL CONNECTIONS       ");
    print("========================================");
    
    var tempFolder = "C:/temp/linz_suite_" + (new Date()).getTime() + "/";
    var dir = new SFile(tempFolder + "_init.txt");
    dir.Open(SFile.OpenModeEnum.WriteOnly); dir.Close();

    var psCode = "";
    psCode += "$ErrorActionPreference = 'Stop'\n";
    psCode += "Write-Host 'Pinging Council Databases...'\n";
    
    var resultsPath = tempFolder + "ping_results.txt";
    
    for (var i = 0; i < COUNCIL_REGISTRY.length; i++) {
        var council = COUNCIL_REGISTRY[i];
        
        var testEndpoints = [];
        if (council.stormwaterUrl) testEndpoints.push({name: council.name + " (Stormwater)", url: council.stormwaterUrl});
        if (council.wastewaterUrl) testEndpoints.push({name: council.name + " (Wastewater)", url: council.wastewaterUrl});
        if (council.waterUrl) testEndpoints.push({name: council.name + " (Drinking Water)", url: council.waterUrl});
        
        for (var e = 0; e < testEndpoints.length; e++) {
            var ep = testEndpoints[e];
            var testUrl = ep.url + "?f=json&where=1%3D1&returnGeometry=false&outFields=*&resultRecordCount=1";
            psCode += "try {\n";
            psCode += "    $resp = Invoke-RestMethod -Uri \"" + testUrl + "\" -Method Get\n";
            psCode += "    if ($resp.features -or $resp.fields) { Add-Content -Path '" + resultsPath.replace(/\//g, "\\") + "' -Value '[OK] " + ep.name + "' }\n";
            psCode += "    else { Add-Content -Path '" + resultsPath.replace(/\//g, "\\") + "' -Value '[FAILED - NO FEATURES FORMAT] " + ep.name + "' }\n";
            psCode += "} catch {\n";
            psCode += "    Add-Content -Path '" + resultsPath.replace(/\//g, "\\") + "' -Value ('[FAILED - ' + $_.Exception.Message + '] " + ep.name + "')\n";
            psCode += "}\n";
        }
    }
    
    var psPath = tempFolder + "ping.ps1";
    var psFile = new SFile(psPath);
    psFile.Open(SFile.OpenModeEnum.WriteOnly);
    psFile.Write(psCode);
    psFile.Close();
    
    print("Testing connections in background (this may take a moment)...");
    var powershellExec = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    Execute("cmd.exe", ["/c", "start", "/wait", "Council Connection Test", powershellExec, "-ExecutionPolicy", "Bypass", "-File", psPath.replace(/\//g, "\\")]);
    
    var resultsFile = new SFile(resultsPath);
    if (resultsFile.Exists()) {
        resultsFile.Open(SFile.OpenModeEnum.ReadOnly);
        var txt = resultsFile.ReadAll();
        resultsFile.Close();
        SDialog.Message("Council Registry Connection Test:\n\n" + txt, SDialog.Info);
    } else {
        SDialog.Message("Connection test failed to execute.", SDialog.Error);
    }
}

// Call main only if we aren't testing headless
if (typeof TESTING_HEADLESS === 'undefined') {
    main();
}
