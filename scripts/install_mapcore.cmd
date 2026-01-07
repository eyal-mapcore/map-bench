@echo off
REM ##########################################################################################
REM ## Install MapCore Web SDK (Windows CMD version)
REM ##########################################################################################

SET VERSION=%1

IF "%VERSION%"=="" (
    echo Usage: %~nx0 ^<version^>
    EXIT /B 1
)

SET JFROG_USERNAME=mapcore

IF "%JFROG_TOKEN%"=="" (
    echo JFROG_TOKEN is not set - please obtain a token from MapCore's JFrog repository and set the JFROG_TOKEN environment variable
    EXIT /B 1
)

REM Create temp folder
mkdir tmp\mapcore-install 2>NUL

REM NPM login to MapCore JFrog
npm login --registry=https://mapcore.jfrog.io/artifactory/api/npm/npm/ --auth-type=web --scope=@mapcore --username=%JFROG_USERNAME% --password=%JFROG_TOKEN%
IF ERRORLEVEL 1 (
    echo npm login failed
    EXIT /B 1
)

REM Install MapCore package into temp prefix
npm install --prefix=tmp\mapcore-install MapCore_32@%VERSION% --registry=https://mapcore.jfrog.io/artifactory/api/npm/npm/
IF ERRORLEVEL 1 (
    echo npm install failed
    EXIT /B 1
)

REM Remove old package files
IF EXIST public\package (
    del /Q public\package\*
) ELSE (
    mkdir public\package
)

REM Move new MapCore files
move /Y tmp\mapcore-install\node_modules\MapCore_32\MapCore* public\package\.

REM Move TypeScript definitions
IF NOT EXIST src\types (
    mkdir src\types
)
move /Y public\package\MapCore.d.ts src\types\MapCore.d.ts

REM Cleanup temp folder
rmdir /S /Q tmp

echo MapCore Web %VERSION% installed successfully
EXIT /B 0