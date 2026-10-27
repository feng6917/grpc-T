# grpc-T 扩展打包脚本
# 用法: .\pack.ps1 [版本号]  (默认读取 manifest.json 中的 version)
# 产物: grpc-T-v<版本>.zip (可直接拖入 Edge/Chrome 扩展程序页面安装)
#
# 注意: 不要用 PowerShell 的 Compress-Archive 打包 —— 它生成的 zip 内部
# 路径是反斜杠(static\css\...), 不符合 zip 规范, Edge 解包后资源加载失败;
# 也不要用 tar.exe -a —— 它会带 "./" 前缀条目, Edge 报
# "Could not unzip extension for install"。
# 正确做法: 用 .NET ZipArchive 逐文件写入, 正斜杠路径, 仅文件条目,
# manifest.json 位于 zip 根目录。

param(
    [string]$Version
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
# 注意: 必须指定 UTF8 编码, 否则 PS 5.1 会把无 BOM 的 UTF-8 按 ANSI 读取, 中文会乱码
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Version) {
    $Version = $manifest.version
}
elseif ($manifest.version -ne $Version) {
    # 指定了版本号时同步 manifest.json, 保证包名与扩展版本一致
    $raw = Get-Content $manifestPath -Raw -Encoding UTF8
    $raw = $raw -replace '"version"\s*:\s*"[^"]*"', ('"version": "' + $Version + '"')
    [System.IO.File]::WriteAllText($manifestPath, $raw, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "manifest.json 版本已同步为 $Version"
}

$zipPath = Join-Path $root "grpc-T-v$Version.zip"
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

$fs = [System.IO.File]::Create($zipPath)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    # 排除 .git、所有打包产物 zip 和本脚本
    Get-ChildItem $root -Recurse -File |
        Where-Object {
            $_.FullName -notmatch '\\\.git($|\\)' -and
            $_.Name -notlike 'grpc-T-v*.zip' -and
            $_.Name -ne 'pack.ps1' -and
            $_.Name -ne 'pack.cmd'
        } |
        ForEach-Object {
            $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
        }
}
finally {
    $zip.Dispose()
    $fs.Dispose()
}

# 自检: 确认 manifest.json 在 zip 根目录且条目路径均为正斜杠
$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $bad = @($check.Entries | Where-Object { $_.FullName -like '*\*' -or $_.FullName -like './*' })
    $hasManifest = $check.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
    $count = $check.Entries.Count
}
finally {
    $check.Dispose()
}

if ($bad.Count -gt 0 -or -not $hasManifest) {
    throw "打包自检失败: 反斜杠或 ./* 条目 $($bad.Count) 个, manifest.json 在根目录: $([bool]$hasManifest)"
}

Get-Item $zipPath | Select-Object Name, @{n='Size(KB)';e={[math]::Round($_.Length/1KB,1)}}
Write-Host "OK: $count 个文件, 路径格式校验通过, 可拖入扩展程序页面安装。"
