param(
  [Parameter(Mandatory = $true)][string]$ProjectDir,
  [Parameter(Mandatory = $true)][string]$RemoteUrl,
  [Parameter(Mandatory = $true)][string]$Branch
)

$secureToken = Read-Host -Prompt 'Site source token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $env:SITES_GIT_AUTHORIZATION = "Authorization: Bearer $plainToken"
  Set-Location -LiteralPath $ProjectDir
  $gitArgs = @(
    '-c', 'credential.helper=',
    '-c', 'http.extraHeader=',
    '-c', 'http.followRedirects=false',
    "--config-env=http.$RemoteUrl.extraHeader=SITES_GIT_AUTHORIZATION",
    'push', $RemoteUrl, "HEAD:refs/heads/$Branch"
  )
  & git @gitArgs
  if ($LASTEXITCODE -ne 0) { throw "Git push failed with exit code $LASTEXITCODE." }
  Write-Output 'Site source push completed.'
}
finally {
  $env:SITES_GIT_AUTHORIZATION = $null
  $plainToken = $null
  if ($tokenPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
}
