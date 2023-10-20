// ------------------------ HOW TO USE IT --------------------------------------------
// The algorithm uses the clicked polyline, the clicked mesh and the given slope to compute the earth embankment => Make sure 1 polyline and 1 mesh, at least, are visible before launching the script. Note the earth embankment will be drawn on the right side of the polyline.
//
// ------------------------ ALGORITHM--------------------------------------------
// 1. The algorithm resamples the clicked polyline.
// 2. It computes the direction of the slope.
// 3. Then, it computes the earth embankment polyline. Optionally, it creates smooth corners.
// 4. The earth embankment polyline is unbuckled and reprojected onto the mesh.
// 5. A mesh is automatically computed according to the clicked polyline and the earth embankment polyline.
// 6. Note: you may want to isolate parts of this mesh ->use Surface Modeling>Cut mesh.
// 7. Note: you may need to reverse this mesh ->use the contextual menu or shortcut i.
//
// ------------------------ PARAMETERS --------------------------------------------
// Parameter explanations:
// 1. Slope(%): the slope of the embankment
// 2. iMulti resampling (document unit): the resampling of the input polyline. This will add computations along the straight lines of the input polyline.
// 3. cone resampling (degrees): give a positive value to create cones in convex corners (0 to ignore). 

//A1-other settings
var debug=false;  //if true print and dump intermediary results
var curUCSMatrix=SMatrix.FromActiveCS();
var curUCSMatrixInv=SMatrix.New();
curUCSMatrixInv.InitInverse(curUCSMatrix)
var nadirVector=SVector.New(0,0,-1);
nadirVector.ApplyTransformation(curUCSMatrixInv);
const mainDirection=SVector.New(nadirVector); //nadir vector of the current UCS given in WCS (reference for the slope)

//A2-polyline selection
print("Click the polyline(embankment created on the right side in top view)");
var iMultiSelection=SMultiline.FromClick();
if(iMultiSelection.ErrorCode)throw new Error("polyline selection cancelled");
var iMulti=iMultiSelection.Multi;
iMulti.AddArrows(1,0.5);
var iMultiName=iMulti.GetName();

//A3-target mesh selection
print("Click the mesh to reach");
var iPolySelection=SPoly.FromClick();
if(iPolySelection.ErrorCode)throw new Error("mesh selection cancelled");
var iPoly=iPolySelection.Poly;

//A4-settings dialog
var dlg=SDialog.New("Earth embankment settings");
dlg.AddLine("Set the slope:",false,{ 'align': 'left' });
dlg.AddLine("Slope(%)",true,{ 'align': 'left' },-100);
dlg.AddLine("Set the input polyline resampling step:",false,{ 'align': 'left' });
dlg.AddLine("iMulti resampling",true,{ 'align': 'left' },0.1);
dlg.AddLine("Set how to resample cones in convex angle (0 to ignore):",false,{ 'align': 'left' });
dlg.AddLine("cone resampling (degrees)",true,{ 'align': 'left' },10);
var params=dlg.Execute();
if(!params.ErrorCode)
{
    var slopeAroundMainDirection=parseFloat(params.InputTbl[0]);
    var slopeAroundMainDirectionDeg=180*Math.atan(slopeAroundMainDirection/100)/Math.PI;
    iMulti=ResampleMulti(iMulti,parseFloat(params.InputTbl[1]));
    if(debug)
    {
        iMulti.SetName("Resampled multi");
        iMulti.AddToDoc();
    }
    var coneResampling=parseFloat(params.InputTbl[2]);
}
else
{
    throw new Error("Operation Cancelled");
}

var earthEmbankment={
    'iMulti': iMulti, //the input polyline
    'iMultiName': iMultiName, //the input polyline name
    'iPoly' : iPoly, //the target mesh
    'iPolyName' : iPoly.GetName(), //the target mesh name
    'iSlope': slopeAroundMainDirection, //the slope in %
    'iSlopeDeg': slopeAroundMainDirectionDeg, //the slope in degrees
    'iSlopeAtCorners': undefined, //the slope in corners in degrees
    'iConeResampling': coneResampling, //the cone sampling in degrees
    'iPlanarMulti': SMultiline.New(), //the projection of iMulti onto an horizontal plane (according to main direction)
    'iPlanarMultiPlane': SPlane.New(SPoint.New(0,0,0),mainDirection), //a horizontal plane
    'oMulti': SMultiline.New(), //the earth embankment polyline
    'oBeamTbl': new Array(), // the beams lying on the earth embankment
    'oJunction' : SPoly.New() // the eart embankment mesh
}

