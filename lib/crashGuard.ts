type Handler = (error: Error, isFatal: boolean) => void;

const listeners: Handler[] = [];

export function installCrashGuard(onCrash?: Handler) {
  const g: any = global as any;
  const errorUtils = g.ErrorUtils;

  if (errorUtils && typeof errorUtils.getGlobalHandler === 'function') {
    const prev = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      try {
        const fatal = isFatal ?? false;
        listeners.forEach((l) => l(error, fatal));
        onCrash?.(error, fatal);
        if (__DEV__) console.error('[crashGuard] JS error:', error);
      } catch {}
      prev?.(error, isFatal);
    });
  }

  if (!g.__crashGuardInstalled) {
    g.__crashGuardInstalled = true;
    try {
      const tracking = require('promise/setimmediate/rejection-tracking');
      if (tracking?.enable) {
        tracking.enable({
          allRejections: true,
          onUnhandled: (_id: number, err: any) => {
            const e = err instanceof Error ? err : new Error(String(err));
            try {
              listeners.forEach((l) => l(e, false));
              onCrash?.(e, false);
              if (__DEV__) console.warn('[crashGuard] Unhandled rejection:', err);
            } catch {}
          },
          onHandled: () => {},
        });
      }
    } catch {}
  }

  return {
    addListener(h: Handler) {
      listeners.push(h);
      return () => { const i = listeners.indexOf(h); if (i >= 0) listeners.splice(i, 1); };
    },
  };
}
