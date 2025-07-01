/**
 * Orthographic image generation utility
 * 
 * This script provides a functionality to export top-down orthographic images from LGSx data. Both LIDAR and image based orthographic images are supported. Results are exported as .JPG data with geographic information (.JGW). 
 * 
 * The following script has been tested on the following release versions:
    - Cyclone 3DR 2025.1.2.47945 

 * For more information regarding this script consult the project .md file 
 * --> https://github.com/Cyclone3DR/Scripts/tree/master/COMMUNITY%20SCRIPTS/Large%20Scale%20Ortho%20Image/README.md
 * 
 * How to use
    1. Run the script and select processing type ("IMAGE" or "LIDAR").
    2. If no Cloudworx data is already loaded in the project, the script will ask you to select the file (.LGSx) you want to open.  
    3. Input user settings such as road width, triangle size, camera to use, image pixel size, etc... (settings vary depending on processing type)
    4. Set the file save location and file prefix*. 
    (*The generated orthoimages name will containt the selected prefix AND the tile name. You can rename the tiles to you preference if you need a specific naming.) 
    5. Wait for the processing to finish. The files will be saved on the set location on your computer. 
 */

/* ---- Main code Starts here ------ */

var myScriptParameters_ImageMode;
var myScriptParameters_LidarMode;
var myScriptParameters_Export;
var myCameraParameters; 
var defaultProjectName = '/Ortho.3dr';

PROCESS_Execute();

MISC_POPUP_ErrorMessageIfAny();

/* ---- End of the script ------ */



/*---------------------------------------------
 * PROCESS FLOW RELATED
 *---------------------------------------------*/

/**
 * Open menu to select process to run
 * The script offers 2 type of processing: 
 * - Image based orthoimage generation
 * - LIDAR based orthoimage generation 
 */
function MENU_MAINMENU()
{
    //Create a dialog to choose process to run
	var myDialog = SDialog.New("Main Menu");

    myDialog.BeginGroup('Processing type');

    var myOptions = {
        'option0':String('JPG ORTHO'),
        'option1':String('LIDAR ORTHO')   
        }
    
    myDialog.AddChoices({
    'id': 'myChoices',
    'name': 'Select processing type: ',
    'tooltip': "Select JPG ORTHO to generate an ortho image based on recorded camera data. Select LIDAR ORTHO to generate an ortho image based on the captured LIDAR data.",
    'choices': [myOptions.option0,myOptions.option1],
    'value': 0, //  correspond to 'option A'
    'saveValue': false,
    'readOnly': false,
    'style': SDialog.RadioButtons
    });

    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    return {     
        'Choice': myResult
    };
}


/**
 * Check if the data contains trajectory  information
 */
function LGS_CheckIfContainsTrajectory()
{
    var myTrjTbl = LGS_ImportTrajectory().TrajectoryTbl;

    //Stop the application and return error if the project does not contain trajectory data (= if the data is not TRK generated data).
    if (myTrjTbl.length == 0)
    {
        POPUP_Message('Error',"Cloudworx data does not contain trajectory information",SDialog.Error);
        throw new Error("Cloudworx data does not contain trajectory information - process aborted");
    }

}


/**
 * Execute the process selected by the user
 */
function PROCESS_Execute()
{
    var myChoice1;
    var myChoice2;
    var myMultilineSelected;

    //call main menu
    myChoice1 = MENU_MAINMENU().Choice.myChoices;

    //get current multiline selection
    myMultilineSelected = SMultiline.FromSel();

    //Detect automatically if processing is over the whole data, or only for selected tiles depending on current selection size
    if (myMultilineSelected.length == 0)
    {
        myChoice2 = 0;
    } else {
        myChoice2 = 1;
    } 
    //Run process accordingly
    var myProcess = Number(myChoice1)*10 + Number(myChoice2);
    var myLGSTiles = [];
    
    switch(myProcess) {
    case 0:
        //Import LGS data
        LGS_Open();
        //Return error if the data is not TRK data
        LGS_CheckIfContainsTrajectory();
        //Ask for user settings
        myScriptParameters_ImageMode = SETTINGS_IMAGEMODE();  
        myCameraParameters = SETTING_Camera(); 
        myScriptParameters_Export = SETTINGS_EXPORT();
        //Generate Mozaic tiles for processing
        myLGSTiles = LGS_MozaicSplit_ImageOrtho().TileTbl;        
        //Generate ortho for each Mozaic tile        
        LGS_GenerateImageOrtho(myLGSTiles);

        break;
    case 1:
        //Import LGS data
        LGS_Open();
        //Return error if the data is not TRK data
        LGS_CheckIfContainsTrajectory();
        //Ask for user settings
        myScriptParameters_ImageMode = SETTINGS_IMAGEMODE();  
        myCameraParameters = SETTING_Camera(); 
        myScriptParameters_Export = SETTINGS_EXPORT();
        //Get Mozaic tiles for processing from user selection
        myLGSTiles = SMultiline.FromSel();
        //Generate ortho for each Mozaic tile        
        LGS_GenerateImageOrtho(myLGSTiles);
        break;
    case 10:
        //Import LGS data
        LGS_Open();
        myScriptParameters_LidarMode = SETTINGS_LIDARMODE();  
        myScriptParameters_Export = SETTINGS_EXPORT();
        //Generate Mozaic tiles for processing
        myLGSTiles = LGS_MozaicSplit_LidarOrtho().TileTbl;
        LGS_GenerateLidarOrtho(myLGSTiles);
        
        break;
    case 11:
        //Import LGS data
        LGS_Open();
        myScriptParameters_LidarMode = SETTINGS_LIDARMODE();  
        myScriptParameters_Export = SETTINGS_EXPORT();
        //Get Mozaic tiles for processing from user selection
        myLGSTiles = SMultiline.FromSel();
        LGS_GenerateLidarOrtho(myLGSTiles);
        break;
    
    default:
        POPUP_Message('Error',"Invalid choice",SDialog.Error);   
        throw new Error("Invalid choice");;
        break;
    } 
}




/*---------------------------------------------
 * PROCESSES
 *---------------------------------------------*/

/**
 * Create a mozaic split covering all the road surfaces visible in the lgs data loaded.
 */
function LGS_MozaicSplit_ImageOrtho()
{   
    var mySampleCloudTbl;
    var myTrjTbl;
    var myRoadMasksTbl;
    var myMozaicTiles;
    var myRoadCloudTbl;

    Print('');
    Print('Spliting data as mozaic');

    try{
        //Convert LGS file into a sparse point cloud 
        mySampleCloudTbl = LGS_ImportCloud(1000000).CloudTbl;
        //Import trajectories from LGS
        myTrjTbl = LGS_ImportTrajectory().TrajectoryTbl;
        //Extract the road part only
        myRoadMasksTbl = TRAJECTORY_GenerateRoadMask(myTrjTbl).RoadMaskTbl;

        //Extract Road Surface
        myRoadCloudTbl = CLOUD_SplitRoadSurface(myRoadMasksTbl,mySampleCloudTbl).RoadCloudTbl

        //Generate mozaic on the sparse cloud data
        myMozaicTiles = CLOUDTBL_GenerateAllTilesBounds(myRoadCloudTbl).TileTbl;
        
    } catch {    
        Print('Error during mozaic creation');
        myScriptParameters_Export.ScriptErrorFlag = true;
    }
    
    return {
        'TileTbl': myMozaicTiles
    };
}


/**
 * Create a mozaic split covering all cloud data in the lgs data loaded.
 */
function LGS_MozaicSplit_LidarOrtho()
{   
    var mySampleCloudTbl;
    var myMozaicTiles;

    Print('');
    Print('Spliting data as mozaic');

    try{
        //Convert LGS file into a sparse point cloud 
        mySampleCloudTbl = LGS_ImportCloud(1000000).CloudTbl;

        //Generate mozaic on the sparse cloud data
        myMozaicTiles = CLOUDTBL_GenerateAllTilesBounds(mySampleCloudTbl).TileTbl;

    } catch {    
        Print('Error during mozaic creation');
        myScriptParameters_Export.ScriptErrorFlag = true;
    }    

    return {
        'TileTbl': myMozaicTiles
    };
}



/**
 * Calculate orthoimages for the whole dataset.
 * This process import the  data of each tile 1 by 1, extract road surface, mesh it, texture it and generate orthoimage. 
 */
