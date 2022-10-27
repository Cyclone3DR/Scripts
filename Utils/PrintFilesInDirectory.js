/*
 * 	Scan for files in a given directory with a given extension and print their path
 *
 * 	Note:
 * 	The file RshFileListing.bat must be present on your computer
 */

// INPUTS
// Path of the batch file that will scan for files
var batchFile = "C:/Users/Nicolas S/Documents/RshFileListing.bat"
// The path where to look for files. Do not forget to add the caracter '/' at the end
var Path = "C:/Users/Public/Documents/3DReshaper 2016 MR1 (x64)/Samples/";
// The extension to look for. Optionnal.
var Ext = "3dr"

// SCAN Directory
var errorCode = Execute(batchFile, [Path, Ext]);
// To list all existing files without taking care of the extension, call the line below instead:
// Execute("C:/Users/Nicolas S/Documents/RshFileListing.bat", [Path]);

var file = SFile.New(Path + "RshFileList.txt");
if (!file.Open(SFile.ReadOnly))
    throw new Error('Failed to open file.');

// OUTPUT file paths
while (file.AtEnd() == false) {
    var fileName = file.ReadLine();
    print(Path + fileName);
}

file.Close();
