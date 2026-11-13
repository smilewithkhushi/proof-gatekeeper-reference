import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { application } from './application.js';
import { checkArtifacts } from './artifacts.js';
import { State } from './state.js';
try {
  const settings = config(); checkArtifacts();
  const state = new State(settings.statePath);
  const handler = application(settings,state);
  const server = settings.tlsCert && settings.tlsKey
    ? httpsServer({cert:readFileSync(settings.tlsCert),key:readFileSync(settings.tlsKey),minVersion:'TLSv1.2'},handler)
    : httpServer(handler);
  server.requestTimeout = 60000; server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;server.maxHeadersCount = 32;server.maxConnections = 128;
  server.on('error',()=>{console.error('Server failed');process.exit(1);});
  server.listen(settings.port,settings.host,()=>console.info(`Proof Gatekeeper listening on port ${settings.port} (${settings.network})`));
  const stop = () => {
    server.close(()=>{state.close();process.exit(0);});
    setTimeout(()=>process.exit(1),59000).unref();
  };
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
} catch {console.error('Startup failed: check configuration, circuit integrity and state directory');process.exit(1);}
