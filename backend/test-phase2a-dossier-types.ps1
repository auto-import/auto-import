$baseUrl = "http://localhost:3000/api"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "PHASE 2A: DOSSIER BUSINESS TYPES E2E TEST SUITE" -ForegroundColor Cyan
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

# 2. Setup: Create Client
Write-Host "`n[2/8] Creating test client..." -ForegroundColor Yellow
$prospectBody = @{
    firstName = "TypeTest"
    lastName = "Client"
    email = "type.test." + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
    phone = "+213555998877"
} | ConvertTo-Json
$prospectRes = Invoke-RestMethod -Uri "$baseUrl/prospects" -Method Post -Headers $headers -Body $prospectBody -ContentType "application/json"
$prospectId = if ($prospectRes.data.id) { $prospectRes.data.id } else { $prospectRes.id }

$convertBody = @{
    passportNumber = "DZ" + (Get-Random -Minimum 100000 -Maximum 999999)
    nationality = "Algerian"
} | ConvertTo-Json
$clientRes = Invoke-RestMethod -Uri "$baseUrl/prospects/$prospectId/convert" -Method Post -Headers $headers -Body $convertBody -ContentType "application/json"
$clientId = if ($clientRes.data.id) { $clientRes.data.id } else { $clientRes.id }

# 3. Test 1: Create VEHICLE_SALE_CIF Dossier
Write-Host "`n[3/8] Test 1: Creating VEHICLE_SALE_CIF Dossier..." -ForegroundColor Yellow
$cifBody = @{
    clientId = $clientId
    type = "VEHICLE_SALE_CIF"
    status = "prospection"
} | ConvertTo-Json
try {
    $cifRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $cifBody -ContentType "application/json"
    $cifDos = if ($cifRes.data) { $cifRes.data } else { $cifRes }
    if ($cifDos.type -eq "VEHICLE_SALE_CIF") {
        Write-Host " VEHICLE_SALE_CIF created successfully. (ID: $($cifDos.id))" -ForegroundColor Green
    } else {
        Write-Host " Expected type VEHICLE_SALE_CIF, got $($cifDos.type)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create CIF dossier: $_" -ForegroundColor Red
    exit 1
}

# 4. Test 2: Create VEHICLE_SALE_DDP Dossier
Write-Host "`n[4/8] Test 2: Creating VEHICLE_SALE_DDP Dossier..." -ForegroundColor Yellow
$ddpBody = @{
    clientId = $clientId
    type = "VEHICLE_SALE_DDP"
    status = "prospection"
} | ConvertTo-Json
try {
    $ddpRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $ddpBody -ContentType "application/json"
    $ddpDos = if ($ddpRes.data) { $ddpRes.data } else { $ddpRes }
    if ($ddpDos.type -eq "VEHICLE_SALE_DDP") {
        Write-Host " VEHICLE_SALE_DDP created successfully. (ID: $($ddpDos.id))" -ForegroundColor Green
    } else {
        Write-Host " Expected type VEHICLE_SALE_DDP, got $($ddpDos.type)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create DDP dossier: $_" -ForegroundColor Red
    exit 1
}

# 5. Test 3: Create SHIPPING_ONLY Dossier
Write-Host "`n[5/8] Test 3: Creating SHIPPING_ONLY Dossier..." -ForegroundColor Yellow
$shipBody = @{
    clientId = $clientId
    type = "SHIPPING_ONLY"
    status = "prospection"
} | ConvertTo-Json
try {
    $shipRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $shipBody -ContentType "application/json"
    $shipDos = if ($shipRes.data) { $shipRes.data } else { $shipRes }
    if ($shipDos.type -eq "SHIPPING_ONLY") {
        Write-Host " SHIPPING_ONLY created successfully. (ID: $($shipDos.id))" -ForegroundColor Green
    } else {
        Write-Host " Expected type SHIPPING_ONLY, got $($shipDos.type)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create SHIPPING_ONLY dossier: $_" -ForegroundColor Red
    exit 1
}

# 6. Test 4: Reject Invalid Dossier Type
Write-Host "`n[6/8] Test 4: Testing rejection of invalid type (e.g. INVALID_TYPE)..." -ForegroundColor Yellow
$invBody = @{
    clientId = $clientId
    type = "INVALID_TYPE"
    status = "prospection"
} | ConvertTo-Json
try {
    $invRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $invBody -ContentType "application/json"
    Write-Host " Error: Invalid type should have been rejected!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Invalid type rejected successfully (HTTP 400 Bad Request)." -ForegroundColor Green
}

# 7. Test 5: Default type fallback for backward compatibility
Write-Host "`n[7/8] Test 5: Testing default fallback when type is omitted..." -ForegroundColor Yellow
$defBody = @{
    clientId = $clientId
    status = "prospection"
} | ConvertTo-Json
try {
    $defRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $defBody -ContentType "application/json"
    $defDos = if ($defRes.data) { $defRes.data } else { $defRes }
    if ($defDos.type -eq "VEHICLE_SALE_CIF") {
        Write-Host " Default fallback to VEHICLE_SALE_CIF verified." -ForegroundColor Green
    } else {
        Write-Host " Expected default VEHICLE_SALE_CIF, got $($defDos.type)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed default fallback test: $_" -ForegroundColor Red
    exit 1
}

# 8. Test 6: Filter by Type and Statistics
Write-Host "`n[8/8] Test 6: Testing GET /api/dossiers?type=SHIPPING_ONLY and /api/dossiers/statistics..." -ForegroundColor Yellow
try {
    $filterRes = Invoke-RestMethod -Uri "$baseUrl/dossiers?type=SHIPPING_ONLY" -Method Get -Headers $headers
    $filterItems = if ($filterRes.data.items) { $filterRes.data.items } else { $filterRes.items }
    $allAreShipping = $true
    foreach ($item in $filterItems) {
        if ($item.type -ne "SHIPPING_ONLY") {
            $allAreShipping = $false
        }
    }
    if ($allAreShipping -and $filterItems.Count -gt 0) {
        Write-Host " Filtering by type=SHIPPING_ONLY verified successfully ($($filterItems.Count) found)." -ForegroundColor Green
    } else {
        Write-Host " Filtering by type check failed." -ForegroundColor Red
        exit 1
    }

    $statsRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/statistics" -Method Get -Headers $headers
    $stats = if ($statsRes.data) { $statsRes.data } else { $statsRes }
    if ($stats.byType.VEHICLE_SALE_CIF -ne $null -and $stats.byType.SHIPPING_ONLY -ne $null) {
        Write-Host " Statistics byType breakdown verified successfully." -ForegroundColor Green
    } else {
        Write-Host " Statistics byType check failed." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed filter / stats test: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "ALL PHASE 2A DOSSIER TYPE TESTS PASSED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
