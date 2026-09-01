# Swisstopo Systematic Point Cloud Validation

**Grid-based point cloud validation for Cyclone 3DR** - checks a whole point cloud against official swisstopo reference heights instead of sampling single points.

| Script info |  |
| -------- | ------- |
| Contact | Jan Sigrist, Bimatic GmbH |
| Email | jan.sigrist@bimatic.ch |

## Description

Walks a regular grid across a point cloud's footprint and checks the local height against the official swisstopo height API at every cell. Designed for validating a scan or model systematically rather than spot-checking it, with color-coded labels, a classification summary and an optional CSV report.

**Deutsch:** Systematische Rastervalidierung einer Punktwolke gegen offizielle Swisstopo-Referenzhöhen, statt einzelner Stichproben. Farbcodierte Labels, Klassifikationsübersicht und optionaler CSV-Bericht.

### What's new (2026-09-01)

- **Correctness fix - the false "no data" result**: the previous version centred its point-cloud search cylinder on the value it got back from the swisstopo API, before it knew the cloud's actual height. A real elevation defect larger than roughly the cylinder's half-height (2.5 m) made the cylinder miss the point-cloud data entirely, so the cell was reported as `NO_DATA` instead of `FAILED`. The cloud's local height is now measured first, with a search cylinder spanning the full vertical extent of the data at that cell, closing that blind spot completely.
- **Cloud before network**: measuring the point cloud now happens before any API call, so grid cells with no cloud coverage generate zero network traffic.
- **Batched reference lookups**: reference heights are resolved in batches of up to 40 points through a single curl process (`--parallel`, 8 concurrent transfers, 30 s per-transfer timeout) instead of one process per point. Measured: 99 grid points resolved in about 1.5 seconds with zero failed lookups.
- **Automatic retry**: after the batched pass, a single-request retry pass mops up anything that is still missing.
- **Actionable diagnostics**: if `API_FAILED` rows remain, the summary reports how many were transfer errors versus bad responses, plus the last error text, instead of a bare failure count.
- **Coordinate guardrail**: the point cloud's LV95 position is validated before the run starts.
- **Bilingual dialogs**: field names, tooltips and the summary dialog are English / German.
- **Reliable transport**: all requests go through curl instead of the engine's `fetch()` API, which intermittently fails inside the GUI process with an SSL certificate-chain error when calling `api3.geo.admin.ch`.
- **Readable failures**: every error names the step it happened in, and the message is never blank.

## Tested version

- Cyclone 3DR 2026.1.2.50530 (headless and interactive)
- Should run on Cyclone 3DR 2025.1 or newer (no dependency on the 2026.1.2 `fetch()` runtime)

## Licensing

Free to use and adapt, no warranty. Compatible with any Cyclone 3DR edition (Standard, Survey, Advanced).

## Usage

1. Import and select the point cloud(s) to validate. Coordinate system must be **LV95 (EPSG:2056)**.
2. Run the script and configure:
   - **Grid spacing**: distance between validation points (default 20 m)
   - **Search radius**: point-cloud search cylinder radius (default 1 m)
   - **Tolerance**: maximum allowed deviation (default 1 m)
   - **Create labels for every point**: off = only points over tolerance get a label
   - **Create a CSV report**: exports a detailed CSV alongside the labels
3. Review the classification labels and the CSV report.

## Output classification

| Classification | Meaning |
|---|---|
| `OK` | Deviation within tolerance |
| `FAILED` | Deviation exceeds tolerance |
| `NO_DATA` | No point-cloud data found at this grid cell |
| `API_FAILED` | swisstopo reference height could not be retrieved |

## Algorithm

1. **Grid generation**: systematic points across the point cloud's bounding box.
2. **Point cloud sampling**: a search cylinder spanning the full local vertical extent of the data (see "What's new" above) extracts the nearby points.
3. **Ground height**: bounding-box midpoint for near-flat patches, lowest 15% slice for the rest.
4. **Reference height query**: batched curl requests against the swisstopo height API (see "What's new").
5. **Comparison and classification**: configurable tolerance-based validation.
6. **Documentation**: 3-column labels (Measure / Reference / Deviation), classification groups, red marker spheres on `FAILED` points, CSV export.

## CSV report format

| Column | Description | Unit |
|--------|-------------|------|
| Point_ID | Sequential point number | - |
| Easting | LV95 East coordinate | m |
| Northing | LV95 North coordinate | m |
| Measured_Height_m | Point cloud height | m |
| Swisstopo_Height_m | Reference height | m |
| Difference_m | Height deviation | m |
| Classification | Validation result | - |
| Grid_Spacing_m | Grid parameter | m |
| Search_Radius_m | Search parameter | m |
| Tolerance_m | Tolerance parameter | m |

## Requirements

- **Leica Cyclone 3DR 2025.1** or newer
- **curl** command-line tool (built into Windows 10/11, must be on PATH)
- Internet connection to `api3.geo.admin.ch`
- Point cloud(s) georeferenced in **LV95 (EPSG:2056)**

## Configuration guidance

**Grid spacing**: small (2-10 m) for detailed analysis; medium (15-25 m) for a balanced default; large (50-100 m) for a fast overview.

**Search radius**: small (0.1-0.5 m) for precise, high-density data; medium (1-2 m) for standard terrain; large (3-5 m) for rough or sparse data.

**Tolerance**: strict (0.02-0.5 m) for quality control on high-precision surveys; standard (0.5-2 m) for general validation; lenient (5-10 m) for rough terrain assessment.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Please select at least one point cloud" | Select at least one SCloud before running |
| Many `API_FAILED` rows | Check the summary dialog's API diagnosis (transfer vs. response errors); check internet connection / firewall / proxy |
| Many `NO_DATA` rows | Increase the search radius, or confirm the cloud actually covers the grid area |
| Slow run | Increase grid spacing, or reduce the validated area |

## Files

- Main script: [Swisstopo Systematic Validation.js](./Swisstopo%20Systematic%20Validation.js)

## Version history

- **2026-09-01**: Search-cylinder correctness fix, cloud-before-network ordering, batched curl transport, automatic retry, API diagnostics, LV95 guardrail, bilingual dialogs, readable error handling
- **1.0** (2025-08-25): initial release

## License and attribution

- Data source: (c) swisstopo - Swiss Federal Office of Topography
- API: height data from `api3.geo.admin.ch`
- Coordinate system: LV95 (EPSG:2056)
- Platform: Leica Cyclone 3DR
