


/**
 * Cyclone 3DR Data Exchange utility
 * 
 * This script provides a functionality to export the coordinates of points clicked in Cyclone 3DR to an external application.
 * The data is exported according to the same specification of the Pegasus Manager Data Exchange.  
 * 
 * The following script has been tested on the following release versions:
    - Cyclone 3DR 2025.1.6.47986

 * For more information regarding this script consult the project .md file 
 * --> [Coming soon]
 * 
 * BEFORE USE
 * - Please save the 3DR script file AND "DATAEXCHANGE.ps1" in the SAME folder, in a path where no non-english character is used. 
 * - Do not rename the file "DATAEXCHANGE.ps1"
 * 
 * How to use
    1. Run the script 
    2. Click points on the Cyclone 3DR screen to send them to the external application
    3. Once finished, stop script execution.
 */

/* ---- Main code Starts here ------ */

var myPowershellScriptName = 'DATAEXCHANGE.ps1';

//Use Pegasus manager default path for the PMDataExchange.txt file
var myPMFilePath = "C:/Leica Pegasus/PegasusManager/PMDataExchange.txt"

//Capture clicked coordinates until the script is stopped
print('...Capturing mouse click...');
while (1 > 0)
{
    var myPoint = SPoint.FromClick().Point;
    DATAEXCHANGE_SendCoordinates(myPoint);  
}

/*
Call Data Exchage powershell script.
Pass clicked point coordinates in parameter as double
*/
function DATAEXCHANGE_SendCoordinates(myCoordinates)
{    
    var myPMDataExchangeFilePath = myPMFilePath;
    var x = myCoordinates.GetX();
    var y = myCoordinates.GetY();;
    var z = myCoordinates.GetZ();;

    //create script call command
    var myScriptPath = '';
    var myArguments = [];

    myScriptPath = myScriptPath.concat('powershell -ExecutionPolicy remotesigned -File "');
    myScriptPath = myScriptPath.concat(CurrentScriptPath());
    myScriptPath = myScriptPath.concat('/');
    myScriptPath = myScriptPath.concat(myPowershellScriptName);
    myScriptPath = myScriptPath.concat('"');

     
    
    //add arguments 
    myArguments.push(String(myPMDataExchangeFilePath));
    myArguments.push(String(x)); 
    myArguments.push(String(y)); 
    myArguments.push(String(z)); 

    var retval = Execute(myScriptPath,myArguments);

    switch (retval)
    {
        case 0:
        break;
        case -1:
            var message = ''
            message = message.concat('Powershell script triggered error at execution');
            POPUP_Message('Error',message,SDialog.Error);
            throw new Error(message);
        break;
        case -2:
            var message = ''
            message = message.concat('Unable to find powershell script ');
            message = message.concat(myPowershellScriptName);
            POPUP_Message('Error',message,SDialog.Error);
            throw new Error(message);
        break;
    }
}




/**
 * Generate a Popup to display a message.
 */
function POPUP_Message(myTitle,myMessage,mySeverity)
{
	SDialog.Message(myMessage,mySeverity,myTitle);
}
