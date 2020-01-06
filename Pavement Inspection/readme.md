# Pavement Inspection

This script provides a functionality to inspect road pavement in a particular direction of travel for smoothness.  The scripts start with a mesh created from scanned data in Cyclone3DR, and a polyline that is projected on the mesh of the lane, created in Cyclone3DR, or imported, that describes the center line of the lane being inspected.

The script has two parts.  The first script, [PavementInspection-CreateLines.js] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/PavementInspection-CreateLines.js), creates polylines at intervals going outward from the centerline of the lane.  These paths would be the same as one would use when using a rolling straightedge, or a transit for inspecting smoothness.  The script copies the center line and moves it outward, projecting the new lines onto the mesh as it goes.

The second script, [PavementInspection-Evaluation-All.js] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/PavementInspection-Evaluation-All.js) uses the polylines created in the first step to carry out the inspection.  The input parameters are ‘Length of straightedge’, ‘tolerance’, and an ‘increment’ to move the straightedge along the line for inspection.  The end result of this script is three colored pointclouds; Red = out of tolerance high, Green = within tolerance, Blue = out of tolerance low.

To use it: <br />
1. Create a detailed (fine) mesh of the scanned pavement from your scanned data <br />
2. Import or create the centerline of the lane being inspected as a polyline and project that polyline to the mesh.  Note that the direction of this polyline should describe the direction of travel along the lane being inspected.  <br />
2. Open the script editor and load PavementInspection-CreateLines.js  <br />
3. Select the mesh and the central line and run the script like if you were running a Cyclone3DR command. You will be required to enter the number of offsets needed and the offset increment between them. <br />
4. Click a point on the side of the line where the offsets are needed  <br />
5. Repeat operations 3. and 4. on the other side if needed  <br />
6. Load PavementInspection-Evaluation-All.js  <br />
7. Select all the lines to be evaluated and run the script like if you were running a Cyclone3DR command. You will be required to enter the length of the rule (straightedge) , the flatness tolerance and the increment  <br />


![alt text](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/ScreenShot1.png "screenshot1")
![alt text](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/ScreenShot2.png "screenshot2")

# Download Files

You can download individual file using these links (for text file, right click on the link and choose "Save as..."):

- [PavementInspection-CreateLines.js] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/PavementInspection-CreateLines.js)
- [PavementInspection-Evaluation-All.js] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/PavementInspection-Evaluation-All.js)
- [PavementInspection_Sample.3dr] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Pavement%20Inspection/PavementInspection_Sample.3dr)

Or all scripts on this site can be download in a [single zip file] (https://github.com/Cyclone3DR/Scripts/archive/master.zip).
