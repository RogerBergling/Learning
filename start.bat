@echo off
rem OneGate Learning Lab launcher (Windows).
rem Requires Python 3.8+. No pip installs, no Node.
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 start.py %*
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  python start.py %*
  goto :end
)

echo.
echo Python 3 was not found on PATH.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
echo.
pause

:end
endlocal
