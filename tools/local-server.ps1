[CmdletBinding()]
param(
    [string]$RootPath,
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Split-Path -Parent $PSScriptRoot
}

try {
    $resolvedRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RootPath).Path)
} catch {
    Write-Error "Website root does not exist: $RootPath"
    exit 1
}

$separator = [IO.Path]::DirectorySeparatorChar
$rootBoundary = $resolvedRoot.TrimEnd($separator) + $separator
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".mjs"  = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml; charset=utf-8"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
    ".map"  = "application/json; charset=utf-8"
}

function Write-HttpResponse {
    param(
        [Parameter(Mandatory = $true)][IO.Stream]$Stream,
        [Parameter(Mandatory = $true)][int]$StatusCode,
        [Parameter(Mandatory = $true)][string]$ReasonPhrase,
        [byte[]]$Body = [byte[]]@(),
        [string]$ContentType = "text/plain; charset=utf-8",
        [hashtable]$AdditionalHeaders = @{},
        [switch]$HeadersOnly
    )

    $headerLines = @(
        "HTTP/1.1 $StatusCode $ReasonPhrase"
        "Content-Type: $ContentType"
        "Content-Length: $($Body.Length)"
        "Connection: close"
        "X-Content-Type-Options: nosniff"
    )
    foreach ($name in $AdditionalHeaders.Keys) {
        $headerLines += "${name}: $($AdditionalHeaders[$name])"
    }
    $headerBytes = [Text.Encoding]::ASCII.GetBytes(($headerLines -join "`r`n") + "`r`n`r`n")
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadersOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

function Write-TextError {
    param(
        [IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$ReasonPhrase,
        [string]$Message,
        [hashtable]$AdditionalHeaders = @{}
    )
    $body = [Text.Encoding]::UTF8.GetBytes($Message)
    Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -ReasonPhrase $ReasonPhrase `
        -Body $body -AdditionalHeaders $AdditionalHeaders
}

function Get-RequestedFile {
    param([string]$RequestTarget)

    $pathPart = $RequestTarget.Split("?", 2)[0]
    try {
        $decodedPath = [Uri]::UnescapeDataString($pathPart)
    } catch {
        return $null
    }
    if ($decodedPath.IndexOf([char]0) -ge 0 -or $decodedPath.Contains(":")) {
        return $null
    }
    if ($decodedPath -eq "/") {
        $decodedPath = "/index.html"
    }

    $relativePath = $decodedPath.TrimStart([char[]]@('/', '\')).Replace("/", $separator)
    try {
        $candidate = [IO.Path]::GetFullPath((Join-Path -Path $resolvedRoot -ChildPath $relativePath))
    } catch {
        return $null
    }
    if (-not $candidate.StartsWith($rootBoundary, [StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $candidate
}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
$listenerStarted = $false
try {
    try {
        $listener.Start()
        $listenerStarted = $true
    } catch {
        Write-Host "[ERROR] Unable to start local server on port $Port. The port may already be in use." -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }

    $url = "http://localhost:$Port/"
    Write-Host "MVTGO2 local server is running."
    Write-Host "Root: $resolvedRoot"
    Write-Host "URL:  $url"
    Write-Host "Press Ctrl+C to stop."
    if (-not $NoBrowser) {
        Start-Process $url
    }

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $reader = $null
        $stream = $null
        try {
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine) -or $requestLine.Length -gt 8192) {
                Write-TextError -Stream $stream -StatusCode 400 -ReasonPhrase "Bad Request" -Message "Bad Request"
                continue
            }

            $requestParts = $requestLine.Split(" ")
            if ($requestParts.Length -ne 3) {
                Write-TextError -Stream $stream -StatusCode 400 -ReasonPhrase "Bad Request" -Message "Bad Request"
                continue
            }

            $headerSize = 0
            $headerCount = 0
            do {
                $headerLine = $reader.ReadLine()
                if ($null -eq $headerLine) { break }
                $headerSize += $headerLine.Length
                $headerCount++
                if ($headerSize -gt 16384 -or $headerCount -gt 100) {
                    Write-TextError -Stream $stream -StatusCode 431 -ReasonPhrase "Request Header Fields Too Large" -Message "Request headers are too large."
                    $headerLine = $null
                    break
                }
            } while ($headerLine.Length -gt 0)
            if ($null -eq $headerLine) { continue }

            $method = $requestParts[0].ToUpperInvariant()
            if ($method -ne "GET" -and $method -ne "HEAD") {
                Write-TextError -Stream $stream -StatusCode 405 -ReasonPhrase "Method Not Allowed" `
                    -Message "Method Not Allowed" -AdditionalHeaders @{ "Allow" = "GET, HEAD" }
                continue
            }

            $requestedFile = Get-RequestedFile -RequestTarget $requestParts[1]
            if ($null -eq $requestedFile) {
                Write-TextError -Stream $stream -StatusCode 403 -ReasonPhrase "Forbidden" -Message "Forbidden"
                continue
            }
            if (-not [IO.File]::Exists($requestedFile)) {
                Write-TextError -Stream $stream -StatusCode 404 -ReasonPhrase "Not Found" -Message "Not Found"
                continue
            }

            $body = [IO.File]::ReadAllBytes($requestedFile)
            $extension = [IO.Path]::GetExtension($requestedFile).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if ([string]::IsNullOrEmpty($contentType)) {
                $contentType = "application/octet-stream"
            }
            Write-HttpResponse -Stream $stream -StatusCode 200 -ReasonPhrase "OK" -Body $body `
                -ContentType $contentType -HeadersOnly:($method -eq "HEAD")
        } catch {
            if ($null -ne $stream -and $stream.CanWrite) {
                try {
                    Write-TextError -Stream $stream -StatusCode 500 -ReasonPhrase "Internal Server Error" -Message "Internal Server Error"
                } catch {}
            }
        } finally {
            if ($null -ne $reader) { $reader.Dispose() }
            if ($null -ne $stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally {
    if ($listenerStarted) {
        $listener.Stop()
        Write-Host "Local server stopped."
    }
}
