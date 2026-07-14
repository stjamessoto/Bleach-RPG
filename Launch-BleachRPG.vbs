Set objShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\Launch-BleachRPG.bat"
objShell.Run """" & batPath & """", 0, False
