// ------------------------ HOW TO USE IT --------------------------------------------
// This script generates an ASCII raster from a point cloud. 
// Launch the script, set the parameters, click the point cloud and give 3 points to define the grid position and orientation.
//
// ------------------------ ALGORITHM --------------------------------------------
// 1. The algorithm creates a cell which moves along X and Y axis of the grid. 
// 2. For each cell position, either the lowest, or the middle or the highest elevation of the cell content is extracted and stored.
//
// ------------------------ PARAMETERS --------------------------------------------
// Parameter explanations:
// 1. No Data default value: default value written in the raster when the cell is empty
// 2. Cell Size: width and length of the cell (in document unit)
// 3. Nb Cols: number of columns
// 4. Nb Rows: number of rows
// 5. Use Cell Center: 
//      0: the given origin will correspond to the bottom left of the pixel and the cell      
//      1: the given origin will correspond to the center of the pixel and the cell
//      in case of using a grid cloud, choose the option where the point will be in the cells center (not in corner)
// 6. Options (0=middle of bounding box,1=lowest,2=highest): the elevation that will be extracted
// 7. 0=ESRI, 1=CSV: result formating (ESRI format stores a header part) 
// 8. Number of digits: number of digits stored for each elevation.
// 9. Display animation: display the moving cell (enable this only for small rasters)

//A1-Parameters (dialog)
var theDialog = SDialog.New('Parameters');

theDialog.AddLine("No Data default value", true, {}, -9999);
theDialog.AddLine("Cell Size", true, {}, 0.5);
theDialog.AddLine("Nb Cols", true, {}, 100);
theDialog.AddLine("Nb Rows", true, {}, 100);
theDialog.AddLine("Use Cell Center", true, {}, 1);
theDialog.AddLine("Options (0=middle,1=lowest,2=highest)", true, {}, 0);
theDialog.AddLine("Output format (0=ESRI, 1=CSV)", true, {}, 0);
theDialog.AddLine("Number of digits", true, {}, 3);
theDialog.AddLine("Display animation", true, {}, 0);

var parameters = theDialog.Execute();

if(!parameters.ErrorCode)
{
	var nullDATA=parseFloat(parameters.InputTbl[0]);
	var step=parseFloat(parameters.InputTbl[1]);
	var resolutionX=parseInt(parameters.InputTbl[2]);
	var resolutionY=parseInt(parameters.InputTbl[3]);
	var useCellCenter=parseInt(parameters.InputTbl[4]);
	var options=parseInt(parameters.InputTbl[5]);
	var format=parseInt(parameters.InputTbl[6]);
	var nbOfDigits=parseInt(parameters.InputTbl[7]);
	var displayAnimation=parseInt(parameters.InputTbl[8]);
}
else
{
	throw new Error("Operation Cancelled");
}

//A2-Parameters (given by user clicks)
print("Click the cloud to export");
var askForCloud=SCloud.FromClick();
if(!askForCloud.ErrorCode)
{
    var cloudToExport=askForCloud.Cloud;
}
else
{
    throw new Error("Error: click a cloud");
}

print("Click a point to define the origin of the raster (bottom left)");
if(useCellCenter)
{
    print("This points will define (XLLCENTER,YLLCENTER) because 'Use Cell Center'=1");
}
else
{
    print("This points will define (XLLCORNER,YLLCORNER) because 'Use Cell Center'=0"); 
}
var askForOrigin=SPoint.FromClick();
if(!askForOrigin.ErrorCode)
{
    var origin0=askForOrigin.Point;
}
else
{
    throw new Error("Error: script cancelled when clicking the origin");
}
origin0.SetZ(0);

print("Click 2 points to define the X direction");
var askForPointDir0=SPoint.FromClick();
if(!askForPointDir0.ErrorCode)
{
    var pointDir0=askForPointDir0.Point;
}
else
{
    throw new Error("Error: script cancelled when clicking the 1st point defining X direction");
}
var askForPointDir1=SPoint.FromClick();
if(!askForPointDir1.ErrorCode)
{
    var pointDir1=askForPointDir1.Point;
}
else
{
    throw new Error("Error: script cancelled when clicking the 2nd point defining X direction");
}
pointDir0.SetZ(0);
pointDir1.SetZ(0);
var dirX=SVector.New(pointDir0,pointDir1);
dirX=dirX.GetNormalized();
dirX=dirX.Mult(step);
var dirY=SVector.New(-dirX.GetY(),dirX.GetX(),0);

var pt1=SPoint.New(origin0);
pt1.Translate(dirX);

var pt2=SPoint.New(origin0);
pt2.Translate(dirY);

var xAxis=SMultiline.New();
xAxis.InsertLast(origin0);
xAxis.InsertLast(pt1);
xAxis.SetName("DirX");
xAxis.SetColors(1,0,0);
xAxis.AddArrows(1,1);
xAxis.AddToDoc();

var yAxis=SMultiline.New();
yAxis.InsertLast(origin0);
yAxis.InsertLast(pt2);
yAxis.SetName("DirY");
yAxis.SetColors(1,0,0);
yAxis.AddArrows(1,1);
yAxis.AddToDoc();

