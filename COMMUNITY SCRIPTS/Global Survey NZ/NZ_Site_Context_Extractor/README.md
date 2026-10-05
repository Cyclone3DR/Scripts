# NZ Site Context Extractor

<img width="840" height="714" alt="image" src="https://github.com/user-attachments/assets/c76901d2-e8d8-48b4-86e5-81ed63dcea52" />


Automates the extraction of nationwide site context data directly into Leica Cyclone 3DR by querying New Zealand Open Data GIS portals. It fetches property boundaries, building outlines from LINZ, and 3D underground utilities (Stormwater, Wastewater, Water) from various local councils.

**Contact:** Thomas Mathey (thomas.mathey@globalsurvey.co.nz)

## Description

The script extracts the bounding box from your active point cloud in Cyclone 3DR. Using a dynamic Council Registry, it queries Open Data ArcGIS FeatureServers and MapServers to download GeoJSON utility data.
The script then dynamically parses the data, handles fallback column names, replaces string values, catches missing invert depths (defaulting them safely to 1.5m below surface), and draws 3D pipes (color-coded to industry standards) directly underneath your point cloud.

**Currently Supported Regions for 3D Utilities:**
- Auckland Council (Stormwater)
- Wellington Water (Wellington, Hutt, Porirua)
- Hamilton City Council
- Nelson City Council (Top of the South Maps)
- Waimakariri District Council
- Canterbury Maps (Christchurch City Council)
- Gisborne District Council
- Southland Region (Invercargill & Gore)

**How to Use:**
1. Open a project with an active Point Cloud (must be in NZTM2000).
2. Select the Point Cloud.
3. Run the script.
4. Input your LINZ API Key and select the features you wish to import.
5. The data will be fetched in the background using PowerShell and imported directly into your scene.

## Tested Version
Cyclone 3DR 2026.3

## Licensing
Survey Edition (or higher)