function LGS_GenerateImageOrtho(myMozaictileTbl)
{
    var myData;
    var myLGSClouds;
    var myLGSTrj;
    var myLGSImg;
    var myRoadMaskTbl;
    var myRoadCloudTbl;
    var myRoadMeshTbl;
    var myTexturedRoadMeshTbl;
    var myTotalImages = [];

    var myCounter = 0;
    for (var tile=0; tile<myMozaictileTbl.length; tile++)
    {
        //Remove any clipping first if any
        var myClipsTbl = SClipping.All(2);
        MISC_ForEach_RemoveFromDoc(myClipsTbl);
        
        //Display live progress
        myCounter++;
        MISC_DisplayProgression('Ortho generation :',myCounter,myMozaictileTbl.length);

        
        //import cloud and image data from LGS
        myData = LGS_ImportTile_ALL(myMozaictileTbl[tile]);
        myLGSImg = myData.LGSImg;
        myLGSClouds = myData.LGSClouds;
        myLGSTrj = myData.LGSTrj;


        MISC_ForEach_AddToDoc(myLGSImg);
        myTotalImages = myLGSImg.concat(myTotalImages);

        //Hide LGS data
        SCwCloud.All(2)[0].SetVisibility(false);  
   
        //Generate Mask
        myRoadMaskTbl = TRAJECTORY_GenerateRoadMask(myLGSTrj).RoadMaskTbl;  

        //Use mask to split cloud around trajectory    
        myRoadCloudTbl = CLOUD_SplitRoadSurface(myRoadMaskTbl,myLGSClouds).RoadCloudTbl;

        //Generate RoadMesh from Clouds
        myRoadMeshTbl = CLOUD_MeshRoadSurface(myRoadCloudTbl,myMozaictileTbl[tile]).RoadMeshTbl;

        //Texture mesh 
        myTexturedRoadMeshTbl = MESH_TextureAll(myTotalImages,myRoadMeshTbl).TexturedMesTbl;

        //add to doc for ortho creation
        MISC_ForEach_AddToDoc(myTexturedRoadMeshTbl);

        //hide data unrelated to ortho generation
        MISC_HideAll();
        MISC_ShowSpecific(myTexturedRoadMeshTbl);
        
        //Generate Ortho
        MOZAIC_GenerateSingleOrtho(myMozaictileTbl[tile]);

        //Turn on display of grid
        MISC_ShowSpecific(myMozaictileTbl);

        //Remove from doc if user doesn t need it
        MISC_ForEach_Clear(myTexturedRoadMeshTbl);
       
        //Clear data for memory cleanup    
        MISC_ForEach_Clear(myData);          
        MISC_ForEach_Clear(myLGSClouds);
        MISC_ForEach_Clear(myLGSTrj);
        MISC_ForEach_Clear(myLGSImg);
        MISC_ForEach_Clear(myRoadMaskTbl);
        MISC_ForEach_Clear(myRoadCloudTbl);
        MISC_ForEach_Clear(myRoadMeshTbl);
    }
}


/**
 * Calculate Lidar based orthoimage for the whole dataset.
 * This process import the  data of each tile 1 by 1, extract the cloud and generate orthoimage.
 */
function LGS_GenerateLidarOrtho(myMozaictileTbl)
{
    var myData;
    var myLGSClouds;

    try{        
        var myCounter = 0;
        for (var tile=0; tile<myMozaictileTbl.length; tile++)
        {
            //Remove any clipping first if any
            var myClipsTbl = SClipping.All(2);
            MISC_ForEach_RemoveFromDoc(myClipsTbl);
        //Display live progress
        myCounter++;
        MISC_DisplayProgression('Ortho generation :',myCounter,myMozaictileTbl.length);

        

        //import cloud and image data from LGS
        myData = LGS_ImportTile_LIDAR(myMozaictileTbl[tile]);
        myLGSClouds = myData.LGSClouds;

        //hide data unrelated to ortho generation        
        MISC_HideAll();

        //set cloud representation
        var myCloudToDisplayTbl =  CLOUDTBL_ForEach_SetRepresentation(myLGSClouds).CloudTbl;

        //Display data for ortho export
        MISC_ForEach_AddToDoc(myCloudToDisplayTbl);           
        MISC_ShowSpecific(myCloudToDisplayTbl);

        //Generate Ortho        
        MOZAIC_GenerateSingleOrtho(myMozaictileTbl[tile]);

        //Export point cloud data if requested by user
        //(Placed at the end of the process so the ortho is still generated in case of error)
        CLOUDTBL_Export(myCloudToDisplayTbl,myMozaictileTbl[tile].GetName());

        //Turn on display of grid
        MISC_ShowSpecific(myMozaictileTbl);

        //Clear data for memory cleanup    
        MISC_ForEach_Clear(myData);  
        MISC_ForEach_Clear(myLGSClouds);
        MISC_ForEach_Clear(myCloudToDisplayTbl);
        }
    } catch {}
}






/*---------------------------------------------
 * CALCULATIONS
 *---------------------------------------------*/

/**
 * Calculate horizontal extent of the dataset.
 */
function CLOUDTBL_GetBounds(myCloudTbl)
{
    var myCloud = SCloud.Merge(myCloudTbl).Cloud;
    var myBounds = myCloud.GetBoundingBox();
    var myMinX = myBounds.LowPoint.GetX()-10;
    var myMaxX = myBounds.UpPoint.GetX()+10;
    var myMinY = myBounds.LowPoint.GetY()-10;
    var myMaxY = myBounds.UpPoint.GetY()+10;
    var myMaxZ = myBounds.UpPoint.GetZ()+10;
   
   return {
        'myMinX': myMinX,
        'myMaxX': myMaxX,
        'myMinY': myMinY,
        'myMaxY': myMaxY,
        'myMaxZ': myMaxZ
    };
}

/**
 * Generate mozaic tiles covering the data in "myCloudtbl".
 * Each tile is set to be 50mx50m.
 */
function CLOUDTBL_GenerateAllTilesBounds(myCloudtbl)
{
    //Calculate max X and Y of data
    var myTemporaryCloud = SCloud.Merge(myCloudtbl).Cloud;
    var myBounds = CLOUDTBL_GetBounds(myCloudtbl);
    var myUperleftCorner = SPoint.New(myBounds.myMinX,myBounds.myMaxY,myBounds.myMaxZ+10);
    
    //Calculate Tile Size
    var myTilesize = 50;
    var myRowTranslation = SVector.New(myTilesize,0,0);
    var myColumnTranslation = SVector.New(0,-myTilesize,0);

    //Calculate how many tiles will be in our Mozaic
    var myTotalX = myBounds.myMaxX-myBounds.myMinX;
    var myTotalY = myBounds.myMaxY-myBounds.myMinY;
    var myTotalRows =  Math.ceil(myTotalX/myTilesize);
    var myTotalColumns = Math.ceil(myTotalY/myTilesize) ;

    //Show Cloudworx cloud 
    SCwCloud.All(2)[0].SetVisibility(true);

    //Center a top-down  View
    SetCameraDirection(SVector.New(0,0,-1),SVector.New(0,1,0));
    SetCameraMode(ViewModeEnum.ORTHOGRAPHIC);
    
    //Zoom on scene
    var myComp = [];
    myComp.push(myTemporaryCloud);
    ZoomOn(myComp,1000);

    //Generates Mozaic Tile boundaries
    var myTileTbl = []; 
    for (var row=0; row<myTotalRows; row++)
    {
        //Shift position to row number
        var myOrthoCoordinates = SPoint.New(myUperleftCorner);
        myOrthoCoordinates.Translate(myRowTranslation.Mult(row));

        for (var column=0; column<myTotalColumns; column++)
        {               
            try {
                //Shift position to Column number
                myOrthoCoordinates.SetY(myUperleftCorner.GetY());
                myOrthoCoordinates.Translate(myColumnTranslation.Mult(column));
                
                //Create Tile Name based on position
                var myTileID = '';
                myTileID = myTileID.concat('X');
                myTileID = myTileID.concat(String(row).padStart(String(myTotalRows).length,'0'));
                myTileID = myTileID.concat('Y');
                myTileID = myTileID.concat(String(column).padStart(String(myTotalColumns).length,'0'));

                //Display limits of each tile
                var myTileBounds = SMultiline.New(); 
                myTileBounds.InsertFirst(myOrthoCoordinates);
                myTileBounds.InsertLast(myOrthoCoordinates.Add(SPoint.New(myTilesize,0,0)),0);
                myTileBounds.InsertLast(myOrthoCoordinates.Add(SPoint.New(myTilesize,-myTilesize,0)),0);
                myTileBounds.InsertLast(myOrthoCoordinates.Add(SPoint.New(0,-myTilesize,0)),0);
                myTileBounds.Close();

                 //Check if there is any mesh data inside the area
                var tempComp = [];
                tempComp.push(myTileBounds);
                var myLimitPoly = SPoly.LinearExtrusion(10000,SVector.New(0,0,1),false,tempComp).CompTbl[0];
                myLimitPoly.Translate(SVector.New(0,0,5000));
                var myTileCloud = myTemporaryCloud.SeparatePoly(myLimitPoly,0,SCloud.FILL_ALL).InCloud;

                if (myTileCloud.GetNumber() != 0) {
                    //Add to the scene
                    myTileBounds.AddToDoc();
                    myTileBounds.SetColors(255,0,0);
                    myTileBounds.SetName(myTileID);
                    //Add to the tbl of bounds to export
                    myTileTbl.push(myTileBounds);
                }

            } catch {}            
        }        
    }

    myTemporaryCloud.Clear();
    

    return {
        'TileTbl': myTileTbl,
        'TotalRows': Number(myTotalRows),
        'TotalColumns': Number(myTotalColumns),
        'TotalTiles': Number(myTileTbl.length)
    };
}

