@echo off
rem Daily backup, called by Windows scheduled task "CandiedRuin-Backup".
rem ASCII only on purpose: cmd.exe reads this file as the OEM codepage, so non-ASCII comments break it.
setlocal
set NODE_TLS_REJECT_UNAUTHORIZED=0
set PATH=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;%PATH%
cd /d "C:\Users\44186\Documents\deepseek-harness\default-workspace\bubble-vanguard-app"
if not exist logs mkdir logs
echo [%date% %time%] backup start >> logs\backup.log
node scripts\backup.mjs >> logs\backup.log 2>&1
echo [%date% %time%] backup end (exit %ERRORLEVEL%) >> logs\backup.log
endlocal
