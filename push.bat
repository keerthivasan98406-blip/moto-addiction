@echo off
echo =============================================
echo  Moto Pit - GitHub Push Script
echo =============================================
echo.
set /p TOKEN=Paste your GitHub token here and press Enter: 
git remote set-url origin https://keerthivasan98406-blip:%TOKEN%@github.com/keerthivasan98406-blip/moto-addiction.git
git add .
git commit -m "Moto Pit complete platform with owner portal, POS, GST billing, inventory"
git branch -M main
git push -u origin main --force
echo.
echo =============================================
echo  Done! Check github.com/keerthivasan98406-blip/moto-addiction
echo =============================================
pause
