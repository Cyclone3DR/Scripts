/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR\Script\JsDoc\Reshaper.d.ts"/>

// -------------- HOW TO USE IT -----------------------------
//
// The goal of this script is to separate a point cloud by box then export those boxes to the disk.
// Optionally, a limitbox can be selected to delimit the area to be extracted. 
// Box generation starts from the lower point (xmin, ymin, zmin) of the limitbox.
// SCloud and SCWCloud are supported.
//
// Instruction:
// 1) Select the point cloud and an optional limitbox.
// 2) Run the script and define the box dimension in the dialog.

// -------------- Generic box utilities -----------------------------
//
 /**
  * Cell coordinates
  */
 class Cell
 {
     constructor(i, j, k)
     {
         this.I = i;
         this.J = j;
         this.K = k;
     }
 }
 
  /**
   * Size of a box along its 3 axes.
   */
 class BoxSize
 {
     constructor(sizeX, sizeY, sizeZ)
     {
         this.X = sizeX;
         this.Y = sizeY;
         this.Z = sizeZ;
     }    
 }
 
  /**
   * Definition of a box
   */
 class BoxDef
 {
     /**
      * Default constructor.
      * All parameters are to be defined in the WCS
      * @param {SPoint} iLowerPt The lower point of the box
      * @param {SPoint} iUpperPt The upper point of the box
      * @param {SVector} iXaxis X axis of the box
      * @param {SVector} iYaxis Y axis of the box
      * @param {SVector} iZaxis Z axis of the box
      * @param {number} iXlength Length of the box along its X axis
      * @param {number} iYlength Length of the box along its Y axis
      * @param {number} iZlength Length of the box along its Z axis
      */
     constructor(iLowerPt, iUpperPt, iXaxis, iYaxis, iZaxis, iXlength, iYlength, iZlength)
     {
         this.LowerPt=iLowerPt;
         this.UpperPt=iUpperPt;
 
         this.Xaxis=iXaxis;
         this.Yaxis=iYaxis;
         this.Zaxis=iZaxis;
 
         this.Size = new BoxSize(iXlength, iYlength, iZlength);
     }
 
     /**
      * Create a SClippingBox from the current definition
      * @returns {SClippingBox} A clipping box
      */    
     ToClippingBox()
     {
         var firstPt = this.LowerPt;

         var secondPt = SPoint.New(firstPt);
         secondPt.Translate(this.Xaxis.Mult(this.Size.X));

         var thirdPt = SPoint.New(firstPt);
         thirdPt.Translate(this.Yaxis.Mult(this.Size.Y));

         var fourthPt = SPoint.New(firstPt);
         fourthPt.Translate(this.Zaxis.Mult(this.Size.Z));

         return SClippingBox.New(firstPt, secondPt, thirdPt, fourthPt);
     }
 }

/**
 * Create a box definition from a clipping box
 * @param {SClippingBox} iClipBox The clipping box
 * @returns {BoxDef} a box definition
 */
function GetBoxDef(iClipBox)
{
    return new BoxDef(
        iClipBox.GetLowerPoint(),
        iClipBox.GetUpperPoint(),
        iClipBox.GetAxisX(),
        iClipBox.GetAxisY(),
        iClipBox.GetAxisZ(),
        iClipBox.GetLength(),
        iClipBox.GetWidth(),
        iClipBox.GetHeight(),
    );
}

/**
 * Compute a box from a given size and its cell position in a main box
 * @param {BoxDef} iMainBoxDef The boundingbox
 * @param {Cell} iCell The cell position of the box in the main bounding box
 * @param {BoxSize} iBoxSize The size of the box to create
 * @returns {BoxDef} the definition of the created box
 */
