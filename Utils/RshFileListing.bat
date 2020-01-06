@echo off

set FileDirectory=%~1
pushd "%FileDirectory%"

if "%~2" == "" (
 set FileExt=* 
 ) else (
 set FileExt=%~2 
 )
 
dir /B *.%FileExt% > RshFileList.txt

popd
