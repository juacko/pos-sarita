param(
  [Parameter(Mandatory=$true)][string]$Printer,
  [Parameter(Mandatory=$true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'

$src = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDatatype; }
}
"@

$dllPath = Join-Path $env:TEMP 'PosRawPrinter.dll'
if (!(Test-Path $dllPath)) {
  Add-Type -TypeDefinition $src -OutputAssembly $dllPath -OutputType Library
}
Add-Type -Path $dllPath

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$di = New-Object RawPrinter+DOCINFO
$di.pDocName = 'POS Ticket'
$di.pDatatype = 'RAW'

$h = [IntPtr]::Zero
if (![RawPrinter]::OpenPrinter($Printer, [ref]$h, [IntPtr]::Zero)) {
  throw "OpenPrinter fallo: " + [Runtime.InteropServices.Marshal]::GetLastWin32Error()
}
try {
  if (![RawPrinter]::StartDocPrinter($h, 1, [ref]$di)) { throw 'StartDocPrinter fallo' }
  try {
    [RawPrinter]::StartPagePrinter($h) | Out-Null
    $written = 0
    if (![RawPrinter]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) {
      throw "WritePrinter fallo: " + [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
    if ($written -ne $bytes.Length) { throw "Solo se escribieron $written de $($bytes.Length) bytes" }
    [RawPrinter]::EndPagePrinter($h) | Out-Null
    Write-Output "OK:$written"
  } finally {
    [RawPrinter]::EndDocPrinter($h) | Out-Null
  }
} finally {
  [RawPrinter]::ClosePrinter($h) | Out-Null
}