/**
 * Import all LGS data contained in the tile "myTile". 
 */
function LGS_ImportTile_ALL(myTile)
{
    var myClipBox;
    var myLGSClouds;
    var myLGSImg;
    var myLGSTrj;

    //Create a clip box around the zone to import
    myClipBox = MISC_CreateClipBox(myTile,10).MyClipBox;
    myClipBox.AddToDoc();
    myClipBox.ActivateInAllScenes();

    //Import cloud Data
    myLGSClouds = LGS_ImportCloud(25000000).CloudTbl;

    //import Image and trajectory data
    myLGSTrj = LGS_ImportTrajectory().TrajectoryTbl;
    myLGSImg = LGS_ImportImg().ImagesTbl;

    //Remove ClipBox
    myClipBox.DeactivateInAllScenes();
    myClipBox.RemoveFromDoc();

    return {
        'LGSImg': myLGSImg,
        'LGSClouds': myLGSClouds,
        'LGSTrj': myLGSTrj
    }       
}


/**
 * Import all LGS data contained in the tile "myTile". 
 */
function LGS_ImportTile_LIDAR(myTile)
{
    var myClipBox;
    var myLGSClouds;

    //Create a clip box around the zone to import
    myClipBox = MISC_CreateClipBox(myTile,0).MyClipBox;
    myClipBox.AddToDoc();
    myClipBox.ActivateInAllScenes();

    //Import cloud Data
    myLGSClouds = LGS_ImportCloud(myScriptParameters_LidarMode.LGSPointNumber).CloudTbl;

    //Remove ClipBox
    myClipBox.DeactivateInAllScenes();
    myClipBox.RemoveFromDoc();

    return {
        'LGSClouds': myLGSClouds
    }       
}


/**
 * This function import the trajectories included in the LGS file.
 * Then call for each trajectory a function to calculate the road footprint (mask).
 */
function TRAJECTORY_GenerateRoadMask(myTrajectoryTbl)
{
    //Import all Trajectories
    var myMaskTbl = [];

    //For each trajectory, generates a mask that defines the road surface in 2D
    for (var i=0; i<myTrajectoryTbl.length; i++)
    {
        try{
            //ExportroadMask for 1 trajectory
            var myTempMask = TRAJECTORY_ExtractRoadMask(myTrajectoryTbl[i]).RoadMask2D;
            myMaskTbl.push(myTempMask);
        } catch {}        
    }
    
    return {
        'RoadMaskTbl': myMaskTbl
    };

}

/**
 * Extract footprint of the road as a Spoly. 
 * This footprint (mask) will be used later to extract the point cloud of the road part of the data.
 * Note: it is important to set up "myScriptParameters.IMUHeight" correctly. If the mask is situated further than 50cm away from the cloud no road surface will be detected. 
 */
function TRAJECTORY_ExtractRoadMask(myTrajectory)
{   
    var myName = myTrajectory.GetName();

    try {
        //Convert the trajectory to a polyline
        var myLocalMultiline = myTrajectory.ConvertToMulti().Multi; 

        //Generate 2 lines parallel to the trajectory, separated by the distance setted by the user
        var myOffsetA = myScriptParameters_ImageMode.TextureWidth;
        var myOffsetB = myOffsetA*(-1);

        var myOffsetLineA = myLocalMultiline.Offset(SVector.New(0,0,0),myOffsetA,SMultiline.SAME_SIDE,SPoint.New(0,0,0)).Multi;
        var myOffsetLineB = myLocalMultiline.Offset(SVector.New(0,0,0),myOffsetB,SMultiline.SAME_SIDE,SPoint.New(0,0,0)).Multi;

        //Create a mesh joining the 2 polyline
        var myMultilineTbl = [];
        var myPolyTbl = [];
        myMultilineTbl.push(myOffsetLineA);
        myMultilineTbl.push(myOffsetLineB);

        var myResultMesh = SPoly.JoinContour(myMultilineTbl,myPolyTbl,0,0,1,false,1).Poly;
        var myHeight = -1*myScriptParameters_ImageMode.IMUHeight;
        myResultMesh.Translate(SVector.New(0,0,myHeight));
        myResultMesh.SetName(myName);        
    } catch  { }

    return {
            "RoadMask2D": myResultMesh
    };
}


/**
 * Extract point cloud representing the road surface.
 * This function uses the "RoadMask" generated previously to extract point clouds situated on close to the road surface.
 * The function extract any point inside a 50cm distance to the mask. 
 */
function CLOUD_SplitRoadSurface(roadMaskTbl,myCloudTbl)
{
    
    var myRoadCloudTbl = [];
    var myWholeCloud = SCloud.New();

    //Merge input clouds as one
    myWholeCloud = SCloud.Merge(myCloudTbl).Cloud;


    //Keep only lowest point to get rid of road artifacts
    if (myScriptParameters_ImageMode.UseFiltering == true && myWholeCloud.GetMeanDistance()<0.2)
    {
        var myCenter = SPoint.New(0,0,0);
        var myVector = SVector.New(0,0,1);
        var myplane = SPlane.New(myCenter,myVector);
        var myWholeCloud2 = myWholeCloud.CleanFeatureOrientation(myplane,myScriptParameters_ImageMode.NoiseAngle,-1,true,SCloud.FILL_IN_ONLY).InCloud;

        myWholeCloud = SCloud.New(myWholeCloud2);
        myWholeCloud = myWholeCloud2.NoiseReductionSplit(50).GoodCloud;
    } 

    
    //Separate ground for each track
    for (var i=0; i<roadMaskTbl.length; i++)
    {
        try{  
            var myTempRoadCloud = myWholeCloud.SeparatePoly(roadMaskTbl[i],0.5,SCloud.FILL_ALL).InCloud;

            var myName = roadMaskTbl[i].GetName();
            myName = myName.concat('_RoadCloud');
            myTempRoadCloud.SetName(myName);
            myRoadCloudTbl.push(myTempRoadCloud);   
        } catch { }
    }


    return {
        'RoadCloudTbl': myRoadCloudTbl
    }
}



/**
 * Generate meshes out of the table of clouds defining the road surface "myRoadCloudTbl".
 * The function generate first a rough mesh, then refine it to match the point cloud.
 * The minimum triangle size is as set by the user in "myScriptParameters.MeshSize;".
 * The Maximum triangle size is est to 5cm, in order to achieve good texturing.
 */
function CLOUD_MeshRoadSurface(myRoadCloudTbl,myMozaictile)
{
    var myRoadMeshTbl = [];
    var myCloud = SCloud.Merge(myRoadCloudTbl).Cloud;
    
    try {      
        var myRoughtMesh = CLOUD_MeshRoughly(myCloud).RoughMesh;

        var myMinimumTriangleSize = myScriptParameters_ImageMode.MeshSize;
        var myStDev = myMinimumTriangleSize/10;
        var myRefinedMesh = myRoughtMesh.RemeshRefineDev(myStDev,myMinimumTriangleSize,10000000,SPoly.EXTEND_REFINE,0.1,2,myCloud,-1).Poly;

        //Resample mesh so the triangle size is small enough to allow accurate texturing
        myRefinedMesh = myRefinedMesh.SubdivideTriangles(0.05,true,0,true).Poly;
        
        //Crop the data to the tile size
        var myCroppedMesh = MESH_CropToClipingBox(myRefinedMesh,myMozaictile).CropedMesh;

        var myName = myMozaictile.GetName();
        myName = myName.concat('_Mesh');
        myCroppedMesh.SetName(myName);
        myRoadMeshTbl.push(myCroppedMesh);

    } catch {}   

    return {
        'RoadMeshTbl': myRoadMeshTbl
    }
}

function CLOUD_MeshRoughly(myCloud)
{
    var myRoughMesh;

    // First step: 3D Mesh
    var myMeanDistance = myCloud.GetMeanDistance()*15;
    myRoughMesh = SPoly.Direct3DMesh(myCloud, 0, myMeanDistance, SPoly.HoleOptionEnum.NO_CLOSED, myMeanDistance*3, false, 0 ).Poly;

    return {
        "RoughMesh": myRoughMesh
    }
}

/**
 * The mesh of each tile needs to be slightly larger than its tile in order to avoid holes in the gaps between tiles.
 * It is then necessary to crop the extra lenght.
 * This function crops the mesh "myPoly" to the dimensions of the tile "myTile".
 */
function MESH_CropToClipingBox(myPoly,myTile)
{
    //Make of copy of the mesh
    var myMesh = SPoly.New(myPoly);

    myMesh.SeparateTriangleInPrism(myTile,10000,SPoly.SEPARATETRIBOX_CROSSING_AND_INSIDE,SPoly.SEPARATETRIBOX_KEEP_INSIDE_TRI).Poly;

    var myCroppedMesh = SPoly.New(myMesh);

    return{
        'CropedMesh': myCroppedMesh
    };
}

