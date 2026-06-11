// Colorize Point Cloud from Multiple Images
// Author: Justin Scholz <jscholz@bcf-engr.com>

// /// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// SEPARATE AND COLORIZE BY IMAGE BOUNDARIES
// This script extracts outer boundaries from images, separates point clouds by those boundaries,
// and applies each image as color to the corresponding boundary region
// Usage: Select one point cloud and one or more images, then run the script

// Configuration
var config = {
    verticalPadding: 1.0,        // Z margin above/below cloud for separation
    hideOriginalCloud: true,     // Hide source cloud after processing
    mergeInsideRegions: true,    // Merge all inside regions into single cloud
    mergeOutsideRegions: false,  // Keep outside regions separate per image
    createBoundaryPolylines: true // Show the extracted boundaries
};

function showMessage(title, message) {
    try {
        print(title + ": " + message);
    } catch (e) {
        // Silent if print not available
    }
}

function pickPointCloud() {
    var clouds = SCloud.FromSel();
    if (!clouds || clouds.length === 0) {
        showMessage("Error", "No point cloud selected!");
        throw new Error("No point cloud selected");
    }
    if (clouds.length > 1) {
        showMessage("Warning", "Multiple clouds selected, using first one only");
    }
    return clouds[0];
}

function pickImages() {
    var images = SImage.FromSel();
    if (!images || images.length === 0) {
        showMessage("Error", "No images selected!");
        throw new Error("No images selected");
    }
    return images;
}

function extractImageBoundary(image) {
    // Get image footprint/boundary as polyline
    // Images in Cyclone 3DR have spatial footprint that can be extracted
    try {
        // Method 1: Try to get image footprint directly
        if (typeof image.GetFootprint === 'function') {
            var footprintResult = image.GetFootprint();
            if (footprintResult && footprintResult.ErrorCode === 0 && footprintResult.Multi) {
                return footprintResult.Multi;
            }
        }
        
        // Method 2: Try to get image boundary from image properties
        if (typeof image.GetBoundary === 'function') {
            var boundaryResult = image.GetBoundary();
            if (boundaryResult && boundaryResult.ErrorCode === 0 && boundaryResult.Multi) {
                return boundaryResult.Multi;
            }
        }
        
        // Method 3: Try to get image position and size to create boundary
        if (typeof image.GetPosition === 'function' && typeof image.GetSize === 'function') {
            var pos = image.GetPosition();
            var size = image.GetSize();
            if (pos && size && pos.ErrorCode === 0 && size.ErrorCode === 0) {
                return createBoundaryFromPositionAndSize(pos, size);
            }
        }
        
        // Method 4: Try to get image transformation matrix and extract corners
        if (typeof image.GetTransform === 'function') {
            var transform = image.GetTransform();
            if (transform && transform.ErrorCode === 0) {
                return createBoundaryFromTransform(transform);
            }
        }
        
        // Method 5: Try to get image bounding box
        if (typeof image.GetBoundingBox === 'function') {
            var bbox = image.GetBoundingBox();
            if (bbox && bbox.ErrorCode === 0) {
                return createBoundaryFromBoundingBox(bbox);
            }
        }
        
        // Method 6: Try to get image corners directly
        if (typeof image.GetCorners === 'function') {
            var corners = image.GetCorners();
            if (corners && corners.ErrorCode === 0 && corners.Points) {
                return createBoundaryFromCorners(corners.Points);
            }
        }
        
        showMessage("Warning", "Could not extract boundary from image: " + image.GetName());
        return null;
        
    } catch (e) {
        showMessage("Error", "Failed to extract boundary from image: " + e.message);
        return null;
    }
}

