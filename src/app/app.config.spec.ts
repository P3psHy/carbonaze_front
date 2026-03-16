import { appConfig } from './app.config';

describe('appConfig', () => {
  it('registers the expected root providers', () => {
    expect(appConfig.providers).toHaveLength(3);
    expect(appConfig.providers?.every(Boolean)).toBe(true);
  });
});
