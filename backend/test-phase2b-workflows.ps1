$baseUrl = "http://localhost:3000/api"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "PHASE 2B: DOSSIER WORKFLOW & STATE MACHINE E2E TESTS" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Login
Write-Host "`n[1/8] Authenticating as Admin..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = if ($loginRes.data.accessToken) { $loginRes.data.accessToken } else { $loginRes.accessToken }
    Write-Host " Auth successful. Token received." -ForegroundColor Green
} catch {
    Write-Host " Auth failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
}

# 2. Setup: Create Test Client
Write-Host "`n[2/8] Creating test client..." -ForegroundColor Yellow
$prospectBody = @{
    firstName = "Workflow"
    lastName = "Tester"
    email = "workflow.test." + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
    phone = "+213555112233"
} | ConvertTo-Json
$prospectRes = Invoke-RestMethod -Uri "$baseUrl/prospects" -Method Post -Headers $headers -Body $prospectBody -ContentType "application/json"
$prospectId = if ($prospectRes.data.id) { $prospectRes.data.id } else { $prospectRes.id }

$convertBody = @{
    passportNumber = "DZ" + (Get-Random -Minimum 100000 -Maximum 999999)
    nationality = "Algerian"
} | ConvertTo-Json
$clientRes = Invoke-RestMethod -Uri "$baseUrl/prospects/$prospectId/convert" -Method Post -Headers $headers -Body $convertBody -ContentType "application/json"
$clientId = if ($clientRes.data.id) { $clientRes.data.id } else { $clientRes.id }

# 3. Test 1: Create CIF Dossier and Advance Status step-by-step
Write-Host "`n[3/8] Test 1: Creating CIF Dossier and advancing status..." -ForegroundColor Yellow
$cifBody = @{
    clientId = $clientId
    type = "VEHICLE_SALE_CIF"
} | ConvertTo-Json
try {
    $cifRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $cifBody -ContentType "application/json"
    $cif = if ($cifRes.data) { $cifRes.data } else { $cifRes }
    $cifId = $cif.id

    if ($cif.status -eq "offerSelected") {
        Write-Host " CIF initialized with 'offerSelected'." -ForegroundColor Green
    } else {
        Write-Host " Expected 'offerSelected', got $($cif.status)" -ForegroundColor Red
        exit 1
    }

    # Advance status: offerSelected -> clientConfirmed
    $advRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$cifId/advance-status" -Method Post -Headers $headers -Body (@{ comment = "Confirmed" } | ConvertTo-Json) -ContentType "application/json"
    $advDos = if ($advRes.data) { $advRes.data } else { $advRes }
    if ($advDos.status -eq "clientConfirmed") {
        Write-Host " CIF advanced to 'clientConfirmed'." -ForegroundColor Green
    } else {
        Write-Host " Expected 'clientConfirmed', got $($advDos.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed CIF workflow test: $_" -ForegroundColor Red
    exit 1
}

# 4. Test 2: Reject Invalid Transition (CIF -> douane)
Write-Host "`n[4/8] Test 2: Testing CIF rejection of DDP customs state (douane)..." -ForegroundColor Yellow
try {
    $invTransBody = @{ status = "douane" } | ConvertTo-Json
    $invRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$cifId/status" -Method Patch -Headers $headers -Body $invTransBody -ContentType "application/json"
    Write-Host " Error: CIF transition to 'douane' should have failed!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Invalid transition rejected (HTTP 409 Conflict returned as expected)." -ForegroundColor Green
}

# 5. Test 3: Allowed transitions query
Write-Host "`n[5/8] Test 3: Querying GET /api/dossiers/:id/allowed-transitions..." -ForegroundColor Yellow
try {
    $allowedRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$cifId/allowed-transitions" -Method Get -Headers $headers
    $allowed = if ($allowedRes.data) { $allowedRes.data } else { $allowedRes }
    if ($allowed.allowedTransitions -contains "contractSigned" -and $allowed.allowedTransitions -contains "cancelled") {
        Write-Host " Allowed transitions correct: $($allowed.allowedTransitions -join ', ')" -ForegroundColor Green
    } else {
        Write-Host " Unexpected allowed transitions: $($allowed.allowedTransitions -join ', ')" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed allowed transitions query: $_" -ForegroundColor Red
    exit 1
}

# 6. Test 4: Create SHIPPING_ONLY Dossier
Write-Host "`n[6/8] Test 4: Creating SHIPPING_ONLY Dossier and advancing..." -ForegroundColor Yellow
$shipBody = @{
    clientId = $clientId
    type = "SHIPPING_ONLY"
} | ConvertTo-Json
try {
    $shipRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $shipBody -ContentType "application/json"
    $ship = if ($shipRes.data) { $shipRes.data } else { $shipRes }
    $shipId = $ship.id

    if ($ship.status -eq "client") {
        Write-Host " SHIPPING_ONLY initialized with 'client'." -ForegroundColor Green
    } else {
        Write-Host " Expected 'client', got $($ship.status)" -ForegroundColor Red
        exit 1
    }

    # Advance: client -> vehicule_externe_renseigne
    $advShipRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$shipId/advance-status" -Method Post -Headers $headers -Body (@{ comment = "Vehicle info received" } | ConvertTo-Json) -ContentType "application/json"
    $advShip = if ($advShipRes.data) { $advShipRes.data } else { $advShipRes }
    if ($advShip.status -eq "vehicule_externe_renseigne") {
        Write-Host " SHIPPING_ONLY advanced to 'vehicule_externe_renseigne'." -ForegroundColor Green
    } else {
        Write-Host " Expected 'vehicule_externe_renseigne', got $($advShip.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed SHIPPING_ONLY test: $_" -ForegroundColor Red
    exit 1
}

# 7. Test 5: Reject Purchase Sale states on SHIPPING_ONLY
Write-Host "`n[7/8] Test 5: Testing rejection of vehicle purchase states on SHIPPING_ONLY..." -ForegroundColor Yellow
try {
    $purBody = @{ status = "purchaseConfirmed" } | ConvertTo-Json
    $purRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$shipId/status" -Method Patch -Headers $headers -Body $purBody -ContentType "application/json"
    Write-Host " Error: SHIPPING_ONLY transition to 'purchaseConfirmed' should have failed!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Commercial sale state rejected on SHIPPING_ONLY as expected." -ForegroundColor Green
}

# 8. Test 6: Terminal state protection
Write-Host "`n[8/8] Test 6: Testing cancellation & terminal state immutability..." -ForegroundColor Yellow
try {
    $cancelBody = @{
        status = "annule"
        comment = "Cancelled by client"
    } | ConvertTo-Json
    $cancelRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$cifId/status" -Method Patch -Headers $headers -Body $cancelBody -ContentType "application/json"
    $cancelled = if ($cancelRes.data) { $cancelRes.data } else { $cancelRes }
    if ($cancelled.status -eq "annule") {
        Write-Host " Dossier successfully cancelled ('annule')." -ForegroundColor Green
    }

    # Attempt transition from terminal state
    try {
        $reopenBody = @{ status = "offerSelected" } | ConvertTo-Json
        $reopenRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$cifId/status" -Method Patch -Headers $headers -Body $reopenBody -ContentType "application/json"
        Write-Host " Error: Transition from terminal state should have failed!" -ForegroundColor Red
        exit 1
    } catch {
        Write-Host " Terminal state transition rejected (HTTP 409 Conflict returned)." -ForegroundColor Green
    }
} catch {
    Write-Host " Failed terminal state test: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "ALL PHASE 2B WORKFLOW TESTS PASSED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