//A3-Parameters (others)
var animationTime=25;
var zenith=SVector.New(0,0,1);
var returnY=SVector.New(dirY);
returnY=returnY.Mult((resolutionY-1));
var returnX=SVector.New(dirX);
returnX=returnX.Mult(-resolutionX);
var dirMinusY=SVector.New(dirY);
dirMinusY=dirMinusY.Mult(-1);
var separator = ";";   
var formats="CSV (*.csv)"

//B-Add ESRI Header
var result="";
if(format==0)
{
    separator = " ";
    formats="ESRI (*.asc)"
    
    result+="NCOLS "+resolutionX+"\n";
    result+="NROWS "+resolutionY+"\n";
    if(useCellCenter)
	{
        result+="XLLCENTER "+origin0.GetX()+"\n";
        result+="YLLCENTER "+origin0.GetY()+"\n";
    }
	else
	{
        result+="XLLCORNER "+origin0.GetX()+"\n";
        result+="YLLCORNER "+origin0.GetY()+"\n";
    }
    result+="CELLSIZE "+step+"\n";
    result+="NODATA_VALUE "+nullDATA+"\n";
}

//C-Define moving cell
var movingCenter=SPoint.New(origin0);
if(!useCellCenter)
{
    var halfDirX=SVector.New();
    halfDirX=dirX.Mult(0.5);
    var halfDirY=SVector.New();
    halfDirY=dirY.Mult(0.5);
    movingCenter.Translate(halfDirX);
    movingCenter.Translate(halfDirY);
}

var movingCell=SMultiline.New();
movingCell.InsertLast(SPoint.New(-0.5*step,-0.5*step,0),0.00001);
movingCell.InsertLast(SPoint.New(+0.5*step,-0.5*step,0),0.00001);
movingCell.InsertLast(SPoint.New(+0.5*step,+0.5*step,0),0.00001);
movingCell.InsertLast(SPoint.New(-0.5*step,+0.5*step,0),0.00001);
movingCell.Close();
var staticCell=SMultiline.New(movingCell);
staticCell.SetName("Cell template");
SetCellCenter(staticCell.GetCentroidLinear(),movingCenter,staticCell);
staticCell.AddToDoc();

if(displayAnimation)
{
    movingCell.SetName("Moving Cell");
    movingCell.AddToDoc();
}

//D-Move the cell and extract data
//Init->move to top left
movingCenter.Translate(returnY);

//Rows loop
for(var j=0;j<resolutionY;j++)
{
    //Cols loop
    for(var i=0;i<resolutionX;i++)
    { 
        //Move the cell
        SetCellCenter(movingCell.GetCentroidLinear(),movingCenter,movingCell);
        if(displayAnimation)
		{
            Repaint();
            Sleep(animationTime); 
        }
        //Extract data
        var extractPoint=cloudToExport.Separate(movingCell,zenith,null,null,SCloud.FILL_ALL);
        if(!extractPoint.ErrorCode)
		{
            if(extractPoint.InCloud.GetNumber()>0)
			{
                //select a z value
                if(options==0)
                    var z=extractPoint.InCloud.GetCentroid().Point.GetZ();
                if(options==1)
                    var z=extractPoint.InCloud.GetLowestPoint(zenith).Point.GetZ();
                if(options==2)
                    var z=extractPoint.InCloud.GetHighestPoint(zenith).Point.GetZ();
                //Here we can add other options (slope, difference between 2 clouds...)
                
				//round the z value
                z=Math.round(z*Math.pow(10,nbOfDigits))/Math.pow(10,nbOfDigits);
                
				//write the z value
				result+=z.toFixed(nbOfDigits);
                result+=separator;
                
                extractPoint.InCloud.Clear();
                extractPoint.OutCloud.Clear();
            }         
            else
			{
                result+=nullDATA;
                result+=separator;
            }
        }
		else
		{
            print("Error in cell:"+i+";"+j);
            result+=nullDATA;
            result+=separator;
        }
        //Move the center along X (1 cell)
        movingCenter.Translate(dirX);
    }
    result+="\n"; //note this line is not mandatory according to ESRI format
    //move the center along X (col 0)
    movingCenter.Translate(returnX);
    //move the center along -Y (1 cell)
    movingCenter.Translate(dirMinusY);
}

if(displayAnimation)movingCell.RemoveFromDoc();

//E-create the raster ascii
var path=GetSaveFileName("Save as",formats,"C:/Users/");
SaveData(path, result);

//function to save the ascii file
function SaveData(
                fileName // the file path
                , content // the content to write in the file
                )
{
    var file = SFile.New( fileName );
    // save the data
    if ( !file.Open( SFile.WriteOnly ) )
        throw new Error( 'Failed to write file:' + fileName ); // test if we can open the file
        
    file.Write( content );
    file.Close();
    print(path);
    OpenUrl(path.substring(0,path.lastIndexOf("\\")));
}

//function to translate the moving cell
function SetCellCenter(iPoint1,ipoint2,iCell)
{
    var translation=SVector.New(iPoint1,ipoint2);
    iCell.Translate(translation);
}