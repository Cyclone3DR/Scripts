/*
 * 	Scan for files in a given directory with a given extension and print their path
 */

// INPUTS
let dial = SDialog.New("Folder configuration");
dial.AddFileSelector(
    {
        id: "path_selector",
        name: "Path to inspect",
        mode: SDialog.EMode.OpenDirectory,
        tooltip: "Select a path where to list files from.",
        value: CurrentScriptPath(),
        saveValue: true
    });

dial.AddTextField(
    {
        id: "extension_selector",
        name: "File extension",
        value: "e57",
        tooltip: 'Extension to list. Such as "3dr", "e57", etc.'
    });

let exec = dial.Run();
if(exec.ErrorCode != 0)
{
    throw new Error("Dialog cancelled.")
}

let path = exec.path_selector;
let ext = exec.extension_selector;

// SCAN Directory
let scanRes = SFile.ListEntries(path, SFile.EntriesType.Files, false, ext.length > 0 ? [ext] : []);

// To list all existing files without taking care of the extension, call the line below instead:
// let scanRes = SFile.ListEntries(Path, SFile.EntriesType.Files);
// To list all existing files recursively, call the line below instead:
// let scanRes = SFile.ListEntries(Path, SFile.EntriesType.Files, true, ext.length > 0 ? [ext] : []);

if(scanRes.ErrorCode != 0)
    throw new Error('Failed to open directory.');

// OUTPUT file paths
for(let filePath of scanRes.Entries)
    Print(filePath);
