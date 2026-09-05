# Reglas del Asistente (Antigravity AI) - CansatSimulator

Este proyecto cuenta con un protocolo operativo estricto definido en [PROTOCOLO.md](file:///c:/Users/Emmanuel/Downloads/CansatSimulator/PROTOCOLO.md).

## Flujo de Trabajo Obligatorio ante Cada Cambio Solicitado:

Cada vez que el usuario pida un cambio o ajuste en el código, DEBES seguir siempre estos 3 pasos en orden:

1. **Haces el cambio**:
   - Modifica o crea el código requerido preservando la arquitectura, comentarios y estilos.

2. **Haces un test con Edge de Microsoft**:
   - Ejecuta la suite de pruebas automatizadas en Microsoft Edge:
     ```powershell
     cmd /c test_edge.bat
     ```
   - Confirma que todos los tests pasen (`FALLADOS: 0`).

3. **Haces un commit para GitHub**:
   - Utiliza el ejecutable de Git configurado en el sistema:
     ```powershell
     & 'C:\Users\Emmanuel\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe' add .
     & 'C:\Users\Emmanuel\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe' commit -m "<descripción clara del cambio>"
     ```
   - Muestra el hash del commit generado.