//B-Prepare
earthEmbankment.oMulti.SetName(earthEmbankment.iMultiName+"_"+earthEmbankment.iPolyName+"_"+earthEmbankment.iSlope+ "%");
if(debug) 
{
    earthEmbankment.iPlanarMultiPlane=SPlane.New(earthEmbankment.iMulti.GetPoint(0),mainDirection);
}

//C-Compute beams
//C1-project iMulti on iPlanarMultiPlane
var planarMultiComputation=earthEmbankment.iPlanarMultiPlane.ProjDir(earthEmbankment.iMulti,mainDirection);
if(planarMultiComputation.ErrorCode)throw new Error("Error making planar the clicked polyline");
earthEmbankment.iPlanarMulti=planarMultiComputation.Multi;

//main loop around iMulti vertices
for(var i=0;i<earthEmbankment.iMulti.GetNumber();i++)
{
    //C2-Compute the tangent direction for each vertex
    var resultStepC2=ComputeTangentDir(earthEmbankment, i, debug);
    var tangentDirTbl=resultStepC2.tangentDirTbl;
    var pt0=resultStepC2.pt0;
    var pt1=resultStepC2.pt1;
    var pt2=resultStepC2.pt2;

    //secondary loop (1 or several beams per vertex), we compute one direction per beam
    for(var dir=0;dir<tangentDirTbl.length;dir++)
    {
        //C3.1-compute the horizontal beam direction using the tangent direction (tbl)
        var resultStepC3a=ComputeBeamHzDir(tangentDirTbl[dir], pt1, debug);
        var pointOnDir=resultStepC3a.pointOnDir;
        var perpDir=resultStepC3a.perpDir;
    
        //C3.2-compute the slope correction at "flat" corners or at concave corners or at convex corners when not computing the cone
        AdjustTheSlope(earthEmbankment, i, tangentDirTbl, perpDir, pt0, pt1, pt2, debug); 

        //C3.3-compute the 3d beam direction using the corrected slope
        var resultStepC3b=ComputeBeam3dDir(earthEmbankment, pt1, tangentDirTbl[dir]);
        pointOnDir=resultStepC3b.pointOnDir;
        var spatialDir2=resultStepC3b.spatialDir2;
        
        //C4-Compute the intersection with the mesh
        var pointToProject=earthEmbankment.iMulti.GetPoint(i);
        var resultStepC4=FindIntersection(earthEmbankment, pt1, tangentDirTbl[dir], pointOnDir, spatialDir2);

        if(resultStepC4.ErrorCode<2)
        {
            earthEmbankment=resultStepC4.EarthEmbankment;

            var beam=SMultiline.New();
            if(resultStepC4.ErrorCode==0)
            {
                beam.SetName("beam+"+i);//fill part
            }
            else  
            {
                beam.SetName("beam-"+i);//cut part
            }

            beam.SetColors(0,1,0);
            beam.InsertLast(pointToProject);
            beam.InsertLast(resultStepC4.Point);
            earthEmbankment.oBeamTbl.push(beam);
        } 
        //no projection found at all
        else
        {
            
            print("no intersection found for vertex "+i+ "(vertex ignored"+ pointToProject.ValuesToString()+")");
            if(debug)
            {
                pointToProject.SetColors(1,0,0);
                pointToProject.AddToDoc();
            }
        }  
    }    
}

//D-Post-process
//D1-unbuckle earthEmbankment.oMulti
earthEmbankment=UnbuckleMulti(earthEmbankment, debug);

//D2-reproject earthEmbankment.oMulti
earthEmbankment=ReprojectOnMesh(earthEmbankment);

