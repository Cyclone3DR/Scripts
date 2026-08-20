// Separate Point Cloud by Polyline
// Author: Justin Scholz <jscholz@bcf-engr.com>

// // Cyclone 3DR — Separate points inside & outside a closed polyline (no dialog; keeps BOTH)
// HOW TO USE
//  1) Select ONE point cloud and ONE or MORE polylines (SMultiline). The polylines should be closed.
//  2) Run the script. It will keep BOTH inside and outside, merge results (configurable), and colorize outputs.
//  Justin Scholz 2025-10-02
// CONFIGURATION (edit if desired)
var MERGE_RESULTS  = true;     // merge inside (and/or outside) results across all polylines
var HIDE_SOURCE    = true;     // hide the original cloud after separation
var VERTICAL_PAD   = 1.0;      // extra Z margin added below/above cloud bbox (in working units)

(function(){
  function fail(msg){ throw new Error(msg); }
  function str(v){ return (v===undefined||v===null)?"":String(v); }

  // --- 1) Inputs ---
  var clouds = SCloud.FromSel();
  if (!clouds || clouds.length === 0) fail('Select ONE point cloud and ONE or MORE polylines (SMultiline), then rerun.');
  var cloud = clouds[0];

  var multis = (typeof SMultiline !== 'undefined' && typeof SMultiline.FromSel === 'function') ? SMultiline.FromSel() : [];
  if (!multis || multis.length === 0) fail('No SMultiline selected. Select at least one closed polyline and rerun.');

  // --- 2) Cloud Z extent ---
  var bbox = cloud.GetBoundingBox();
  if (!bbox || bbox.ErrorCode !== 0) fail('Could not read cloud bounding box.');
  var minZ, maxZ;
  if (typeof bbox.LowPoint.z !== 'undefined'){ minZ=bbox.LowPoint.z; maxZ=bbox.UpPoint.z; }
  else if (typeof bbox.LowPoint.Z !== 'undefined'){ minZ=bbox.LowPoint.Z; maxZ=bbox.UpPoint.Z; }
  else if (typeof bbox.LowPoint.GetZ === 'function'){ minZ=bbox.LowPoint.GetZ(); maxZ=bbox.UpPoint.GetZ(); }
  else fail('Could not access Z from bounding box.');

  var pBottom = SPoint.New(0,0, minZ - VERTICAL_PAD);
  var pTop    = SPoint.New(0,0, maxZ + VERTICAL_PAD);
  var dirZ    = SVector.New(0,0,1);

  print('Selected cloud: ' + cloud.GetName());
  print('Selected polylines: ' + multis.length);
  print('Extrusion Z=[' + (minZ - VERTICAL_PAD).toFixed(3) + ', ' + (maxZ + VERTICAL_PAD).toFixed(3) + ']');

  // --- 3) Separate per polyline ---
  var insideParts = [];
  var outsideParts = [];

  for (var i=0;i<multis.length;i++){
    var ml = multis[i];
    try { if (typeof ml.Close === 'function') ml.Close(); } catch(e) {}
    var mlName = ml.GetName ? ml.GetName() : ('Poly_'+(i+1));

    var sep = cloud.Separate(ml, dirZ, pBottom, pTop, SCloud.FILL_ALL);
    if (!sep){ print('WARNING: Separate returned null for ' + mlName); continue; }

    var inCloud  = sep.InCloud  || sep.Inside || sep.InsideCloud  || null;
    var outCloud = sep.OutCloud || sep.Outside|| sep.OutsideCloud || null;

    if (inCloud){
      inCloud.AddToDoc();
      inCloud.SetName(cloud.GetName() + '_Inside_' + mlName);
      try { inCloud.SetCloudRepresentation('Colored'); } catch(e){ try{ inCloud.SetCloudRepresentation(SCloud.CLOUD_COLORED);}catch(_){} }
      if (typeof inCloud.SetColor === 'function') inCloud.SetColor(40,180,75); // green
      insideParts.push(inCloud);
    }
    if (outCloud){
      outCloud.AddToDoc();
      outCloud.SetName(cloud.GetName() + '_Outside_' + mlName);
      try { outCloud.SetCloudRepresentation('Colored'); } catch(e){ try{ outCloud.SetCloudRepresentation(SCloud.CLOUD_COLORED);}catch(_){} }
      if (typeof outCloud.SetColor === 'function') outCloud.SetColor(160,160,160); // gray
      outsideParts.push(outCloud);
    }
  }

  // --- 4) Optional merge ---
  function mergeParts(parts, suffix, color){
    if (!MERGE_RESULTS || !parts || parts.length <= 1) return null;
    var merged = SCloud.Merge(parts);
    merged.AddToDoc();
    merged.SetName(cloud.GetName() + '_' + suffix);
    try { merged.SetCloudRepresentation('Colored'); } catch(e){ try{ merged.SetCloudRepresentation(SCloud.CLOUD_COLORED);}catch(_){} }
    if (typeof merged.SetColor === 'function') merged.SetColor(color[0], color[1], color[2]);
    for (var k=0;k<parts.length;k++){ try{ parts[k].SetVisibility(false);}catch(_){} }
    return merged;
  }

  var mergedInside = mergeParts(insideParts, 'Inside_All', [40,180,75]);
  var mergedOutside= mergeParts(outsideParts,'Outside_All',[160,160,160]);

  if (HIDE_SOURCE) cloud.SetVisibility(false);

  var msg = 'Done. Created ' + insideParts.length + ' inside and ' + outsideParts.length + ' outside cloud(s).';
  if (mergedInside)  msg += ' Merged inside -> ' + mergedInside.GetName() + '.';
  if (mergedOutside) msg += ' Merged outside -> ' + mergedOutside.GetName() + '.';
  print(msg);
})();

