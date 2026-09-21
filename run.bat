@echo off
title BharatConnect AI - Startup
echo ===================================================
echo Starting BharatConnect AI Server...
echo "Plan with AI. Navigate with locals. Experience India."
echo ===================================================
python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
pause
