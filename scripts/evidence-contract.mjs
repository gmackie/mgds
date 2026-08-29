const PROHIBITED_KEY = /(?:transcript|email|username|rawPath|secret|credential|token)/i;
const PROHIBITED_VALUE = /(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

export function assertPublishable(value) {
  const visit = (current, path) => {
    if (typeof current === 'string' && PROHIBITED_VALUE.test(current)) {
      throw new Error(`MGDS_PRIVACY_REJECTED:${path}`);
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (current && typeof current === 'object') {
      for (const [key, item] of Object.entries(current)) {
        if (PROHIBITED_KEY.test(key)) throw new Error(`MGDS_PRIVACY_REJECTED:${path}.${key}`);
        visit(item, `${path}.${key}`);
      }
    }
  };
  visit(value, '$');
  return true;
}
