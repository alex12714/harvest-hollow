// The world layer's entry (OnFire "Hollow Valley", phase 1): worlds of single-owner farms, server-to-server API, join
// token launch, and read-only visits. Everything lives in server/world/; the multi-farm host calls two hooks:
//   attachWorld(hh)              at boot, before the app is built: hh.world / hh.wc, the visitor-aware sessions class
//                                for every farm, the farm sweep's exemption for world farms, the world sweep
//   mountWorld(app, hh, o)       the routes (server/world/routes.js)
// With no HH_WORLD_SECRET (and no cfg.world) nothing is attached and the host is exactly the upstream one.
import { worldConfig } from './config.js';
import { WorldRegistry } from './registry.js';
import { worldSessions } from './sessions.js';

export { mountWorld } from './routes.js';

/** Attach the world layer to a multi-farm host context (server/multi.js startMultiServer). Returns hh.world or null. */
export function attachWorld(hh, env = process.env) {
  const wc = hh.cfg.world === undefined ? worldConfig(env) : hh.cfg.world;
  if (!wc) return null;
  const world = new WorldRegistry({ wc, reg: hh.reg, log: hh.log, dataDir: hh.cfg.dataDir });
  const n = world.scan();
  hh.wc = wc;
  hh.world = world;
  hh.reg.Sessions = worldSessions(world);
  hh.reg.keep = (id) => world.keep(id);
  hh.reg.sweepers.push(async (now) => world.sweep(now));
  hh.log.info(`worlds: on (${n} stored, up to ${wc.maxMembers} farms each)`);
  return world;
}
