@echo off
rem 打包包装脚本: 绕过 PowerShell 执行策略限制, 直接调用 pack.ps1
rem 用法: pack.cmd [版本号], 例如 pack.cmd 1.0.1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack.ps1" %*