//D3-create the junction (use only the 1st multiline of D2 result)
var resultStepD3=MeshTheJunction(earthEmbankment, debug);
if(resultStepD3.ErrorCode==0)
{
    earthEmbankment=resultStepD3.EarthEmbankment;
    earthEmbankment.oJunction.AddToDoc();
}
else
{
    print("Error when creating the junction mesh");
}


function ComputeTangentDirFrom3Points(iEarthEmbankment, pt0,pt1,pt2,iDebug){
    var dirTbl=new Array();
    
    //backward direction
    var v1=SVector.New(pt1,pt0);
    v1.Normalize();

    //forward direction
    var v2=SVector.New(pt1,pt2);
    v2.Normalize();

    //Bissectrix direction
    var bissectDir=v1.Add(v2);
    if(bissectDir.IsNull())
    {
        var tangentDir=v2;//case null bisectrix
        dirTbl[0]=tangentDir;
        if(debug)
        {
            print("null bissectrix");
            print(i+": "+iMulti.GetPoint(i).ValuesToString());
            print(pt0.ValuesToString());
            print(pt1.ValuesToString());
            print(pt2.ValuesToString());
            print(tangentDir.ValuesToString());
        }
    }
    else
    {
        //Compute the tangent direction using the opposite of the bissectrix        
        var tangentDir=SVector.Cross(mainDirection.Mult(-1),bissectDir.Mult(-1));

        //case convex
        if(SVector.Dot(tangentDir,v2)>0)
        {
            //cone resmpling
            if(iEarthEmbankment.iConeResampling!=0)
            {
                var angle=SVector.Angle(v1,v2);
                if(angle<(180-iEarthEmbankment.iConeResampling))
                {
                    dirTbl.push(v1.Mult(-1));
                    var kEndMax=90-0.5*angle;
                    var kStart=(kEndMax%iEarthEmbankment.iConeResampling)-kEndMax;
                    for(var k=kStart;k<kEndMax;k=k+iEarthEmbankment.iConeResampling)
                    {
                        var copy=SVector.New(tangentDir);
                        var matrixk=SMatrix.New();
                        matrixk.InitRot(pt1,mainDirection,-k,SMatrix.DEGREE); 
                        copy.ApplyTransformation(matrixk);
                        dirTbl.push(copy);
                    }
                    dirTbl.push(v2);
                }
                else
                {
                    dirTbl[0]=tangentDir;
                }
            }
            //no cone resampling
            else
            {
                dirTbl[0]=tangentDir;
            }
            
            if(iDebug)
            {
                for(var p=0;p<dirTbl.length;p++)
                {
                    var sommet=SPoint.New(pt1);
                    var pointcone=SPoint.New(pt1);
                    pointcone.Translate(dirTbl[p]);
                    var multicone=SMultiline.New();
                    multicone.InsertLast(sommet);
                    multicone.InsertLast(pointcone);
                    multicone.SetName("cone"+p);
                    multicone.AddToDoc()
                }
            }
        }
        // case concave
        else 
        {
            tangentDir=tangentDir.Mult(-1);
            dirTbl[0]=tangentDir;
        }

        if(debug)
        {
            print("bissectrix not null");
            print(i+": "+iMulti.GetPoint(i).ValuesToString());
            print(pt0.ValuesToString());
            print(pt1.ValuesToString());
            print(pt2.ValuesToString());
            print(bissectDir.Mult(-1).ValuesToString());
            print(tangentDir.ValuesToString());
        }
    }

    return dirTbl;
}

function ResampleMulti(iMulti,iStep){
    var l=iMulti.GetLength();
    var n=iMulti.GetNumber();

    var oMulti=SMultiline.New();

    oMulti.InsertLast(iMulti.GetPoint(0),0.00001);

    var j=1;//vertex increment
    var i=AdjustStep(iMulti.GetPoint(j-1),iMulti.GetPoint(j),iStep);//length increment
    while(i<l){
        if(ReadCurvilinearDistance(iMulti,j)<i){//the next vertex has been reached
            oMulti.InsertLast(iMulti.GetPoint(j),0.00001);
            i=ReadCurvilinearDistance(iMulti,j);
            j++;
        }else{////the next vertex hasn't been reached
            oMulti.InsertLast(iMulti.GetPointAtDistance(i,false).Point,0.00001);
        }
        i=i+AdjustStep(iMulti.GetPoint(j-1),iMulti.GetPoint(j),iStep);
    }

    oMulti.InsertLast(iMulti.GetPoint(n-1),0.00001);

    return oMulti;
}

