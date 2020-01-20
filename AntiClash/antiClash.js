//AntiClash
//This script identifies missing objects in a point cloud. Optionnally, it creates a report.
//To use it, open the script editor and load antiClash.js. 
//Select the point clouds and all the objects to check (CAD surfaces and/or meshes), fulfill the dialog, then run the script.  

//namespace reporting
var reportingTools = {
	// example:
	//     reportingTools.createReport(array1,"My Report Name", "A2");
	//     reportingTools.createReport(array1,"My Report Name", SReport.A2);
	createReport: function createReport(arrayComp, reportname, paperFormat, displayInputBefore) {
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
			myReport = reportingTools.createChapter(arrayComp, myReport, displayInputBefore,printedTextTbl);

			//create the pdf report
			myReport.ExportReportPDF(curPath + reportname + '.pdf')
		}

		//restore inputs visibility
		visibilityTools.restoreVisibility(
			treeview, visibilityTbl);
	},

	createChapter: function createChapter(arrayComp, myReport, displayInputBefore,printedTextTbl) {

		for (var indexComp = 0; indexComp < arrayComp.length; indexComp++) {
			var myReportData = SReportData.New(arrayComp[indexComp].GetName());
			var myViewSet = SViewSet.New();

            visibilityTools.show(iCloudTbl)

			if (displayInputBefore == true) {
				arrayComp[indexComp].SetVisibility(true);
			} else {
				arrayComp[indexComp].SetVisibility(false);
			}

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
			//use the line below so as to be able to edit your own template
			//but pay attention not to create a report data with thousands of chapters
			//myReportData.AddToDoc();
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
var iCloud=SCloud.Merge(iCloudTbl).Cloud;
var partsCADTbl=SShape.FromSel();
var partsMeshTbl=SPoly.FromSel();

var curPath = CurrentScriptPath() + '/';
var arrayComp=new Array();

visibilityTools.hide(partsCADTbl);
visibilityTools.hide(partsMeshTbl);

//dialog box
var myDialog = SDialog.New('Settings');
myDialog.AddLine('Outlier distance', true, Array(), 10);
myDialog.AddLine('Threshold (% of surface)', true, Array(), 50);
myDialog.AddLine('1=dump results and report/0=no', true, Array(), 1);
var parameters = myDialog.Execute();
if( parameters.ErrorCode == 0) {
    var distmax=parameters.InputTbl[0];
    var threshold=parameters.InputTbl[1];
    var dumpResults=parameters.InputTbl[2];
}	

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

			//dump results 
			if (dumpResults==1){
				//if they exceed the threshold 
				if(rate>threshold){
                    
					//add missing part in the current document and select them for the report
					split.PolyTbl[split.PolyTbl.length-1].SetColors(1,0,0);
					split.PolyTbl[split.PolyTbl.length-1].SetPolyRepresentation(SPoly.SMOOTH);
					split.PolyTbl[split.PolyTbl.length-1].SetName(nameTbl[i]);
                    split.PolyTbl[split.PolyTbl.length-1].AddToDoc();
                    arrayComp.push(split.PolyTbl[split.PolyTbl.length-1]);
					
					//and keep the %
					printedTextTbl.push(printedText);
                }
			}
    }else{
        undefinedTbl.push(); 
        partSurfTbl.push();
        print(nameTbl[i]+": comparison error");
    }
}

//create the report using functions define in reporting and visibility namespaces
if(dumpResults)reportingTools.createReport(arrayComp,"antiClash_Report", "A4", true);