function createBoundaryFromExtent(extent) {
    // Create a rectangular boundary from image extents
    var boundary = SMultiline.New();
    
    try {
        // Get corner points from extent
        var corners = [
            new SPoint(extent.MinX, extent.MinY, 0),
            new SPoint(extent.MaxX, extent.MinY, 0),
            new SPoint(extent.MaxX, extent.MaxY, 0),
            new SPoint(extent.MinX, extent.MaxY, 0),
            new SPoint(extent.MinX, extent.MinY, 0) // Close the polygon
        ];
        
        for (var i = 0; i < corners.length; i++) {
            boundary.InsertLast(corners[i], 0);
        }
        
        return boundary;
    } catch (e) {
        showMessage("Error", "Failed to create boundary from extent: " + e.message);
        return null;
    }
}

function createBoundaryFromPositionAndSize(position, size) {
    // Create boundary from image position and size
    var boundary = SMultiline.New();
    
    try {
        var pos = position.Point || position;
        var halfWidth = size.Width / 2;
        var halfHeight = size.Height / 2;
        
        var corners = [
            new SPoint(pos.GetX() - halfWidth, pos.GetY() - halfHeight, pos.GetZ()),
            new SPoint(pos.GetX() + halfWidth, pos.GetY() - halfHeight, pos.GetZ()),
            new SPoint(pos.GetX() + halfWidth, pos.GetY() + halfHeight, pos.GetZ()),
            new SPoint(pos.GetX() - halfWidth, pos.GetY() + halfHeight, pos.GetZ()),
            new SPoint(pos.GetX() - halfWidth, pos.GetY() - halfHeight, pos.GetZ()) // Close polygon
        ];
        
        for (var i = 0; i < corners.length; i++) {
            boundary.InsertLast(corners[i], 0);
        }
        
        return boundary;
    } catch (e) {
        showMessage("Error", "Failed to create boundary from position and size: " + e.message);
        return null;
    }
}

function createBoundaryFromTransform(transform) {
    // Create boundary from image transformation matrix
    var boundary = SMultiline.New();
    
    try {
        // Assume standard image corners in local coordinates [-0.5, 0.5] x [-0.5, 0.5]
        var localCorners = [
            {x: -0.5, y: -0.5},
            {x: 0.5, y: -0.5},
            {x: 0.5, y: 0.5},
            {x: -0.5, y: 0.5},
            {x: -0.5, y: -0.5} // Close polygon
        ];
        
        for (var i = 0; i < localCorners.length; i++) {
            var worldPoint = transform.TransformPoint(localCorners[i].x, localCorners[i].y, 0);
            boundary.InsertLast(worldPoint, 0);
        }
        
        return boundary;
    } catch (e) {
        showMessage("Error", "Failed to create boundary from transform: " + e.message);
        return null;
    }
}

function createBoundaryFromBoundingBox(bbox) {
    // Create boundary from image bounding box
    var boundary = SMultiline.New();
    
    try {
        var minPt = bbox.LowPoint;
        var maxPt = bbox.UpPoint;
        
        var corners = [
            new SPoint(minPt.GetX(), minPt.GetY(), minPt.GetZ()),
            new SPoint(maxPt.GetX(), minPt.GetY(), minPt.GetZ()),
            new SPoint(maxPt.GetX(), maxPt.GetY(), minPt.GetZ()),
            new SPoint(minPt.GetX(), maxPt.GetY(), minPt.GetZ()),
            new SPoint(minPt.GetX(), minPt.GetY(), minPt.GetZ()) // Close polygon
        ];
        
        for (var i = 0; i < corners.length; i++) {
            boundary.InsertLast(corners[i], 0);
        }
        
        return boundary;
    } catch (e) {
        showMessage("Error", "Failed to create boundary from bounding box: " + e.message);
        return null;
    }
}

function createBoundaryFromCorners(corners) {
    // Create boundary from image corner points
    var boundary = SMultiline.New();
    
    try {
        // Add all corners and close the polygon
        for (var i = 0; i < corners.length; i++) {
            boundary.InsertLast(corners[i], 0);
        }
        
        // Add first corner again to close polygon if not already closed
        if (corners.length > 0) {
            boundary.InsertLast(corners[0], 0);
        }
        
        return boundary;
    } catch (e) {
        showMessage("Error", "Failed to create boundary from corners: " + e.message);
        return null;
    }
}