function ReadCurvilinearDistance(iMulti,index){
    var multiCopy=SMultiline.New();
    for (var l=0;l<iMulti.GetNumber()-1;l++){
        multiCopy.InsertLast(iMulti.GetPoint(l),0.00001);
    }
    multiCopy.InsertLast(SPoint.New(0,0,-1),0.00001);//cut doens't work on closed multiline
    var result=SMultiline.Cut(multiCopy,multiCopy.GetPoint(index));
    var distance=result.MultiTbl[0].GetLength();
    return distance;
}

function AdjustStep(iPoint1,iPoint2,step){
    var distance=iPoint1.Distance(iPoint2);
    var adjustedStep=distance/Math.ceil(distance/step);
    return adjustedStep;
}

function ComputeTangentDir(iEarthEmbankment, iIndex, iDebug)
{
    var pt0=undefined;
    var pt1=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex);
    var pt2=undefined;
    
    //case closed iMulti
    if(iEarthEmbankment.iPlanarMulti.IsClosed())
    {
        if(iIndex==0)
        {
            var pt0=iEarthEmbankment.iPlanarMulti.GetPoint(iEarthEmbankment.iPlanarMulti.GetNumber()-2);
        }
        else
        {
            var pt0=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex-1);
        }

        if(iIndex==iEarthEmbankment.iPlanarMulti.GetNumber()-1)
        {
            var pt2=iEarthEmbankment.iPlanarMulti.GetPoint(1);
        }
        else
        {
            var pt2=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex+1);
        }

        var tangentDirTbl=ComputeTangentDirFrom3Points(earthEmbankment, pt0,pt1,pt2,debug); 
    }
    //case opened iMulti
    else 
    {
        //case only 2 vertices
        if(iEarthEmbankment.iPlanarMulti.GetNumber()==2)
        {
            var tangentDirTbl=[SVector.New(iEarthEmbankment.iPlanarMulti.GetPoint(0),iEarthEmbankment.iPlanarMulti.GetPoint(1))];
			if(iDebug)
            {
                print("2 vertices multi");
                print(iIndex+": "+iMulti.GetPoint(i).ValuesToString());
                print(iEarthEmbankment.iPlanarMulti.GetPoint(0));
                print(iEarthEmbankment.iPlanarMulti.GetPoint(1));
                print(tangentDirTbl[0].ValuesToString());
            }
        }
        //case more than 2 vertices
        else
        {
            if(iIndex==0)
            {
                var pt2=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex+1);
                var tangentDirTbl=[SVector.New(pt1,pt2)];
                if(iDebug)
                {
                    print("first segment of opened multi");
                    print(iIndex+": "+iEarthEmbankment.iMulti.GetPoint(iIndex).ValuesToString());
                    print(pt1.ValuesToString());
                    print(pt2.ValuesToString());
                    print(tangentDirTbl[0].ValuesToString());
                }
            }
            else if(iIndex==iEarthEmbankment.iPlanarMulti.GetNumber()-1)
            {
                var pt0=iEarthEmbankment.iPlanarMulti.GetPoint(iEarthEmbankment.iPlanarMulti.GetNumber()-2)
                var tangentDirTbl=[SVector.New(pt0,pt1)];
                if(iDebug)
                {
                    print("last segment of opened multi");
                    print(iIndex+": "+iEarthEmbankment.iMulti.GetPoint(iIndex).ValuesToString());
                    print(pt0.ValuesToString());
                    print(pt1.ValuesToString());
                    print(tangentDirTbl[0].ValuesToString());
                }
            }
            else
            {
                var pt0=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex-1);
                var pt2=iEarthEmbankment.iPlanarMulti.GetPoint(iIndex+1);
                var tangentDirTbl=ComputeTangentDirFrom3Points(earthEmbankment, pt0,pt1,pt2,debug); 
            }
        }  
    }
    
    return {'tangentDirTbl':tangentDirTbl, 'pt0':pt0, 'pt1':pt1, 'pt2':pt2};
}

