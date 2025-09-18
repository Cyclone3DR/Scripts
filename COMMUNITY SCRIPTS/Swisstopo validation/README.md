# Swisstopo Height Validation Tool for Cyclone 3DR
Created by Bimatic, Jan Sigrist - for any Questions and Feedback contact me at jan.sigrist@bimatic.ch

## Description / Beschreibung

**English:**
Interactive quality control tool for comparing elevation data against swisstopo reference heights. Click on any point in your mesh or point cloud to instantly compare local height measurements with swisstopo data. Note: Swisstopo data should be used as a reference aid only, as there may be an undetermined time span between the acquisition of swisstopo data and the object being controlled.

**Deutsch:**
Interaktives Qualitätskontroll-Tool zum Vergleich von Höhendaten gegen swisstopo-Referenzhöhen. Klicken Sie auf beliebige Punkte in Ihrem Mesh oder Ihrer Punktwolke, um lokale Höhenmessungen sofort mit swisstopo-Daten zu vergleichen. Hinweis: Swisstopo-Daten sind nur als Hilfsmittel zu betrachten, da zwischen der Erfassung der swisstopo-Daten und dem zu kontrollierenden Objekt eine unbestimmte Zeitspanne liegen kann.

## Features

- Interactive point selection with instant height comparison
- Real-time validation against swisstopo API
- Automatic label creation with pass/fail results
- Configurable warning thresholds
- Automatic grouping of validation labels
- Bilingual interface (EN/DE)

## Requirements

### Software
- **Leica Cyclone 3DR 2025.1.4** or compatible version
- **curl** command-line tool (must be in system PATH)
- Internet connection for swisstopo API access

### Data Requirements
- **Coordinate System**: LV95 (EPSG:2056)
- **Coverage Area**: Switzerland and Liechtenstein
- **Data Types**: Point clouds, meshes, or any clickable 3D geometry

## Installation

1. Download `SwisstopoHeightValidation.js` or the whole folder.
2. Place in Cyclone 3DR scripts directory:
   - `C:\Users\[Username]\Documents\3DReshaper Scripts\`

## Usage

### Configuration
1. **Run script**: `Scripts` → `Execute Script` → `Load` → `SwisstopoHeightValidation.js`
2. **Set warning threshold**: Maximum acceptable height difference (recommended: 0.2-1.0m)
3. **Enable auto-labels**: Automatically create validation labels
4. **Show coordinates**: Include LV95 coordinates in labels (optional)

### Validation Process
1. **Click on points** in your 3D data to validate heights
2. **Review results** in the popup dialog
3. **Check labels** created automatically in the document
4. **Continue validation** or finish session

### Label Information
Labels contain numeric values only:
- **Row 1**: Local height (measured)
- **Row 2**: Swisstopo reference height
- **Row 3**: Height difference (local - swisstopo)
- **Row 4-5**: Coordinates (if enabled)

Label comments show validation result:
- `VALIDATION_PASSED`: Difference within threshold
- `VALIDATION_FAILED`: Difference exceeds threshold

## Technical Details

### API Information
- **Endpoint**: https://api3.geo.admin.ch/rest/services/height
- **Coordinate System**: LV95 (EPSG:2056)
- **Data Source**: swisstopo DTM-AV
- **Coverage**: Switzerland and Liechtenstein

### Label Format
Due to Cyclone 3DR 2025.1.4 API requirements:
- All label cells contain **numeric values only**
- Text information is stored in label comments
- Numeric codes: 1=Local, 2=Swisstopo, 3=Difference, 4=Easting, 5=Northing

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "curl command not found" | Install curl or add to system PATH |
| "API request failed" | Check internet connection |
| "No points generated" | Verify LV95 coordinates within Switzerland |
| Label creation fails | Ensure using Cyclone 3DR 2025.1.4+ |

## Data Limitations

- **Temporal Accuracy**: Time difference between swisstopo data acquisition and surveyed object
- **Spatial Resolution**: swisstopo DTM resolution limitations
- **Reference Purpose**: Data should be used for reference comparison only
- **Professional Verification**: Critical measurements require professional survey validation

## Version History

- **v2.1**: Fixed for Cyclone 3DR 2025.1.4 - numeric labels only
- **v2.0**: Enhanced bilingual interface and error handling
- **v1.0**: Initial release

---

## Disclaimer / Haftungsausschluss

**English:**
This tool provides reference comparisons for quality control purposes only. Swisstopo data should be used as a reference aid, as there may be an undetermined time span between swisstopo data acquisition and the object being controlled. Users must verify data accuracy for their specific applications and comply with professional surveying standards. Use at your own risk.

**Deutsch:**
Dieses Tool bietet Referenzvergleiche nur für Qualitätskontrollzwecke. Swisstopo-Daten sind als Hilfsmittel zu betrachten, da zwischen der Erfassung der swisstopo-Daten und dem zu kontrollierenden Objekt eine unbestimmte Zeitspanne liegen kann. Benutzer müssen die Datengenauigkeit für ihre spezifischen Anwendungen überprüfen und professionelle Vermessungsstandards einhalten. Nutzung auf eigene Gefahr.

**Data Attribution:**
© swisstopo - Swiss Federal Office of Topography  
Height data from api3.geo.admin.ch