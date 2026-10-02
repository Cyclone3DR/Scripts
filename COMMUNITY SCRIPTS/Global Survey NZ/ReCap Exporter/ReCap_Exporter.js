// ReCap_Exporter.js
// Automates exporting Cyclone 3DR Point Clouds to Autodesk ReCap (.rcp/.rcs)
// Uses Autodesk DeCap.exe in the background.

print("Starting ReCap Exporter...");

var clouds = SCloud.FromSel();
if (clouds.length === 0) {
    print("No clouds selected. Grabbing all visible clouds instead...");
    var allClouds = SCloud.All();
    for (var c = 0; c < allClouds.length; c++) {
        if (allClouds[c].IsVisible()) clouds.push(allClouds[c]);
    }
    
    if (clouds.length === 0) {
        throw new Error("No visible point clouds found in the project. Please load or display a cloud.");
    }
}

// 1. Build the GUI
var gui = SDialog.New("Export to ReCap (RCS / RCP)");
gui.BeginGroup("Options");
gui.AddChoices({
    id: "outputMode",
    name: "Output",
    choices: ["RCP project + Support folder", "RCS file(s) only"],
    style: SDialog.ChoiceRepresentationMode.RadioButtons
});
gui.AddChoices({
    id: "grouping",
    name: "Clouds",
    choices: ["Separate - one scan per cloud", "Combined - merge all clouds into one scan"],
    style: SDialog.ChoiceRepresentationMode.RadioButtons
});

gui.SetButtons(["Select Output Folder & Run", "Cancel"]);
var res = gui.Run();

if (res.ErrorCode !== 0) {
    print("Export cancelled by user.");
    // Terminate script cleanly without error
} else {
    var isRcp = res.outputMode === 0;
    var isCombined = res.grouping === 1;

    // Get output directory
    var outputFolder = GetOpenFolder("Select output folder for ReCap project", "C:/");
    if (!outputFolder || outputFolder.length === 0) {
        print("Export cancelled.");
    } else {
        outputFolder = outputFolder.replace(/\\/g, "/");
        if (outputFolder.charAt(outputFolder.length - 1) !== "/") {
            outputFolder += "/";
        }
        
        // Derive project name from output folder name
        var pathParts = outputFolder.split("/");
        var projectName = pathParts[pathParts.length - 2] || "Exported_Project"; 

        print("Target Folder: " + outputFolder);
        print("Project Name: " + projectName);

        // Export Temporary E57 files
        var e57Files = [];

        if (isCombined) {
            var mergedCloud = SCloud.New();
            for (var i = 0; i < clouds.length; i++) {
                mergedCloud.Add(clouds[i]);
            }
            var tempE57 = outputFolder + projectName + "_temp.e57";
            print("Exporting merged temporary E57 to: " + tempE57);
            SSurveyingFormat.ExportE57([mergedCloud], [], tempE57);
            e57Files.push(tempE57);
        } else {
            for (var i = 0; i < clouds.length; i++) {
                var tempE57 = outputFolder + clouds[i].GetName() + "_temp.e57";
                print("Exporting temporary E57 to: " + tempE57);
                SSurveyingFormat.ExportE57([clouds[i]], [], tempE57);
                e57Files.push(tempE57);
            }
        }

        // Generate Background PowerShell Script to run DeCap.exe
        var decapPath = "C:\\Program Files\\Autodesk\\Autodesk ReCap\\DeCap.exe";
        var ps1Path = outputFolder + "_recap_converter_" + (new Date()).getTime() + ".ps1";

        var psCode = "";
        psCode += "$decap = '" + decapPath + "'\n";
        psCode += "if (-Not (Test-Path $decap)) { \n";
        psCode += "   Write-Host 'ERROR: DeCap.exe not found. Is Autodesk ReCap installed?' -ForegroundColor Red\n";
        psCode += "   Read-Host 'Press Enter to exit'\n";
        psCode += "   exit\n";
        psCode += "}\n\n";

        psCode += "$e57Files = @(\n";
        for(var j=0; j<e57Files.length; j++) {
            psCode += "  '" + e57Files[j].replace(/\//g, "\\") + "'\n";
        }
        psCode += ")\n\n";

        var args = "";
        if (isRcp) {
            psCode += "$args = '--importWithLicense', '" + outputFolder.replace(/\//g, "\\") + "', '" + projectName + "'\n";
            psCode += "$args += $e57Files\n";
        } else {
            psCode += "$args = '--importWithLicense', '" + outputFolder.replace(/\//g, "\\") + "', '" + projectName + "'\n";
            psCode += "$args += $e57Files\n";
        }

        psCode += "Write-Host '========================================'\n";
        psCode += "Write-Host ' Autodesk DeCap.exe Processing...'\n";
        psCode += "Write-Host '========================================'\n";
        psCode += "& $decap $args\n\n";

        psCode += "Write-Host 'Cleaning up temporary files...'\n";
        psCode += "foreach ($file in $e57Files) { Remove-Item $file -ErrorAction SilentlyContinue }\n";
        psCode += "Remove-Item $PSCommandPath -ErrorAction SilentlyContinue\n";
        psCode += "Write-Host 'DONE!'\n";
        psCode += "Start-Sleep -Seconds 3\n";

        // Write the PowerShell script
        var file = new SFile(ps1Path);
        file.Open(SFile.OpenModeEnum.WriteOnly);
        file.Write(psCode);
        file.Close();

        // Launch PowerShell visibly using cmd.exe start
        print("Launching Autodesk ReCap Converter in the background...");
        var powershellExec = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
        var psPath = ps1Path.replace(/\//g, "\\");
        
        // Using cmd.exe /c start forces Windows to open a new visible console window
        var cmdArgs = ["/c", "start", "ReCap Export Background Task", powershellExec, "-ExecutionPolicy", "Bypass", "-NoExit", "-File", psPath];
        Execute("cmd.exe", cmdArgs);

        print("Background conversion started! A command window should have popped up.");
        print("You can continue working in Cyclone 3DR.");
    }
}
