function getCloud() {
	// Retrieve cloud
	var measuredCloudNames = 'Aligned Dam';
	var result = SCloud.FromName(measuredCloudNames);
	if (result.length != 1)
		throw new Error('Impossible to load: ' + measuredCloudNames + '. We have ' + result.length + "imported component(s), named " + measuredCloudNames + ". Check your path file or use ClearDoc() to start with a empty document.");

	// Cleaning the point cloud
	var multiBox = SMultiline.New();
	multiBox.InsertLast(SPoint.New(11.7650, 41.2910, -0.4814), 0.00001);
	multiBox.InsertLast(SPoint.New(11.7514, 41.2910, -0.0110), 0.00001);
	multiBox.InsertLast(SPoint.New(12.4766, 41.2910, 2.5515), 0.00001);
	multiBox.InsertLast(SPoint.New(9.71246, 41.2910, 2.5888), 0.00001);
	multiBox.InsertLast(SPoint.New(5.30466, 41.2910, 8.1920), 0.00001);
	multiBox.InsertLast(SPoint.New(6.42529, 41.2910, 8.9390), 0.00001);
	multiBox.InsertLast(SPoint.New(13.7093, 41.2910, 2.7756), 0.00001);
	multiBox.InsertLast(SPoint.New(13.8961, 41.2910, -0.9410), 0.00001);
	multiBox.InsertLast(SPoint.New(12.7568, 41.2910, -0.9784), 0.00001);
	multiBox.Close();
	multiBox.AddToDoc();

	var PointFirstPlane = SPoint.New(12.4393, 41.2910, -0.4554);
	var PointSecondPlane = SPoint.New(6.4556, 24.0964, 8.1279);
	var direction = SVector.New(0, 1, 0);
	// Separate the cloud
	var separateResult = result[0].Separate(
		multiBox, // [in] Closed polygonal contour that cuts the current cloud.
		direction, // [in] Direction of the extrusion.
		PointFirstPlane, // [in] Point on the first plane of the box.
		PointSecondPlane, // [in] Point on the second plane of the box.
		SCloud.FILL_OUT_ONLY
	);
	var theCloud = separateResult.OutCloud
	var PrevCol = result[0].GetColors()
	theCloud.SetName('Aligned Dam Cleaned')
	theCloud.SetColors(PrevCol.Red, PrevCol.Green, PrevCol.Blue)
	theCloud.SetCloudRepresentation(SCloud.CLOUD_SMOOTH)


	return theCloud;
}

function getNominal() {
	var NominalMeshName = 'Theoretical Dam (good CS)';
	var surfaceObject = SPoly.FromName(NominalMeshName);
	if (surfaceObject.length != 1)
		throw new Error('Impossible to load: ' + NominalMeshName + '. We have ' + surfaceObject.length + " imported component(s), named " + NominalMeshName + ". Check your path file or use ClearDoc() to start with a empty document.");
	surfaceObject[0].RemoveFromDoc()
	return surfaceObject[0]
}

function cleanDocument() {
	ClearDoc()
	AllData.measuredCloud.AddToDoc()
	AllData.nominalMesh.AddToDoc()
	ZoomAll()
}

function create1stChapter(AllData) {
	var compareResult = AllData.nominalMesh.Compare(
		AllData.measuredCloud, // [in] Cloud considered as the measured object to project on this
		0.3 // [in] ignore point having a distance greater than this one. 
	);

	if (compareResult.ErrorCode != 0)
		throw new Error('Impossible to compare the mesh and the cloud');

	AllData.inspectedMesh = compareResult.Poly;

	var theGrad = AllData.inspectedMesh.GetColorGradient().Gradient;
	theGrad.SetDisplayOption(SColorGradient.SHOW_FOREGROUND)

	AllData.measuredCloud.SetVisibility(false);
	AllData.nominalMesh.SetVisibility(false);
	AllData.inspectedMesh.SetName('compareResult');
	AllData.inspectedMesh.AddToDoc();
	AllData.reportChapter1 = compareResult.ReportData
	AllData.reportChapter1.SetName("Dam Inspection")
	AllData.reportChapter1.AddToDoc();
}

