import { createApp } from './app.js';
import { assertProductionConfig, assertStagingSafety, config } from './config.js';
import { reportError, startErrorReports } from './services/errorReports.js';

// Stops a public deployment booting on development secrets. No-op in dev.
assertProductionConfig();
assertStagingSafety();

// Crash reports (when SENTRY_DSN is set), including failures outside any request.
startErrorReports();
process.on('unhandledRejection', (reason) => {
  console.error('[error] unhandled promise rejection', reason);
  reportError(reason instanceof Error ? reason : new Error(String(reason)));
});

createApp().listen(config.port, () => {
  console.log(`Mdawra API listening on http://localhost:${config.port}`);
});
