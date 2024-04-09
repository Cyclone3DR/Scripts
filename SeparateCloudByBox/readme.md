# Separate cloud by box
This script provides a functionality to separate a point cloud by box, then export those boxes to the disk.
To use it, open the script editor and load SeparateCloudByBox.js.

# HOW TO USE IT
A single point cloud must be selected before launching the script. It can be a standard or a CloudWorx (LGSx) point cloud.
Optionally, a limit box can be selected to delimit the area to be extracted. 
The generated boxes will then be aligned along this limit box starting from its lower point (xmin, ymin, zmin).
If no limit box is selected, the whole bounding box of the selected point cloud will be used.

Finally, launch the script to define the box size and the output file name parameters.
To define an infinite height, simply set the value to 0.
The following output extensions are supported: E57, LAS and LAZ.


![Input dataset](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/SeparateCloudByBox/Screenshot1.png "Input sample")
![Output result](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/SeparateCloudByBox/Screenshot2.png "Output points")

# Download Files

You can download individual file using these links (for text file, right click on the link and choose "Save as..."):

- [SeparateCloudByBox.js](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/SeparateCloudByBox/SeparateCloudByBox.js)
- [SeparateCloudByBoxSample.3dr](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/SeparateCloudByBox/SeparateCloudByBoxSample.3dr)

Or all scripts on this site can be download in a [single zip file] (https://github.com/Cyclone3DR/Scripts/archive/master.zip).