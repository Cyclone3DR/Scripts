/// <reference path="C:\Program Files\Leica Geosystems\Cyclone 3DR 19.1\Script\JsDoc\Reshaper.d.ts"/>


function ErrorMessage(	_iMessage // [in] the error message
    , _iThrowError// = true // [in] should we throw an error (default value: true)
    )
{
    var _iThrowError = (typeof _iThrowError !== 'undefined') ? _iThrowError : true;

    var myDlg = SDialog.New("Error Message");
	myDlg.AddLine(_iMessage, false, Array(), 1);
    myDlg.Execute();
    if(_iThrowError)
        throw new Error( _iMessage );
}

function DuplicateComp(allSel)
{
    toRet = [];
    allSel.forEach(function(element) {
        eval("toRet.push(" + element.toString() + ".New(element));")
        // var t = element.toString();
        // switch(t)
        // {
        //     case "SPoint":
		// 		toRet.push(SPoint.New(element));
		// 		break;
		// 	case "SCloud":
        //         toRet.push(SCloud.New(element));
		// 		break;
        // }
    })
    return toRet;
}

function mainApplyMatrix()
{
    var DATAFOLDER = CurrentScriptPath ();
    // retrieving file to import
    var Matrixfile = GetOpenFileName("Matrix file", "*.txt", DATAFOLDER);

    if (Matrixfile.length==0)
        ErrorMessage("Cancelled by user")
    
    // loading Matrix file
    var theFile = SFile.New( Matrixfile );
    if ( !theFile.Open( SFile.ReadOnly ) )
        ErrorMessage( 'Failed to read file.' );

    var content = theFile.ReadAll();
    theFile.Close();

    // split the content
    var list = content.split("\n");
     
    // for all the lines
    var MatValues = new Array;
    for (var ii = 1; ii < list.length-1; ii++)
    {
        MatValues.push(parseFloat(list[ii].substr(10)))
        //print (MatValues[ii-1]);
    }
    //print (MatValues.length);
    var Row1 = [MatValues[0], MatValues[1], MatValues[2], MatValues[3]];
    var Row2 = [MatValues[4], MatValues[5], MatValues[6], MatValues[7]];
    var Row3 = [MatValues[8], MatValues[9], MatValues[10], MatValues[11]];
    var theMat = SMatrix.New(Row1, Row2, Row3);

    var allSel = SComp.FromSel();
    var dupData = DuplicateComp(allSel);
    dupData.forEach(function(element) {
        element.ApplyTransformation(theMat);
        element.AddToDoc();
    })

    allSel.forEach(function(element) {
        element.SetVisibility(false);
    })

}

mainApplyMatrix()