function updateView(AllData) {
	SetCameraDirection(AXIS_X)
	ZoomAll()
	AllData.reportChapter1.UpdateMainViewSet()
}

function createLabels(AllData) {
	var gradient = AllData.inspectedMesh.GetColorGradient().Gradient
	var min = gradient.GetRange().Min;
	var max = gradient.GetRange().Max;
	var ret = AllData.inspectedMesh.LocalizeValues([min, max]);
	if (ret.ErrorCode != 0)
		throw new Error('Failed to localize values');

	var idx = 0;
	ret.Results.forEach(function (curResult) {
		var theComp = curResult.Comp
		var theLabel = curResult.Label;
		var labelName = "Most internal deviation"
		if (idx == 1)
			labelName = "Most external deviation"
		theLabel.SetName(labelName)
		theLabel.AddToDoc();
		AllData.labels.push(theLabel)
		idx++
	}
	);

	AllData.reportChapter1.AddLabels("Deviations", AllData.labels)
}

function create2ndChapter(AllData) {
	AllData.reportChapter2 = SReportData.New('All Views');

	var Dir = SVector.New(-0.5, -0.5, -0.5);
	var frontDir = SVector.New(-1, 0, 0);
	var sideDir = SVector.New(0, 1, 0);
	var topDir = SVector.New(0, 0, -1);
	var xDir = SVector.New(1, 0, 0);
	var zDir = SVector.New(0, 0, 1);

	var ViewSet = SViewSet.New(true);
	SetCameraDirection(Dir, zDir);
	ZoomAll();
	ViewSet.Update(true);

	var ViewSetX = SViewSet.New(true);
	SetCameraDirection(frontDir, zDir);
	ViewSetX.Update(true);

	var ViewSetY = SViewSet.New(true);
	SetCameraDirection(sideDir, zDir);
	ViewSetY.Update(true);

	var ViewSetZ = SViewSet.New(true);
	SetCameraDirection(topDir, xDir);
	ViewSetZ.Update(true);

	AllData.reportChapter2.AddViewset('MainView', ViewSet);
	AllData.reportChapter2.AddViewset('XView', ViewSetX);
	AllData.reportChapter2.AddViewset('YView', ViewSetY);
	AllData.reportChapter2.AddViewset('ZView', ViewSetZ);
}

function createReport(AllData) {
	var theReport = SReport.New()

	var reportOpt = {
		PaperFormat: SReport.A4,
		MarginTop: 5,
		MarginBottom: 0,
		Orientation: 1,
		HeaderPolicy: 1,
		FooterPolicy: 0,
		LengthDecimals: 3
	};

	theReport.SetReportOptions(reportOpt);

	var res = theReport.AddChapter(AllData.reportChapter1, CurrentScriptPath() + '/CustomInspectionReport.mlt');
	if (res.ErrorCode != 0)
		throw new Error('Failed to add chapter 1');

	res = theReport.AddChapter(AllData.reportChapter2, CurrentScriptPath() + '/Landscape_4Views.mlt');
	if (res.ErrorCode != 0)
		throw new Error('Failed to add chapter 2');

	res = theReport.ExportReportPDF(CurrentScriptPath() + '/InspectionReports.pdf')
	if (res.ErrorCode != 0)
		throw new Error('Failed to create the PDF file');
	else
		print('Report generated at: ' + CurrentScriptPath() + '/InspectionReports.pdf');
}

var AllData = {
	measuredCloud: getCloud(),
	nominalMesh: getNominal(),
	inspectedMesh: '',
	reportChapter1: '',
	reportChapter2: '',
	labels: []
};

cleanDocument()
create1stChapter(AllData)
create2ndChapter(AllData)
createLabels(AllData)
updateView(AllData)
createReport(AllData)