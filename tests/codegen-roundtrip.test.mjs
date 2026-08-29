import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

test('generated protocol sources are deterministic and current', () => {
  const result = run(process.execPath, ['tools/codegen/generate.mjs', '--check']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const path of [
    'packages/protocol-ts/src/generated.ts',
    'packages/protocol-py/mgds_protocol/generated.py',
    'Packages/org.mgds.unity.core/Runtime/Generated/MgdsProtocol.g.cs',
  ]) assert.equal(existsSync(path), true, `missing ${path}`);
});

test('golden artifact JSON round-trips in JavaScript', () => {
  const result = run(process.execPath, ['packages/protocol-ts/test/roundtrip.mjs']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /typescript round-trip: stable/);
});

test('golden artifact JSON round-trips in Python', () => {
  const result = run('uv', ['run', 'python', 'packages/protocol-py/tests/test_roundtrip.py']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /python round-trip: stable/);
});

test('golden artifact JSON round-trips through generated Unity-safe C# fields', () => {
  const dotnet = existsSync('.dotnet/dotnet') ? '.dotnet/dotnet' : 'dotnet';
  const result = run(dotnet, ['run', '--project', 'csharp-tests/Mgds.Protocol.RoundTrip/Mgds.Protocol.RoundTrip.csproj']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /csharp round-trip: stable/);
});
