#!/usr/bin/env python3
"""Run a freshly built SP1 guest in the real RISC-V executor, not a prover."""
import hashlib
import json
import platform
import resource
import subprocess
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
runner = root / 'hub/target/release/hub-execute'
elf = root / 'hub/target/elf-compilation/riscv32im-succinct-zkvm-elf/release/hub-auth-program'
if not runner.is_file() or not elf.is_file():
    raise SystemExit('Build hub-auth-program and hub-execute before running this check')
start = time.monotonic()
completed = subprocess.run([str(runner), str(elf)], text=True, capture_output=True, timeout=180)
elapsed = time.monotonic() - start
peak_rss = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * 1024  # Linux KiB
(root / 'bench').mkdir(exist_ok=True)
(root / 'bench/hub-execution.log').write_text(completed.stdout + completed.stderr)
if completed.returncode:
    print(completed.stderr[-4000:])
    raise SystemExit('SP1 execution test failed; no successful execution artifact written')
lines = [line for line in completed.stdout.splitlines() if line.startswith('{"sp1Version":')]
if len(lines) != 1:
    raise SystemExit('Expected one structured SP1 execution result')
record = json.loads(lines[0])
assert record['publicValuesMatch'] is True and record['proofGenerated'] is False
assert record['positiveCases'] == 1 and record['negativeCases'] == 3

def read(path):
    p = Path(path)
    return p.read_text().strip() if p.is_file() else 'unavailable'

record.update({
    'evidence': 'SP1 5.2.4 RISC-V executor run_fast; not a cryptographic proof or EVM gas benchmark',
    'elapsedSecondsAllFourFixtures': round(elapsed, 6),
    'peakChildRssBytes': peak_rss,
    'elfSha256': hashlib.sha256(elf.read_bytes()).hexdigest(),
    'machine': platform.machine(),
    'memoryLimitBytes': read('/sys/fs/cgroup/memory.max'),
    'cpuQuota': read('/sys/fs/cgroup/cpu.max'),
    'hubSavings': 'NOT MEASURED',
    'groth16ProvingTime': 'NOT MEASURED',
})
(root / 'bench/hub-execution-results.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
