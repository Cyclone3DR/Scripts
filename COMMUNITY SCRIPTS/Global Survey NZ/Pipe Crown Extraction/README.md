# Pipe Crown Extractor

**Contact:** Thomas Mathey (Global Survey NZ)

An advanced, highly robust Cyclone 3DR JavaScript script designed to extract the true geometric apex (crown) of a pipe from noisy, raw 3D point cloud data. The script automatically draws a continuous 3D Polyline along the highest point of the pipe between two user-defined points.

## Description

This script is designed to automate the extraction of pipe strings in noisy trench environments. It uses a "Look-Down Prediction" algorithm combined with Mean Shift centering and a Dynamic Momentum Limiter to mathematically ignore intersecting pipes, adjacent trench walls, and dirt clumps.

![Pipe Crown Tracker Output](Pipe%20Crown%20Tracker.png)

### Features & Capabilities

- **Continuous Workflow:** Automatically prompts you to extract the next pipe upon completion, allowing for rapid trench processing.
- **Robust Z-Slicing Crown Detection:** Accurately isolates the true pipe surface by mathematically slicing downwards through the data, completely ignoring sparse floating noise or laser spray above the pipe.
- **Dynamic Mean Shift Centering:** Automatically centers the tracking node perfectly across the pipe's curvature on every single step, ensuring the polyline never drifts down the sides of the pipe.
- **Aggressive Trench Wall Rejection:** Calculates the maximum possible physical slope of the pipe to rigorously filter out massive vertical structures (like trench walls or adjacent concrete blocks) that would otherwise pull the tracker off-course.
- **Dynamic Momentum Bending Limiter:** Mathematically clamps the maximum allowed lateral turning angle (e.g., 9 degrees per step). This gives the tracker immense forward inertia, allowing it to plow straight through heavy dirt clumps and intersecting pipes without violently swerving, while remaining agile enough to track legitimate pipeline curves.
- **Perfect Edge Snapping:** Projects initial start and end clicks perpendicularly to eliminate longitudinal "edge drift," mathematically guaranteeing that the drawn polyline starts and ends exactly where you clicked.

### How to Use

1. **Load your Point Cloud:** Ensure your point cloud is loaded and visible in Cyclone 3DR.
2. **Run the Script:** Execute `1_Pipe_Crown_Tracker.js`.
3. **Select the Cloud:** Click anywhere on the point cloud to select it as the target.
4. **Click the Start Point:** Click approximately where you want the line to begin (on top of the pipe). *Note: Your click doesn't need to be perfectly centered; the script will mathematically snap it to the true geometric crown.*
5. **Define the Pipe Diameter:** Click 3 distinct points around the circumference/surface of the pipe at the starting location. This calculates the physical diameter used to calibrate the tracker's search algorithms.
6. **Click the End Point:** Click approximately where you want the line to end.
7. **Configure Settings:** 
   - **Step Interval:** How frequently nodes are placed (default: 0.25m). Smaller values create denser lines but take longer.
   - **Search Radius Multiplier:** How tightly the search cylinder hugs the crown (default: 0.20, or 20% of the pipe diameter). Keep this tight to ignore adjacent trench walls.
   - **Max Gap Distance:** How far the script is allowed to blindly coast if it loses sight of the pipe before giving up (default: 5.0m).
8. **Extract:** The script will drive down the pipe, ignoring noise, and output a Green Polyline! It will then immediately ask if you want to extract another pipe.

### Under the Hood (Algorithm Details)

The tracker operates using a highly tuned "Look-Down Prediction" algorithm:
1. **Prediction:** It predicts where the next point should be based on the established trajectory (`currentDir`).
2. **Z-Filtering:** It heavily crops the point cloud around the prediction, deleting everything more than ~10-15cm above the predicted height. This instantly decapitates trench walls and overhanging scaffolding.
3. **Emergency Expansion:** It drops a tight search cylinder. If it misses the pipe entirely (because of a sharp unpredicted curve), it throws a massive 50% radius net, catches the pipe, and snaps back down to a tight tracking radius.
4. **Centering:** It runs a 3-iteration Mean Shift loop, adjusting its X/Y coordinates until it perfectly balances on the highest density peak.
5. **Capping Bends:** It measures how far the new center is from its prediction. If the shift is extreme (e.g., a dirt clump pulling it sideways), the **Momentum Limiter** steps in and physically restricts the lateral movement to a maximum realistic bend radius (e.g., 4cm on a 25cm step).
6. **Tight Z-Snap:** It drops a tiny 3cm pin straight down at the smoothed location to grab the exact mathematical Z-height of the crown, ignoring any remaining floating fuzz.
7. **Inertial Update:** It updates its tracking vector based on the last 5 steps to smoothly follow S-curves.

### Customization

The script's default variables are stored at the very top of `1_Pipe_Crown_Tracker.js`. Modifying these changes the default values presented in the initial dialog:

```javascript
var defaultStep = 0.25;
var defaultSearchMult = 0.20; // 20% of pipe diameter
var defaultGap = 5.0;
```

## Tested Version
- Cyclone 3DR 2024.0.1 (and newer)

## Licensing
Compatible with:
- Cyclone 3DR Survey Edition (or any edition with the Scripting capability)
