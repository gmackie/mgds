function splitIdentifier(identifier) {
  const at = identifier.lastIndexOf('@');
  if (at < 1) return null;
  const version = identifier.slice(at + 1).split('.').map(Number);
  if (version.length !== 3 || version.some((part) => !Number.isInteger(part))) return null;
  return { base: identifier.slice(0, at), version };
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function registryStatus(base, version, registry) {
  return registry.capabilities
    .find((entry) => entry.id === base)
    ?.versions.find((entry) => entry.version === version.join('.'))
    ?.status;
}

export function negotiateCapability(requestedId, advertisedId, registry) {
  const requested = splitIdentifier(requestedId);
  const advertised = splitIdentifier(advertisedId);
  if (!requested || !advertised || requested.base !== advertised.base) return { status: 'unsupported' };
  if (registryStatus(advertised.base, advertised.version, registry) === 'deprecated') return { status: 'deprecated', selected: advertisedId };
  if (compare(requested.version, advertised.version) === 0) return { status: 'exact', selected: advertisedId };
  const compatibleLine = requested.version[0] === advertised.version[0]
    && (requested.version[0] !== 0 || requested.version[1] === advertised.version[1]);
  if (compatibleLine && compare(advertised.version, requested.version) > 0) return { status: 'compatible', selected: advertisedId };
  return { status: 'unsupported' };
}