function CreateSubBox(iMainBoxDef, iCell, iBoxSize)
{
    // Shift the position from the origin
    var origin = iMainBoxDef.LowerPt;

    var offsetLower = [
        iCell.I * iBoxSize.X,
        iCell.J * iBoxSize.Y,
        iCell.K * iBoxSize.Z
    ]; 

    var lowerPt = SPoint.New(origin);
    lowerPt.Translate(iMainBoxDef.Xaxis.Mult(offsetLower[0]));
    lowerPt.Translate(iMainBoxDef.Yaxis.Mult(offsetLower[1]));
    lowerPt.Translate(iMainBoxDef.Zaxis.Mult(offsetLower[2]));

    var offsetUpper = [
        Math.min((iCell.I+1) * iBoxSize.X, iMainBoxDef.Size.X),
        Math.min((iCell.J+1) * iBoxSize.Y, iMainBoxDef.Size.Y),
        Math.min((iCell.K+1) * iBoxSize.Z, iMainBoxDef.Size.Z)
    ];
    
    var x = Math.abs(offsetUpper[0]-offsetLower[0]);
    var y = Math.abs(offsetUpper[1]-offsetLower[1]);
    var z = Math.abs(offsetUpper[2]-offsetLower[2]);

    if( x < 1e-6 || y < 1e-6 || z < 1e-6)
        return null;

    var upperPt = SPoint.New(origin);    
    upperPt.Translate(iMainBoxDef.Xaxis.Mult(offsetUpper[0]));
    upperPt.Translate(iMainBoxDef.Yaxis.Mult(offsetUpper[1]));
    upperPt.Translate(iMainBoxDef.Zaxis.Mult(offsetUpper[2]));

    var subBoxDef = new BoxDef(
        lowerPt, 
        upperPt, 
        iMainBoxDef.Xaxis, 
        iMainBoxDef.Yaxis, 
        iMainBoxDef.Zaxis, 
        offsetUpper[0]-offsetLower[0], 
        offsetUpper[1]-offsetLower[1], 
        offsetUpper[2]-offsetLower[2]
        );

    return subBoxDef;
}

/**
 * Divide a boundingbox into several smaller boxes of the same size.
 * The boundary boxes may be truncated.
 * @param {BoxDef} iBoundingBoxDef The global bounding box to subdivide
 * @param {BoxSize} iBoxSize The size of the box to create
 * @returns {array} array of pairs<Cell, BoxDef> accessible by keys "cell" and "def"
 */
function ComputeBoxes(iBoundingBoxDef, iBoxSize)
{
    // Compute number of cells
    var nbI = Math.floor(iBoundingBoxDef.Size.X / iBoxSize.X) + 1;
    var nbJ = Math.floor(iBoundingBoxDef.Size.Y / iBoxSize.Y) + 1;
    var nbK = Math.floor(iBoundingBoxDef.Size.Z / iBoxSize.Z) + 1;

    // Compute all boxes
    var boxList = [];    
    for(var ii=0; ii<nbI; ii++)
    {
        for(var jj=0; jj<nbJ; jj++)
        {
            for(var kk=0; kk<nbK; kk++)
            {
                var cell = new Cell(ii, jj, kk);
                var boxDef = CreateSubBox(iBoundingBoxDef, cell, iBoxSize);

                if(boxDef != null)
                {
                    boxList.push({
                        "cell": cell,
                        "def": boxDef
                    });
                }
            }
        }
    }

    return boxList;
}

//-------------- Split methods ----------------------------------------
//
/**
 * Extract all points from a CloudWorx cloud inside a given box
 * @param {SCWCloud} iCWCloud The cloud to split
 * @param {BoxDef} iBoxDef The box used to split the input cloud
 * @param {number} iNbMaxPts The maximum number of points per box
 * @returns {any} a structure containing the split result (SCloud)
 */
function SplitCWCloudWithBox(iCWCloud, iBoxDef, iNbMaxPts)
{
    var clipBox = iBoxDef.ToClippingBox();
    clipBox.AddToDoc();
    clipBox.Clip(iCWCloud);
    var resConvertion = iCWCloud.ToCloud(iNbMaxPts);
    clipBox.RemoveFromDoc();

    return {
        "ErrorCode": resConvertion.ErrorCode,
        "Comp": resConvertion.Cloud
    };
}

/**
 * Extract all points from a cloud inside a given box
 * @param {SCloud} iCloud The cloud to split
 * @param {BoxDef} iBoxDef The box used to split the input cloud
 * @returns {any} a structure containing the split result (SCloud)
 */
