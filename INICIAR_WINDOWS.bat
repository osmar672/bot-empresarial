@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo ERROR: instala Node.js 22.16 o superior.&pause&exit /b 1)
if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo Se creo backend\.env. Configura tus datos de MySQL, JWT_SECRET y Groq.
  echo Si usas MySQL instalado en Windows utiliza el puerto real, habitualmente 3306.
  notepad "backend\.env"
  echo Vuelve a ejecutar este archivo despues de configurar las variables.
  pause
  exit /b 0
)
echo Instalando dependencias...
call npm install || (pause&exit /b 1)
echo Diagnosticando MySQL...
call npm run db:doctor || (
  echo.
  echo NO se ejecutaron migraciones. Revisa el diagnostico anterior.
  echo Con Docker Desktop: docker compose up -d db
  echo Con MySQL local: corrige MYSQL_PORT, MYSQL_USER y MYSQL_PASSWORD en backend\.env
  pause
  exit /b 1
)
echo Aplicando migraciones no destructivas a la base configurada...
call npm run db:migrate || (pause&exit /b 1)
echo Iniciando PolicyBot: http://127.0.0.1:5173
echo Pulsa Ctrl+C para detener el servidor.
call npm run dev
pause
