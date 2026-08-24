param(
  [int]$Port = 55433
)

$ErrorActionPreference = 'Stop'
$containerName = "auto-import-prisma-verify-$PID"
$databaseName = 'auto_import_verify'
$shadowDatabaseName = 'auto_import_verify_shadow'
$password = 'foundation_verify_only'
$originalDatabaseUrl = $env:DATABASE_URL
$originalShadowDatabaseUrl = $env:SHADOW_DATABASE_URL

try {
  docker run --rm -d --name $containerName -p "127.0.0.1:${Port}:5432" `
    -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=$databaseName" postgres:15-alpine | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $ready) {
    throw 'Disposable PostgreSQL did not become ready'
  }

  docker exec $containerName createdb -U postgres $shadowDatabaseName
  $env:DATABASE_URL = "postgresql://postgres:${password}@localhost:${Port}/${databaseName}?schema=public"
  $env:SHADOW_DATABASE_URL = "postgresql://postgres:${password}@localhost:${Port}/${shadowDatabaseName}?schema=public"

  npx prisma validate
  if ($LASTEXITCODE -ne 0) { throw 'prisma validate failed' }
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'fresh migration deployment failed' }
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
  if ($LASTEXITCODE -ne 0) { throw 'database/schema drift detected' }
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
}
finally {
  $env:DATABASE_URL = $originalDatabaseUrl
  $env:SHADOW_DATABASE_URL = $originalShadowDatabaseUrl
  docker rm -f $containerName 2>$null | Out-Null
}