function separateCloudByBoundary(cloud, boundary, minZ, maxZ) {
    // Separate point cloud using boundary polyline
    var pBottom = SPoint.New(0, 0, minZ - config.verticalPadding);
    var pTop = SPoint.New(0, 0, maxZ + config.verticalPadding);
    var dirZ = SVector.New(0, 0, 1);
    
    try {
        // Ensure boundary is closed
        if (typeof boundary.Close === 'function') {
            boundary.Close();
        }
        
        var separationResult = cloud.Separate(boundary, dirZ, pBottom, pTop, SCloud.FILL_ALL);
        
        if (!separationResult) {
            showMessage("Warning", "Separation returned null for boundary");
            return { inside: null, outside: null };
        }
        
        var insideCloud = separationResult.InCloud || separationResult.Inside || separationResult.InsideCloud || null;
        var outsideCloud = separationResult.OutCloud || separationResult.Outside || separationResult.OutsideCloud || null;
        
        return { inside: insideCloud, outside: outsideCloud };
        
    } catch (e) {
        showMessage("Error", "Separation failed: " + e.message);
        return { inside: null, outside: null };
    }
}

function colorizeCloudFromImage(cloud, image) {
    try {
        var colorizeResult = STexturingUtil.ColorizeCloudFromImage(cloud, image);
        
        if (colorizeResult.ErrorCode >= 2) {
            showMessage("Error", "Colorization failed for image: " + image.GetName());
            return null;
        } else if (colorizeResult.ErrorCode === 1) {
            showMessage("Warning", "Colorization completed with warnings for image: " + image.GetName());
        }
        
        var coloredCloud = colorizeResult.Cloud;
        if (coloredCloud) {
            coloredCloud.SetVisibility(true);
            coloredCloud.SetCloudRepresentation("Colored");
            coloredCloud.AddToDoc();
            return coloredCloud;
        }
        
        return null;
        
    } catch (e) {
        showMessage("Error", "Colorization failed: " + e.message);
        return null;
    }
}

function styleBoundary(boundary, name, index) {
    if (!boundary) return;
    
    boundary.SetName(name + "_Boundary");
    
    // Set different colors for different image boundaries
    var colors = [
        [1.0, 0.0, 0.0], // Red
        [0.0, 1.0, 0.0], // Green  
        [0.0, 0.0, 1.0], // Blue
        [1.0, 1.0, 0.0], // Yellow
        [1.0, 0.0, 1.0], // Magenta
        [0.0, 1.0, 1.0]  // Cyan
    ];
    
    var colorIndex = index % colors.length;
    boundary.SetColors(colors[colorIndex][0], colors[colorIndex][1], colors[colorIndex][2]);
    
    try {
        boundary.SetLineWidth(2.0);
    } catch (e) {
        // Ignore if not supported
    }
    
    boundary.AddToDoc();
}

function mergeClouds(clouds, name) {
    if (!clouds || clouds.length <= 1) return clouds[0] || null;
    
    try {
        var merged = SCloud.Merge(clouds);
        
        // Check if merge was successful
        if (!merged) {
            showMessage("Error", "SCloud.Merge returned null");
            return null;
        }
        
        // Try to set name and properties, checking if methods exist
        try {
            if (typeof merged.SetName === 'function') {
                merged.SetName(name);
            }
        } catch (e) {
            showMessage("Warning", "Could not set name on merged cloud: " + e.message);
        }
        
        try {
            merged.SetCloudRepresentation("Colored");
        } catch (e) {
            showMessage("Warning", "Could not set cloud representation: " + e.message);
        }
        
        try {
            merged.AddToDoc();
        } catch (e) {
            showMessage("Warning", "Could not add merged cloud to document: " + e.message);
        }
        
        // Keep original clouds visible - don't hide them
        // for (var i = 0; i < clouds.length; i++) {
        //     try {
        //         clouds[i].SetVisibility(false);
        //     } catch (e) {
        //         // Ignore
        //     }
        // }
        
        return merged;
    } catch (e) {
        showMessage("Error", "Failed to merge clouds: " + e.message);
        return null;
    }
}

