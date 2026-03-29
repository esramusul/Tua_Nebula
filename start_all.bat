@echo off
echo Baslatiliyor...

start cmd /k "py run_server.py"
start cmd /k "cd frontend && npm run dev"

echo Sistem Baslatildi. Tarayicidan http://localhost:5173 adresine gidebilirsiniz.
