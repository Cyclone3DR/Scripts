/*
 * 	Open a txt file containing a matrix (saved from Best Fit Registration)
 *	and apply the transformation to a selected object
 * 	
 */

// Open the matrix file
var fileName = GetOpenFileName("Matrix file","*.txt","");
print(fileName);
var file = SFile.New(fileName);
if ( !file.Open( SFile.ReadOnly ) )
    throw new Error( 'Failed to read file.' );

//read the file
var content = file.ReadAll();
// separate the lines
var list = content.split("\n");
if(list.length != 14)
	throw new Error('Wrong file content.' );

// read the 1st line of the matrix
var line1 = new Array(4);
for (var ii=1; ii <5; ii++)
{
	print(list[ii]);
	var value = list[ii].split("=");
	if(value.length != 2)
		throw new Error('Impossible to read a value.' );
 	line1[ii-1]=parseFloat(value[1]);
}

var line2 = new Array(4);
for (var ii=5; ii <9; ii++)
{
	print(list[ii]);
	var value = list[ii].split("=");
	if(value.length != 2)
		throw new Error('Impossible to read a value.' );
 	line2[ii-5]=parseFloat(value[1]);
}

var line3 = new Array(4);
for (var ii=9; ii <13; ii++)
{
	print(list[ii]);
	var value = list[ii].split("=");
	if(value.length != 2)
		throw new Error('Impossible to read a value.' );
 	line3[ii-9]=parseFloat(value[1]);

}

file.Close();

print(line1);
print(line2);
print(line3);

//Apply the matrix to the selected object
var mat = SMatrix.New(line1,line2,line3);
var comps = SComp.FromSel();
if(comps.length != 1)
	throw new Error( 'Please select one object' );
comps[0].ApplyTransformation(mat);
print(comps[0].GetName () + ' has moved');