/**
 * Run texture process for each mesh in "myMeshTbl"
 */
function MESH_TextureAll(myImageTbl,myMeshTbl)
{
    var myTexturedMeshTbl = [];
    var myTexturedMesh;

    //Run texturing of each mesh separately
    for (var i=0; i<myMeshTbl.length; i++)
    {                
        myTexturedMesh = MESH_Texture(myImageTbl,myMeshTbl[i]).TexturedMesh;
        myTexturedMeshTbl.push(myTexturedMesh);
    }

    return {
            "TexturedMesTbl": myTexturedMeshTbl
    };

}


/**
 * Texture mesh in parameter "myMesh" with all the images in the table "myImageTbl"
 */
function MESH_Texture(myImageTbl,myMesh)
{
    var myTexturedMesh = SPoly.New();

    //texture using best images
    myTexturedMesh = STexturingUtil.TextureMeshStandard(myMesh,myImageTbl,0,0,0).Poly;

    return {
        'TexturedMesh': myTexturedMesh
    };
}




/**
 * Create an ortho image of the selected tile.
 * For lidar  ortho, the size of the lidar points is automatically scaled to the chosen DTM, then adjusted to user preferences via the setting myScriptParameters.LidarPointSize
 */
function MOZAIC_GenerateSingleOrtho(myTile)
{
    var myViewDirection = SVector.New(0,0,-1);
    var myHzDirection = SVector.New(1,0,0);

    var myDocumentPath = myScriptParameters_Export.SavePath;
    
    var myOrthoPath = '';
    
    var myOrthoCoordinates= myTile.GetPoint(0); //top left corner
    var myTileID = myTile.GetName();

    var myDTM = myScriptParameters_Export.TexelSize;

    // calculate LIDAR point size
    var myPointSize;
    try {
        //Calculate size accordingly to user preference
        myPointSize = Math.ceil((0.05/myDTM)*(myScriptParameters_LidarMode.LidarPointSize/100));
    } catch {
        //if user preference is not defined use another formula
         myPointSize = Math.ceil((0.05/myDTM));
    }
    
    var myTilesize = myTile.GetLength()/4; 
    
    try{
        //create name for current tile filename
        myOrthoPath = myDocumentPath.concat('_');
        myOrthoPath = myOrthoPath.concat(myTileID);
        myOrthoPath = myOrthoPath.concat('.jpg');

        //Export ortho image
        SImage.ExportOrthoImage(myOrthoPath,myViewDirection,myHzDirection,myOrthoCoordinates,16777215,myTilesize,myTilesize,myDTM,myPointSize,-1);  

        //Set color to green as function succeeeded
        myTile.SetColors(0,255,0);        

    } catch {
        var myErrorText = "ERROR : Unable Export ortho image for tile id: ";
        myErrorText = myErrorText.concat(String(myTileID));
        print(myErrorText);
        myScriptParameters_Export.ScriptErrorFlag = true;
    }    
}






/*---------------------------------------------
 * LGS RELATED
 *---------------------------------------------*/


/**
 * Open LGS Project
 * If a project is already present in the scene, use it instead.
 */
function LGS_Open()
{
    //Get Cloudworx cloud if any is loaded
    var myCWCloud = SCwCloud.All(2)[0];
    
    if (myCWCloud != null)   { return   }

    //Close previous CW data
    SCwCloud.CloseCwProject();

    //Load Selected LGS File as CW data
    Print('Loading LGS document')
    try {
        SCwCloud.NewFromLGSData();
    } catch {
        POPUP_Message("ERROR","Unable to load LGS data",SDialog.Error);
        throw new Error("Unable to load LGS data");
    }
}

function LGS_GetClassNumber()
{
    var myNumberOfClasses;
    var className
    
    //import rough version of point cloud data from current LGS
    var myCloudTbl = LGS_ImportCloud(100000).CloudTbl;
    var myCloud = SCloud.Merge(myCloudTbl).Cloud;

    //Explode by Class
    var myExplodedClouds =  myCloud.ExplodeByClass();
    myNumberOfClasses = myExplodedClouds.ClassTbl.length;

    //get names of the classes for user convenience
    var myClassesNames = [];
    var myClassesID = [];
    for (var i=0;i<myNumberOfClasses;i++)
    {
        className = SCloud.GetClassName(myExplodedClouds.ClassTbl[i]).Name;
        myClassesID.push(myExplodedClouds.ClassTbl[i]);
        myClassesNames.push(className);
    }
        

    return {
        "ClassNb": myNumberOfClasses,
        "ClassID": myClassesID,
        "ClassNames": myClassesNames

    }
}

function CLOUD_GetClassNumber(myCloud)
{
    var myNumberOfClasses;
    var className;

    //Explode by Class
    var myExplodedClouds =  myCloud.ExplodeByClass();
    myNumberOfClasses = myExplodedClouds.ClassTbl.length;

    //get names of the classes for user convenience
    var myClassesNames = [];
    var myClassesID = [];
    for (var i=0;i<myNumberOfClasses;i++)
    {
        className = SCloud.GetClassName(myExplodedClouds.ClassTbl[i]).Name;
        myClassesID.push(myExplodedClouds.ClassTbl[i]);
        myClassesNames.push(className);
    }
        

    return {
        "ClassNb": myNumberOfClasses,
        "ClassID": myClassesID,
        "ClassNames": myClassesNames

    }
}



/**
 * Convert LGS data imported into the project as Trajectory
 */
function LGS_ImportTrajectory()
{
    //Get the first (and unique) CW Cloud in the project
    var myCWCloud = SCwCloud.All(2)[0];
    var myLocalTrajTbl = [];
    
    try {
        //Convert CW to MMS data and keep only Trajectory
        myLocalTrajTbl = myCWCloud.ToMMSData(0,SCwCloud.TRAJECTORIES,0,false,false).TrajectoryTbl;

    } catch {
        POPUP_Message("ERROR","Unable to read Trajectory data from LGS",SDialog.Error);
        throw new Error("Unable to read Trajectory data from LGS");
    }

    return {
        "TrajectoryTbl": myLocalTrajTbl
    };
}

/**
 * Convert LGS data  imported into the project as Cloud
 */
function LGS_ImportCloud(maxPointNumber)
{
    //Get the first (and unique) CW Cloud in the project
    var myCWCloud = SCwCloud.All(2)[0];
    var myLocalCloudTbl = [];
    
    try {
        //Convert CW to MMS data and keep only cloud
        myLocalCloudTbl = myCWCloud.ToMMSData(maxPointNumber,SCwCloud.CLOUDS,0,false,false).CloudTbl;
        
    } catch {
        try {
        //Convert CW to cloud data (if MMS does not have MMS data but TLS data this function will run instead)  
        var myTempCloud = myCWCloud.ToCloud(maxPointNumber,false,true).Cloud;
        myLocalCloudTbl.push(myTempCloud);

        } catch {
            POPUP_Message("ERROR","Unable to read Cloud data from LGS",SDialog.Error);
            throw new Error("Unable to read Cloud data from LGS");
        }
    }

    return {
        "CloudTbl": myLocalCloudTbl
    };
}




/**
 * Convert IMAGE data from LGS data imported into the project.
 * Only keep images that matches the camera set by the user in camera settings 
 */
