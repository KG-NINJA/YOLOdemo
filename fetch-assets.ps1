Param()
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$assets = Join-Path $root 'assets'
$models = Join-Path $root 'models\coco-ssd'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
New-Item -ItemType Directory -Force -Path $models | Out-Null

$tfUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.19.0/dist/tf.min.js'
$cssdUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'
$base = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/'

Write-Host 'Downloading TFJS...' -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing -Uri $tfUrl -OutFile (Join-Path $assets 'tf.min.js')
Write-Host 'Downloading coco-ssd UMD...' -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing -Uri $cssdUrl -OutFile (Join-Path $assets 'coco-ssd.min.js')

Write-Host 'Downloading model.json...' -ForegroundColor Cyan
$localModelJson = Join-Path $models 'model.json'
Invoke-WebRequest -UseBasicParsing -Uri ($base + 'model.json') -OutFile $localModelJson

Write-Host 'Downloading model shards...' -ForegroundColor Cyan
$json = Get-Content -Raw $localModelJson | ConvertFrom-Json
foreach ($man in $json.weightsManifest) {
  foreach ($p in $man.paths) {
    $url = $base + $p
    $dest = Join-Path $models $p
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest
  }
}

Write-Host 'Done. Assets are ready for offline use.' -ForegroundColor Green

