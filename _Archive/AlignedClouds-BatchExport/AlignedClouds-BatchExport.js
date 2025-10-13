//measured clouds must be named with a suffix (like 'import')
//aligned clouds (=clouds to export) must be named with the suffix "export" 
//select the clouds named with the suffix "export" and launch the script

var dlg=SDialog.New("Export parameters");
dlg.AddTextField({ id: "exportSuffix", name: "Export Suffix", tooltip: "Aligned clouds (=clouds to export) must be named with the suffix 'export'", value: "export", saveValue: true, readOnly: true, canBeEmpty: false });
dlg.AddTextField({ id: "importSuffix", name: "Import Suffix", tooltip: "Measured clouds must be named with another suffix, for instance 'import'", value: "import", saveValue: true, readOnly: false, canBeEmpty: false });
dlg.AddTextField({ id: "filepath", name: "File path", tooltip: "without the file name, example: 'C:/Users/firstname.name/Documents/'", value: "C:/", saveValue: true, readOnly: false, canBeEmpty: false });
dlg.AddChoices({ id: "format", name: "Cloud format", choices: [".asc", ".csv", ".igs", ".las", ".nsd", ".pts", ".ptx"], value: 4, saveValue: true, readOnly: false, style: SDialog.ChoiceRepresentationMode.ComboBox});
var res=dlg.Run();

if(res.ErrorCode==0)
{
    switch(res.format)
    {
        case 0:
            var format = ".asc";
            break;
        case 1:
            var format = ".csv";
            break;
        case 2:
            var format = ".igs";
            break;
        case 3:
            var format = ".las";
            break;
        case 4:
            var format = ".nsd";
            break;
        case 5:
            var format = ".pts";
            break;
        case 6:
            var format = ".ptx";
            break;
    }
    var filepath = res.filepath;

    var arrayCloudToExport = SCloud.FromSel();
    if(arrayCloudToExport.length==0)
        throw new Error("Select clouds named with the suffix 'export' and launch the script");

    for (var i = 0; i < arrayCloudToExport.length; i = i + 1) {
        //Save the aligned cloud
        var myCloudToExport = arrayCloudToExport[i];
        var myAlignedCloudName = myCloudToExport.GetName();
        var myFilePath1 = filepath;
        myFilePath1 += myAlignedCloudName;
        myFilePath1 += format;
        myCloudToExport.Save(myFilePath1, '.', false)

        //Compute the corresponding matrix (replay the registration: best fit between measured and aligned clouds)
        var myMeasuredCloud = SCloud.FromName(myAlignedCloudName.replace(res.exportSuffix, res.importSuffix))[0];
        if(myMeasuredCloud==undefined)
        {
            SDialog.Message("'Import' cloud not found: \n"+myAlignedCloudName,SDialog.EMessageSeverity.Error,"Error")
        }
        else
        {
            var myMovingCloud = SCloud.New(myMeasuredCloud);
            var step1 = SMatrix.New();
            step1.InitAutoRoughAlign(myCloudToExport, myMeasuredCloud);
            myMovingCloud.ApplyTransformation(step1);
            var bothClouds = new Array();
            bothClouds.push(myCloudToExport);
            bothClouds.push(myMovingCloud);
            var step2 = SMatrix.BestFitCompute(bothClouds, 0, 0, SMatrix.ALL_MOVEMENT, null, SVector.New(), true)
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
    }
}