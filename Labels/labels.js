//Input selection: here select lines before running the script
var iLinesTbl=SLine.FromSel();

//Set here the theoretical length of the lines
var iRef=1.145;

for(var i=0;i<iLinesTbl.length;i++){
	//create an empty label with 1 row and 3 columns
    var oLabel=SLabel.New(1,3);
	
	//Set the type of the row among XX, YY, ZZ, NormalX ,NormalY, NormalZ, Radius, Diameter, Angle, Circularity, Cylindricity, Planeity, Distance, AngleX, AngleY, AngleZ, AngleCompX, AngleCompY, AngleCompZ, AngleSuppX, AngleSuppY, AngleSuppZ, AngleC, AngleS, Dev3D, Curv, EmptyLine, Length, Width, Linearity, Sphericity, DistanceXY, DistanceYZ, DistanceXZ, DistanceX, DistanceY, DistanceZ, Volume, Intensity, VolumeOver, VolumeUnder, Perpendicularity, Parallelism, Level, Surface, NbPoints, NbTriangles, NbPieces, NbFreeCont, UndefinedLine, Flatness, 
	oLabel.SetLineType([SLabel.Distance]);
	
	//Set the types of columns among Reference, Measure, Deviation, TolMin, TolMax, Note, Flushing, EmptyCol, Nominal, BBoxMin, BBoxMax, Size, Centroid, LowestPoint, UppestPoint, Count, UndefinedCol 
    oLabel.SetColType([SLabel.Measure,SLabel.Reference,SLabel.Deviation]);
    
	//Fill the 3 cells with the line length, the theoretical length and the difference
    oLabel.SetCell(0,0,iLinesTbl[i].GetLength());
    oLabel.SetCell(0,1,iRef);
    oLabel.SetCell(0,2,iLinesTbl[i].GetLength()-iRef);
	
	//Compute the line middle point (useful to define an attachment point)
    var p1=iLinesTbl[i].GetFirstPoint();
    var p2=iLinesTbl[i].GetLastPoint();
    var attachPoint=SPoint.New(0.5*(p1.GetX()+p2.GetX()),0.5*(p1.GetY()+p2.GetY()),0.5*(p1.GetZ()+p2.GetZ()));
	oLabel.AttachToPoint(attachPoint);
	
	//Define the label comment (for instance, a number)
    oLabel.SetComment("n°"+(i+1));
    
	//Finally, add the label to the current document
    oLabel.AddToDoc();
}