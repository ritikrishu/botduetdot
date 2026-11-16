export const crashReportingAvailable = false;

export function setCrashReportsEnabled(_enabled: boolean): Promise<void> {
  return Promise.resolve();
}

export const Observe = {
  reportError(_error: unknown): void {},
};
