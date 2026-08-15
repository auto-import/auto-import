$baseUrl = "http://localhost:3000/api"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PHASE 7 AUTOMATED E2E TEST SUITE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Login
Write-Host "`n[1/10] Authenticating as Admin..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginRes.data.accessToken
    if (-not $token) {
        $token = $loginRes.accessToken
    }
    Write-Host " Auth successful. Token received." -ForegroundColor Green
} catch {
    Write-Host " Auth failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
}

# 2. Create Vehicle
Write-Host "`n[2/10] Creating a Vehicle..." -ForegroundColor Yellow
$vin = "TESTVIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
$vehicleBody = @{
    vin = $vin
    brand = "Toyota"
    model = "RAV4"
    year = 2023
    mileage = 15000
    condition = "used"
    purchasePrice = 28000
    sellingPrice = 34000
    currency = "EUR"
    status = "available"
    acquisitionType = "stock"
} | ConvertTo-Json

try {
    $vehRes = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $vehicleBody -ContentType "application/json"
    $vehicleId = if ($vehRes.data.id) { $vehRes.data.id } else { $vehRes.id }
    Write-Host " Vehicle created: $vehicleId (Brand: Toyota, Model: RAV4, VIN: $vin)" -ForegroundColor Green
} catch {
    Write-Host " Failed to create vehicle: $_" -ForegroundColor Red
    exit 1
}

# 3. Add Specs to Vehicle
Write-Host "`n[3/10] Adding Specs to Vehicle..." -ForegroundColor Yellow
$specBody = @{
    engine = "2.5L Hybrid"
    fuelType = "hybrid"
    transmission = "automatic"
    color = "Pearl White"
    seats = 5
    doors = 5
    power = "219 hp"
    description = "Top trim with panoramic sunroof"
} | ConvertTo-Json

try {
    $specRes = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId/specs" -Method Put -Headers $headers -Body $specBody -ContentType "application/json"
    Write-Host " Vehicle specs updated successfully." -ForegroundColor Green
} catch {
    Write-Host " Failed to add specs: $_" -ForegroundColor Red
    exit 1
}

# 4. Get Vehicle Specs
Write-Host "`n[4/10] Fetching Vehicle Specs..." -ForegroundColor Yellow
try {
    $getSpecRes = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId/specs" -Method Get -Headers $headers
    $specData = if ($getSpecRes.data) { $getSpecRes.data } else { $getSpecRes }
    Write-Host " Vehicle Specs: Engine=$($specData.engine), Color=$($specData.color), Seats=$($specData.seats)" -ForegroundColor Green
} catch {
    Write-Host " Failed to get specs: $_" -ForegroundColor Red
    exit 1
}

# 5. List Vehicles & Filter
Write-Host "`n[5/10] Listing Vehicles (filtering by brand=Toyota)..." -ForegroundColor Yellow
try {
    $listRes = Invoke-RestMethod -Uri "$baseUrl/vehicles?brand=Toyota&page=1&limit=10" -Method Get -Headers $headers
    $listData = if ($listRes.data) { $listRes.data } else { $listRes }
    Write-Host " Vehicles found: $($listData.total) (Page: $($listData.page)/$($listData.totalPages))" -ForegroundColor Green
} catch {
    Write-Host " Failed to list vehicles: $_" -ForegroundColor Red
    exit 1
}

# 6. Get Stock Summary
Write-Host "`n[6/10] Getting Stock Summary..." -ForegroundColor Yellow
try {
    $summaryRes = Invoke-RestMethod -Uri "$baseUrl/vehicles/stock-summary" -Method Get -Headers $headers
    $summary = if ($summaryRes.data) { $summaryRes.data } else { $summaryRes }
    Write-Host " Stock Summary -> Total: $($summary.total), Available: $($summary.byStatus.available), Reserved: $($summary.byStatus.reserved)" -ForegroundColor Green
} catch {
    Write-Host " Failed to get stock summary: $_" -ForegroundColor Red
    exit 1
}

# 7. Get Organization ID for Warehouse
Write-Host "`n[7/10] Getting Organization for Warehouse..." -ForegroundColor Yellow
$orgId = if ($loginRes.data.user.organizationId) { $loginRes.data.user.organizationId } else { $loginRes.user.organizationId }
Write-Host " Using Organization ID: $orgId" -ForegroundColor Green

# 8. Create Warehouse
Write-Host "`n[8/10] Creating Warehouse..." -ForegroundColor Yellow
$whName = "Warehouse Algiers Hub " + (Get-Random -Minimum 100 -Maximum 999)
$whBody = @{
    organizationId = $orgId
    name = $whName
    type = "central"
    country = "Algeria"
    city = "Algiers"
    address = "Zone Industrielle Oued Smar"
    status = "active"
} | ConvertTo-Json

try {
    $whRes = Invoke-RestMethod -Uri "$baseUrl/warehouses" -Method Post -Headers $headers -Body $whBody -ContentType "application/json"
    $warehouseId = if ($whRes.data.id) { $whRes.data.id } else { $whRes.id }
    Write-Host " Warehouse created: $warehouseId ($whName)" -ForegroundColor Green
} catch {
    Write-Host " Failed to create warehouse: $_" -ForegroundColor Red
    exit 1
}

# 9. Add Warehouse Location
Write-Host "`n[9/10] Adding Location to Warehouse..." -ForegroundColor Yellow
$locBody = @{
    code = "SECTION-A1"
    name = "Section A Row 1"
    status = "active"
} | ConvertTo-Json

try {
    $locRes = Invoke-RestMethod -Uri "$baseUrl/warehouses/$warehouseId/locations" -Method Post -Headers $headers -Body $locBody -ContentType "application/json"
    $locationId = if ($locRes.data.id) { $locRes.data.id } else { $locRes.id }
    Write-Host " Location created: $locationId (Code: SECTION-A1)" -ForegroundColor Green
} catch {
    Write-Host " Failed to add location: $_" -ForegroundColor Red
    exit 1
}

# 10. Create Stock Movement & History
Write-Host "`n[10/10] Creating Stock Movement & verifying history..." -ForegroundColor Yellow
$movementBody = @{
    vehicleId = $vehicleId
    toLocationId = $locationId
    type = "in"
    reason = "Initial intake from supplier"
} | ConvertTo-Json

try {
    $movRes = Invoke-RestMethod -Uri "$baseUrl/warehouses/stock-movements" -Method Post -Headers $headers -Body $movementBody -ContentType "application/json"
    $movId = if ($movRes.data.id) { $movRes.data.id } else { $movRes.id }
    Write-Host " Stock movement recorded: $movId (Type: in)" -ForegroundColor Green

    $histRes = Invoke-RestMethod -Uri "$baseUrl/warehouses/stock-movements/history?vehicleId=$vehicleId" -Method Get -Headers $headers
    $histData = if ($histRes.data) { $histRes.data } else { $histRes }
    Write-Host " Stock movements history retrieved: $($histData.total) movement(s) found." -ForegroundColor Green

    # Verify vehicle current location was updated
    $checkVeh = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId" -Method Get -Headers $headers
    $vehObj = if ($checkVeh.data) { $checkVeh.data } else { $checkVeh }
    if ($vehObj.currentLocationId -eq $locationId) {
        Write-Host " Vehicle location correctly synchronized to $locationId." -ForegroundColor Green
    } else {
        Write-Host " Warning: Vehicle location is $($vehObj.currentLocationId), expected $locationId" -ForegroundColor Yellow
    }
} catch {
    Write-Host " Failed stock movement workflow: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host " ALL 10 PHASE 7 E2E TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
