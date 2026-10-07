# Swisstopo Data Download for Cyclone 3DR

Downloads official swisstopo elevation data into the document, for a chosen area of interest. The comparison itself is then done manually with Cyclone 3DR's own inspection tools (e.g. Analyze > Compare/Inspect), which keeps the workflow simple and gives full control over method, direction and tolerance.

| Script info |  |
| -------- | ------- |
| Contact | Jan Sigrist, Bimatic GmbH |
| Email | jan.sigrist@bimatic.ch |

## Description

**Area of interest** - two modes:

| Mode | Behavior |
|---|---|
| **Bounding box of all visible elements** | Union bounding box of everything currently visible in the document, expanded by a buffer. |
| **Along / inside the selected polyline** | Select exactly one polyline before running. An **open** polyline acts as a corridor (buffer = half corridor width): only tiles the line actually passes are downloaded, so a diagonal corridor does not pull in its whole bounding box (verified: a 5 km diagonal across a 5x5 km tile grid selects 9 tiles instead of 25). A **closed** polyline additionally includes all tiles whose center lies inside the contour. |

**Data sources**, via the official swisstopo STAC API (`data.geo.admin.ch`), always resolving the newest available survey year per 1 km² tile automatically:

| Source | Content | Format | Typical tile size |
|---|---|---|---|
| swissSURFACE3D - ground points | Classified airborne LiDAR, class 2 (ground) only | LAS (zipped) | ~130 MB per km² |
| swissSURFACE3D - all classes | Classified airborne LiDAR, unfiltered | LAS (zipped) | ~130 MB per km² |
| swissALTI3D 0.5 m | Terrain model raster (DTM) | XYZ ASCII (zipped) | ~25 MB per km², 4 million points |
| swissALTI3D 2 m | Terrain model raster (DTM) | XYZ ASCII (zipped) | ~1 MB per km², 250 000 points |

**Precise clipping**: every imported tile is clipped to the exact chosen footprint (not just whichever whole 1x1 km tiles it happens to touch) using 2D polygon fencing extruded along Z, so point elevation never affects the cut. Verified pixel-exact against the raster grid: a 400x400 m bounding box yields exactly 40 000 points on the 2 m grid; a 200x200 m closed contour with a 50 m buffer yields exactly 22 500.

**Practical touches**: a persistent on-disk tile cache so re-runs cost no bandwidth; a size-estimate warning before pulling multiple uncached swissSURFACE3D tiles; automatic cloud-to-cloud comparison basis for swissSURFACE3D (meshing raw LiDAR at that density takes minutes to hours for no accuracy gain, so it is not attempted) with an optional 2.5D mesh for the raster sources; merged or per-tile output.

## Tested version

- Cyclone 3DR 2026.1.2.50530 (headless end-to-end: STAC query, corridor tile filter, cached download, import, area clipping, merge, meshing, error paths)
- Should run on Cyclone 3DR 2025.2 or newer (uses `SFile.ListEntries` and `AddFileSelector`, both available since 2025.2; no dependency on the 2026.1.2 `fetch()` runtime)

## Licensing

Free to use and adapt, no warranty. Compatible with any Cyclone 3DR edition (Standard, Survey, Advanced).

## Usage

1. Run the script.
2. Choose the area of interest (bounding box, or select a polyline first for the corridor / area mode) and a buffer.
3. Choose the data source and, optionally, a per-tile point limit (0 = all points, recommended).
4. Choose whether to clip to the exact area, merge tiles into one cloud, and create a 2.5D mesh.
5. Point cloud(s) - and optionally a mesh - are added to the document under `Swisstopo Data/<source>`. Run the comparison manually from there.

### Runtime expectations (measured on 9 tiles / 3x3 km)

| Step | swissALTI3D 2 m | swissSURFACE3D |
|---|---|---|
| Download (first run only) | seconds (~1 MB/tile) | ~2 min (~130 MB/tile) |
| Import | seconds | ~30-60 s per tile |
| Clip / merge / mesh | seconds | seconds to a few minutes |

The GUI is unresponsive during downloads and imports (they run synchronously); progress is printed to the script console. A run touching more than 2 uncached swissSURFACE3D tiles asks for confirmation with a download size estimate. On repeated runs the cache makes the download step free.

## Requirements

- Cyclone 3DR 2025.2 or newer
- Internet access to `data.geo.admin.ch`
- `curl` and `tar` (built into Windows 10/11) for downloading and unzipping tiles
- Project georeferenced in LV95 / EPSG:2056 (the script validates the area and reports it clearly if not)

## Troubleshooting

| Problem | Solution |
|---|---|
| "No visible elements found" | Make at least one cloud, mesh or line visible, or use the polyline area selection |
| "Please select exactly ONE polyline" | Select a single SMultiline before choosing the polyline area mode |
| "No tiles found for this area" | Confirm the area lies within Switzerland / swisstopo's data coverage |
| Download failed | Check internet connection / firewall / proxy for curl |
| "No points remain after clipping" | Increase the buffer, or check the area / polyline placement |

## Interpreting results

- Reference = the downloaded swisstopo data, measured object = your project cloud.
- swissALTI3D is a terrain model: buildings and vegetation in your cloud deviate from it by design.
- swissSURFACE3D class 2 has no points on water surfaces.
- The tile survey year is part of each cloud's name; terrain changes since the flight appear as real deviations.

## Files

- Main script: [Swisstopo Data Download.js](./Swisstopo%20Data%20Download.js)

## Version history

- **2026-09-01**: initial release

## License and attribution

- Data source: (c) swisstopo - Swiss Federal Office of Topography
- API: `data.geo.admin.ch` STAC API
- Coordinate system: LV95 (EPSG:2056), height datum LN02
- Platform: Leica Cyclone 3DR
