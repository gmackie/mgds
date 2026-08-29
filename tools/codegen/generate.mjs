import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const definitions = [
  'resource', 'capability', 'manifest', 'procedure', 'job', 'event',
  'policy', 'approval', 'lease', 'budget', 'task', 'run', 'artifact', 'evidence', 'result', 'conformance',
];

const schemas = await Promise.all(definitions.map(async (name) => ({
  name,
  schema: JSON.parse(await readFile(`schemas/v0/${name}.schema.json`, 'utf8')),
})));

const pascal = (value) => value.split(/[-_.]/).map((part) => part[0].toUpperCase() + part.slice(1)).join('');

function tsType(schema = {}) {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.$ref) return `Mgds${pascal(path.basename(schema.$ref, '.schema.json'))}`;
  if (schema.type === 'string') return 'string';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') return `Array<${tsType(schema.items)}>`;
  if (schema.type === 'object' && schema.properties) {
    const required = new Set(schema.required ?? []);
    return `{ ${Object.entries(schema.properties).map(([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${tsType(value)}`).join('; ')} }`;
  }
  return 'Record<string, unknown>';
}

function pythonType(schema = {}) {
  if (schema.const !== undefined) return typeof schema.const === 'number' ? 'int' : typeof schema.const === 'boolean' ? 'bool' : 'str';
  if (schema.enum) return 'str';
  if (schema.$ref) return 'dict[str, object]';
  if (schema.type === 'string') return 'str';
  if (schema.type === 'integer') return 'int';
  if (schema.type === 'number') return 'float';
  if (schema.type === 'boolean') return 'bool';
  if (schema.type === 'array') return `list[${pythonType(schema.items)}]`;
  return 'dict[str, object]';
}

function csharpType(schema = {}) {
  if (schema.const !== undefined) return typeof schema.const === 'number' ? 'long' : typeof schema.const === 'boolean' ? 'bool' : 'string';
  if (schema.$ref) return `Mgds${pascal(path.basename(schema.$ref, '.schema.json'))}`;
  if (schema.type === 'integer') return 'long';
  if (schema.type === 'number') return 'double';
  if (schema.type === 'boolean') return 'bool';
  if (schema.type === 'array') return `List<${csharpType(schema.items)}>`;
  if (schema.type === 'object') return 'Dictionary<string, object>';
  return 'string';
}

function tsSource() {
  const chunks = ['// Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.'];
  for (const { name, schema } of schemas) {
    const required = new Set(schema.required ?? []);
    chunks.push('', `export interface Mgds${pascal(name)} {`);
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      chunks.push(`  ${key}${required.has(key) ? '' : '?'}: ${tsType(value)};`);
    }
    chunks.push('}');
  }
  return `${chunks.join('\n')}\n`;
}

function pythonSource() {
  const chunks = ['# Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.', 'from typing import NotRequired, TypedDict'];
  for (const { name, schema } of schemas) {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {});
    const fields = properties.map(([key, value]) => {
      const type = pythonType(value);
      return `    ${JSON.stringify(key)}: ${required.has(key) ? type : `NotRequired[${type}]`},`;
    });
    chunks.push('', `Mgds${pascal(name)} = TypedDict(`, `    "Mgds${pascal(name)}",`, '    {', ...fields, '    },', ')');
  }
  return `${chunks.join('\n')}\n`;
}

function csharpSource() {
  const keywords = new Set(['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'from', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'record', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'var', 'virtual', 'void', 'volatile', 'while']);
  const chunks = [
    '// Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.',
    'using System;',
    'using System.Collections.Generic;',
    '',
    'namespace Mgds.Protocol.Generated',
    '{',
  ];
  for (const { name, schema } of schemas) {
    chunks.push('    [Serializable]', `    public sealed class Mgds${pascal(name)}`, '    {');
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      const type = csharpType(value);
      const initial = type === 'string' ? ' = string.Empty;' : type.startsWith('List<') || type.startsWith('Dictionary<') ? ' = new();' : ';';
      const identifier = keywords.has(key) ? `@${key}` : key;
      chunks.push(`        public ${type} ${identifier}${initial}`);
    }
    chunks.push('    }', '');
  }
  chunks.push('}', '');
  return chunks.join('\n');
}

const outputs = new Map([
  ['packages/protocol-ts/src/generated.ts', tsSource()],
  ['packages/protocol-py/mgds_protocol/generated.py', pythonSource()],
  ['Packages/org.mgds.unity.core/Runtime/Generated/MgdsProtocol.g.cs', csharpSource()],
]);

let stale = false;
for (const [target, content] of outputs) {
  if (process.argv.includes('--check')) {
    const actual = await readFile(target, 'utf8').catch(() => '');
    if (actual !== content) {
      console.error(`generated file is stale: ${target}`);
      stale = true;
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    console.log(`generated ${target}`);
  }
}
if (stale) process.exitCode = 1;
