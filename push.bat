@echo off
echo Setting up git and pushing to GitHub...
git remote add origin https://github.com/keerthivasan98406-blip/moto-addiction.git 2>nul
git remote set-url origin https://github.com/keerthivasan98406-blip/moto-addiction.git
git add .
git commit -m "Moto Pit complete platform with owner portal, POS, GST billing, inventory"
git branch -M main
git push -u origin main --force
echo Done!
pause