function LGS_ImportImg()
{
    //Get the first (and unique) CW Cloud in the project
    var myCWCloud = SCwCloud.All(2)[0];
    var myLocalDataTbl;
    var myChoices = myCameraParameters;
    var myFinalImageTbl = [];

    
    try {
        //Convert CW to MMS data and keep only Trajectory
        myLocalDataTbl = myCWCloud.ToMMSData(0,SCwCloud.ObjectsToConvert.IMAGES + SCwCloud.ObjectsToConvert.TRAJECTORIES,0,true,false);

        var myTrjTbl = myLocalDataTbl.TrajectoryTbl;
        var myImageTbl = myLocalDataTbl.ImageTblTbl;

    } catch {
        POPUP_Message("ERROR","Unable to read data from LGS",SDialog.Error);
        throw new Error("Unable to read data from LGS");
    }


    var myImageName = '';
    for (var trackIndex=0; trackIndex < myTrjTbl.length; trackIndex++)
    {   
        try{
            //rename Cloud data according to trajectory number
            var myTrackName = myTrjTbl[trackIndex].GetName();

            //Keep image data only if from the correct camera 
            var trackImagesTable = myImageTbl[trackIndex]; 
            for(var imageIndex = 0; imageIndex < trackImagesTable.length; ++imageIndex)
            {
                myImageName =trackImagesTable[imageIndex].GetName();
                var myTempImage;
                var myFinalImageName='';

                switch(myImageName) 
                {
                case 'Front Right':
                    if (myChoices.Camera_1 == true) 
                    {
                    //rename image for convienience                     
                    myFinalImageName = myFinalImageName.concat(myTrackName);
                    myFinalImageName = myFinalImageName.concat(' ');
                    myFinalImageName = myFinalImageName.concat(myImageName);
                    myFinalImageName = myFinalImageName.concat(' id:');
                    myFinalImageName = myFinalImageName.concat(String(imageIndex));
                    //set data type to pinhole camera                    
                    myTempImage = SImage.New(trackImagesTable[imageIndex],SImage.PERSPECTIVE)
                    //Apply correct name
                    myTempImage.SetName(myFinalImageName);                     
                    //add image data to output table
                    myFinalImageTbl.push(myTempImage);
                    }
                break;
                case 'Front Left':
                    if (myChoices.Camera_2 == true) 
                    {
                    //rename image for convienience  
                    myFinalImageName = myFinalImageName.concat(myTrackName);
                    myFinalImageName = myFinalImageName.concat(' ');
                    myFinalImageName = myFinalImageName.concat(myImageName);
                    myFinalImageName = myFinalImageName.concat(' id:');
                    myFinalImageName = myFinalImageName.concat(String(imageIndex));
                    //set data type to pinhole camera                    
                    myTempImage = SImage.New(trackImagesTable[imageIndex],SImage.PERSPECTIVE)
                    //Apply correct name
                    myTempImage.SetName(myFinalImageName);                     
                    //add image data to output table
                    myFinalImageTbl.push(myTempImage);
                    }
                break;
                case 'Rear Right':
                    if (myChoices.Camera_3 == true) 
                    {
                    //rename image for convienience  
                    myFinalImageName = myFinalImageName.concat(myTrackName);
                    myFinalImageName = myFinalImageName.concat(' ');
                    myFinalImageName = myFinalImageName.concat(myImageName);
                    myFinalImageName = myFinalImageName.concat(' id:');
                    myFinalImageName = myFinalImageName.concat(String(imageIndex));
                    //set data type to pinhole camera                    
                    myTempImage = SImage.New(trackImagesTable[imageIndex],SImage.PERSPECTIVE)
                    //Apply correct name
                    myTempImage.SetName(myFinalImageName);                     
                    //add image data to output table
                    myFinalImageTbl.push(myTempImage);
                    }
                break;
                case 'Rear Left':
                    if (myChoices.Camera_4 == true) 
                    {
                    //rename image for convienience  
                    myFinalImageName = myFinalImageName.concat(myTrackName);
                    myFinalImageName = myFinalImageName.concat(' ');
                    myFinalImageName = myFinalImageName.concat(myImageName);
                    myFinalImageName = myFinalImageName.concat(' id:');
                    myFinalImageName = myFinalImageName.concat(String(imageIndex));
                    //set data type to pinhole camera                    
                    myTempImage = SImage.New(trackImagesTable[imageIndex],SImage.PERSPECTIVE)
                    //Apply correct name
                    myTempImage.SetName(myFinalImageName);                     
                    //add image data to output table
                    myFinalImageTbl.push(myTempImage);
                    }
                break;
                case 'Sphere':
                    if (myChoices.Camera_5 == true) 
                    {
                    //rename image for convienience  
                    myFinalImageName = myFinalImageName.concat(myTrackName);
                    myFinalImageName = myFinalImageName.concat(' ');
                    myFinalImageName = myFinalImageName.concat(myImageName);
                    myFinalImageName = myFinalImageName.concat(' id:');
                    myFinalImageName = myFinalImageName.concat(String(imageIndex));
                    //set data type to pinhole camera                    
                    myTempImage = SImage.New(trackImagesTable[imageIndex],SImage.SPHERICAL)
                    //Apply correct name
                    myTempImage.SetName(myFinalImageName);                     
                    //add image data to output table
                    myFinalImageTbl.push(myTempImage);
                    }
                break;
                default:
                break;
                }
            }
        } catch { 
            POPUP_Message("ERROR","Unable to read Image data from LGS",SDialog.Error);
            throw new Error("Unable to read Image data from LGS");  
        }
    }
    
    return {
        "ImagesTbl": myFinalImageTbl,
        "TrajectoriesTbl": myTrjTbl
    };
}









/*---------------------------------------------
 * MISCELANEOUS
 *---------------------------------------------*/


/**
 * Create a clip box from selected tile.
 * As we need to clip a region slightly larger than the tile, the parameter "Buffer" allows to adjust the extra lenght of the box.
 */
function MISC_CreateClipBox(myTile,myBuffer)
{
    var myMultiline = SMultiline.New(myTile);
    var myCenter = myMultiline.GetCentroidLinear();

    var myLenght = (myMultiline.GetLength()/4)+myBuffer;
    var myWidth = (myMultiline.GetLength()/4)+myBuffer;
    var myHeight = 300;

    var myClippingBox = SClippingBox.New();    
    myClippingBox.SetCenter(myCenter);
    myClippingBox.SetLength(myLenght);
    myClippingBox.SetWidth(myWidth);
    myClippingBox.SetHeight(myHeight);

    //Center a top-down  View
    SetCameraDirection(SVector.New(0,0,-1),SVector.New(0,1,0));
    SetCameraMode(ViewModeEnum.ORTHOGRAPHIC);

    //Zoom on data
    var myComp = [];
    myComp.push(myClippingBox);
    ZoomOn(myComp,1000);

    return{
        'MyClipBox': myClippingBox
    }
}

/**
 * Change Lidar data display type (intensity / Color) according to user selection.
 */
function CLOUDTBL_ForEach_SetRepresentation(inputTbl)
{
    var tempCloud = SCloud.New();
    var myOutputCloudTbl = [];


    for (var i=0; i<inputTbl.length; i++)
    {   
        try{
            switch(myScriptParameters_LidarMode.LidarRepresentation) {
            case 0:
                //display cloud as colored
                inputTbl[i].SetCloudRepresentation("real_color");
                //Add clouds in the tbl of clouds to display
                myOutputCloudTbl.push(inputTbl[i]);
                break;
            case 1:
                //Display cloud as intensity and check if we use special color grading
                CLOUD_ApplyColorGradient(inputTbl[i]);
                //Convert intensity as color to get rid of the intensity scale display
                tempCloud = inputTbl[i].ConvertInspectionToColor().Cloud;
                inputTbl[i] = SCloud.New(tempCloud);
                inputTbl[i].SetCloudRepresentation("real_color");
                //Add clouds in the tbl of clouds to display
                myOutputCloudTbl.push(inputTbl[i]);
                break;
            case 2: 
                //Set display setting by class      
                //Explode cloud by class
                var myCloudExplodedByClass = inputTbl[i].ExplodeByClass().CloudTbl;
                //Map display setting for each class    
                var myTileSettings = CLOUD_MapClassSettings(inputTbl[i]); 

                
                //Set display type of each cloud 
                var myCloudsToDisplay = CLOUDTBL_SetClassDisplayType(myCloudExplodedByClass,myTileSettings.TileDisplayTypeTbl).CloudsToDisplay;
                //Set Opacity of each cloud 
                CLOUDTBL_SetClassOpacity(myCloudExplodedByClass,myTileSettings.TileOpacityTbl);
                //Set Color of each cloud 
                CLOUDTBL_SetClassColor(myCloudExplodedByClass,myTileSettings.TileColorTbl);
                
                MISC_ForEachPush(myCloudsToDisplay,myOutputCloudTbl);

                break;
            default:
                break;
            }
        } catch {}
    }
    inputTbl=[];

    return {
        "CloudTbl": myOutputCloudTbl
    }
}


function CLOUD_MapClassSettings(myCloud)
{
    //Get user settings
    var myClassesNamesTbl = myScriptParameters_LidarMode.ClassesNamesTbl;
    var myDisplaySettingsTbl = myScriptParameters_LidarMode.ClassesDisplayTypeTbl;
    var myOpacitySettingsTbl = myScriptParameters_LidarMode.ClassesOpacityTbl;
    var myClassColorSettingsTbl = myScriptParameters_LidarMode.ClassColorsTbl;

    //Get class info of currently opened tile
    var myTileClasses = CLOUD_GetClassNumber(myCloud);
    
    var myTileNumberOfClasses = myTileClasses.ClassNb;
    var myTileClassesNames = myTileClasses.ClassNames;
    var myTileDisplaySettings = [];
    var myTileOpacitySettings = [];
    var myTileColorSettings = [];
    

    //Map the settings with the classes names found in that tile
    for (var tileClassIdx=0; tileClassIdx<myTileNumberOfClasses; tileClassIdx++)
    {
        for (var totalClassIdx=0; totalClassIdx<myClassesNamesTbl.length; totalClassIdx++)
        {
            if (myTileClassesNames[tileClassIdx] == myClassesNamesTbl[totalClassIdx])
            {
                myTileDisplaySettings.push(myDisplaySettingsTbl[totalClassIdx]);
                myTileOpacitySettings.push(myOpacitySettingsTbl[totalClassIdx]);
                myTileColorSettings.push(myClassColorSettingsTbl[totalClassIdx]);
            }
        }
    } 
    
    return {
        "TileDisplayTypeTbl": myTileDisplaySettings,
        "TileOpacityTbl": myTileOpacitySettings,
        "TileColorTbl": myTileColorSettings,
    }
}
    

