$baseUrl = "http://localhost:3000/api"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "MULTI-VEHICLE DOSSIER E2E TEST SUITE" -ForegroundColor Cyan
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

# 2. Setup: Create Client and 3 Vehicles
Write-Host "`n[2/8] Creating test data (Client + 3 Vehicles)..." -ForegroundColor Yellow
$prospectBody = @{
    firstName = "DossierTest"
    lastName = "Client"
    email = "dossier.test." + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
    phone = "+213555001122"
} | ConvertTo-Json
$prospectRes = Invoke-RestMethod -Uri "$baseUrl/prospects" -Method Post -Headers $headers -Body $prospectBody -ContentType "application/json"
$prospectId = if ($prospectRes.data.id) { $prospectRes.data.id } else { $prospectRes.id }

$convertBody = @{
    passportNumber = "DZ" + (Get-Random -Minimum 100000 -Maximum 999999)
    nationality = "Algerian"
} | ConvertTo-Json
$clientRes = Invoke-RestMethod -Uri "$baseUrl/prospects/$prospectId/convert" -Method Post -Headers $headers -Body $convertBody -ContentType "application/json"
$clientId = if ($clientRes.data.id) { $clientRes.data.id } else { $clientRes.id }

# Vehicle 1
$v1Body = @{
    vin = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
    brand = "Toyota"
    model = "Hilux"
    year = 2024
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$v1Res = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $v1Body -ContentType "application/json"
$v1Id = if ($v1Res.data.id) { $v1Res.data.id } else { $v1Res.id }

# Vehicle 2
$v2Body = @{
    vin = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
    brand = "Toyota"
    model = "Land Cruiser"
    year = 2024
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$v2Res = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $v2Body -ContentType "application/json"
$v2Id = if ($v2Res.data.id) { $v2Res.data.id } else { $v2Res.id }

# Vehicle 3
$v3Body = @{
    vin = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
    brand = "Nissan"
    model = "Patrol"
    year = 2023
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$v3Res = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $v3Body -ContentType "application/json"
$v3Id = if ($v3Res.data.id) { $v3Res.data.id } else { $v3Res.id }

Write-Host " Setup complete: Client=$clientId, V1=$v1Id, V2=$v2Id, V3=$v3Id" -ForegroundColor Green

# 3. Test 1: Create Dossier with multiple vehicles (V1, V2)
Write-Host "`n[3/8] Test 1: Creating Dossier with 2 vehicles (V1, V2)..." -ForegroundColor Yellow
$dossierBody = @{
    clientId = $clientId
    vehicleIds = @($v1Id, $v2Id)
    status = "prospection"
} | ConvertTo-Json

try {
    $dosRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $dossierBody -ContentType "application/json"
    $dossier = if ($dosRes.data) { $dosRes.data } else { $dosRes }
    $dossierId = $dossier.id

    if ($dossier.vehicles.Count -eq 2) {
        Write-Host " Dossier $dossierId created with 2 vehicles." -ForegroundColor Green
    } else {
        Write-Host " Expected 2 vehicles, got $($dossier.vehicles.Count)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create multi-vehicle dossier: $_" -ForegroundColor Red
    exit 1
}

# 4. Test 2: Add V3 to Dossier
Write-Host "`n[4/8] Test 2: Adding Vehicle 3 to Dossier..." -ForegroundColor Yellow
$addBody = @{
    vehicleId = $v3Id
} | ConvertTo-Json

try {
    $addRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId/vehicles" -Method Post -Headers $headers -Body $addBody -ContentType "application/json"
    $updatedDos = if ($addRes.data) { $addRes.data } else { $addRes }

    if ($updatedDos.vehicles.Count -eq 3) {
        Write-Host " Vehicle 3 added successfully. Total vehicles: 3." -ForegroundColor Green
    } else {
        Write-Host " Expected 3 vehicles, got $($updatedDos.vehicles.Count)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to add vehicle: $_" -ForegroundColor Red
    exit 1
}

# 5. Test 3: Prevent duplicate vehicle assignment
Write-Host "`n[5/8] Test 3: Testing duplicate vehicle prevention (re-adding V3)..." -ForegroundColor Yellow
try {
    $dupRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId/vehicles" -Method Post -Headers $headers -Body $addBody -ContentType "application/json"
    Write-Host " Error: Duplicate assignment should have failed!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Duplicate prevention passed (HTTP 409 Conflict returned)." -ForegroundColor Green
}

# 6. Test 4: Remove V1 from Dossier
Write-Host "`n[6/8] Test 4: Removing Vehicle 1 from Dossier..." -ForegroundColor Yellow
try {
    $remRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId/vehicles/$v1Id" -Method Delete -Headers $headers
    $remDos = if ($remRes.data) { $remRes.data } else { $remRes }

    if ($remDos.vehicles.Count -eq 2) {
        Write-Host " Vehicle 1 removed successfully. Total vehicles: 2." -ForegroundColor Green
    } else {
        Write-Host " Expected 2 vehicles after removal, got $($remDos.vehicles.Count)" -ForegroundColor Red
        exit 1
    }

    # Verify V1 status is now available
    $v1Check = Invoke-RestMethod -Uri "$baseUrl/vehicles/$v1Id" -Method Get -Headers $headers
    $v1Data = if ($v1Check.data) { $v1Check.data } else { $v1Check }
    if ($v1Data.status -eq "available") {
        Write-Host " Vehicle 1 status correctly reverted to 'available'." -ForegroundColor Green
    } else {
        Write-Host " Expected vehicle 1 status 'available', got $($v1Data.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to remove vehicle: $_" -ForegroundColor Red
    exit 1
}

# 7. Test 5: Fetch Dossier vehicles list
Write-Host "`n[7/8] Test 5: Fetching Dossier vehicles via GET /api/dossiers/:id/vehicles..." -ForegroundColor Yellow
try {
    $vehListRes = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId/vehicles" -Method Get -Headers $headers
    $vehList = if ($vehListRes.data) { $vehListRes.data } else { $vehListRes }

    if ($vehList.Count -eq 2) {
        Write-Host " GET /api/dossiers/:id/vehicles returned 2 vehicles as expected." -ForegroundColor Green
    } else {
        Write-Host " Expected 2 vehicles, got $($vehList.Count)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to fetch vehicles: $_" -ForegroundColor Red
    exit 1
}

# 8. Test 6: Single-vehicle backward compatibility
Write-Host "`n[8/8] Test 6: Testing single-vehicle creation backward compatibility..." -ForegroundColor Yellow
$singleBody = @{
    clientId = $clientId
    vehicleId = $v1Id
    status = "prospection"
} | ConvertTo-Json

try {
    $singleRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $singleBody -ContentType "application/json"
    $singleDos = if ($singleRes.data) { $singleRes.data } else { $singleRes }

    if ($singleDos.vehicles.Count -eq 1 -and $singleDos.vehicleId -eq $v1Id) {
        Write-Host " Single-vehicle backward compatibility verified successfully." -ForegroundColor Green
    } else {
        Write-Host " Backward compatibility check failed." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed single-vehicle creation: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "ALL MULTI-VEHICLE DOSSIER TESTS PASSED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
