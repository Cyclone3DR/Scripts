param(
	[string]$FilePath,
    [string]$X,
    [string]$Y,
    [string]$Z
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public struct STCoord {
    public double X;
    public double Y;
    public double Z;
}

public struct COPYDATASTRUCT {
    public IntPtr DwData;
    public int CbData;
    public IntPtr LpData;
}

public class WindowMessage {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
	
	[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern uint RegisterWindowMessage(string lpString);
	
	[DllImport("kernel32.dll")]
	public static extern IntPtr GetConsoleWindow();
	
	public static uint GetMessageId(string messageName)
    {
        return RegisterWindowMessage(messageName);
    }
    
    public const uint WM_COPYDATA = 0x004A;
}
"@

$content = @"
[ExternalApp]
Handle=528060 

[PegasusManager]
Handle=10487708

EAMessage_CoordFromPegasus=356745
"@

#Get Powershell concsole handle
$currentProcess = Get-Process -Id $PID
$Handle = $currentProcess.Handle

#register a message for 'EAMessage_CoordFromPegasus' and get its code
$messageId = [WindowMessage]::GetMessageId('EAMessage_CoordFromPegasus')

#Check that the path is valid (exist)
#Else create the folders and files
if (!(Test-Path -Path $filePath -Type Leaf -ErrorAction SilentlyContinue)) {
    # The file does not exist, let's create it with its parent folders if needed
    $dir = Split-Path $filePath -Parent
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    New-Item -Path $filePath -ItemType File | Out-Null
	Set-Content -Path $filePath -Value $content
}

#Write handle and mesasge id in the PMDataExchange File
$content = Get-Content $FilePath -Raw
$content = $content -replace "EAMessage_CoordFromPegasus=\d+", "EAMessage_CoordFromPegasus=$messageId"
$content = $content -replace "\[PegasusManager\]\s+Handle=\d+", "[PegasusManager]`r`nHandle=$Handle"
$content | Set-Content $FilePath


#Read Handle of target application
if ($content -match '\[ExternalApp\]\s+Handle=(\d+)') {
    $Foundhandle = $matches[1]
} 


# Create coordinate structure
$coord = New-Object -TypeName STCoord
$coord.X = [double]::Parse($X)
$coord.Y = [double]::Parse($Y)
$coord.Z = [double]::Parse($Z)


# Marshal coordinate structure to unmanaged memory
$coordSize = [System.Runtime.InteropServices.Marshal]::SizeOf($coord)
$ptrCoord = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($coordSize)
[System.Runtime.InteropServices.Marshal]::StructureToPtr($coord, $ptrCoord, $false)


# Create COPYDATASTRUCT
$cds = New-Object -TypeName COPYDATASTRUCT
$cds.DwData = [IntPtr]$messageId 
$cds.CbData = $coordSize
$cds.LpData = $ptrCoord

# Marshal COPYDATASTRUCT to unmanaged memory
$cdsSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cds)
$ptrCds = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($cdsSize)
[System.Runtime.InteropServices.Marshal]::StructureToPtr($cds, $ptrCds, $false)


# Send the WM_COPYDATA message with the pointer to COPYDATASTRUCT
$Targethandle = [IntPtr]::new([int]::Parse($Foundhandle)) 
$result = [WindowMessage]::SendMessage($Targethandle, [WindowMessage]::WM_COPYDATA, [IntPtr]$messageId , $ptrCds)


# Clean up memory
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptrCoord)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptrCds)


