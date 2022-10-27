/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR 19.1\Script\JsDoc\Reshaper.d.ts"/>


function mainImportProject() {
    var DATAFOLDER = CurrentScriptPath();
    // retrieving file to import
    var File = GetOpenFileName("3DR Project", "*.3dr *.rsh", DATAFOLDER);

    if (File.length != 0)
        OpenDoc(File, false, false)
}

mainImportProject()