function ComputeBeamHzDir(iTangentDir, ipt, iDebug1)
{
    //a-initialize the point
    var pointOnDir=SPoint.New(ipt);
    if(iDebug1)pointOnDir.AddToDoc();
    iTangentDir.Normalize();
    pointOnDir.Translate(iTangentDir);
    
    //b-rotate the point on perpendicular direction (that is to say in the slope direction)
    var matrix1=SMatrix.New();
    matrix1.InitRot(ipt,mainDirection,90,SMatrix.DEGREE);
    pointOnDir.ApplyTransformation(matrix1);
    var perpDir=SVector.New(ipt,pointOnDir);
    if(iDebug1)SPoint.New(pointOnDir).AddToDoc();

    return {'pointOnDir':pointOnDir, 'perpDir':perpDir}
}

function AdjustTheSlope(iEarthEmbankment, iVertex, iTangentDirTbl, iPerpDir, ipt0, ipt1, ipt2, iDebug)
{
    if(iTangentDirTbl.length==1) 
    {
        //case no corner
        if(iEarthEmbankment.iPlanarMulti.GetNumber()==2)
        {
            var angleCorrection=Math.PI/2;
        }
        else if(iVertex==iEarthEmbankment.iPlanarMulti.GetNumber()-1)
        {
            var angleCorrection=Math.PI*SVector.Angle(SVector.New(ipt0,ipt1),iPerpDir)/180;
        }
        else
        {
            var angleCorrection=Math.PI*SVector.Angle(SVector.New(ipt1,ipt2),iPerpDir)/180;
        }

        var slopeCorrectionAtCorner=Math.sin(angleCorrection);
        var slopeAtCorners=Math.atan(Math.tan(-iEarthEmbankment.iSlopeDeg*Math.PI/180)*slopeCorrectionAtCorner)*180/Math.PI;
        if(iDebug)
        {
            print(angleCorrection*180/Math.PI);
            print(slopeCorrectionAtCorner);
            print(slopeAtCorners);
        }
    }
    //case convex angle when computing the cone (no correction)
    else
    { 
        var slopeAtCorners=-iEarthEmbankment.iSlopeDeg;
    }
    
    iEarthEmbankment.iSlopeAtCorners=slopeAtCorners; 
}

function ComputeBeam3dDir(iEarthEmbankment, ipt1, iTangentDir)
{
    var matrix2=SMatrix.New();
    matrix2.InitRot(ipt1,iTangentDir,iEarthEmbankment.iSlopeAtCorners,SMatrix.DEGREE);
    pointOnDir.ApplyTransformation(matrix2);

    var spatialDir2=SVector.New(ipt1,pointOnDir);

    return{'pointOnDir':pointOnDir, 'spatialDir2':spatialDir2};
}

function FindIntersection(iEarthEmbankment, ipt, iTangentDir, iPointOnDir, iSpatialDir)
{
    var iPointToProject=iEarthEmbankment.iMulti.GetPoint(i); 
    var oPoint=undefined;
    var errorCode=2;

    var project2=iEarthEmbankment.iPoly.ProjDir(iPointToProject,iSpatialDir,true);
    if(!project2.ErrorCode)
    {
        oPoint=project2.Point;
        iEarthEmbankment.oMulti.InsertLast(oPoint); 
        errorCode=0;
    }
    //no projection found
    else
    {
        //rotate again the point to apply the opposite slope
        var matrix3=SMatrix.New();
        matrix3.InitRot(ipt,iTangentDir,-2*iEarthEmbankment.iSlopeAtCorners,SMatrix.DEGREE);
        iPointOnDir.ApplyTransformation(matrix3);

        var spatialDir3=SVector.New(ipt,iPointOnDir);
        var project3=iEarthEmbankment.iPoly.ProjDir(iPointToProject,spatialDir3,true);
        if(!project3.ErrorCode)
        {
            oPoint=project3.Point;
            iEarthEmbankment.oMulti.InsertLast(oPoint);
            errorCode=1; 
        }
        
    }

    return {'ErrorCode':errorCode, 'Point':oPoint, 'EarthEmbankment':iEarthEmbankment};
}