function SplitCloudWithBox(iCloud, iBoxDef)
{
    var contour = SMultiline.New();

    var offsetX = iBoxDef.Xaxis.Mult(iBoxDef.Size.X);
    var offsetY = iBoxDef.Yaxis.Mult(iBoxDef.Size.Y);
    var offsetZ = iBoxDef.Zaxis.Mult(iBoxDef.Size.Z);

    var lowPt = iBoxDef.LowerPt;
    var upPt = iBoxDef.UpperPt;
    
    contour.InsertLast(lowPt)

    var pt2 = SPoint(lowPt);
    pt2.Translate(offsetX);
    contour.InsertLast(pt2);
    
    var pt3 = SPoint(pt2);
    pt3.Translate(offsetY);
    contour.InsertLast(pt3);
    
    var pt4 = SPoint(lowPt);
    pt4.Translate(offsetY);
    contour.InsertLast(pt4);
    contour.Close();

    var resSeparate = iCloud.Separate(contour, iBoxDef.Zaxis, lowPt, upPt, SCloud.FILL_IN_ONLY);

    return {
        "ErrorCode": resSeparate.ErrorCode,
        "Comp": resSeparate.InCloud
    };
}

/**
 * Export a cloud to E57, LAS or LAZ
 * @param {SCloud} iCloud The cloud to export
 * @param {string} iPath The output path
 * @param {number} iNbMaxPts The maximum number of points per box. Not used.
 * @returns {number} an error code
 */
function ExportCloudToDisk(iComp, iPath, iNbMaxPts)
{
    return SSurveyingFormat.ExportCloud(iComp, iPath);
}

/**
 * Pseudo factory to gather all managed input types.
 * For each types, a splitting method is associated which takes as input a SComp object and a box definition 
 * and returns a SCloud object.
 */
const s_SplitFactory = {
    "SCwCloud": SplitCWCloudWithBox,
    "SCloud": SplitCloudWithBox
    };

/**
 * Split an object by a box and export it to the disk.
 * @param {SComp} iComp The comp to split and export
 * @param {BoxDef} iBoxDef The box definition
 * @param {function} iSplitFunc The function to split
 * @param {function} iExportFunc The export function 
 * @param {string} iFilePath The output path
 * @param {number} iMaxNbPtsPerBox The maximum number of points per box. Used for streamed point clouds.
 * @returns {number} an error code
 */
function ExportBox(iComp, iBoxDef, iSplitFunc, iExportFunc, iFilePath, iMaxNbPtsPerBox)
{
    var resSplit = iSplitFunc(iComp, iBoxDef, iMaxNbPtsPerBox);
    if (resSplit.ErrorCode == 1) 
    {
        return 1;
    }
    else 
    {
        var theComp = resSplit.Comp;
        var resExport = iExportFunc(theComp, iFilePath);

        // Release memory if supported
        if (typeof theComp.Clear == 'function')
            theComp.Clear();

        if (resExport.ErrorCode == 1)
            return 2;
    }

    return 0;    
}

/**
 * Split an object by a box and export it to the disk.
 * @param {SComp} iCompToSplit The object to split per box
 * @param {BoxDef} iBoundingBoxDef The bounding box definition
 * @param {BoxDef} iSplitBox The box used to split the object
 * @param {function} iSplitCompFunc The function to split the input comp
 * @param {function} iExportCompFunc The export function
 * @param {String} iOutputPath The output path
 * @param {String} iBoxNamePattern The name pattern for each box
 * @param {number} iMaxNbPtsPerBox The maximum number of points per box. Used for streamed point clouds.
 */
function DoSegmentation(iCompToSplit, iBoundingBoxDef, iSplitBox, iSplitCompFunc, iExportCompFunc, iOutputPath, iBoxNamePattern, iMaxNbPtsPerBox)
{
    var boxList = ComputeBoxes(iBoundingBoxDef, iSplitBox);  

    // Loop over the boxes to separate the input object
    for(var box of boxList)
    {
        var cell = box["cell"];
        var boxDef = box["def"];
        var cellName = "Cell (" + cell.I + ", " + cell.J + ", " + cell.K + ")";

        // build a valid filepath
        var fileName = iBoxNamePattern.replace("#I#", cell.I).replace("#J#", cell.J).replace("#K#", cell.K);
        var fullpath = iOutputPath + fileName;
        
        var file = SFile.New(fullpath);
        if(file.Exists())
            throw new Error(cellName + ": The file \"" + fullpath + "\" already exists.");

        // Do the export
        var error = ExportBox(iCompToSplit, boxDef, iSplitCompFunc, iExportCompFunc, fullpath, iMaxNbPtsPerBox);
        
        if(error == 0)
            print(cellName + ": Exported at " + fullpath);
        else if(error == 1)
            print(cellName + ": Empty cell.");
        else if(error == 2)
            throw Error(cellName + ": Export failed at " + fullpath);
        else
            throw new Error(cellName + ": Unknown error (" + error + ")");
    }
}

