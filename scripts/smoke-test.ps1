param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "https://bitecode-agentic-orchestrator-prod.cserenyecztibor.workers.dev",

  [Parameter(Mandatory = $false)]
  [string]$AdminToken = $env:AGENTIC_ADMIN_TOKEN,

  [Parameter(Mandatory = $false)]
  [string]$Actor = "manual-smoke-test"
)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
  param([string]$Message)
  $failures.Add($Message)
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-Pass {
  param([string]$Message)
  Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Assert-StatusCode {
  param(
    [string]$Name,
    [scriptblock]$Request,
    [int]$ExpectedStatusCode
  )

  try {
    & $Request | Out-Null
    if ($ExpectedStatusCode -ge 400) {
      Add-Failure "$Name expected HTTP $ExpectedStatusCode but request succeeded"
      return
    }
    Add-Pass "$Name returned HTTP $ExpectedStatusCode"
  }
  catch {
    $actual = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $actual = [int]$_.Exception.Response.StatusCode
    }

    if ($actual -eq $ExpectedStatusCode) {
      Add-Pass "$Name returned HTTP $ExpectedStatusCode"
    }
    else {
      Add-Failure "$Name expected HTTP $ExpectedStatusCode but got $actual"
    }
  }
}

Write-Host "Running smoke tests against: $BaseUrl" -ForegroundColor Cyan

# 1) Health endpoint
try {
  $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
  if ($health.ok -eq $true -and $health.status -eq "healthy") {
    Add-Pass "GET /health responded with healthy status"
  }
  else {
    Add-Failure "GET /health returned unexpected body: $($health | ConvertTo-Json -Compress)"
  }
}
catch {
  Add-Failure "GET /health request failed: $($_.Exception.Message)"
}

# 2) Admin endpoint without token should be 401
Assert-StatusCode -Name "POST /admin/run-weekly-review without token" -ExpectedStatusCode 401 -Request {
  Invoke-WebRequest -Method Post -Uri "$BaseUrl/admin/run-weekly-review" -ContentType "application/json" -Body "{}" | Out-Null
}

# 3) Admin endpoint with token should be 200
if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  Add-Failure "Admin token missing. Pass -AdminToken or set AGENTIC_ADMIN_TOKEN environment variable."
}
else {
  try {
    $headers = @{
      "x-admin-token" = $AdminToken
      "x-actor" = $Actor
    }

    $authorized = Invoke-RestMethod -Method Post -Uri "$BaseUrl/admin/run-weekly-review" -Headers $headers -ContentType "application/json" -Body "{}"
    if ($authorized.ok -eq $true -and $authorized.status -eq "accepted") {
      Add-Pass "POST /admin/run-weekly-review with token was accepted"
    }
    else {
      Add-Failure "Authorized admin call returned unexpected body: $($authorized | ConvertTo-Json -Compress)"
    }
  }
  catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    Add-Failure "Authorized admin call failed with HTTP $status"
  }
}

# 4) GET admin endpoint should be 405
Assert-StatusCode -Name "GET /admin/run-weekly-review" -ExpectedStatusCode 405 -Request {
  Invoke-WebRequest -Method Get -Uri "$BaseUrl/admin/run-weekly-review" | Out-Null
}

# 5) Unknown endpoint should be 404
Assert-StatusCode -Name "GET /does-not-exist" -ExpectedStatusCode 404 -Request {
  Invoke-WebRequest -Method Get -Uri "$BaseUrl/does-not-exist" | Out-Null
}

Write-Host ""
if ($failures.Count -gt 0) {
  Write-Host "Smoke test completed with $($failures.Count) failure(s)." -ForegroundColor Red
  exit 1
}

Write-Host "Smoke test completed successfully." -ForegroundColor Green
exit 0
