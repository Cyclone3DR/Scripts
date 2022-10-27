//measured clouds must be named with the suffix "import"
//aligned clouds (=clouds to export) must be named with the suffix "export" 
//choose a cloud format (.asc, .csv, .igs, .las, .nsd, .pts or .ptx), modify the filepath, select the clouds named with the suffix "export" and launch the script
var format = ".pts";
var filepath = "C:/Users/benoit.passot/Documents/"
var arrayCloudToExport = SCloud.FromSel();

for (var i = 0; i < arrayCloudToExport.length; i = i + 1) {
	//Save the aligned cloud
	var myCloudToExport = arrayCloudToExport[i];
	var myAlignedCloudName = myCloudToExport.GetName();
	var myFilePath1 = filepath;
	myFilePath1 += myAlignedCloudName;
	myFilePath1 += format;
	myCloudToExport.Save(myFilePath1, '.', false)

	//Compute the corresponding matrix (replay the registration: best fit between measured and aligned clouds)
	var myMeasuredCloud = SCloud.FromName(myAlignedCloudName.replace('export', 'import'))[0];
	var myMovingCloud = SCloud.New(myMeasuredCloud);
	var step1 = SMatrix.New();
	step1.InitAutoRoughAlign(myCloudToExport, myMeasuredCloud);
	myMovingCloud.ApplyTransformation(step1);
	var bothClouds = new Array();
	bothClouds.push(myCloudToExport);
	bothClouds.push(myMovingCloud);
	var step2 = SMatrix.BestFitCompute(bothClouds, 0, 0, SMatrix.ALL_MOVEMENT, null, 0, true)
	myMovingCloud.ApplyTransformation(step2.MatrixTbl[1]);
	step2.MatrixTbl[1].ApplyTransformation(step1);
	////myMovingCloud.AddToDoc();

	//Save the matrix in a csv file
	var csvReport = "";
	var myFilePath2 = filepath;
	myFilePath2 += myAlignedCloudName.replace('export', 'matrix');
	myFilePath2 += ".csv";
	for (var j = 0; j < 3; j = j + 1) {
		for (var k = 0; k < 4; k = k + 1) {
			csvReport += step2.MatrixTbl[1].GetValue(j, k);
			csvReport += ";"
		}
		csvReport += "\n";
	}

	// save the data
	var file = SFile.New(myFilePath2);
	if (!file.Open(SFile.WriteOnly))
		throw new Error('Failed to write file:' + myFilePath2); // test if we can open the file

	// write the smultiline in the file
	file.Write(csvReport);

	// Close the file
	file.Close();
}
