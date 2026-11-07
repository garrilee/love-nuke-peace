@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 热爱核平 正在启动... 关闭此窗口即可停止游戏服务器
start "" http://localhost:8765
python -m http.server 8765
