@echo off
cd /d "C:\Users\USER\.gemini\antigravity\scratch\lineBot"
taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul
taskkill /F /IM ngrok.exe 2>nul
taskkill /F /IM ssh.exe 2>nul
node startup.js
