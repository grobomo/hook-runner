# T392: Monitor cmd.exe spawns that steal focus
# Runs continuously, logs every new cmd.exe with parent chain
# Usage: powershell -ExecutionPolicy Bypass -File scripts/monitor-cmd-popups.ps1
# Press Ctrl+C to stop

$logFile = "$env:USERPROFILE\.system-monitor\cmd-popup-monitor.log"
$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

Write-Host "Monitoring cmd.exe spawns... (Ctrl+C to stop)"
Write-Host "Log: $logFile"

$known = @{}

while ($true) {
    $procs = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($known.ContainsKey($p.ProcessId)) { continue }
        $known[$p.ProcessId] = $true

        $parentName = ""
        try {
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
            $parentName = if ($parent) { $parent.Name } else { "unknown" }
        } catch { $parentName = "error" }

        $cmdLine = if ($p.CommandLine) { $p.CommandLine } else { "(no cmdline)" }
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
        $entry = "$ts PID=$($p.ProcessId) PPID=$($p.ParentProcessId) parent=$parentName cmd=$cmdLine"

        Add-Content -Path $logFile -Value $entry
        if ($cmdLine -match "taskkill|findstr|tasklist") {
            Write-Host "[$ts] POPUP CANDIDATE: $parentName -> $cmdLine" -ForegroundColor Red
        } else {
            Write-Host "[$ts] cmd.exe: $parentName -> $($cmdLine.Substring(0, [Math]::Min(120, $cmdLine.Length)))" -ForegroundColor Gray
        }
    }

    if ($known.Count -gt 500) {
        $active = @{}
        $procs | ForEach-Object { $active[$_.ProcessId] = $true }
        $toRemove = $known.Keys | Where-Object { -not $active.ContainsKey($_) }
        foreach ($k in $toRemove) { $known.Remove($k) }
    }

    Start-Sleep -Milliseconds 200
}
