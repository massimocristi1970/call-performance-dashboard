@echo off
echo 🚀 Creating Call Performance Dashboard structure...

REM Create main directory
mkdir "call-performance-dashboard" 2>nul
cd "call-performance-dashboard"

REM Create subdirectories
mkdir "js" 2>nul
mkdir "data" 2>nul
mkdir "assets" 2>nul
mkdir "docs" 2>nul

echo 📁 Directory structure created!

REM Create basic HTML file
echo ^<!DOCTYPE html^> > index.html
echo ^<html lang="en"^> >> index.html
echo ^<head^> >> index.html
echo     ^<meta charset="UTF-8"^> >> index.html
echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^> >> index.html
echo     ^<title^>Call Performance Dashboard^</title^> >> index.html
echo     ^<link rel="stylesheet" href="styles.css"^> >> index.html
echo     ^<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"^>^</script^> >> index.html
echo     ^<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"^>^</script^> >> index.html
echo     ^<script src="https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.11.9/dayjs.min.js"^>^</script^> >> index.html
echo ^</head^> >> index.html
echo ^<body^> >> index.html
echo     ^<h1^>📞 Call Performance Dashboard^</h1^> >> index.html
echo     ^<p^>Dashboard structure created! Copy the complete code from the artifacts.^</p^> >> index.html
echo     ^<script type="module" src="js/main.js"^>^</script^> >> index.html
echo ^</body^> >> index.html
echo ^</html^> >> index.html

REM Create basic CSS file
echo /* Call Performance Dashboard - Basic CSS */ > styles.css
echo /* ⚠️ COPY THE COMPLETE CSS FROM THE ARTIFACTS */ >> styles.css
echo body { font-family: Arial, sans-serif; margin: 20px; } >> styles.css

REM Create basic JS config
echo // Configuration for Call Performance Dashboard > js\config.js
echo // ⚠️ COPY THE COMPLETE CONFIG FROM THE ARTIFACTS >> js\config.js
echo export const CONFIG = { dataSources: {} }; >> js\config.js

REM Create placeholder JS files
echo // ⚠️ COPY THE COMPLETE CODE FROM THE UTILS ARTIFACT > js\utils.js
echo // ⚠️ COPY THE COMPLETE CODE FROM THE DATA-LOADER ARTIFACT > js\data-loader.js
echo // ⚠️ COPY THE COMPLETE CODE FROM THE CHART-MANAGER ARTIFACT > js\chart-manager.js
echo // ⚠️ COPY THE COMPLETE CODE FROM THE RENDERERS ARTIFACT > js\renderers.js
echo // ⚠️ COPY THE COMPLETE CODE FROM THE MAIN ARTIFACT > js\main.js

REM Create sample data
echo date,agent,status,duration > data\inbound_calls.csv
echo 2024-01-15,John Smith,connected,180 >> data\inbound_calls.csv
echo 2024-01-16,Sarah Jones,connected,240 >> data\inbound_calls.csv

echo date,agent,status,duration >> data\outbound_calls.csv
echo 2024-01-15,John Smith,connected,150 >> data\outbound_calls.csv
echo 2024-01-16,Sarah Jones,busy,0 >> data\outbound_calls.csv

echo date,agent,resolved,category > data\first_contact_resolution.csv
echo 2024-01-15,John Smith,yes,Technical >> data\first_contact_resolution.csv
echo 2024-01-16,Sarah Jones,no,Billing >> data\first_contact_resolution.csv

REM Create README
echo # Call Performance Dashboard > README.md
echo. >> README.md
echo Created dashboard structure successfully! >> README.md
echo. >> README.md
echo ⚠️ IMPORTANT: Copy the complete code from each artifact into the corresponding files. >> README.md

echo.
echo ✅ Basic structure created successfully!
echo.
echo 📁 Created:
echo    - call-performance-dashboard\
echo    - js\, data\, assets\, docs\ folders
echo    - Basic HTML, CSS, and JS files
echo.
echo ⚠️ NEXT STEPS:
echo    1. Copy COMPLETE code from artifacts into each file
echo    2. Open index.html in your browser to test
echo    3. Replace sample data with your actual CSV files
echo.
echo 🎉 Your dashboard structure is ready!

pause