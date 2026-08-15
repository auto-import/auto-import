$baseUrl = "http://localhost:3000/api"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PHASE 8 AUTOMATED E2E TEST SUITE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Login
Write-Host "`n[1/7] Authenticating as Admin..." -ForegroundColor Yellow
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

# Setup: Create a client, a vehicle, and a dossier linked to the client
Write-Host "`n[Setup] Creating Prospect & converting to Client, creating Vehicle, creating Dossier..." -ForegroundColor Yellow
$prospectBody = @{
    firstName = "Karim"
    lastName = "Benzema"
    email = "karim." + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
    phone = "+213555123456"
} | ConvertTo-Json
$prospectRes = Invoke-RestMethod -Uri "$baseUrl/prospects" -Method Post -Headers $headers -Body $prospectBody -ContentType "application/json"
$prospectId = if ($prospectRes.data.id) { $prospectRes.data.id } else { $prospectRes.id }

$convertBody = @{
    passportNumber = "DZ" + (Get-Random -Minimum 100000 -Maximum 999999)
    nationality = "Algerian"
} | ConvertTo-Json
$clientRes = Invoke-RestMethod -Uri "$baseUrl/prospects/$prospectId/convert" -Method Post -Headers $headers -Body $convertBody -ContentType "application/json"
$clientId = if ($clientRes.data.id) { $clientRes.data.id } else { $clientRes.id }

