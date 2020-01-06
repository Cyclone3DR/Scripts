//Select the labels before launching the script and set the path
var label = SLabel.FromSel();

//write header
var csv = new String();
csv="num;Vol+;Vol-;\n";

//extract the data
for (i=0;i<label.length;i++){
a=label[i].GetName();
res=label[i].GetCol(0);
b=res.ValueTbl[0];
c=res.ValueTbl[1];
csv+=a + ";" + b + ";" + c + ";" + "\n" ;
}

//create the csv report
var path=new String();
path="C:/Users/Default/Desktop/report_over_under.csv";
SaveData(path, csv);

function SaveData(
                fileName // the file path
                , content // the content to write in the file
                )
{
    var file = SFile.New( fileName );
    // save the data
    if ( !file.Open( SFile.WriteOnly ) )
        throw new Error( 'Failed to write file:' + fileName ); // test if we can open the file
        
    // write the smultiline in the file
    file.Write( content );
    // Close the file
    file.Close();
}