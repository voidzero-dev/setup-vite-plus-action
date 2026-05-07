import { info, warning, addPath } from "@actions/core";
import { exec } from "@actions/exec";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Inputs } from "./types.js";
import { DISPLAY_NAME } from "./types.js";
import { getVitePlusHome } from "./utils.js";

const INSTALL_URL_SH = "https://viteplus.dev/install.sh";
const INSTALL_URL_PS1 = "https://viteplus.dev/install.ps1";
const INSTALL_MAX_ATTEMPTS = 3;
const INSTALL_RETRY_DELAY_MS = 2000;

export async function installVitePlus(inputs: Inputs): Promise<void> {
  const { version } = inputs;

  info(`Installing ${DISPLAY_NAME}@${version}...`);

  // TODO: Remove VITE_PLUS_VERSION once vite-plus versions before the VP_* env var
  // rename (see https://github.com/voidzero-dev/vite-plus/pull/1166) are no longer supported.
  const env = {
    ...process.env,
    VP_VERSION: version,
    VITE_PLUS_VERSION: version,
  } as { [key: string]: string };

  let failureReason = "";
  for (let attempt = 1; attempt <= INSTALL_MAX_ATTEMPTS; attempt++) {
    try {
      const exitCode = await runInstallCommand(env);
      if (exitCode === 0) {
        ensureVitePlusBinInPath();
        return;
      }
      failureReason = `exit code ${exitCode}`;
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
    }

    if (attempt < INSTALL_MAX_ATTEMPTS) {
      const delay = INSTALL_RETRY_DELAY_MS * attempt;
      warning(
        `Failed to install ${DISPLAY_NAME} (${failureReason}). Retrying in ${delay}ms... (attempt ${attempt + 1}/${INSTALL_MAX_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `Failed to install ${DISPLAY_NAME} after ${INSTALL_MAX_ATTEMPTS} attempts: ${failureReason}`,
  );
}

async function runInstallCommand(env: { [key: string]: string }): Promise<number> {
  const options = { env, ignoreReturnCode: true };
  if (process.platform === "win32") {
    return exec("pwsh", ["-NoProfile", "-Command", buildWindowsInstallCommand()], options);
  }
  return exec("bash", ["-c", `curl -fsSL ${INSTALL_URL_SH} | bash`], options);
}

// Diagnostic wrapper around install.ps1: prints stage markers and a 30s
// heartbeat that snapshots the descendant process tree, so a hang inside the
// upstream installer (e.g. pnpm install during `vp install`) shows up in CI
// logs instead of timing out silently.
function buildWindowsInstallCommand(): string {
  return `
$ErrorActionPreference = 'Stop'
function Write-Stage($m) {
  Write-Host "[stage $((Get-Date).ToUniversalTime().ToString('o'))] $m"
}

Write-Stage "VP_VERSION=$env:VP_VERSION"
Write-Stage "fetching ${INSTALL_URL_PS1}"
$installScript = Invoke-RestMethod -Uri '${INSTALL_URL_PS1}'
Write-Stage "fetched install.ps1 ($($installScript.Length) chars)"

$selfPid = $PID
$heartbeat = Start-ThreadJob -StreamingHost $Host -ScriptBlock {
  param($parentPid)
  function Get-Descendants($rootPid) {
    $all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine
    $byParent = @{}
    foreach ($p in $all) {
      $key = [int]$p.ParentProcessId
      if (-not $byParent.ContainsKey($key)) { $byParent[$key] = @() }
      $byParent[$key] += $p
    }
    $out = @()
    $stack = New-Object System.Collections.Stack
    $stack.Push([int]$rootPid)
    while ($stack.Count -gt 0) {
      $p = $stack.Pop()
      if ($byParent.ContainsKey($p)) {
        foreach ($child in $byParent[$p]) {
          $out += $child
          $stack.Push([int]$child.ProcessId)
        }
      }
    }
    return $out
  }
  while ($true) {
    Start-Sleep -Seconds 30
    $ts = (Get-Date).ToUniversalTime().ToString('o')
    try {
      $descendants = Get-Descendants -rootPid $parentPid
      Write-Host "[heartbeat $ts] $($descendants.Count) descendants of pid=$parentPid"
      foreach ($d in $descendants) {
        Write-Host ("  pid={0} ppid={1} {2} :: {3}" -f $d.ProcessId, $d.ParentProcessId, $d.Name, $d.CommandLine)
      }
    } catch {
      Write-Host "[heartbeat $ts] error: $_"
    }
  }
} -ArgumentList $selfPid

Write-Stage "executing install.ps1"
$startTs = Get-Date
$exitCode = 0
try {
  & ([scriptblock]::Create($installScript))
  $exitCode = $LASTEXITCODE
} catch {
  Write-Stage "install.ps1 threw: $_"
  $exitCode = 1
} finally {
  $heartbeat | Stop-Job -ErrorAction SilentlyContinue | Out-Null
  $heartbeat | Remove-Job -Force -ErrorAction SilentlyContinue | Out-Null
  $elapsed = ((Get-Date) - $startTs).TotalSeconds
  Write-Stage "install.ps1 finished after $elapsed s with exit=$exitCode"
}
exit $exitCode
`.trim();
}

function ensureVitePlusBinInPath(): void {
  const binDir = join(getVitePlusHome(), "bin");
  if (!process.env.PATH?.includes(binDir)) {
    addPath(binDir);
  }
}
