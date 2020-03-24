// ------------------------ HOW TO USE IT --------------------------------------------
// The goal of this script is to identify missing objects in a point cloud by a comparison to a design model (Mesh, CAD). 
// This command is appropriate to inspect SEVERAL design objects. 

// Instructions
// 1. Select the point clouds and all the objects to check (CAD surfaces and/or meshes)
// 2. Fulfill the dialog, then press OK to run the analysis

// The outputs of this script are:
// 1. One or several meshes, extracted from the objects that are missing in the point cloud, according to the Anti-Clash script algorithm.
// 2. A report, which shows different views of the missing objects. A dialog box will open at the end of the computing to allow the user to choose the folder and the name of the report.

// Concerning the algorithm:
// A 3D inspection is done between the surfaces (from the objects) and the cloud.
// An anticlash is detected if a certain amount (%) of the inspected surface ('AntiClash Threshold') is missing from the point cloud (where the inspection is considered as 'undefined'). 
// For example, if you define the threshold at a 20% level, the Anti-Clash will not return the objects whose at least 20% of surfaces are identified in the insepcted point cloud. 
// The remaining objects will be considered as the missing ones and will be returned by the command into meshes.
// To optimize computation time, a maximum searching distance can be provided to bypass outlier points in the clouds.

//namespace reporting
var reportingTools = 
{
	// example:
	//     reportingTools.createReport(array1,"C:\Users\My Report Name.pdf", "A2");
	createReport: function createReport(arrayComp, reportname, paperFormat) {
		//store inputs visibility
		var treeview = SComp.All(2);
		var visibilityTbl = visibilityTools.storeVisibility(treeview);
		visibilityTools.hide(treeview);

		//create an empty report
		var myReport = SReport.New();

		var paperFormatAsEnum = (typeof paperFormat === "string") ? SReport[paperFormat] : paperFormat;
		if (typeof paperFormatAsEnum !== "object") {
			throw new Error("This paper format is invalid " + paperFormat);
		}

		//set report options
		var myOptionsArray = {
			PaperFormat: paperFormatAsEnum,
			MarginTop: 10,
			MarginBottom: 10,
			MarginLeft: 10,
			MarginRight: 10,
			Orientation: 1,
			HeaderPolicy: 1,
			FooterPolicy: 1,
			LengthDecimals: 2,
			AreaDecimals: 0,
			VolumeDecimals: 0,
			AngleDecimals: 4
		};
		myReport.SetReportOptions(myOptionsArray);

		//call the function which creates a chapter report
		if (arrayComp.length > 0) {
			myReport = reportingTools.createChapter(arrayComp, myReport, printedTextTbl);

			//create the pdf report
			myReport.ExportReportPDF(reportname)
		}

		//restore inputs visibility
		visibilityTools.restoreVisibility(
			treeview, visibilityTbl);
	},

	createChapter: function createChapter(arrayComp, myReport, printedTextTbl) {

		for (var indexComp = 0; indexComp < arrayComp.length; indexComp++) {
			var myReportData = SReportData.New(arrayComp[indexComp].GetName());
			var myViewSet = SViewSet.New();

            visibilityTools.show(iCloudTbl)

			// Display Input Before
			arrayComp[indexComp].SetVisibility(true);

            myReportData.AddText('rate',printedTextTbl[indexComp]);

			//-X
			SetViewDir(AXIS_REVERSE_Z);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_a1", myViewSet);
			//X	
			SetViewDir(AXIS_X);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_b1", myViewSet);
			//-Y
			SetViewDir(AXIS_REVERSE_Y);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_c1", myViewSet);
			//Y
			SetViewDir(AXIS_Y);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_d1", myViewSet);
			//-Z
			SetViewDir(AXIS_REVERSE_Z);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_e1", myViewSet);
			//Z
			SetViewDir(AXIS_Z);
			ZoomOn([arrayComp[indexComp]], 1);
			myViewSet.Update(true);
			myReportData.AddViewset("face_f1", myViewSet);

			arrayComp[indexComp].SetVisibility(false);
			//add a chapter
			myReport.AddChapter(myReportData, curPath + 'antiClash_Report_Template.mlt');
		}
		return myReport;
	}
}

