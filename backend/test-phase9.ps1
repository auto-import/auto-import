$baseUrl = "http://localhost:3000/api"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PHASE 9 AUTOMATED E2E TEST SUITE - ORDERS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

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

# Setup: Create Prospect -> Client, 2 Vehicles, Dossier
Write-Host "`n[Setup] Preparing test data (Client, Vehicles, Dossier)..." -ForegroundColor Yellow
$prospectBody = @{
    firstName = "Riyad"
    lastName = "Mahrez"
    email = "riyad." + (Get-Random -Minimum 1000 -Maximum 9999) + "@example.com"
    phone = "+213555987654"
} | ConvertTo-Json
$prospectRes = Invoke-RestMethod -Uri "$baseUrl/prospects" -Method Post -Headers $headers -Body $prospectBody -ContentType "application/json"
$prospectId = if ($prospectRes.data.id) { $prospectRes.data.id } else { $prospectRes.id }

$convertBody = @{
    passportNumber = "DZ" + (Get-Random -Minimum 100000 -Maximum 999999)
    nationality = "Algerian"
} | ConvertTo-Json
$clientRes = Invoke-RestMethod -Uri "$baseUrl/prospects/$prospectId/convert" -Method Post -Headers $headers -Body $convertBody -ContentType "application/json"
$clientId = if ($clientRes.data.id) { $clientRes.data.id } else { $clientRes.id }

