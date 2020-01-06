//Select the cloud to color according to a criterion...
myCloud=SCloud.FromSel()[0];

//explode the input according to inspection color (or intensities)
explodedClouds=myCloud.ExplodeColor();

//sort the exploded clouds by inspection value
tbl=new Array();
tbl2=new Array();
tbl3=new Array();

for(i=0;i<explodedClouds.CloudTbl.length;i++){
	var it = explodedClouds.CloudTbl[i].GetIterator();
	tbl.push(it.GetDeviation());
	tbl2.push(it.GetDeviation());
}

tbl2.sort(function(a, b) {  return a - b;});

for(j=0;j<tbl.length;j++){
	tbl3.push(tbl.indexOf(tbl2[j]));
}

//set the color for the lowest range (red)
explodedClouds.CloudTbl[tbl3[0]].SetColors(1,0,0);
explodedClouds.CloudTbl[tbl3[0]].SetName("1st");

//set the color on the 2nd range (criterion): green or yellow
nbPoints=myCloud.GetNumber();
nbPointsInSecundRange=explodedClouds.CloudTbl[tbl3[1]].GetNumber();
if(nbPointsInSecundRange/nbPoints<0.5){
	explodedClouds.CloudTbl[tbl3[1]].SetColors(1,1,0);
}else{
	explodedClouds.CloudTbl[tbl3[1]].SetColors(0,1,0);
}
explodedClouds.CloudTbl[tbl3[1]].SetName("2nd");

//set the color for the 3rd range (blue)
explodedClouds.CloudTbl[tbl3[2]].SetColors(0,0,1);
explodedClouds.CloudTbl[tbl3[2]].SetName("3rd");

//set the color for the 4th range (grey)
explodedClouds.CloudTbl[tbl3[3]].SetColors(0.3,0.3,0.3);
explodedClouds.CloudTbl[tbl3[3]].SetName("4th");

//add another ranges...

//create outputs
for(i=0;i<explodedClouds.CloudTbl.length;i++){
	explodedClouds.CloudTbl[i].SetCloudRepresentation(SCloud.CLOUD_FLAT )
	explodedClouds.CloudTbl[i].AddToDoc();
}

//remove input cloud
myCloud.RemoveFromDoc();