function UnbuckleMulti(iEarthEmbankment, iDebug)
{
    var improveRes=iEarthEmbankment.oMulti.RepairAutoIntersections(0.01,-1,SMultiline.SUPPRESS_SMALL_LOOPS_FIRST);
    if(!improveRes.ErrorCode)
    {
        print("removed buckles: "+improveRes.Value)
        iEarthEmbankment.oMulti=improveRes.Multi;
    }

    if(iDebug)
    {
        iEarthEmbankment.oMulti.SetName(iEarthEmbankment.iMultiName+"_"+iEarthEmbankment.iPolyName+"_"+iEarthEmbankment.iSlope+"%_after D1");
        iEarthEmbankment.oMulti.AddToDoc();
        iEarthEmbankment.oMulti.SetVisibility(false);
    }

    return iEarthEmbankment; 
}

function ReprojectOnMesh(iEarthEmbankment)
{
    var reprojectedMultiComputation=iEarthEmbankment.iPoly.Proj3D(iEarthEmbankment.oMulti,true);
    if(reprojectedMultiComputation.ErrorCode)throw new Error("error when reprojecting the result");
    if(reprojectedMultiComputation.MultiTbl.length>1)print("Warning: "+reprojectedMultiComputation.MultiTbl.length+" resulting polylines")
    for(var j=0;j<reprojectedMultiComputation.MultiTbl.length;j++)
    {
        //unbuckle again
        var improveRes2=reprojectedMultiComputation.MultiTbl[j].RepairAutoIntersections(0.01,-1,SMultiline.SUPPRESS_SMALL_LOOPS_FIRST);
        if(!improveRes2.ErrorCode)
        {
            print("removed buckles(bis): "+improveRes2.Value);
            reprojectedMultiComputation.MultiTbl[j]=improveRes2.Multi;
        }
        
        reprojectedMultiComputation.MultiTbl[j].SetName(iEarthEmbankment.iMultiName+"_"+iEarthEmbankment.iPolyName+"_"+iEarthEmbankment.iSlope+"%_part"+j);
        reprojectedMultiComputation.MultiTbl[j].AddToDoc();
    }

    iEarthEmbankment.oMulti=reprojectedMultiComputation.MultiTbl[0];

    return iEarthEmbankment ;
}

function MeshTheJunction(iEarthEmbankment, iDebug)
{
    var featureLinesTbl=new Array();
    featureLinesTbl.push(iEarthEmbankment.iMulti);
    featureLinesTbl.push(iEarthEmbankment.oMulti);
    for(var f=0;f<iEarthEmbankment.oBeamTbl.length;f++)
    {
        if(iEarthEmbankment.oMulti.ClosestPoint(iEarthEmbankment.oBeamTbl[f].GetPoint(1)).SqDistance<0.00001)
        {
            featureLinesTbl.push(iEarthEmbankment.oBeamTbl[f]);
            if(iDebug)
            {
                iEarthEmbankment.oBeamTbl[f].AddToDoc();
            }
        } 
        else
        {
            if(iDebug)
            {
                iEarthEmbankment.oBeamTbl[f].SetColors(1,0,0);
                iEarthEmbankment.oBeamTbl[f].AddToDoc();
            }
        }
    }
    var resJunction=SPoly.ConstraintMesh2D(null,featureLinesTbl,mainDirection,0,0);
    var errorCode=resJunction.ErrorCode;
    if(errorCode==0)
    {
        iEarthEmbankment.oJunction=resJunction.PolyTbl[0];
        iEarthEmbankment.oJunction.SetName(iEarthEmbankment.iMultiName+"_"+iEarthEmbankment.iPolyName+"_"+iEarthEmbankment.iSlope+"%");
    }

    return {'ErrorCode': errorCode, 'EarthEmbankment':iEarthEmbankment};
}