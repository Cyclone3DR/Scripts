# Swisstopo Systematic Point Cloud Validation

**Professional point cloud validation tool for Cyclone 3DR** - Validates measured heights against official Swiss topographic reference data.
Created by Bimatic, Jan Sigrist - for any Questions and Feedback contact me at jan.sigrist@bimatic.ch

## 🎯 Overview

This script performs systematic grid-based validation of point cloud heights against official Swisstopo reference data. It's designed for professional surveying workflows requiring accuracy verification against national geodetic standards.

## ✨ Key Features

- **Systematic Grid Validation**: Automated grid-based sampling across entire point cloud bounding box
- **Official Swisstopo Integration**: Direct API connection to `api3.geo.admin.ch` for reference heights
- **Intelligent Ground Detection**: Advanced cylinder-based point extraction with median approximation
- **Professional Labeling**: Comprehensive 5-row labels with tolerance visualization and organized grouping
- **Detailed CSV Reports**: Statistical analysis with configurable export options including fallback mechanisms
- **Robust Error Handling**: Multiple fallback strategies ensure reliable operation

## 🛠️ Requirements

- **Cyclone 3DR 2025.1.4** or newer
- **Windows environment** with curl command available
- **Internet connection** for Swisstopo API access
- **LV95 coordinate system** (EPSG:2056) point clouds

## 📋 Usage Instructions

### 1. Preparation
- Import your point cloud(s) into Cyclone 3DR
- Ensure coordinate system is **LV95 (EPSG:2056)**
- Select the point cloud(s) you want to validate

### 2. Script Execution
1. Run the script from Cyclone 3DR Scripts menu
2. Configure parameters in the dialog:
   - **Grid Spacing**: Distance between validation points (default: 20m)
   - **Search Radius**: Cylinder radius for point extraction (default: 1m)
   - **Error Threshold**: Maximum allowed deviation (default: 1m)
   - **Create All Labels**: Generate labels for all points or errors only
   - **Generate Report**: Enable detailed CSV export with multiple save options

### 3. Results
The script produces:
- **Validation Labels**: Color-coded 5-row labels showing complete validation data
- **Statistical Summary**: Console output with validation counts
- **CSV Report**: Detailed analysis file with fallback save mechanisms
- **Organized Groups**: Labels sorted by classification (OK/ERROR/NO_DATA/API_FAILED)

## 📊 Output Classifications

| Classification | Description | Color Coding |
|---------------|-------------|--------------|
| **OK** | Deviation within threshold | Green/Normal |
| **ERROR** | Deviation exceeds threshold | Red/Warning |
| **NO_DATA** | No point cloud data found | Yellow/Info |
| **API_FAILED** | Swisstopo API unavailable | Gray/Error |

## 🔧 Technical Details

### Algorithm Components

1. **Grid Generation**: Creates systematic validation points across bounding box
2. **Reference Height Query**: Retrieves official heights via Swisstopo REST API
3. **Point Cloud Sampling**: Uses centered cylinders for robust ground detection
4. **Height Calculation**: Weighted average with median approximation of lower 25% points for accuracy
5. **Comparison & Classification**: Configurable tolerance-based validation
6. **Documentation**: Professional 5-row labels and comprehensive reporting

### API Integration
```javascript
// Swisstopo Height API
https://api3.geo.admin.ch/rest/services/height?easting={E}&northing={N}&sr=2056&format=json
```

### Ground Detection Method
- **Primary Method**: Median approximation using iterative cylinder approach for lower 25% of points
- **Fallback Method**: Simple average for small height variations
- **Search Strategy**: Fixed 5m vertical search height centered around reference elevation
- **Weighting**: Results weighted by point count when multiple clouds contribute

## 📄 Label Information

Each validation label contains 5 rows with comprehensive data:
- **Row 0**: Measured height from point cloud (Code 1)
- **Row 1**: Swisstopo reference height (Code 2)
- **Row 2**: Height difference/deviation (Code 3) - **Primary measurement**
- **Row 3**: Point ID for traceability (Code 4)
- **Row 4**: Grid coordinates - Easting, Northing (Codes 5)

### Label Features
- **Enhanced Comments**: Include classification and deviation in label name
- **Dynamic Tolerances**: ERROR points use stricter tolerance, OK points use warning threshold
- **Group Organization**: Automatic sorting into classification-based groups
- **Fallback System**: Robust 3-row basic labels if enhanced labels fail

## 📈 CSV Report Format

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
| Error_Threshold_m | Tolerance parameter | m |

### CSV Export Options
1. **User Dialog**: Standard save dialog for user-selected location
2. **Temp Directory**: Automatic fallback with timestamp
3. **Console Output**: Last resort for manual copy-paste

## ⚙️ Configuration Parameters

### Grid Spacing (2-100m)
- **Small values (2-10m)**: Detailed analysis, more processing time
- **Medium values (15-25m)**: Balanced approach (recommended)
- **Large values (50-100m)**: Overview analysis, faster processing

### Search Radius (0.05-5m)
- **Small radius (0.1-0.5m)**: Precise point sampling (recommended for high-quality data)
- **Medium radius (1-2m)**: Standard terrain analysis
- **Large radius (3-5m)**: Rough terrain or sparse data

### Error Threshold (0.02-10m)
- **Strict (0.02-0.5m)**: High precision surveys (recommended for quality control)
- **Standard (0.5-2m)**: General validation
- **Lenient (5-10m)**: Rough terrain assessment

## 🚨 Troubleshooting

### Common Issues

**"No point cloud selected"**
- Ensure at least one SCloud object is selected before running

**"API request failed"**
- Check internet connection
- Verify coordinates are within Switzerland
- Try again later (API may be temporarily unavailable)

**"No cloud data found"**
- Increase search radius
- Check if point cloud covers the validation area
- Verify coordinate system alignment

**"Label creation failed"**
- Script automatically falls back to basic 3-row labels
- Check console for specific error messages

**Performance issues**
- Reduce grid density (increase spacing)
- Limit validation area
- Close other resource-intensive applications

### Best Practices

1. **Start with larger grid spacing** for overview analysis
2. **Use appropriate search radius** based on point cloud density
3. **Validate coordinate system** before processing
4. **Check sample results** before full validation
5. **Save reports** for documentation and analysis
6. **Monitor console output** for detailed processing information

## 📋 Version & Compatibility

- **Script Version**: 1.0 (2025-08-25)
- **Cyclone 3DR**: 2025.1.4 or newer required
- **Author**: Jan Sigrist (Bimatic GmbH) - www.bimatic.ch
- **Platform**: Windows with curl support

## 📋 License & Attribution

- **Script**: Developed for professional surveying workflows
- **Data Source**: © swisstopo - Swiss Federal Office of Topography
- **API**: Height data from `api3.geo.admin.ch`
- **Coordinate System**: LV95 (EPSG:2056)
- **Platform**: Leica Cyclone 3DR

---
