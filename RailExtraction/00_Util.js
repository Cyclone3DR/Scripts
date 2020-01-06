/// <reference path="C:\Program Files\3DReshaper_18.1_x64\docScript\Reshaper.d.ts"/>

function SelNbSComp(SCompType, NbSComp)
{
	var idxSComp = 0;	
	var tblSComp = new Array();
	while (idxSComp < NbSComp)
	{
		var clickedResult = SCompType.FromClick();
		switch (clickedResult.ErrorCode)
		{
		case 0:
			idxSComp++;
			switch (SCompType.toString())
			{
			case "SPoint":
				tblSComp.push(clickedResult.Point);
				break;
			case "SCloud":
				tblSComp.push(clickedResult.Cloud);
				break;
			case "SMultiline":
				tblSComp.push(clickedResult.Multi);
				break;
			default:
				throw new Error( 'Impossible to select this SComp type, not implemented.' );
				break;
			}
			break;
		case 1: // continue (click is not valid)
			break;
		case 2: // an escape key has been pressed
			throw new Error( 'The user has aborted the script.' );
			break;
		default:
			throw new Error( 'FromClick(): Unknown error.' );
			break;
		}
	}
	return tblSComp;
}

function SelNbPoints(NbPoints)
{
	return SelNbSComp(SPoint, NbPoints);
}

function SelNbClouds(NbClouds)
{
	return SelNbSComp(SCloud, NbClouds);
}

function SelNbMultilines(NbLines)
{
	return SelNbSComp(SMultiline, NbLines);
}

function LoadCloud(_iFileName)
{
	var rshLoadCloud = SSurveyingFormat.ImportCloud(_iFileName, 0);
	if(rshLoadCloud.ErrorCode != 0) 
		throw new Error('Error when loading *.pts file: ' + _iFileName);
	if(rshLoadCloud.CloudTbl.length != 1) 
		throw new Error('There isn\'t only one cloud in the file: ' + _iFileName);
	
	rshLoadCloud.CloudTbl[0].SetRepresentationType(SCloud.SMOOTH);
	rshLoadCloud.CloudTbl[0].SetColors(0, 0, 1);
	rshLoadCloud.CloudTbl[0].AddToDoc();
	return rshLoadCloud.CloudTbl[0];
}





