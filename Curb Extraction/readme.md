# Curb extraction

This script provides a functionality to extract curbs from a point cloud in Cyclone 3DR.

To use it, open the script editor and load CurbExtraction.js.

1. The algorithm uses the displayed cloud (or Cloudworx cloud) to extract the curb! => Make sure only 1 cloud (or CWxCloud) is displayed before launching the script
2. At least 1 polyline should be selected. But 2 polylines can be selected.
3. The first selected polyline is used to extract the top of the curb.
   a. If it contains only 2 points, the first point is used to start the curb extraction and the second point is used to show the extraction direction
   b. If it contains more than 3 points, the point used to start the curb extraction is the last point of the polyline prolongated according to the last segment of the polyline. In this case, the points extracted will be added to the input polyline
4. The second polyline is optional and correspond to the bottom of the curb: the points extracted at the bottom of the curb wil be added to this polyline
5. This means that the 2 polylines have to be oriented in the same way

** Parameter explanations: **

- ** Sampling step: ** the algorithm extracts the curbs at individual points. This parameter defines the interval between the individual points which will be extarcted. The more straight, the higher this value can be. The more curved, a lower value will be required
- ** Curb width: ** this parameter defines the width of the curb to extract. The longer it is the better, as long as the data is clean.
- ** Curb height: ** this parameter defines the approximate height of the curb. It has a limited impact on the results
- ** Curb angle to vertical (in °): ** the vertical part of the curb might not always be perpendicular to the curb itself. This angle allows to adjust according to the real angle
- ** Min Curb Height: ** this is a threshold used to stop the curb extraction. Actually, when the height difference between the curn and the street is almost null, there is no way to extract a curb on the point cloud
- ** Max Curb Length: ** this is also a parameter used to stop the curb extraction at some point. This allows to define that we are not looking for curbs which length are greater than this value
- ** Input Units Conversion: ** unit factor conversion to meter. This allows the algorithm works in other units than meter (the default). If the document is in millimeter, this value should be 1000.

![alt text](https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Curb%20Extraction/Screenshot.png "screenshot")

# Download Files

You can download individual file using these links (for text file, right click on the link and choose "Save as..."):

- [CurbExtraction.js] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Curb%20Extraction/CurbExtraction.js)
- [CurbExtractionSample.3dr] (https://raw.githubusercontent.com/Cyclone3DR/Scripts/master/Curb%20Extraction/CurbExtractionSample.3dr)

Or all scripts on this site can be download in a [single zip file] (https://github.com/Cyclone3DR/Scripts/archive/master.zip).
