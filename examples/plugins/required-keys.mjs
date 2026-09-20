/** Trusted local plugin, loaded only through --plugin ./examples/plugins/required-keys.mjs. */
export default {
  name: 'required-keys',
  version: '1.0.0',
  assert({ response, options }) {
    const keys = Array.isArray(options.keys) ? options.keys : [];
    const value = JSON.parse(response.body);
    const missing = keys.filter(key => value === null || typeof value !== 'object' || !Object.hasOwn(value, key));
    return {
      name: 'Required JSON keys',
      passed: missing.length === 0,
      message: missing.length ? `Missing keys: ${missing.join(', ')}` : `Found all ${keys.length} required keys`,
    };
  },
};
