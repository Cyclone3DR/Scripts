var debug = false;

/**
 * Function to compute the angular step in degrees according to the settings dialog box
 * @param {number} nbSections The number of sections
 * @param {number} minAngle The minimum angle
 * @param {number} maxAngle The maximum angle
 * @returns {number} The angular step
 */
function ComputeAngularSteps(nbSections, minAngle, maxAngle)
{
    if (nbSections > 1)
        var step = (maxAngle - minAngle) / (nbSections - 1);
    else
        var step = 361;

    return step;
}

/**
 * Function to rotate the tank mesh and the rod (Euler Y>X>Z)
 * @param {SPoly} mesh The tank mesh
 * @param {SMultiline} rod The multiline standing for the rod
 * @param {number} angleX The angle around X' in degrees
 * @param {number} angleY The angle around Y in degrees
 * @returns {SPoly, SMultiline} The rotated mesh and rod
 */
function RotateBoat(mesh, rod, angleX, angleY)
{
    var rotMesh = SPoly.New(mesh);
    var rotRod = SMultiline.New(rod);
    var matrix = SMatrix.New();

    //Y>X>Z + no translation (rotations around origin)
    matrix.InitRot(angleY, angleX, 0, SMatrix.DEGREE, SMatrix.OrderYXZ, SPoint.New(0,0,0));

    rotMesh.ApplyTransformation(matrix);
    rotRod.ApplyTransformation(matrix);

    if(debug)
    {
        rotRod.SetName("angY = " + angleY + " angX = " + angleX);
        rotRod.AddToDoc();
        rotRod.SetVisibility(false);
        rotMesh.SetName("angY = " + angleY + " angX = " + angleX);
        rotMesh.AddToDoc();
        rotMesh.SetVisibility(false);
    }
    
    return {rotMesh:rotMesh, rotRod:rotRod }
}

/**
 * Function to initialize a rod
 * @param {number} step_1stHeight The 1rst height
 * @param {number} step_ The step between each level
 * @param {number} step_NbSections The number of levels
 * @returns {SMultiline} The rod
 */
function ComputeRod(step_1stHeight, step_, step_NbSections)
{
    var rod = SMultiline.New();

    for(var height = step_1stHeight ; height <= step_*(step_NbSections) ; height = height + step_)
    {
        rod.InsertLast(SPoint.New(0, 0, height), 0.00001);
    }

    return rod;
}

/**
 * Function to convert the rod in an array of elevations
 * @param {SMultiline} rod The rod
 * @returns {number[]} The elevations table
 */
function ConvertRod(rod)
{
    var elevationList = new Array();

    for(var indexRod = 0; indexRod < rod.GetNumber(); indexRod++)
    {
        elevationList.push(rod.GetPoint(indexRod).GetZ());
    }

    if(debug)
        print(elevationList);

    return elevationList;
}

