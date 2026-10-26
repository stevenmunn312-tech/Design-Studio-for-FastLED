@echo off
rem Every necessary fbuild compile fixture, one at a time, at low priority.
rem
rem   run-fbuild.cmd                  build them all
rem   run-fbuild.cmd --retry-failed   rebuild only what failed or did not run last time
rem
rem Each finished build prints what it was for, PASS or FAIL, its time and size.
rem The record is artifacts\compile-matrix\<start time>\summary.md (failures at
rem the top, with their logs) and summary.json. To stop, create a file named STOP
rem in that folder: the build in progress finishes first. Never close the window
rem mid-build; a killed compile can leave a broken cache.
cd /d "%~dp0..\.."
python scripts\compile-fixtures\compile-matrix.py --engine fbuild --low-priority %*
echo.
pause