$vin1 = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
$vehicleBody1 = @{
    vin = $vin1
    brand = "Porsche"
    model = "911 GT3"
    year = 2024
    sellingPrice = 185000
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$vehRes1 = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $vehicleBody1 -ContentType "application/json"
$vehicleId1 = if ($vehRes1.data.id) { $vehRes1.data.id } else { $vehRes1.id }

$vin2 = "VIN" + (Get-Random -Minimum 100000000 -Maximum 999999999)
$vehicleBody2 = @{
    vin = $vin2
    brand = "BMW"
    model = "M4 Competition"
    year = 2023
    sellingPrice = 85000
    acquisitionType = "stock"
    status = "available"
} | ConvertTo-Json
$vehRes2 = Invoke-RestMethod -Uri "$baseUrl/vehicles" -Method Post -Headers $headers -Body $vehicleBody2 -ContentType "application/json"
$vehicleId2 = if ($vehRes2.data.id) { $vehRes2.data.id } else { $vehRes2.id }

$dossierBody = @{
    clientId = $clientId
    vehicleId = $vehicleId1
    status = "commande"
} | ConvertTo-Json
$dossierRes = Invoke-RestMethod -Uri "$baseUrl/dossiers" -Method Post -Headers $headers -Body $dossierBody -ContentType "application/json"
$dossierId = if ($dossierRes.data.id) { $dossierRes.data.id } else { $dossierRes.id }

Write-Host " Setup complete: Client=$clientId, Vehicle1=$vehicleId1, Vehicle2=$vehicleId2, Dossier=$dossierId" -ForegroundColor Green

# 2. STEP 1: Create an Order
Write-Host "`n[2/8] Creating Order with Vehicle 1..." -ForegroundColor Yellow
$orderBody = @{
    clientId = $clientId
    dossierId = $dossierId
    items = @(
        @{
            vehicleId = $vehicleId1
            unitPrice = 185000
            discount = 5000
        }
    )
    currency = "USD"
} | ConvertTo-Json

try {
    $orderRes = Invoke-RestMethod -Uri "$baseUrl/orders" -Method Post -Headers $headers -Body $orderBody -ContentType "application/json"
    $orderData = if ($orderRes.data) { $orderRes.data } else { $orderRes }
    $orderId = $orderData.id
    $orderNumber = $orderData.orderNumber

    Write-Host " Order created successfully!" -ForegroundColor Green
    Write-Host "   Order ID: $orderId" -ForegroundColor DarkCyan
    Write-Host "   Order Number: $orderNumber" -ForegroundColor DarkCyan
    Write-Host "   Status: $($orderData.status)" -ForegroundColor DarkCyan
    Write-Host "   Subtotal: $($orderData.subtotal), Total: $($orderData.total)" -ForegroundColor DarkCyan

    # Check vehicle 1 status changed to 'reserved'
    $vehCheck = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId1" -Method Get -Headers $headers
    $vData = if ($vehCheck.data) { $vehCheck.data } else { $vehCheck }
    if ($vData.status -eq "reserved") {
        Write-Host " Vehicle 1 status correctly changed to 'reserved'." -ForegroundColor Green
    } else {
        Write-Host " Expected vehicle 1 status 'reserved', got '$($vData.status)'" -ForegroundColor Red
        exit 1
    }

    # Check dossier linked
    $dosCheck = Invoke-RestMethod -Uri "$baseUrl/dossiers/$dossierId" -Method Get -Headers $headers
    $dData = if ($dosCheck.data) { $dosCheck.data } else { $dosCheck }
    if ($dData.orderId -eq $orderId) {
        Write-Host " Dossier $dossierId successfully linked to Order $orderId." -ForegroundColor Green
    } else {
        Write-Host " Expected dossier orderId '$orderId', got '$($dData.orderId)'" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to create order: $_" -ForegroundColor Red
    exit 1
}

# 3. STEP 2: Get all orders
Write-Host "`n[3/8] Fetching paginated orders list (GET /api/orders?page=1&limit=10)..." -ForegroundColor Yellow
try {
    $ordersListRes = Invoke-RestMethod -Uri "$baseUrl/orders?page=1&limit=10" -Method Get -Headers $headers
    $listData = if ($ordersListRes.data) { $ordersListRes.data } else { $ordersListRes }
    Write-Host " Orders list retrieved: Total=$($listData.total), Page=$($listData.page), Items count=$($listData.items.Count)" -ForegroundColor Green
} catch {
    Write-Host " Failed to list orders: $_" -ForegroundColor Red
    exit 1
}

# 4. STEP 3: Get order details
Write-Host "`n[4/8] Fetching order details (GET /api/orders/$orderId)..." -ForegroundColor Yellow
try {
    $getOneRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId" -Method Get -Headers $headers
    $oneData = if ($getOneRes.data) { $getOneRes.data } else { $getOneRes }
    Write-Host " Order retrieved: Number=$($oneData.orderNumber), Client=$($oneData.client.firstName) $($oneData.client.lastName)" -ForegroundColor Green
    Write-Host "   Payment Status: TotalPaid=$($oneData.paymentStatus.totalPaid), Balance=$($oneData.paymentStatus.balance), FullyPaid=$($oneData.paymentStatus.isFullyPaid)" -ForegroundColor DarkCyan
} catch {
    Write-Host " Failed to get order details: $_" -ForegroundColor Red
    exit 1
}

# 5. STEP 4: Test Invalid Status Transition & Valid Status Transition
Write-Host "`n[5/8] Testing status transitions (Invalid & Valid)..." -ForegroundColor Yellow
# Try invalid transition draft -> delivered
$invalidTransition = @{
    status = "delivered"
    comment = "Should fail directly"
} | ConvertTo-Json

try {
    $invRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId/status" -Method Patch -Headers $headers -Body $invalidTransition -ContentType "application/json"
    Write-Host " Invalid transition draft -> delivered was unexpectedly accepted!" -ForegroundColor Red
    exit 1
} catch {
    Write-Host " Invalid transition draft -> delivered correctly rejected (409 ConflictException)." -ForegroundColor Green
}

# Valid transition: draft -> confirmed
$confirmBody = @{
    status = "confirmed"
    comment = "Order confirmed by client"
} | ConvertTo-Json

try {
    $confRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId/status" -Method Patch -Headers $headers -Body $confirmBody -ContentType "application/json"
    $confData = if ($confRes.data) { $confRes.data } else { $confRes }
    if ($confData.status -eq "confirmed") {
        Write-Host " Order status successfully updated to 'confirmed'." -ForegroundColor Green
    } else {
        Write-Host " Expected status 'confirmed', got '$($confData.status)'" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " Failed to update status to confirmed: $_" -ForegroundColor Red
    exit 1
}

# 6. STEP 5: Get order history & reservations
Write-Host "`n[6/8] Fetching order history and reservations..." -ForegroundColor Yellow
try {
    $historyRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId/history" -Method Get -Headers $headers
    $histData = if ($historyRes.data) { $historyRes.data } else { $historyRes }
    Write-Host " History records count: $($histData.Count)" -ForegroundColor Green
    foreach ($h in $histData) {
        Write-Host "   - [$($h.createdAt)] From: '$($h.fromStatus)' -> To: '$($h.toStatus)' (Comment: $($h.comment))" -ForegroundColor DarkCyan
    }

    $reservationsRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId/reservations" -Method Get -Headers $headers
    $resData = if ($reservationsRes.data) { $reservationsRes.data } else { $reservationsRes }
    Write-Host " Active reservations count: $($resData.Count)" -ForegroundColor Green
    foreach ($r in $resData) {
        Write-Host "   - Vehicle: $($r.vehicle.brand) $($r.vehicle.model) (Status: $($r.status))" -ForegroundColor DarkCyan
    }
} catch {
    Write-Host " Failed to fetch history/reservations: $_" -ForegroundColor Red
    exit 1
}

# 7. STEP 6: Advance order to completed & verify vehicle sold + reservation released
Write-Host "`n[7/8] Advancing status to 'completed' through lifecycle..." -ForegroundColor Yellow
$steps = @("processing", "shipped", "delivered", "completed")
foreach ($step in $steps) {
    $stepBody = @{
        status = $step
        comment = "Progressing to $step"
    } | ConvertTo-Json
    $stepRes = Invoke-RestMethod -Uri "$baseUrl/orders/$orderId/status" -Method Patch -Headers $headers -Body $stepBody -ContentType "application/json"
    $sData = if ($stepRes.data) { $stepRes.data } else { $stepRes }
    Write-Host "   -> Advanced to '$($sData.status)'" -ForegroundColor DarkCyan
}

# Verify vehicle 1 status is 'sold'
$vehCheckSold = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId1" -Method Get -Headers $headers
$vSoldData = if ($vehCheckSold.data) { $vehCheckSold.data } else { $vehCheckSold }
if ($vSoldData.status -eq "sold") {
    Write-Host " Vehicle 1 status correctly changed to 'sold' on completion." -ForegroundColor Green
} else {
    Write-Host " Expected vehicle 1 status 'sold', got '$($vSoldData.status)'" -ForegroundColor Red
    exit 1
}

# 8. STEP 7: Test order deletion and reservation release
Write-Host "`n[8/8] Testing Order creation & deletion with Vehicle 2..." -ForegroundColor Yellow
$order2Body = @{
    clientId = $clientId
    items = @(
        @{
            vehicleId = $vehicleId2
            unitPrice = 85000
            discount = 0
        }
    )
    currency = "USD"
} | ConvertTo-Json
$order2Res = Invoke-RestMethod -Uri "$baseUrl/orders" -Method Post -Headers $headers -Body $order2Body -ContentType "application/json"
$order2Data = if ($order2Res.data) { $order2Res.data } else { $order2Res }
$order2Id = $order2Data.id
Write-Host " Created draft Order 2: $order2Id" -ForegroundColor Green

# Vehicle 2 should now be 'reserved'
$veh2Check = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId2" -Method Get -Headers $headers
$v2Data = if ($veh2Check.data) { $veh2Check.data } else { $veh2Check }
if ($v2Data.status -eq "reserved") {
    Write-Host " Vehicle 2 reserved." -ForegroundColor Green
}

# Delete Order 2
$delRes = Invoke-RestMethod -Uri "$baseUrl/orders/$order2Id" -Method Delete -Headers $headers
Write-Host " Deleted Order 2 successfully." -ForegroundColor Green

# Vehicle 2 should now be 'available' again
$veh2CheckAvail = Invoke-RestMethod -Uri "$baseUrl/vehicles/$vehicleId2" -Method Get -Headers $headers
$v2AvailData = if ($veh2CheckAvail.data) { $veh2CheckAvail.data } else { $veh2CheckAvail }
if ($v2AvailData.status -eq "available") {
    Write-Host " Vehicle 2 released back to 'available' status." -ForegroundColor Green
} else {
    Write-Host " Expected vehicle 2 status 'available', got '$($v2AvailData.status)'" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host " ALL PHASE 9 E2E TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
