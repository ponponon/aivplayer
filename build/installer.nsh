!include "WinMessages.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"
${StrStr}
${StrRep}

!macro aivcliBroadcastEnvironment
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customInstall
  ; aivcli.cmd is installed beside AIVPlayer.exe by extraFiles.
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrStr} $1 $0 "$INSTDIR"
  ${If} $1 == ""
    ${If} $0 == ""
      StrCpy $2 "$INSTDIR"
    ${Else}
      StrCpy $2 "$0;$INSTDIR"
    ${EndIf}
    WriteRegExpandStr HKCU "Environment" "Path" $2
    !insertmacro aivcliBroadcastEnvironment
  ${EndIf}
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrRep} $1 $0 ";$INSTDIR" ""
  ${StrRep} $2 $1 "$INSTDIR;" ""
  StrCmp $2 "$INSTDIR" 0 +2
    StrCpy $2 ""
  WriteRegExpandStr HKCU "Environment" "Path" $2
  !insertmacro aivcliBroadcastEnvironment
!macroend
