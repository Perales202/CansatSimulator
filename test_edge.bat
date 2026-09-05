@echo off
set "EDGE_BIN=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_BIN%" (
    set "EDGE_BIN=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

echo [RUNNING] Ejecutando suite de pruebas en Microsoft Edge...
cmd /c ""%EDGE_BIN%" --headless --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///%CD:\=/%/test_suite.html" > edge_results.tmp 2>&1"

findstr /C:"TOTAL TESTS:" edge_results.tmp
findstr /C:"FALLADOS: <span class=\"test-fail\">0</span>" edge_results.tmp >nul
if %errorlevel% equ 0 (
    echo [EXITO] Todos los tests pasaron satisfactoriamente en Microsoft Edge.
    if exist edge_results.tmp del edge_results.tmp
    exit /b 0
) else (
    echo [ERROR] Se detectaron fallos en la suite de pruebas de Microsoft Edge.
    if exist edge_results.tmp (
        type edge_results.tmp | findstr /C:"[FAIL]"
        del edge_results.tmp
    )
    exit /b 1
)