function groupClouds(coloredClouds, mergedCloud) {
    try {
        // Create a list of clouds to group
        var cloudsToGroup = [];
        
        // Add all individual colored clouds
        if (coloredClouds && coloredClouds.length > 0) {
            for (var i = 0; i < coloredClouds.length; i++) {
                cloudsToGroup.push(coloredClouds[i]);
            }
        }
        
        // Add the merged cloud if it exists and is different from individual clouds
        if (mergedCloud) {
            var isAlreadyInList = false;
            for (var j = 0; j < cloudsToGroup.length; j++) {
                if (cloudsToGroup[j] === mergedCloud) {
                    isAlreadyInList = true;
                    break;
                }
            }
            if (!isAlreadyInList) {
                cloudsToGroup.push(mergedCloud);
            }
        }
        
        // Only group if we have clouds to group
        if (cloudsToGroup.length > 0) {
            try {
                // Try to create a group
                var groupName = "Colorized Clouds Group";
                
                // Method 1: Try using SGroup if available
                if (typeof SGroup !== 'undefined' && typeof SGroup.New === 'function') {
                    var group = SGroup.New();
                    group.SetName(groupName);
                    
                    // Add clouds to group
                    for (var k = 0; k < cloudsToGroup.length; k++) {
                        try {
                            group.Add(cloudsToGroup[k]);
                        } catch (e) {
                            // Ignore if adding fails
                        }
                    }
                    
                    group.AddToDoc();
                    showMessage("Info", "Created group: " + groupName);
                    return;
                }
                
                // Method 2: Try using document grouping functions
                if (typeof AddToGroup === 'function') {
                    for (var m = 0; m < cloudsToGroup.length; m++) {
                        try {
                            AddToGroup(cloudsToGroup[m], groupName);
                        } catch (e) {
                            // Ignore if adding fails
                        }
                    }
                    showMessage("Info", "Added clouds to group: " + groupName);
                    return;
                }
                
                // Method 3: Try using selection and group command
                if (typeof Select === 'function' && typeof Group === 'function') {
                    // Clear selection first
                    try {
                        ClearSelection();
                    } catch (e) {
                        // Ignore
                    }
                    
                    // Select all clouds
                    for (var n = 0; n < cloudsToGroup.length; n++) {
                        try {
                            Select(cloudsToGroup[n]);
                        } catch (e) {
                            // Ignore if selection fails
                        }
                    }
                    
                    // Group the selection
                    try {
                        Group();
                        showMessage("Info", "Grouped colored clouds using Group command");
                    } catch (e) {
                        showMessage("Warning", "Could not group clouds: " + e.message);
                    }
                    return;
                }
                
                showMessage("Warning", "No grouping method available - clouds remain separate");
                
            } catch (e) {
                showMessage("Warning", "Grouping failed: " + e.message);
            }
        } else {
            showMessage("Info", "No clouds to group");
        }
        
    } catch (e) {
        showMessage("Error", "Grouping function failed: " + e.message);
    }
}

