// Select the mesh
var myMesh = SPoly.FromSel()[0];

// start the dialog box
//------------------------
var myDialog = SDialog.New('Name of the dialog box');

// add a line to enter the path of the report
myDialog.AddLine( 'Enter the path where to create the report', true);

// add a title to the column
myDialog.AddLine('Rotate around Y axis (degrees)', false, {'css':'font-weight: bold'});
// add the first parameters
myDialog.AddLine( 'Angle of the first section:', true, Array(), 0);
myDialog.AddLine( 'Maximum angle:', true, Array(), 0);
myDialog.AddLine( 'Number of sections:', true, Array(), 0);

// add a title to the column
myDialog.AddLine('Rotate around X axis (degrees)', false, {'css':'font-weight: bold'});
// add the first parameters
myDialog.AddLine( 'Angle of the first section:', true, Array(), 0);
myDialog.AddLine( 'Maximum angle:', true, Array(), 0);
myDialog.AddLine( 'Number of sections:', true, Array(), 0);

// add a title to the column
myDialog.AddLine('Step (m)', false, {'css':'font-weight: bold'});
// add the first parameters
myDialog.AddLine( 'Height of the first section:', true, Array(), 0);
myDialog.AddLine( 'Step of sections:', true, Array(), 0);
myDialog.AddLine( 'Number of sections:', true, Array(), 0);

// open the dialog box
var parameters = myDialog.Execute();

// if the user clicked on OK
// ------------------------------
if( parameters.ErrorCode == 0)
{
	// get all the variables (in the same order as the lines in the dialog box)
	var thePath = parameters.InputTbl[0];
	var RotateY_1stAngle = parameters.InputTbl[1];
	var RotateY_MaxAngle = parameters.InputTbl[2];
	var RotateY_NbSections = parameters.InputTbl[3];
	var RotateX_1stAngle = parameters.InputTbl[4];
	var RotateX_MaxAngle = parameters.InputTbl[5];
	var RotateX_NbSections = parameters.InputTbl[6];
	var Step_1stHeight = parameters.InputTbl[7];
	var Step_ = parameters.InputTbl[8];
	var Step_NbSections = parameters.InputTbl[9];
	
	//Start the CSV
	var myCSV = "AngleY (deg); AngleX (deg); Height (m); Volume Below (m3); Volume Above (m3)\n";
	
	//compute the cubature
	var pointRef = SPoint.New();
	var CubatureDirection = SVector.New();
	var ii=0;
	var angleY=0; var angleX=0; var height=0;
	
	if (RotateY_NbSections>1)
		var stepY = (RotateY_MaxAngle-RotateY_1stAngle)/(RotateY_NbSections-1);
		else
		{
		var stepY =361;
		}

	if (RotateX_NbSections>1)
		var stepX = (RotateX_MaxAngle-RotateX_1stAngle)/(RotateX_NbSections-1);
		else
		{
		var stepX =361;
		}

		
	for( angleY=RotateY_1stAngle; angleY<=RotateY_MaxAngle; angleY=parseFloat(angleY)+parseFloat(stepY) )
	{
		CubatureDirection.SetX(Math.sin(angleY*Math.PI/180));
		
		for ( angleX=RotateX_1stAngle; angleX<=RotateX_MaxAngle; angleX=parseFloat(angleX)+parseFloat(stepX) )
		{		
			CubatureDirection.SetY(Math.sin(angleX*Math.PI/180));
			
			for( height=Step_1stHeight; height<= Step_*Step_NbSections; height=parseFloat(height)+parseFloat(Step_) )
			{
				pointRef.SetZ(height);
				
			
				if(angleY==0 && angleX==0){
					CubatureDirection.SetZ(1);
				} 
				else {
					CubatureDirection.SetNormed();
				}									
				

				//compute the cubature 
				//result = SPoly.LiquidCubature(myMesh, CubatureDirection, pointRef);
				result = SSurveying.LiquidCubature(myMesh, CubatureDirection, pointRef);
				
				if(result.ErrorCode==1)
					throw new Error( "Error during computation" );
				else
				{
					myCSV += angleY + ";" + angleX + ";" + height+ ";" + result.VolumeBelow + ";"+ result.VolumeAbove+";" + "\n" ;
					print( "Volume computation " + (ii++) );	
				}
			}
		}
	}
		
	//export the CSV report
	thePath += '/';
	thePath += 'report_volume.csv';
	
	// save the data
	var file = SFile.New(thePath);
	if ( !file.Open( SFile.WriteOnly ) )
		throw new Error( 'Failed to write file:' + thePath ); // test if we can open the file
	
	// write the smultiline in the file
	file.Write( myCSV );
	
	// Close the file
	file.Close();
	
	print( "File exported." );	
	
}
else
	throw new Error( "Operation canceled" );