/**
 * Main method of the script
 */
function Main()
{
    var compToSplit=null;
    var clipBox=null;
    var title = "Point cloud box segmentation"
    
    // Check is a point cloud is selected
    var selClouds = [].concat(SCloud.FromSel(), SCwCloud.FromSel());
    if(selClouds.length != 1)
    {
        SDialog.Message(
            "Select one point cloud and optionally, a limitbox to define the area to split.",
            SDialog.Error,
            "Empty selection");

        throw Error("Wrong selected inputs.");
    }
    var compToSplit = selClouds[0];

    // Check if a clipping box is selected
    var allClipBox = SClippingBox.FromSel();
    if(allClipBox.length > 0)
        clipBox = allClipBox[0];
    
    // Initialize the bouding area
    if(!clipBox)
        clipBox = SClippingBox.New([compToSplit]);
    else
        clipBox.UnclipAll();
    
    var mainBoxDef = GetBoxDef(clipBox);
    
    // Load the segmentation method
    var compType = compToSplit.toString();
    if( !(compType in s_SplitFactory))
        throw Error("The type \"" + compType + "\"is not supported.");

    var definePointLimit = (compType == "SCwCloud");
    
    var funcSplit = s_SplitFactory[compType];

    // Initialize the form
    var userForm = SDialog.New(title);

    userForm.SetHeader(
        "This script allows splitting an input point cloud by box.\n"+
        "Each subdivision is exported to an individual file on the disk.\n"+
        "The box definition and the output file names can be define through the following parameters.\n"+
        "Optionnaly, the splitting area can be restricted by selecting a limitbox which will also be used to align the splitting box."
    );
    userForm.BeginGroup("Box definition");
    userForm.AddLength({
        id: "sizeX",
        name: "Size X",
        value: 10,
        tooltip: "Length of the splitting box."
    });

    userForm.AddLength({
        id: "sizeY",
        name: "Size Y",
        value: 10,
        tooltip: "Width of the splitting box."
    });

    userForm.AddLength({
        id: "sizeZ",
        name: "Size Z",
        value: 0,
        min: 0,
        tooltip: "Height of the splitting box.\nSet 0 to use the full height of the bounding box."
    });

    if(definePointLimit)
    {
        userForm.AddInt({
            id: "maxPointsPerBox",
            name: "Number of points",
            value: 10000000,
            min: 1,
            tooltip: "Maximum number of points per box."
        });      
    }    

    userForm.BeginGroup("Output");

    userForm.AddTextField({
        id: "boxNamePattern",
        name: "Box Names",
        value: "Box_[#I#_#J#_#K#].e57",
        tooltip: "Use #I#, #J# and #K# to insert cell index in the box names.\nSupported format: e57, las and laz."
    });

    userForm.AddTextField({
        id: "outputPath",
        name: "Output path",
        value: "D:\\Temp\\",
        tooltip: "Output folder where all files will be written. The path must exist."
    });

    var outputPathValid = false;
    var tmpPath;

    // Launch the dialog until the output path is valid
    while (!outputPathValid) 
    {
        var resForm = userForm.Run();
        if (resForm.ErrorCode != 0)
        {
            print("Operation canceled.");
            return;
        }

        tmpPath = resForm.outputPath;
        if (!tmpPath.endsWith("\\"))
        tmpPath += "\\";

        var folder = SFile.New(tmpPath);
        outputPathValid = folder.Exists();
        if(!outputPathValid)
        {
            SDialog.Message(
                "The output folder is invalid:\n" + tmpPath + "\nPlease define a new one.",
                SDialog.Error,
                title);
        }
    }

    // Load output infos
    var outputPath = tmpPath;
    var boxNamePattern = resForm.boxNamePattern;

    var pointLimit = -1;
    if(definePointLimit)
        pointLimit = resForm.maxPointsPerBox;

    // Create all boxes
    var boxHeight = resForm.sizeZ;
    if (boxHeight == 0.)
        boxHeight = mainBoxDef.Size.Z;

    var boxSplit = new BoxSize(resForm.sizeX, resForm.sizeY, boxHeight);      
    
    // Perfom the segmentation
    DoSegmentation(compToSplit, mainBoxDef, boxSplit, funcSplit, ExportCloudToDisk, outputPath, boxNamePattern, pointLimit);

    OpenUrl(outputPath);
}

// Main
Main();