// Main execution
try {
    // Get inputs
    var sourceCloud = pickPointCloud();
    var images = pickImages();
    
    showMessage("Info", "Processing " + images.length + " image(s) with cloud: " + sourceCloud.GetName());
    
    // Get cloud Z extent
    var bbox = sourceCloud.GetBoundingBox();
    if (!bbox || bbox.ErrorCode !== 0) {
        throw new Error("Could not read cloud bounding box");
    }
    
    var minZ, maxZ;
    if (typeof bbox.LowPoint.z !== 'undefined') {
        minZ = bbox.LowPoint.z; maxZ = bbox.UpPoint.z;
    } else if (typeof bbox.LowPoint.Z !== 'undefined') {
        minZ = bbox.LowPoint.Z; maxZ = bbox.UpPoint.Z;
    } else if (typeof bbox.LowPoint.GetZ === 'function') {
        minZ = bbox.LowPoint.GetZ(); maxZ = bbox.UpPoint.GetZ();
    } else {
        throw new Error("Could not access Z from bounding box");
    }
    
    // Process each image
    var insideClouds = [];
    var outsideClouds = [];
    var processedCount = 0;
    
    for (var i = 0; i < images.length; i++) {
        var image = images[i];
        var imageName = image.GetName ? image.GetName() : ("Image_" + (i + 1));
        
        showMessage("Info", "Processing image: " + imageName);
        
        // Extract boundary from image
        var boundary = extractImageBoundary(image);
        if (!boundary) {
            showMessage("Warning", "Skipping image - no boundary extracted: " + imageName);
            continue;
        }
        
        // Style and show boundary if requested
        if (config.createBoundaryPolylines) {
            styleBoundary(boundary, imageName, i);
        }
        
        // Separate cloud by boundary
        var separation = separateCloudByBoundary(sourceCloud, boundary, minZ, maxZ);
        
        // Colorize the inside region with the image
        if (separation.inside) {
            var coloredCloud = colorizeCloudFromImage(separation.inside, image);
            if (coloredCloud) {
                coloredCloud.SetName(sourceCloud.GetName() + "_" + imageName + "_Colored");
                insideClouds.push(coloredCloud);
            }
        }
        
        // Don't create outside clouds - we only want the colored regions
        // Outside regions are discarded to avoid duplicate clouds
        
        processedCount++;
    }
    
    // Always merge colored clouds into one cloud with original name + "_Colorized from photos"
    var finalMergedCloud = null;
    var finalCloudName = sourceCloud.GetName() + "_Colorized from photos";
    
    if (insideClouds.length > 0) {
        if (insideClouds.length === 1) {
            // Only one colored cloud, just rename it
            finalMergedCloud = insideClouds[0];
            try {
                finalMergedCloud.SetName(finalCloudName);
                showMessage("Info", "Using single colored cloud: " + finalMergedCloud.GetName());
            } catch (e) {
                showMessage("Warning", "Could not rename single cloud: " + e.message);
            }
        } else {
            // Multiple colored clouds, merge them
            finalMergedCloud = mergeClouds(insideClouds, finalCloudName);
            if (finalMergedCloud) {
                showMessage("Info", "Merged " + insideClouds.length + " colored regions successfully");
            } else {
                showMessage("Warning", "Failed to merge colored clouds - keeping them separate");
                // Keep the first colored cloud as the "final" one for naming purposes
                finalMergedCloud = insideClouds[0];
                try {
                    finalMergedCloud.SetName(finalCloudName);
                } catch (e) {
                    showMessage("Warning", "Could not rename fallback cloud: " + e.message);
                }
            }
        }
    }
    
    // Outside regions are no longer created, so no merging needed
    
    // Hide original cloud if requested
    if (config.hideOriginalCloud) {
        sourceCloud.SetVisibility(false);
    }
    
    // Group the colored clouds together
    groupClouds(insideClouds, finalMergedCloud);
    
    // Summary
    var summary = "Processing complete!\n";
    summary += "Images processed: " + processedCount + "/" + images.length + "\n";
    summary += "Colored regions created: " + insideClouds.length + "\n";
    if (finalMergedCloud) {
        try {
            summary += "Final combined cloud: " + finalMergedCloud.GetName();
        } catch (e) {
            summary += "Final combined cloud created (name unavailable)";
        }
    } else {
        summary += "No colored clouds were created";
    }
    
    showMessage("Complete", summary);
    
} catch (e) {
    showMessage("Error", "Script failed: " + e.message);
    throw e;
}

