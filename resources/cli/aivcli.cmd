@echo off
set "AIVPLAYER_EXE=%~dp0AIVPlayer.exe"
if not exist "%AIVPLAYER_EXE%" (
  echo AIVPlayer.exe was not found next to aivcli.cmd 1>&2
  exit /b 127
)
"%AIVPLAYER_EXE%" --cli %*
exit /b %ERRORLEVEL%