function main()
{
    // Select the mesh
    var myMesh = SPoly.FromSel()[0];

    // dialog box
    {
        var myDialog = SDialog.New('Volume Tank Angle');

        // add a line to enter the path of the report
        myDialog.BeginGroup('Output path');
        myDialog.AddTextField({id: 'Path',name: 'Path',tooltip: 'Enter the path where to create the report',value: TempPath() + 'report_volume.csv',saveValue: false,readOnly: false,canBeEmpty: false});

        myDialog.BeginGroup('Rotation around Y axis');
        myDialog.AddAngle({id: 'Y_1stAngle',name: 'Angle of the first section',value: 0,saveValue: true,readOnly: false});
        myDialog.AddAngle({id: 'Y_MaxAngle',name: 'Maximum angle',value: 10,saveValue: true,readOnly: false});
        myDialog.AddInt({id: 'Y_NbSections',name: 'Number of sections',value: 6,saveValue: true,readOnly: false,min: 0});

        myDialog.BeginGroup('Rotation around X axis');
        myDialog.AddAngle({id: 'X_1stAngle',name: 'Angle of the first section',value: 0,saveValue: true,readOnly: false});
        myDialog.AddAngle({id: 'X_MaxAngle',name: 'Maximum angle',value: 10,saveValue: true,readOnly: false});
        myDialog.AddInt({id: 'X_NbSections',name: 'Number of sections',value: 6,saveValue: true,readOnly: false,min: 0});

        myDialog.BeginGroup('Step');
        myDialog.AddFloat({id: 'firstHeight',name: 'Height of the first section',value: 1,saveValue: true,readOnly: false});
        myDialog.AddLength({id: 'step',name: 'Step of sections',value: 1,saveValue: true,readOnly: false});
        myDialog.AddInt({id: 'NbSections',name: 'Number of sections',value: 10,saveValue: true,readOnly: false});
    }

    // open the dialog box
    var parameters = myDialog.Run();

    // if the user clicked on OK
    // ------------------------------
    if( parameters.ErrorCode == 0)
    {
        // get all the variables (in the same order as the lines in the dialog box)
        var thePath = parameters.Path;
        var rotateY_1stAngle = parameters.Y_1stAngle;
        var rotateY_MaxAngle = parameters.Y_MaxAngle;
        var rotateY_NbSections = parameters.Y_NbSections;
        var rotateX_1stAngle = parameters.X_1stAngle;
        var rotateX_MaxAngle = parameters.X_MaxAngle;
        var rotateX_NbSections = parameters.X_NbSections;
        var step_1stHeight = parameters.firstHeight;
        var step_ = parameters.step;
        var step_NbSections = parameters.NbSections;
        
        //Start the CSV
        var myCSV = "AngleY (deg); AngleX (deg); Height (m); Volume Below (m3); Volume Above (m3)\n";
        
        //compute the cubature
        var stepY = ComputeAngularSteps(rotateY_NbSections, rotateY_1stAngle, rotateY_MaxAngle);
        var stepX = ComputeAngularSteps(rotateX_NbSections, rotateX_1stAngle, rotateX_MaxAngle);

        var ii = 1;
        var zenith = SVector.New(0,0,1);

        for(var angleY = rotateY_1stAngle; angleY <= rotateY_MaxAngle; angleY = angleY + stepY)
        {
            for (var angleX = rotateX_1stAngle; angleX <= rotateX_MaxAngle; angleX = angleX + stepX)
            {		
                //progress bar
                print(((ii++) + "/" + (rotateX_NbSections  *rotateY_NbSections)));	

                var myRod = ComputeRod(step_1stHeight, step_, step_NbSections);
                var rotResult = RotateBoat(myMesh, myRod, angleX, angleY);
                var currElevationList = ConvertRod(rotResult.rotRod);
                var iiResult = rotResult.rotMesh.VolumeFromElevation(currElevationList, zenith);
                
                if(iiResult.ErrorCode == 1)
                {
                    SDialog.Message("Error during computation" ,SDialog.EMessageSeverity.Error,'Error');
                    throw new Error( "Error during computation" );
                }
                else
                {
                    for(var j=0 ; j<iiResult.ValueTbl.length ; j++)
                    {
                        myCSV += angleY + ";" + angleX + ";" + myRod.GetPoint(j).GetZ()+ ";" + iiResult.ValueTbl[j].VolumeUnder + ";" + iiResult.ValueTbl[j].VolumeOver + ";" + "\n" ;
                    }
                }
            }
        }
            
        // save the data
        var file = SFile.New(thePath);
        if ( !file.Open( SFile.WriteOnly ) )
        {
            SDialog.Message('Failed to write file:' + thePath,SDialog.EMessageSeverity.Error,'Error');
            throw new Error( 'Failed to write file:' + thePath ); // test if we can open the file
        }
        
        // write the smultiline in the file
        file.Write( myCSV );
        
        // Close the file
        file.Close();
        
        print( "File exported: " + thePath);	
        
    }
    else
    {
        SDialog.Message("Operation canceled",SDialog.EMessageSeverity.Error,'Error');
        throw new Error( "Operation canceled" );
    }    
}

main();