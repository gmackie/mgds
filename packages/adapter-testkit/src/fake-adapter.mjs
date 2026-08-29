export class FakeAdapter {
  manifest() {
    return {
      schemaVersion: '0.1.0',
      adapter: { id: 'org.mgds.fake-adapter', version: '0.1.0-preview.1' },
      capabilities: [
        {
          id: 'mgds.unity.fake.echo@0.1.0',
          risk: 'read',
          effects: ['read'],
          idempotency: 'safe',
        },
      ],
    };
  }

  async execute(capabilityId, input) {
    if (capabilityId !== 'mgds.unity.fake.echo@0.1.0') throw new Error('MGDS_UNSUPPORTED_CAPABILITY');
    return { echoed: structuredClone(input) };
  }
}
