# Structural Plate & Bolt Extraction Tool (v2.0)
## User Guide & Standard Operating Procedure (SOP)

**Application**: Leica Cyclone 3DR (2025 / 2026+)  
**Target Objects**: Structural Steel Connection Plates, Gusset Plates, Splice Plates, Base Plates, Bent/Multi-Face Plates  
**Output**: Planar Surface Mesh, CAD Boundary Contours, CAD Bolt Holes with Center Crosses, 1:1 Scale DXF Template  

---

## 1. Overview & Highlights

The **Plate & Bolt Extraction Tool v2.0** uses a streamlined workflow inspired by Cyclone 3DR's Building Extractor:
- **Instant Planar Fitting**: 1-click plane fitting directly from point cloud data.
- **Real-Time Interactive Digitizer**: Click corners around noisy scan edges with continuous polyline and closed polygon preview.
- **100% Exact Surface Meshing**: Constrained 2D Delaunay mesh (`ConstraintMesh2D`) that perfectly matches every sharp corner and edge.
- **Automated Bolt Extraction**: Spatial slicing (+3mm to +35mm) with automatic cylinder fitting and CAD circle generation.
- **Interactive Review & 1:1 DXF Export**: Live 3D overlay with click-to-add / click-to-remove bolt assist.

**Advanced Multi-Face Engine**:
- **Fold Axis Computation**: Automatically calculates the bend axis and angle between multiple plates.
- **Boundary Plane Edge Snapping**: Click supporting beam flanges to generate red "Snap Lines".
- **Point Memory Corner Snapping**: Clicking near intersecting red lines automatically computes the exact 3D corner. Face 2 automatically snaps to Face 1's corners for mathematically perfect shared edges.
- **Automated Flattening**: Unfolds bent plates and projects them flat to the Z=0 plane for a 1:1 scale manufacturing DXF.

---

## 2. Step-by-Step Workflow

### Step 1: Select Workflow Mode
Run `Plate_Extraction_Tool_v2.js` and choose between:
- **Single Face Plate**: For flat gusset plates, splice plates, and base plates.
- **Multi-Face / Bent Plate**: For bent or folded plates across multiple angular planes.

### Step 2: Define the Plate Plane(s)
- **Single Face**: Click once directly on the plate face.
- **Multi-Face**: Click Face 1, then Face 2.

### Step 3: Define Boundary Planes for Snapping (Optional)
If your plate attaches to beam flanges or webs, defining them helps you trace corners precisely:
1. When prompted, select **Define Boundary Face**.
2. Click on the intersecting beam flange or web.
3. Repeat for any other connecting elements, then select **No / Done**.
4. The tool will display long red **Snap Lines** showing the intersection edges perfectly aligned next to your plate.

### Step 4: Live Interactive Perimeter Digitizing
1. **Click each corner** around the perimeter of the plate in sequence:
   - *Snap Assist*: Click anywhere near the red Snap Lines to magnetically lock to the edge. Click near an intersection of two red lines to lock perfectly to the absolute 3D corner!
   - *Point Memory*: When drawing Face 2, click near Face 1's corners along the fold axis to snap perfectly to them, ensuring they share the exact same edge length.
2. **Right-Click** or press **Enter / Escape** when you have clicked all corners.
3. The Action Menu will appear to validate, undo misclicks, or add more corners.

### Step 5: Automated Processing & Live 3D Review
The tool automatically:
1. Creates an exact planar surface mesh.
2. Generates CAD circles, center crosses, and fitted cylinders for bolts.

Use the **Live Review Dialog**:
- **`+ Add Missed Bolt`**: Click any faint or low-density bolt head to fit a new circle/cross.
- **`- Remove Incorrect Bolt`**: Click near an unwanted bolt to instantly delete its geometry.
- **`Accept & Export DXF`** / **`Unfold Flat & Export DXF`**: Finalizes the entities in the document and exports the DXF file.

---

## 3. Output Deliverables

| Entity Name | Object Type | Color | Description |
| :--- | :--- | :--- | :--- |
| `Plate_Boundary_Contour` | 3D Polyline | **Green** (4px) | Orthogonally snapped outer perimeter |
| `Plate_Planar_Mesh` | 3D Mesh | **Golden Yellow** | 100% full-coverage constrained planar mesh |
| `Bolt_Hole_X_[Dia_24.0mm]` | 3D Polyline | **Red** (3px) | 1:1 CAD hole circle |
| `Bolt_Cross_X_A / B` | 3D Polyline | **Yellow** (2px) | Standard CAD center mark crosses |
| `BentPlate_Unfolded...` | Group | N/A | Contains the flattened, unrolled 2D geometry at Z=0 |
| `Flat_Bend_Axis_[Angle_XX]`| 3D Polyline | **Red** (2px) | Fold axis marked on the unrolled DXF template |
| `*.dxf` | DXF File | CAD Layers | 1:1 scale DXF ready for AutoCAD, Tekla, or CNC cutting |

---

## 4. Best Practices & Tips

- **View Orientation**: For best accuracy when clicking corners, rotate the 3D viewport perpendicular to the plate face (press `Space` or use view hotkeys).
- **Misclicks**: If you accidentally click a point in empty space, do not cancel — simply **Right-Click** and choose **`Undo Last Corner`**.
- **Noisy Edges**: Always define Boundary Planes if the plate edge is obscured by shadows or noise. Snapping to the intersection of planes is mathematically perfect and much faster than guessing visually.
