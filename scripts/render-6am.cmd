@echo off
REM Entry point for the scheduled 6am render (see: schtasks /query /tn "Shortsmith 6am render").
REM Kept as a .cmd wrapper because schtasks argument quoting mangles long inline commands.
cd /d "%~dp0.."
if not exist "out" mkdir "out"
echo ======== run started %DATE% %TIME% ======== >> "out\render-6am.log"
node "scripts\render-reels.mjs" >> "out\render-6am.log" 2>&1
echo ======== run finished %DATE% %TIME% (exit %ERRORLEVEL%) ======== >> "out\render-6am.log"
