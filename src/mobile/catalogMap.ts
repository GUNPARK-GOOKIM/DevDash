import { ConnectionConfig } from '../types';
import {
  CatalogConnection,
  catalogToConfig,
  configToCatalog,
} from '../services/tauriBridge';

export { catalogToConfig, configToCatalog };

export function mergeCatalogIntoLocal(
  local: ConnectionConfig[],
  catalog: CatalogConnection[]
): ConnectionConfig[] {
  const byId = new Map(local.map((c) => [c.id, c]));
  const names = new Set(local.map((c) => c.name.toLowerCase()));
  let changed = false;
  for (const cc of catalog) {
    if (byId.has(cc.id)) continue;
    if (names.has(cc.name.toLowerCase())) continue;
    const cfg = catalogToConfig(cc);
    byId.set(cfg.id, cfg);
    names.add(cfg.name.toLowerCase());
    changed = true;
  }
  return changed ? Array.from(byId.values()) : local;
}