function CLOUDTBL_SetClassDisplayType(myCloudTbl,myTileDisplaySettings)
{
    var myOutputCloudTbl = [];
    var tempCloud;

    //Set visibility setting for each class
    for (var classIdx=0; classIdx<myCloudTbl.length; classIdx++)
    {
        //set display type 
        switch (myTileDisplaySettings[classIdx])
        {
        case 0:
            myCloudTbl[classIdx].SetCloudRepresentation("real_color");
            //Add subClouds in the tbl of clouds to display
            myOutputCloudTbl.push(myCloudTbl[classIdx]);  
            break;
        case 1:          
            //Set special color grading 
            CLOUD_ApplyColorGradient(myCloudTbl[classIdx]);              
            //Convert intensity as color to get rid of the intensity scale display
            tempCloud = myCloudTbl[classIdx].ConvertInspectionToColor().Cloud;
            myCloudTbl[classIdx] = SCloud.New(tempCloud);
            myCloudTbl[classIdx].SetCloudRepresentation("real_color");
            //Add subClouds in the tbl of clouds to display
            myOutputCloudTbl.push(myCloudTbl[classIdx]);   
            break;
        case 2:
            myCloudTbl[classIdx].SetCloudRepresentation("flat");
            //Add subClouds in the tbl of clouds to display
            myOutputCloudTbl.push(myCloudTbl[classIdx]);
            break;
        case 3:         
            //Do not add the data to the tbl of clouds to display               
            break;
        default:
            break;
        }     
    }

    return {
        "CloudsToDisplay": myOutputCloudTbl
    }
}

function CLOUDTBL_SetClassOpacity(myCloudTbl,myTileOpacitySettings)
{
    //Set visibility setting for each class
    for (var classIdx=0; classIdx<myCloudTbl.length; classIdx++)
    {
        //set opacity
        var myOpacityText = (myTileOpacitySettings[classIdx]*255/100).toFixed(0);
        var myOpacity = Number(myOpacityText);                    
        myCloudTbl[classIdx].SetTransparency(myOpacity);
    }
}

function CLOUDTBL_SetClassColor(myCloudTbl,myTileColorSettings)
{
    //Set visibility setting for each class
    for (var classIdx=0; classIdx<myCloudTbl.length; classIdx++)
    {
        //set Color
        switch (myTileColorSettings[classIdx])
        {
        case 0: //'Red'
            myCloudTbl[classIdx].SetColors(1,0,0);
            break;
        case 1: //'Orange'
            myCloudTbl[classIdx].SetColors(1,0.5,0);     
            break;
        case 2: //'Yellow'  
            myCloudTbl[classIdx].SetColors(1,1,0);
            break;
        case 3: //'Green'        
            myCloudTbl[classIdx].SetColors(0,1,0);
            break;
        case 4: //'Blue'                     
            myCloudTbl[classIdx].SetColors(0,0,1);
            break;
        case 5: //'Purple'     
            myCloudTbl[classIdx].SetColors(1,0,1);
            break;
        case 6: //'White'                        
            myCloudTbl[classIdx].SetColors(1,1,1);
            break;
        case 7: //'Grey'              
            myCloudTbl[classIdx].SetColors(0.5,0.5,0.5);
            break;
        case 8: //'Black'                     
            myCloudTbl[classIdx].SetColors(0,0,0);
            break;
        default:
            myCloudTbl[classIdx].SetColors(0,0,0);
            break;
        }     
    }
}

/**
 * Apply color gradient to a point cloud
 */
function CLOUD_ApplyColorGradient(myCloud)
{
    var myPath = myScriptParameters_LidarMode.CustomColorPathToRSI;

    if (myScriptParameters_LidarMode.UseCustomColor == true)
    {
        myCloud.GetColorGradientAttribute("intensity");
        var result = myCloud.LoadColorGradientAttribute(myPath, "intensity");
    } 
}


/**
 * Trigger export of point cloud data according to user setting
 */
function CLOUDTBL_Export(myCloudTbl,myTileID)
{
    try {		
		switch (myScriptParameters_LidarMode.ExportType) 
			{
				case 0:
					//do nothing
					break;
				case 1:
					//Export as E57
					CLOUDTBL_ExportAsE57(myCloudTbl,myTileID);
					break;
				case 2:
					//Export as LAS
					CLOUDTBL_ExportAsLAS(myCloudTbl,myTileID)
					break;
				default:
					break; 
			}
	} catch {
		var myErrorText = "ERROR : Unable Export point cloud for tile id: ";
        myErrorText = myErrorText.concat(String(myTileID));
        print(myErrorText);
        myScriptParameters_Export.ScriptErrorFlag = true;
	}
}

/**
 * Export point cloud data as LAS
 */
function CLOUDTBL_ExportAsLAS(myCloudTbl,myTileID)
{
    var myCloud = SCloud.Merge(myCloudTbl).Cloud;
    var myPath = '';
    var myCoordinateSystem = SMatrix.New();

    var myDocumentPath = myScriptParameters_Export.SavePath;
    myPath = myDocumentPath.concat('_');
    myPath = myPath.concat(myTileID);
    myPath = myPath.concat('.las');

    SSurveyingFormat.ExportLASLAZ(myCloud,myPath,myCoordinateSystem,false);

    return {
        "LAS": myCloud
    }
}

/**
 * Export point Cloud data as E57
 */
function CLOUDTBL_ExportAsE57(myCloudTbl,myTileID)
{
    var myCloud = SCloud.Merge(myCloudTbl).Cloud;
    var myImages = [];
    var myPath = '';

    var myDocumentPath = myScriptParameters_Export.SavePath;
    myPath = myDocumentPath.concat('_');
    myPath = myPath.concat(myTileID);
    myPath = myPath.concat('.e57');

    SSurveyingFormat.ExportE57(myCloudTbl,myImages,myPath);

    return{
        "E57": myCloud
    }
}





/**
 * Show all data included in the table entered in parameter.
 */
function MISC_ShowSpecific(myCompTbl)
{
    for (var i=0; i<myCompTbl.length; i++)
    {   
        try{
            myCompTbl[i].SetVisibility(true);
        } catch {}
    } 
}

/**
 * Hide all data included in the table entered in parameter.
 */
function MISC_HideSpecific(myCompTbl)
{
    for (var i=0; i<myCompTbl.length; i++)
    {   
        try{
            myCompTbl[i].SetVisibility(false);
        } catch {}
    } 
}

/**
 * Hide all data.
 */
function MISC_HideAll()
{
    var myData = SComp.All(2);
    
    for (var i=0; i<myData.length; i++)
    {   
        try{
            myData[i].SetVisibility(false);
        } catch {}
    } 
}


/**
 * Add all data included in the table entered in parameter to the scene.
 */
function MISC_ForEach_AddToDoc(inputTbl)
{
    for (var i=0; i<inputTbl.length; i++)
    {   
        try{
            inputTbl[i].AddToDoc();
        } catch {}
    }
}

/**
 * Remove all data included in the table entered in parameter to the scene.
 */
function MISC_ForEach_RemoveFromDoc(inputTbl)
{
    for (var i=0; i<inputTbl.length; i++)
    {   
        try{
            inputTbl[i].RemoveFromDoc();
        } catch {}
    }
}

/**
 * Clear all data included in the table entered in parameter to the scene. (remove from scene AND memory clear)
 */
function MISC_ForEach_Clear(inputTbl)
{
    for (var i=0; i<inputTbl.length; i++)
    {   
        try{
            inputTbl[i].Clear();
        } catch {}

        try{
            inputTbl[i].RemoveFromDoc();
        } catch {}
    }
    inputTbl=null;
}


function MISC_ForEachPush(myTbltoAdd,myTblToPushTo)
{
    for (var i=0;i<myTbltoAdd.length;i++)
    {
        myTblToPushTo.push(myTbltoAdd[i]);
    }    
}

/**
 * Get the current document Path. 
 * If no path is available (document not saved yet) will set the document path to default path (Script path + default Project name)
 */
function MISC_GetDocumentPath()
{
    var myDocumentPath = CurrentDocPath();
    if (myDocumentPath == '') 
        {
            myDocumentPath=CurrentScriptPath();
            myDocumentPath = myDocumentPath.concat(defaultProjectName);
        }

    return{
        'DocumentFullPath':myDocumentPath
    }
}

/**
 * Split a fullpath (path/filename.ext) into 3 separated output : path, filename and extension
 */
function MISC_FullPathSplit(myFullPath)
{
    //Get filename+extension from full path
    var myFilenameAndExtension = myFullPath.replace(/^.*[\\/]/, '');    

    //Get path from fullpath - filename
    var myPath = myFullPath.substring(0,myFullPath.length-myFilenameAndExtension.length)

    //Get filename only from filename+extension 
    var myFilename = myFilenameAndExtension.split('.').slice(0, -1).join('.')

    var myExtensionTbl = myFilenameAndExtension.split('.');
    var myExtension = myExtensionTbl[myExtensionTbl.length-1];

    return{
        'Path': myPath,
        'FileName':myFilename,
        'Extension':myExtension,
    }
}


