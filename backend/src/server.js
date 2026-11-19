import { createServer } from 'node:http';
import app from './app.js';
import { config } from './config.js';
import { attachSocket } from './services/events.js';

// Fail fast on a missing secret, rather than at the first sign-in.
void config.jwtSecret;
void config.masterKey;

const server = createServer(app);
attachSocket(server);
server.listen(config.port, () => {
  console.log(`SECEP API listening on port ${config.port}`);
});
