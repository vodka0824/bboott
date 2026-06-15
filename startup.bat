@echo off
cd /d "C:\Users\USER\.gemini\antigravity\scratch\lineBot"

taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul

start /B node server.js >> logs\LineBot.log 2>&1

ping 127.0.0.1 -n 4 > nul

start /B node ngrok-runner.js >> logs\Tunnel.log 2>&1
