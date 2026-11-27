/*
 * 	Open a txt file containing a matrix (saved from Best Fit Registration)
 *	and apply the transformation to a selected object
 * 	
 */

// Open the matrix file
var fileName = GetOpenFileName("Matrix file", "*.txt", "");
print(fileName);
var file = SFile.New(fileName);
if (!file.Open(SFile.ReadOnly))
{
    SDialog.Message('Failed to read file.',SDialog.EMessageSeverity.Error,'Error');
    throw new Error('Failed to read file.');
}

// read the file
var content = file.ReadAll();
file.Close();

function FailReading(message)
{
    SDialog.Message(message, SDialog.EMessageSeverity.Error, 'Error');
    throw new Error(message);
}

// separate the lines, ignoring surrounding white spaces and blank lines
var list = content.split("\n")
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; });

// 1 header line followed by the 12 matrix fields
if (list.length != 13)
    FailReading('Wrong file content.');

// read the 3 lines of the matrix (4 fields each)
var rows = [];
for (var row = 0; row < 3; row++) {
    var values = new Array(4);
    for (var col = 0; col < 4; col++) {
        var line = list[1 + row * 4 + col];
        print(line);
        var value = line.split("=");
        if (value.length != 2)
            FailReading('Impossible to read a value.');
        values[col] = parseFloat(value[1]);
        if (isNaN(values[col]))
            FailReading('Impossible to read a value.');
    }
    rows.push(values);
}
rows.forEach(function (row) { print(row); });

// Apply the matrix to the selected object
var mat = SMatrix.New(rows[0], rows[1], rows[2]);
var comps = SComp.FromSel();
if (comps.length != 1)
{
    SDialog.Message('Please select one object',SDialog.EMessageSeverity.Error,'Error');
    throw new Error('Please select one object');
}
comps[0].ApplyTransformation(mat);
print(comps[0].GetName() + ' has moved');