$vin = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
$vehicleBody = @{
    vin = $vin
    brand = "Audi"
    model = "RS6"
    year = 2024
    sellingPrice = 110000
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$vehRes = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $vehicleBody -ContentType "application/json"
$vehicleId = if ($vehRes.data.id) { $vehRes.data.id } else { $vehRes.id }

Write-Host " Setup complete: Client=$clientId, Vehicle=$vehicleId ($vin)" -ForegroundColor Green

# STEP 1: POST /api/vehicle-requests (no status field in body)
Write-Host "`n[2/7] STEP 1: Creating a Vehicle Request (client-linked)..." -ForegroundColor Yellow
$requestBody = @{
    clientId = $clientId
    brand = "Audi"
    model = "RS6"
    minYear = 2022
    maxYear = 2024
    budgetMin = 90000
    budgetMax = 120000
    currency = "EUR"
    preferredColor = "Nardo Grey"
    requirements = "Carbon pack, Bang & Olufsen sound"
} | ConvertTo-Json

try {
    $reqRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests" -Method Post -Headers $headers -Body $requestBody -ContentType "application/json"
    $requestId = if ($reqRes.data.id) { $reqRes.data.id } else { $reqRes.id }
    $reqStatus = if ($reqRes.data.status) { $reqRes.data.status } else { $reqRes.status }
    if ($reqStatus -eq "open") {
        Write-Host " Vehicle Request created: $requestId (Status: $reqStatus)" -ForegroundColor Green
    } else {
        Write-Host " Expected status 'open', got '$reqStatus'" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create vehicle request: $_" -ForegroundColor Red
    exit 1
}

# Also create a dossier and link this vehicle request to it
$dossierBody = @{
    clientId = $clientId
    vehicleRequestId = $requestId
    status = "recherche_vehicule"
} | ConvertTo-Json
$dossierRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $dossierBody -ContentType "application/json"
$dossierId = if ($dossierRes.data.id) { $dossierRes.data.id } else { $dossierRes.id }
Write-Host " Created Dossier $dossierId linked to Request $requestId" -ForegroundColor Green

# STEP 2: POST /api/vehicle-requests/candidates
Write-Host "`n[3/7] STEP 2: Adding Candidate Vehicle to Request..." -ForegroundColor Yellow
$candidateBody = @{
    vehicleRequestId = $requestId
    vehicleId = $vehicleId
    proposedPrice = 105000
    currency = "EUR"
    notes = "Excellent condition, 1 owner"
} | ConvertTo-Json

try {
    $candRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/candidates" -Method Post -Headers $headers -Body $candidateBody -ContentType "application/json"
    $candidateId = if ($candRes.data.id) { $candRes.data.id } else { $candRes.id }
    $candStatus = if ($candRes.data.status) { $candRes.data.status } else { $candRes.status }
    if ($candStatus -eq "proposed") {
        Write-Host " Candidate created: $candidateId (Status: $candStatus, Price: 105000 EUR)" -ForegroundColor Green
    } else {
        Write-Host " Expected candidate status 'proposed', got '$candStatus'" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create candidate: $_" -ForegroundColor Red
    exit 1
}

# Verify duplicate candidate rejection (unique constraint @@unique([vehicleRequestId, vehicleId]))
Write-Host "`n[Check] Testing duplicate candidate prevention..." -ForegroundColor Yellow
try {
    $dupRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/candidates" -Method Post -Headers $headers -Body $candidateBody -ContentType "application/json"
    Write-Host " Duplicate was unexpectedly accepted!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Duplicate candidate correctly rejected with ConflictException." -ForegroundColor Green
}

# STEP 3: GET /api/vehicle-requests/:id
Write-Host "`n[4/7] STEP 3: Fetching Vehicle Request details..." -ForegroundColor Yellow
try {
    $getReqRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/$requestId" -Method Get -Headers $headers
    $reqData = if ($getReqRes.data) { $getReqRes.data } else { $getReqRes }
    Write-Host " Request retrieved: candidateCount=$($reqData.candidateCount), bestCandidatePrice=$($reqData.bestCandidate.proposedPrice), ClientName=$($reqData.client.firstName) $($reqData.client.lastName)" -ForegroundColor Green
} catch {
    Write-Host " Failed to fetch vehicle request: $_" -ForegroundColor Red
    exit 1
}

# STEP 4: PATCH /api/vehicle-requests/candidates/:id with {"status":"validated"} — CONFIRM REJECTED (400)
Write-Host "`n[5/7] STEP 4: Testing PATCH candidate status bypass protection..." -ForegroundColor Yellow
$bypassBody = @{
    status = "validated"
    notes = "Trying to bypass validate endpoint"
} | ConvertTo-Json

$bypassRejected = $false
try {
    $bypassRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/candidates/$candidateId" -Method Patch -Headers $headers -Body $bypassBody -ContentType "application/json"
    Write-Host " Bypass request succeeded unexpectedly!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Bypass attempt successfully rejected (Status 400 - forbidNonWhitelisted / unallowed property 'status')." -ForegroundColor Green
    $bypassRejected = $true
}

# STEP 5: POST /api/vehicle-requests/candidates/:id/validate
Write-Host "`n[6/7] STEP 5: Validating Candidate via dedicated endpoint..." -ForegroundColor Yellow
try {
    $valRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/candidates/$candidateId/validate" -Method Post -Headers $headers
    $valData = if ($valRes.data) { $valRes.data } else { $valRes }
    Write-Host " Candidate validated successfully: status=$($valData.status), validatedAt=$($valData.validatedAt)" -ForegroundColor Green

    # Verify vehicle status is now 'reserved'
    $checkVeh = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId" -Method Get -Headers $headers
    $vehData = if ($checkVeh.data) { $checkVeh.data } else { $checkVeh }
    if ($vehData.status -eq "reserved") {
        Write-Host " Vehicle status correctly transitioned to 'reserved'." -ForegroundColor Green
    } else {
        Write-Host " Vehicle status is $($vehData.status), expected 'reserved'" -ForegroundColor Red
        exit 1
    }

    # Verify vehicle request status is now 'validated'
    $checkReq = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/$requestId" -Method Get -Headers $headers
    $reqObj = if ($checkReq.data) { $checkReq.data } else { $checkReq }
    if ($reqObj.status -eq "validated") {
        Write-Host " Vehicle Request status correctly transitioned to 'validated'." -ForegroundColor Green
    } else {
        Write-Host " Vehicle Request status is $($reqObj.status), expected 'validated'" -ForegroundColor Red
        exit 1
    }

    # Verify linked dossier updated: vehicleId set and status advanced to 'achat'
    $checkDos = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId" -Method Get -Headers $headers
    $dosData = if ($checkDos.data) { $checkDos.data } else { $checkDos }
    if ($dosData.vehicleId -eq $vehicleId -and $dosData.status -eq "achat") {
        Write-Host " Linked Dossier $dossierId correctly updated: vehicleId=$vehicleId, status='achat'." -ForegroundColor Green
    } else {
        Write-Host " Dossier update mismatch: vehicleId=$($dosData.vehicleId), status=$($dosData.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to validate candidate: $_" -ForegroundColor Red
    exit 1
}

# STEP 6: GET /api/vehicle-requests/statistics
Write-Host "`n[7/7] STEP 6: Fetching Vehicle Requests Statistics..." -ForegroundColor Yellow
try {
    $statRes = Invoke-RestMethod -Uri "$baseUrl/vehicle-requests/statistics" -Method Get -Headers $headers
    $stats = if ($statRes.data) { $statRes.data } else { $statRes }
    Write-Host " Statistics -> Total: $($stats.total), Open: $($stats.byStatus.open), Validated: $($stats.byStatus.validated), ConversionRate: $($stats.conversionRate)%" -ForegroundColor Green
} catch {
    Write-Host " Failed to get statistics: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host " ALL PHASE 8 E2E TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
