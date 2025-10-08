/// Script engine API documentation
/// <reference path="C:/Program Files/Leica Geosystems/Cyclone 3DR/Script/JsDoc/Reshaper.d.ts" />

let _delimiter = ";";
let allMeasures = SMeasure.All();

if (allMeasures.length == 0) {
    throw new Error("No measures available in the project.")
}
else {
    print(`Found ${allMeasures.length} measures.`);
}

var csvHeader = ["ID", "Name", "Comment"];
var csvRows = [];

for (let meas of allMeasures) 
{
    let csvRow = [];

    let buildHeader = (csvHeader.length == 3);

    csvRow.push(meas.GetID());
    csvRow.push(meas.GetName());
    csvRow.push(meas.GetComment().String);

    for (let key of meas.GetRowsKeys().StringTbl) 
    {
        let row = meas.GetRowData(key);

        if (row.ErrorCode > 0) 
        {
            print(`Error while querying key ${key} from measure ${meas.GetName()}`);
            continue;
        }

        let rowData = row.Result;
        let rowName = rowData.Name;
        let values = rowData.Values;

        for (let val of values) 
        {
            if (buildHeader) 
            {
                let pref = val.Prefix;
                let colName = rowName;
                if (pref)
                    colName = colName.concat(`[${pref}]`)

                csvHeader.push(colName)
            }

            csvRow.push(val.Value);
        }
    }
    csvRows.push(csvRow);
}

let outputPath = GetSaveFileName("Select a fileName", "*.csv", CurrentScriptPath());

if(outputPath.length > 0)
{
    let csv = SFile.New(outputPath);
    if(!csv.Open(SFile.WriteOnly))
        throw new Error("Can't write to the file.");

    csv.Write(csvHeader.join(_delimiter) + "\n");
    
    csvRows.forEach(function(r)
    {
        csv.Write(r.join(_delimiter) + "\n");
    });

    csv.Close();
}

let dir = outputPath.substring(0, outputPath.lastIndexOf("\\")+1);
OpenUrl(dir);