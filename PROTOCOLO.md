# PROTOCOLO DE DESARROLLO Y CAMBIOS (Antigravity AI)

Este documento define el protocolo obligatorio de trabajo para cualquier modificación, corrección o nueva característica en el repositorio **CansatSimulator**.

---

## Flujo de Trabajo Obligatorio (3 Pasos)

Cada vez que el usuario solicite un cambio o ajuste en el código, se debe ejecutar estrictamente la siguiente secuencia:

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  PASO 1: CAMBIO         │ ──> │  PASO 2: TEST CON EDGE  │ ──> │  PASO 3: COMMIT GITHUB  │
│  Implementar el código  │     │  Validar suite en Edge  │     │  Registrar en el repo   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

---

### Paso 1: Hacer el cambio
1. Analizar el requerimiento del usuario y el código existente.
2. Aplicar las modificaciones necesarias en los archivos pertinentes (`js/`, `css/`, `index.html`, etc.).
3. Mantener la arquitectura modular, legibilidad, robustez y estética táctica de la interfaz.
4. Si el cambio afecta a los módulos cubiertos por el banco de pruebas, actualizar o añadir los tests correspondientes en `test_suite.html`.

---

### Paso 2: Hacer un test con Edge de Microsoft
1. Ejecutar la suite de pruebas automatizadas contra el motor real de **Microsoft Edge**.
2. **Método automatizado**:
   - Ejecutar el script `test_edge.bat` en la raíz del proyecto, o bien:
   ```powershell
   cmd /c test_edge.bat
   ```
   *(Internamente ejecuta Microsoft Edge en modo headless con `--virtual-time-budget=2000` sobre `test_suite.html` y valida que no existan tests fallidos).*
3. **Verificación**: Confirmar que los 60+ tests del harness se reporten como `[PASS]` y que `FALLADOS: 0`.
4. Si el cambio involucra comportamiento visual o interactivo complejo en la interfaz principal, abrir o inspeccionar la vista en Edge para verificar renderizado correcto sin excepciones en consola:
   ```powershell
   Start-Process "msedge.exe" "file:///c:/Users/Emmanuel/Downloads/CansatSimulator/index.html"
   ```

---

### Paso 3: Hacer un commit para GitHub
1. Verificar el estado del árbol de trabajo con `git status`.
2. Preparar los cambios con `git add .`.
3. Crear el commit con un mensaje descriptivo en español, siguiendo el formato convencional:
   ```powershell
   & 'C:\Users\Emmanuel\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe' add .
   & 'C:\Users\Emmanuel\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe' commit -m "<tipo>: <descripción clara del cambio>"
   ```
4. Confirmar el hash del commit generado y el estado limpio del working tree.

---

## Configuración de Entorno Local

- **Ruta de Microsoft Edge**:
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (o `C:\Program Files\Microsoft\Edge\Application\msedge.exe`)
- **Ruta del binario Git**:
  `C:\Users\Emmanuel\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe`
- **Suite de Pruebas**:
  `test_suite.html` (ejecutable mediante `test_edge.bat`)
