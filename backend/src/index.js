import { createApp } from './app.js';
import { assertProductionConfig, config } from './config.js';

// Stops a public deployment booting on development secrets. No-op in dev.
assertProductionConfig();

createApp().listen(config.port, () => {
  console.log(`Mdawra API listening on http://localhost:${config.port}`);
});
