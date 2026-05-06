param(
  [int]$Port = 4173
)

$root = (Resolve-Path "$PSScriptRoot\..").Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()
Write-Output "Miga POS PWA disponible en http://127.0.0.1:$Port/"
Write-Output "Presione Ctrl+C para detener."

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
}

function Send-Response($client, [int]$status, [string]$contentType, [byte[]]$body) {
  $stream = $client.GetStream()
  $reason = if ($status -eq 200) { "OK" } else { "Not Found" }
  $headers = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  $stream.Write($body, 0, $body.Length)
  $stream.Close()
  $client.Close()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) {
      $client.Close()
      continue
    }

    $parts = $requestLine.Split(" ")
    $path = [Uri]::UnescapeDataString($parts[1].Split("?")[0].TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($path)) {
      $path = "index.html"
    }

    $fullPath = Join-Path $root $path
    $resolved = $null
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
      $resolved = (Resolve-Path -LiteralPath $fullPath).Path
    }

    if ($resolved -and $resolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $bytes = [System.IO.File]::ReadAllBytes($resolved)
      $ext = [System.IO.Path]::GetExtension($resolved)
      $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
      Send-Response $client 200 $contentType $bytes
    } else {
      Send-Response $client 404 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("No encontrado"))
    }
  } catch {
    $client.Close()
  }
}
