!include "WinMessages.nsh"
!include "LogicLib.nsh"

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
  ; Simple string removal - find and remove $INSTDIR from PATH
  StrLen $3 "$INSTDIR"
  StrCpy $4 0
  StrCpy $5 ""
  ${DoWhile} $4 < $0
    StrCpy $6 $0 $3 $4
    ${If} $6 == "$INSTDIR"
      ; Skip this occurrence
      IntOp $4 $4 + $3
      ; Also skip trailing semicolon if present
      StrCpy $7 $0 1 $4
      ${If} $7 == ";"
        IntOp $4 $4 + 1
      ${EndIf}
    ${Else}
      StrCpy $7 $0 1 $4
      ${If} $5 == ""
        StrCpy $5 $7
      ${Else}
        StrCpy $5 "$5$7"
      ${EndIf}
      IntOp $4 $4 + 1
    ${EndIf}
  ${Loop}
  WriteRegExpandStr HKCU "Environment" "Path" $5
  !insertmacro aivcliBroadcastEnvironment
!macroend