/*---------------------------------------------
 * PROMPT and DISPLAY 
 *---------------------------------------------*/


/**
 * Generate a Popup to ask for user input related to image based ortho.
 */
function SETTINGS_IMAGEMODE()
{
	//Create a dialog to enter script settings
	var myDialog = SDialog.New("Image ortho Settings");
    
    //Add dialog line (parameter) to fill

    myDialog.BeginGroup('Mesh generation settings');

    myDialog.AddTextField({
        'id': 'myTextureWidth',
        'name': 'Texture Generation Width (m):',
        'tooltip': 'Defines the width of the road to mesh and texture. (Distance from the trajectory path)',
        'value': '4',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });

    myDialog.AddTextField({
        'id': 'myIMUHeight',
        'name': 'Height of IMU (m) :',
        'tooltip': 'Height of IMU in regard to the road surface. Accurate value is requiered for correct road surface extraction',
        'value': '2.1',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });

    myDialog.AddTextField({
        'id': 'MeshSize',
        'name': 'Mesh smallest triangle size (m):',
        'tooltip': 'Defines the level of details of the generated mesh in meter. Recommended value range (very detailed) 0.001 -> 0.05 (rough) ',
        'value': '0.01',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });

    myDialog.BeginGroup('Filtering settings');

    myDialog.AddBoolean({
        'id': 'UseFiltering',
        'name': 'Filter out non-horizontal data ?',
        'tooltip': "If enabled, data that is not horizontal (10deg tolerance) will be erased. (Recommended for general case. Not recommended for roads with strong inclination)",
        'value': true,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.AddTextField({
        'id': 'NoiseAngle',
        'name': 'Normal angle of the points to keep (deg):',
        'tooltip': 'Keep only points that have a normal inferior to that value (Horizontal points = 0deg. Vertical points = 90deg). Beware: a too small value might impact curb extraction accuracy',
        'value': '30',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });

    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    return {
        "TextureWidth": Number(myResult.myTextureWidth),
        "IMUHeight": Number(myResult.myIMUHeight),
        "MeshSize": Number(myResult.MeshSize),
        "UseFiltering": Boolean(myResult.UseFiltering),
        "NoiseAngle": Number(myResult.NoiseAngle)
    };
}



/**
 * Generate a Popup to ask for user inputs related to LIDAR Options.
 */
function SETTINGS_LIDARMODE()
{
    var myClassNamesTbl = [];
    var myClassDisplayTypeTbl = [];
    var myClassOpacityTbl = [];    
    var myClassColorsTbl = [];
    var myResult;


	//Create a dialog to enter script settings
	var myDialog = SDialog.New("LIDAR Settings");
    
    myDialog.BeginGroup('LIDAR display settings');

    myDialog.AddTextField({
        'id': 'LgsImportNumber',
        'name': 'Max number of point per tile :',
        'tooltip': 'Number of point to import from LGS file for each tile. A larger number increase point density.',
        'value': '25000000',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });    

    myDialog.AddTextField({
        'id': 'LidarPointSize',
        'name': 'LIDAR point size (%) :',
        'tooltip': 'LIDAR point size scale factor in percent. Larger number increase the size of each point, making them more visible at the cost of details',
        'value': '100',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });    

    myDialog.AddChoices({
        'id': 'LIDARRepresentation',
        'name': 'LIDAR Representation',
        'choices': ['Color','Intensity','Decide by Class'],
        'tooltip': '',
        'value': 0,
        'saveValue': true,
        'readOnly': false,
        'style': SDialog.ChoiceRepresentationMode.ComboBox
    });

    myDialog.AddBoolean({
        'id': 'UseCustomColor',
        'name': 'Use custom intensity color scale ?',
        'tooltip': "If enabled, the lidar intensity orthoimage will be generated with intensity scale set by the user in provided .rsi file ",
        'value': false,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.BeginGroup('LIDAR export settings');

    myDialog.AddChoices({
        'id': 'ExportFormat',
        'name': 'LIDAR export format',
        'choices': ['Do not export tile data','export as E57','Export as LAS'],
        'tooltip': 'Do you want to export tile data as point cloud ?',
        'value': 0,
        'saveValue': true,
        'readOnly': false,
        'style': SDialog.ChoiceRepresentationMode.ComboBox
    });

    myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    //if LIDAR Representation is set to be decided by class, call in an extra menu  
    if (myResult.LIDARRepresentation == 2) 
    {
        var myClasses = LGS_GetClassNumber();
        var myNumberOfClasses = myClasses.ClassNb;
        if (myNumberOfClasses != 0)
        {
            myClassNamesTbl = myClasses.ClassNames;
            myClassDisplayTypeTbl = SETTINGS_LidarClassDisplayType().DisplayTypeTbl;        
            myClassOpacityTbl = SETTINGS_LidarClassOpacity().OpacityTbl;
            myClassColorsTbl =  SETTINGS_LidarClassColor().ClassColorsTbl;
        }
        else
        {
            //return error if there is no class data
            POPUP_Message('Error',"No class data found in current cloudworx project",SDialog.Error);
            throw new Error("No class data found in current cloudworx project - Process aborted");
        }
        
    } 

    //If custom color has been selected, ask the user to choose .rsi file
    if ((myResult.UseCustomColor == true))
    {
        //Ask user for save path
        var myDefaultPath = MISC_GetDocumentPath().DocumentFullPath;
        myDefaultPath = MISC_FullPathSplit(myDefaultPath).Path;
        var myLoadPath = GetOpenFileName('Select .rsi file :','*.rsi',myDefaultPath);  
        
        //return error if cancelled by user
        if (myLoadPath.length == 0)
        {
            POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
            throw new Error("Operation Cancelled by the user");
        }
    }

    return {
        "LidarPointSize": Number(myResult.LidarPointSize),
        "LidarRepresentation": Number(myResult.LIDARRepresentation),
        "UseCustomColor": Boolean(myResult.UseCustomColor),
        "CustomColorPathToRSI": String(myLoadPath),
        "ExportType": Number(myResult.ExportFormat),
        "ClassesNamesTbl": myClassNamesTbl,
        "ClassesDisplayTypeTbl": myClassDisplayTypeTbl,
        "ClassesOpacityTbl": myClassOpacityTbl,
        "ClassColorsTbl": myClassColorsTbl,
        "LGSPointNumber": Number(myResult.LgsImportNumber)
    };
}

/**
 * Generate a Popup to ask user to choose disply type (Color/intensity/Class) for each class.
 */
function SETTINGS_LidarClassDisplayType()
{
    var myID;
    var myText;
    var myIDs = [];
    var myTooltip = 'Choose display type';
    var myChoices = ['Color','Intensity','Class','Hidden']
    var myDisplayTypeTbl = [];

    //Create a dialog to enter script settings
	var myDialog = SDialog.New("Classes Settings");

    myDialog.BeginGroup('Display type by class');

    var myClasses = LGS_GetClassNumber();
    var myNumberOfClasses = myClasses.ClassNb;
    var myClassesList = myClasses.ClassNames;
    
    
    if (myNumberOfClasses == 0)
    {
        myDialog.AddText('No class available',SDialog.Instruction);
    }
    else
    {   
        for (var i=0; i<myNumberOfClasses; i++)
        {
            myID = 'CLASS_';
            myID = myID.concat(String(i));
            myText = ''
            myText = myText.concat(String(myClassesList[i]));
            myIDs.push(myID);

            myDialog.AddChoices({
            'id': myID,
            'name': myText,
            'choices': myChoices,
            'tooltip': myTooltip,
            'value': 0,
            'saveValue': false,
            'readOnly': false,
            'style': SDialog.ChoiceRepresentationMode.ComboBox
            });
        }
    }
   
    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    //get data saved by user
    myDisplayTypeTbl = SETTINGS_readClassInput(myResult).Results;

    return {
        "DisplayTypeTbl": myDisplayTypeTbl
    }

    
}

/**
 * Workaround function to read data from proceduraly generated dialogs
 */
function SETTINGS_readClassInput(myDialogResult)
{
    var myResults = [];

    //Workaround to read data from proceduraly generated dialog
    //Only implemented for max 30 classes
    if (myDialogResult.CLASS_0 != undefined)  myResults.push(myDialogResult.CLASS_0);
    if (myDialogResult.CLASS_1 != undefined)  myResults.push(myDialogResult.CLASS_1);
    if (myDialogResult.CLASS_2 != undefined)  myResults.push(myDialogResult.CLASS_2);
    if (myDialogResult.CLASS_3 != undefined)  myResults.push(myDialogResult.CLASS_3);
    if (myDialogResult.CLASS_4 != undefined)  myResults.push(myDialogResult.CLASS_4);
    if (myDialogResult.CLASS_5 != undefined)  myResults.push(myDialogResult.CLASS_5);
    if (myDialogResult.CLASS_6 != undefined)  myResults.push(myDialogResult.CLASS_6);
    if (myDialogResult.CLASS_7 != undefined)  myResults.push(myDialogResult.CLASS_7);
    if (myDialogResult.CLASS_8 != undefined)  myResults.push(myDialogResult.CLASS_8);
    if (myDialogResult.CLASS_9 != undefined)  myResults.push(myDialogResult.CLASS_9);
    if (myDialogResult.CLASS_10 != undefined)  myResults.push(myDialogResult.CLASS_10);
    if (myDialogResult.CLASS_11 != undefined)  myResults.push(myDialogResult.CLASS_11);
    if (myDialogResult.CLASS_12 != undefined)  myResults.push(myDialogResult.CLASS_12);
    if (myDialogResult.CLASS_13 != undefined)  myResults.push(myDialogResult.CLASS_13);
    if (myDialogResult.CLASS_14 != undefined)  myResults.push(myDialogResult.CLASS_14);
    if (myDialogResult.CLASS_15 != undefined)  myResults.push(myDialogResult.CLASS_15);
    if (myDialogResult.CLASS_16 != undefined)  myResults.push(myDialogResult.CLASS_16);
    if (myDialogResult.CLASS_17 != undefined)  myResults.push(myDialogResult.CLASS_17);
    if (myDialogResult.CLASS_18 != undefined)  myResults.push(myDialogResult.CLASS_18);
    if (myDialogResult.CLASS_19 != undefined)  myResults.push(myDialogResult.CLASS_19);
    if (myDialogResult.CLASS_20 != undefined)  myResults.push(myDialogResult.CLASS_20);
    if (myDialogResult.CLASS_21 != undefined)  myResults.push(myDialogResult.CLASS_21);
    if (myDialogResult.CLASS_22 != undefined)  myResults.push(myDialogResult.CLASS_22);
    if (myDialogResult.CLASS_23 != undefined)  myResults.push(myDialogResult.CLASS_23);
    if (myDialogResult.CLASS_24 != undefined)  myResults.push(myDialogResult.CLASS_24);
    if (myDialogResult.CLASS_25 != undefined)  myResults.push(myDialogResult.CLASS_25);
    if (myDialogResult.CLASS_26 != undefined)  myResults.push(myDialogResult.CLASS_26);
    if (myDialogResult.CLASS_27 != undefined)  myResults.push(myDialogResult.CLASS_27);
    if (myDialogResult.CLASS_28 != undefined)  myResults.push(myDialogResult.CLASS_28);
    if (myDialogResult.CLASS_29 != undefined)  myResults.push(myDialogResult.CLASS_29);

    return{
        "Results": myResults
    }
}

/**
 * Generate a Popup to ask user to choose opacity levels for each class.
 */
function SETTINGS_LidarClassOpacity()
{
    var myID;
    var myText;
    var myOpacityTbl = [];
    var myTooltip = 'Choose transparency level';

    //Create a dialog to enter script settings
	var myDialog = SDialog.New("Classes Settings");

    myDialog.BeginGroup('Opacity by class');

    var myClasses = LGS_GetClassNumber();
    var myNumberOfClasses = myClasses.ClassNb;
    var myClassesList = myClasses.ClassNames;
    
    if (myNumberOfClasses == 0)
    {
        myDialog.AddText('No class available',SDialog.Instruction);
    }
    else
    {   
        for (var i=0; i<myNumberOfClasses; i++)
        {
            myID = 'CLASS_'
            myID = myID.concat(String(i));
            myText = ''
            myText = myText.concat(String(myClassesList[i]));
            myText = myText.concat(' (10-100%):');

            myDialog.AddInt({
                'id': myID,
                'name': myText,
                'tooltip': myTooltip,
                'value': 100,
                'saveValue': false,
                'min': 10,
                'max': 100
            });
        }
    }
    
    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }


    //get data saved by user
    myOpacityTbl = SETTINGS_readClassInput(myResult).Results;
    
    return {
        "OpacityTbl": myOpacityTbl
    }
    
}



/**
 * Generate a Popup to ask user to choose colors for each class.
 */
function SETTINGS_LidarClassColor()
{
    var myID;
    var myText;
    var myColorTbl = [];
    var myTooltip = 'Choose color for each class';
    var myChoices = ['Red','Orange','Yellow','Green','Blue','Purple','White','Grey','Black']

    //Create a dialog to enter script settings
	var myDialog = SDialog.New("Classes Settings");

    myDialog.BeginGroup('Color by class');

    var myClasses = LGS_GetClassNumber();
    var myNumberOfClasses = myClasses.ClassNb;
    var myClassesList = myClasses.ClassNames;
    
    if (myNumberOfClasses == 0)
    {
        myDialog.AddText('No class available',SDialog.Instruction);
    }
    else
    {   
        for (var i=0; i<myNumberOfClasses; i++)
        {
            myID = 'CLASS_'
            myID = myID.concat(String(i));
            myText = ''
            myText = myText.concat(String(myClassesList[i]));

            myDialog.AddChoices({
            'id': myID,
            'name': myText,
            'choices': myChoices,
            'tooltip': myTooltip,
            'value': 0,
            'saveValue': false,
            'readOnly': false,
            'style': SDialog.ChoiceRepresentationMode.ComboBox
            });
        }
    }
    
    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }


    //get data saved by user
    myColorTbl = SETTINGS_readClassInput(myResult).Results;
    
    return {
        "ClassColorsTbl": myColorTbl
    }
    
}

/**
 * Generate a Popup to ask for user input related to Export options.
 */
function SETTINGS_EXPORT()
{
	//Create a dialog to enter script settings
	var myDialog = SDialog.New("Export Settings");
    
    myDialog.BeginGroup('Ortho resolution');

    myDialog.AddTextField({
        'id': 'TexelSize',
        'name': 'Texel size (m) :',
        'tooltip': 'Defines the size of a pixel in the real world : 0.001 -> 1 pixel=1mm ',
        'value': '0.005',
        'saveValue': true,
        'readOnly': false,
        'canBeEmpty': false
    });    

    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    //Ask user for save path
    var myDefaultPath = MISC_GetDocumentPath().DocumentFullPath;
    myDefaultPath = MISC_FullPathSplit(myDefaultPath).Path;
    var mySavePath = GetSaveFileName('Select save location :','',myDefaultPath);  
    
    //return error if cancelled by user
    if (mySavePath.length == 0)
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }

    return {
        "TexelSize": Number(myResult.TexelSize),
        "SavePath": String(mySavePath),
        "ScriptErrorFlag": false
    };
}


/**
 * Generate a Popup to select camera to use.
 */
function SETTING_Camera()
{
    //Create a dialog to choose process to run
	var myDialog = SDialog.New("Camera Selection");

    myDialog.BeginGroup('Camera to use for texturing');

    myDialog.AddBoolean({
        'id': 'FrontRight',
        'name': 'Front Right',
        'tooltip': "",
        'value': false,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.AddBoolean({
        'id': 'FrontLeft',
        'name': 'Front Left',
        'tooltip': "",
        'value': false,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.AddBoolean({
        'id': 'RearRight',
        'name': 'Rear Right',
        'tooltip': "",
        'value': true,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.AddBoolean({
        'id': 'RearLeft',
        'name': 'Rear Left',
        'tooltip': "",
        'value': true,
        'saveValue': true,
        'readOnly': false   
    });

    myDialog.AddBoolean({
        'id': 'Sphere',
        'name': 'Sphere',
        'tooltip': "",
        'value': false,
        'saveValue': true,
        'readOnly': false   
    });

    var myResult = myDialog.Run();

    //close if user cancelled
    if ((myResult.ErrorCode == -1) || ((myResult.ErrorCode == 1)))
    {
        POPUP_Message('Error',"Operation Cancelled by the user",SDialog.Error);
        throw new Error("Operation Cancelled by the user");
    }


    return {
        'Camera_1': Boolean(myResult.FrontRight),
        'Camera_2': Boolean(myResult.FrontLeft),
        'Camera_3': Boolean(myResult.RearRight),
        'Camera_4': Boolean(myResult.RearLeft),
        'Camera_5': Boolean(myResult.Sphere)
    };
}


/**
 * Generate a Popup to display a message.
 */
function POPUP_Message(myTitle,myMessage,mySeverity)
{
	var myDialog = SDialog.Message(myMessage,mySeverity,myTitle);
}

/**
 * Display the progression of current process in the command prompt. 
 */
function MISC_DisplayProgression(myString,myCounter,myTotalCount)
{
    //Display progression in real time
    var myProgression = String(myString);
    myProgression = myProgression.concat(String(myCounter));
    myProgression = myProgression.concat('/');
    myProgression = myProgression.concat(String(myTotalCount));
    Print(myProgression);
}


function MISC_POPUP_ErrorMessageIfAny()
{
    if (myScriptParameters_Export.ScriptErrorFlag == true)
    {
        POPUP_Message("ERROR","Some errors happened during script processing. Please check command log for details.",SDialog.Error);
    }
}