//namespace visiblity
var visibilityTools = {
	hide: function hide(componentArray) {
		for (i = 0; i < componentArray.length; i++)
			componentArray[i].SetVisibility(false);
	},

	show: function show(componentArray) {
		for (i = 0; i < componentArray.length; i++)
			componentArray[i].SetVisibility(true);
	},

	storeVisibility: function storeVisibility(componentArray) {
		var visibilityArray = new Array();
		for (i = 0; i < componentArray.length; i++) {
			if (componentArray[i].IsVisible() == true) {
				visibilityArray.push(true);
			} else {
				visibilityArray.push(false);
			}
		}
		return visibilityArray;
	},

	restoreVisibility: function restoreVisibility(componentArray, visibilityArray) {
		for (i = 0; i < componentArray.length; i++)
			componentArray[i].SetVisibility(visibilityArray[i])
	},

	filterVisible: function filterVisible(iArray) {
		var oArray = new Array();
		for (i = 0; i < iArray.length; i++) {
			if (iArray[i].IsVisible() == true)
				oArray.push(iArray[i]);
		}
		return oArray;
	}
}

//inputs: select the clouds, the CAD surfaces and the meshes
var iCloudTbl=SCloud.FromSel();

if(iCloudTbl.length == 0)
    throw new Error("Please select at least one cloud to run the script");

var iCloud=SCloud.Merge(iCloudTbl).Cloud;
var partsCADTbl=SShape.FromSel();
var partsMeshTbl=SPoly.FromSel();

if(partsCADTbl.length == 0 && partsMeshTbl.length == 0)
    throw new Error("Please select at least one CAD or mesh to run the script");

var curPath = CurrentScriptPath() + '/';
var arrayComp=new Array();

visibilityTools.hide(partsCADTbl);
visibilityTools.hide(partsMeshTbl);

//dialog box
var myDialog = SDialog.New('AntiClash Settings');
myDialog.AddLine('AntiClash Threshold (% of surface):', true, Array(), 20);
myDialog.AddLine('Max. Searching Distance (doc unit):', true, Array(), 10);

var parameters = myDialog.Execute();
if( parameters.ErrorCode != 0) 
{
    throw new Error("Analysis cancelled.")
}

var distmax=parameters.InputTbl[0];
var threshold=parameters.InputTbl[1];

//keep input names in a table
var nameTbl=new Array();
for(var i=0;i<partsCADTbl.length;i++)nameTbl.push(partsCADTbl[i].GetName());
for(var i=0;i<partsMeshTbl.length;i++)nameTbl.push(partsMeshTbl[i].GetName());

//convert CAD to meshes
for(var i=0;i<partsCADTbl.length;i++){
    var partMesh=SCADUtil.Discretize(partsCADTbl[i]);
    partsMeshTbl.push(partMesh.Poly);
}

//main algorithm
var undefinedTbl=new Array();
var partSurfTbl=new Array();
var clashMeshTbl=new Array();
var printedTextTbl=new Array();
var antiClashCount = 0;
for (var i=0;i<partsMeshTbl.length;i++){
	//inspection cloud vs mesh
    var res=partsMeshTbl[i].Compare(iCloud,distmax,1,false,0,0,true);
    if(res.ErrorCode==0){
		//replace input mesh by inspected mesh 
        partsMeshTbl[i]=res.Poly;
		//store its surface
        partSurfTbl.push(partsMeshTbl[i].GetSurface().Surface);
		
		//split by color undefined parts
		var split=partsMeshTbl[i].ExplodeWithInspectionSteps();
		//store the surface undefined
		undefinedTbl.push(split.PolyTbl[split.PolyTbl.length-1].GetSurface().Surface);
		
        //print % missing
        var rate=Math.round(undefinedTbl[i]*1000/partSurfTbl[i])/10;
        var printedText=new String(nameTbl[i]+": "+ rate +"% missing");
        print(printedText);

        //if they exceed the threshold 
        if(rate>threshold)
        {                    
            //add missing part in the current document and select them for the report
            split.PolyTbl[split.PolyTbl.length-1].SetColors(1,0,0);
            split.PolyTbl[split.PolyTbl.length-1].SetPolyRepresentation(SPoly.SMOOTH);
            split.PolyTbl[split.PolyTbl.length-1].SetName(nameTbl[i]);
            split.PolyTbl[split.PolyTbl.length-1].AddToDoc();
            arrayComp.push(split.PolyTbl[split.PolyTbl.length-1]);
                
            //and keep the %
            printedTextTbl.push(printedText);

            antiClashCount++;
        }
    }
}

// Create the report using functions define in reporting and visibility namespaces
if(antiClashCount>0)
{
    print("Analysis done: "+antiClashCount +" anticlash(s) detected.");
    var reportPath = GetSaveFileName("Save Anti-Clash report", "PDF file (*.pdf)");
    if(reportPath.length>0)
	{
        reportingTools.createReport(arrayComp, reportPath, "A4");
        print("Report generated at the following location: "+reportPath)        ;
    }
}
else
    print("Analysis done: No anticlash detected");