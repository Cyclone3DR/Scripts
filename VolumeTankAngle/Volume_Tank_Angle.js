var debug=false;

function ComputeAngularSteps(nbSections,minAngle, maxAngle){
    if (nbSections>1)
        var step = (maxAngle-minAngle)/(nbSections-1);
    else
        var step=361;

    return step;
}

function RotateBoat(mesh,rod,angleX,angleY){
    var rotMesh=SPoly.New(mesh);
    var rotRod=SMultiline.New(rod);
    var matrix=SMatrix.New();

    //Y>X>Z + no translation (rotations around origin)
    matrix.InitRot(angleY,angleX,0,SMatrix.DEGREE,SMatrix.OrderYXZ,SPoint.New(0,0,0));

    rotMesh.ApplyTransformation(matrix);
    rotRod.ApplyTransformation(matrix);

    if(debug){
        rotRod.SetName("angY="+angleY+" angX="+angleX);
        rotRod.AddToDoc();
        rotRod.SetVisibility(false);
        rotMesh.SetName("angY="+angleY+" angX="+angleX);
        rotMesh.AddToDoc();
        rotMesh.SetVisibility(false);
    }
    
    return {rotMesh:rotMesh, rotRod:rotRod }
}

function ComputeRod(step_1stHeight, step_,step_NbSections){
    var rod=SMultiline.New();

    for(var height=step_1stHeight; height<= step_*(step_NbSections); height=height+step_)
    {
        rod.InsertLast(SPoint.New(0,0,height),0.00001);
    }

    return rod;
}

function ConvertRod(rod){
    var elevationList=new Array();

    for(var indexRod=0; indexRod<rod.GetNumber();indexRod++){
        elevationList.push(rod.GetPoint(indexRod).GetZ());
    }

    if(debug)print(elevationList);

    return elevationList;
}

function main(){
    // Select the mesh
    var myMesh = SPoly.FromSel()[0];

    // dialog box
    {
        var myDialog = SDialog.New('Settings');

        // add a line to enter the path of the report
        myDialog.AddLine( 'Enter the path where to create the report', true,Array(),TempPath()+'report_volume.csv');

        // add a title to the column
        myDialog.AddLine('Rotate around Y axis (degrees)', false, {'css':'font-weight: bold'});
        // add the first parameters
        myDialog.AddLine( 'Angle of the first section:', true, Array(), 0);
        myDialog.AddLine( 'Maximum angle:', true, Array(), 10);
        myDialog.AddLine( 'Number of sections:', true, Array(), 6);

        // add a title to the column
        myDialog.AddLine('Rotate around X axis (degrees)', false, {'css':'font-weight: bold'});
        // add the first parameters
        myDialog.AddLine( 'Angle of the first section:', true, Array(), 0);
        myDialog.AddLine( 'Maximum angle:', true, Array(), 10);
        myDialog.AddLine( 'Number of sections:', true, Array(), 6);

        // add a title to the column
        myDialog.AddLine('Step (m)', false, {'css':'font-weight: bold'});
        // add the first parameters
        myDialog.AddLine( 'Height of the first section:', true, Array(), 1);
        myDialog.AddLine( 'Step of sections:', true, Array(), 1);
        myDialog.AddLine( 'Number of sections:', true, Array(), 10);
    }

    // open the dialog box
    var parameters = myDialog.Execute();

    // if the user clicked on OK
    // ------------------------------
    if( parameters.ErrorCode == 0)
    {
        // get all the variables (in the same order as the lines in the dialog box)
        var thePath = parameters.InputTbl[0];
        var rotateY_1stAngle = parseFloat(parameters.InputTbl[1]);
        var rotateY_MaxAngle = parseFloat(parameters.InputTbl[2]);
        var rotateY_NbSections = parseFloat(parameters.InputTbl[3]);
        var rotateX_1stAngle = parseFloat(parameters.InputTbl[4]);
        var rotateX_MaxAngle = parseFloat(parameters.InputTbl[5]);
        var rotateX_NbSections = parseFloat(parameters.InputTbl[6]);
        var step_1stHeight = parseFloat(parameters.InputTbl[7]);
        var step_ = parseFloat(parameters.InputTbl[8]);
        var step_NbSections = parseFloat(parameters.InputTbl[9]);
        
        //Start the CSV
        var myCSV = "AngleY (deg); AngleX (deg); Height (m); Volume Below (m3); Volume Above (m3)\n";
        
        //compute the cubature
        var stepY=ComputeAngularSteps(rotateY_NbSections,rotateY_1stAngle,rotateY_MaxAngle);
        var stepX=ComputeAngularSteps(rotateX_NbSections,rotateX_1stAngle,rotateX_MaxAngle);

        var ii=1;
        var zenith=SVector.New(0,0,1);

        for(var angleY=rotateY_1stAngle; angleY<=rotateY_MaxAngle; angleY=angleY+stepY)
        {
            for (var angleX=rotateX_1stAngle; angleX<=rotateX_MaxAngle; angleX=angleX+stepX)
            {		
                //progress bar
                print(((ii++)+"/"+(rotateX_NbSections*rotateY_NbSections)));	

                var myRod=ComputeRod(step_1stHeight, step_,step_NbSections);
                var rotResult=RotateBoat(myMesh,myRod,angleX,angleY);
                var currElevationList=ConvertRod(rotResult.rotRod);
                var iiResult = rotResult.rotMesh.VolumeFromElevation(currElevationList,zenith);
                
                if(iiResult.ErrorCode==1)
                    throw new Error( "Error during computation" );
                else
                {
                    for(var j=0;j<iiResult.ValueTbl.length;j++){
                        myCSV += angleY + ";" + angleX + ";" + myRod.GetPoint(j).GetZ()+ ";" + iiResult.ValueTbl[j].VolumeUnder + ";"+ iiResult.ValueTbl[j].VolumeOver+";" + "\n" ;
                    }
                }

            }
        }
            
        // save the data
        var file = SFile.New(thePath);
        if ( !file.Open( SFile.WriteOnly ) )
            throw new Error( 'Failed to write file:' + thePath ); // test if we can open the file
        
        // write the smultiline in the file
        file.Write( myCSV );
        
        // Close the file
        file.Close();
        
        print( "File exported: " + thePath);	
        
    }
    else
        throw new Error( "Operation canceled" );
}

main();