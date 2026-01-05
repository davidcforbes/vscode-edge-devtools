$edgeProcesses = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
$codeProcesses = Get-Process -Name "Code" -ErrorAction SilentlyContinue

Write-Host "`n=== EDGE BROWSER PROCESSES ===" -ForegroundColor Cyan
if ($edgeProcesses) {
    $edgeProcesses | Sort-Object WorkingSet -Descending | Select-Object -First 20 Id, @{Name='Memory(MB)';Expression={[math]::Round($_.WorkingSet / 1MB, 2)}}, @{Name='CPU';Expression={$_.CPU}} | Format-Table
    $totalEdgeMem = ($edgeProcesses | Measure-Object WorkingSet -Sum).Sum / 1GB
    Write-Host "Total Edge Memory: $([math]::Round($totalEdgeMem, 2)) GB across $($edgeProcesses.Count) processes" -ForegroundColor Yellow
} else {
    Write-Host "No Edge processes found"
}

Write-Host "`n=== VS CODE PROCESSES ===" -ForegroundColor Cyan
if ($codeProcesses) {
    $codeProcesses | Sort-Object WorkingSet -Descending | Select-Object -First 20 Id, @{Name='Memory(MB)';Expression={[math]::Round($_.WorkingSet / 1MB, 2)}}, @{Name='CPU';Expression={$_.CPU}} | Format-Table
    $totalCodeMem = ($codeProcesses | Measure-Object WorkingSet -Sum).Sum / 1GB
    Write-Host "Total VS Code Memory: $([math]::Round($totalCodeMem, 2)) GB across $($codeProcesses.Count) processes" -ForegroundColor Yellow
} else {
    Write-Host "No VS Code processes found"
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$grandTotal = 0
if ($edgeProcesses) { $grandTotal += ($edgeProcesses | Measure-Object WorkingSet -Sum).Sum }
if ($codeProcesses) { $grandTotal += ($codeProcesses | Measure-Object WorkingSet -Sum).Sum }
Write-Host "Combined Total: $([math]::Round($grandTotal / 1GB, 2)) GB" -ForegroundColor Green
