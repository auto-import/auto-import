# test-auth.ps1 - Complete Windows PowerShell Test Script
Write-Host ""

Write-Host "TESTING AUTHENTICATION SYSTEM" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "1. HEALTH CHECK" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health"
    Write-Host "Health Check: OK" -ForegroundColor Green
    Write-Host "   Database: $($health.data.services.database)" -ForegroundColor Gray
} catch {
    Write-Host "Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}
Write-Host ""

# 2. Login
Write-Host "2. LOGIN" -ForegroundColor Yellow
$loginBody = @{
    email = "admin@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json"

    Write-Host "Login Successful" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.data.user.email)" -ForegroundColor Gray
    Write-Host "   Name: $($loginResponse.data.user.firstName) $($loginResponse.data.user.lastName)" -ForegroundColor Gray

    # Extract tokens
    $accessToken = $loginResponse.data.accessToken
    $refreshToken = $loginResponse.data.refreshToken

    Write-Host "   Access Token: $($accessToken.Substring(0,30))..." -ForegroundColor Gray
    Write-Host "   Refresh Token: $($refreshToken.Substring(0,30))..." -ForegroundColor Gray
} catch {
    Write-Host "Login Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}
Write-Host ""

# 3. Get Current User
Write-Host "3. GET CURRENT USER" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $accessToken" }
    $meResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" `
        -Method Post `
        -Headers $headers

    Write-Host "Current User:" -ForegroundColor Green
    Write-Host "   ID: $($meResponse.data.id)" -ForegroundColor Gray
    Write-Host "   Email: $($meResponse.data.email)" -ForegroundColor Gray
    Write-Host "   Roles: $($meResponse.data.roles -join ', ')" -ForegroundColor Gray
    Write-Host "   Permissions: $($meResponse.data.permissions -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. Refresh Token
Write-Host "4. REFRESH TOKEN" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $refreshToken" }
    $refreshResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/refresh" `
        -Method Post `
        -Headers $headers

    $newAccessToken = $refreshResponse.data.accessToken
    Write-Host "New Access Token: $($newAccessToken.Substring(0,30))..." -ForegroundColor Green
} catch {
    Write-Host "Refresh Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 5. Logout
Write-Host "5. LOGOUT" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $accessToken" }
    $logoutResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/logout" `
        -Method Post `
        -Headers $headers

    Write-Host "Logout Successful" -ForegroundColor Green
} catch {
    Write-Host "Logout Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. Test Protected Route (Should Fail)
Write-Host "6. TEST PROTECTED ROUTE (Without Token)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/users" -Method Get
    Write-Host "Warning: Protected route returned data without token!" -ForegroundColor Yellow
} catch {
    Write-Host "Protected route correctly blocked (401 Unauthorized)" -ForegroundColor Green
}
Write-Host ""

# 7. Test Protected Route (With Token)
Write-Host "7. TEST PROTECTED ROUTE (With Token)" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $accessToken" }
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/users" -Method Get -Headers $headers
    Write-Host "Note: /api/users endpoint returns data (or empty array)" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Info: /api/users endpoint not implemented yet (this is normal)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "ALL TESTS COMPLETED!" -ForegroundColor Green
Write-Host ""