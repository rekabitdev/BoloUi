param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$resources = Join-Path $repoRoot 'resources'
$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source))

function New-LogoBitmap([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
  } finally {
    $graphics.Dispose()
  }
  return $bitmap
}

function Save-Png([string]$name, [int]$size) {
  $bitmap = New-LogoBitmap $size
  try {
    $bitmap.Save((Join-Path $resources $name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

function Get-PngBytes([int]$size) {
  $bitmap = New-LogoBitmap $size
  $stream = New-Object System.IO.MemoryStream
  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return $stream.ToArray()
  } finally {
    $stream.Dispose()
    $bitmap.Dispose()
  }
}

try {
  Save-Png 'app.png' 1024
  Save-Png 'app_dev.png' 512
  Save-Png 'icon.png' 512
  Save-Png 'boloui_logo_no_border.png' 512

  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  $images = New-Object 'System.Collections.Generic.List[byte[]]'
  foreach ($size in $sizes) {
    $images.Add((Get-PngBytes $size))
  }
  $iconPath = Join-Path $resources 'app.ico'
  $stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)
    $offset = 6 + (16 * $images.Count)
    for ($index = 0; $index -lt $images.Count; $index++) {
      $size = $sizes[$index]
      $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
      $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$images[$index].Length)
      $writer.Write([uint32]$offset)
      $offset += $images[$index].Length
    }
    foreach ($image in $images) { $writer.Write($image) }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output 'Generated BoloUi PNG and multi-resolution Windows icon assets.'
