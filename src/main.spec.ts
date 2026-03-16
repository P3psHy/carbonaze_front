import { vi } from 'vitest';

describe('main bootstrap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('bootstraps the application with the root app config', async () => {
    const bootstrapApplication = vi.fn(() => Promise.resolve());
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@angular/platform-browser', () => ({
      bootstrapApplication,
    }));

    const { App } = await import('./app/app');
    const { appConfig } = await import('./app/app.config');
    await import('./main');
    await Promise.resolve();

    expect(bootstrapApplication).toHaveBeenCalledWith(App, appConfig);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs bootstrap failures to the console', async () => {
    const bootstrapError = new Error('bootstrap failed');
    const bootstrapApplication = vi.fn(() => Promise.reject(bootstrapError));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@angular/platform-browser', () => ({
      bootstrapApplication,
    }));

    await import('./main');
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(bootstrapError);
  });
});
