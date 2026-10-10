import type { SourceKind } from "@/types/media";
import { directFactory } from "./direct";
import { localFactory } from "./local";
import { m3uFactory } from "./m3u";
import type { MediaSource, SourceConfig, SourceConfigBase, SourceFactory, SourceSecrets } from "./types";
import { xtreamFactory } from "./xtream";

const factories = new Map<SourceKind, SourceFactory<any>>();

export function registerSourceFactory<C extends SourceConfigBase>(factory: SourceFactory<C>) {
  factories.set(factory.kind, factory as SourceFactory<any>);
}

export function getSourceFactory(kind: SourceKind): SourceFactory<any> | undefined {
  return factories.get(kind);
}

export function listSourceFactories(): SourceFactory<any>[] {
  return [...factories.values()];
}

export function createSource(config: SourceConfig, secrets: SourceSecrets): MediaSource {
  const factory = factories.get(config.kind);
  if (!factory) throw new Error(`No source plugin registered for "${config.kind}"`);
  return factory.create(config, secrets);
}

registerSourceFactory(xtreamFactory);
registerSourceFactory(m3uFactory);
registerSourceFactory(localFactory);
registerSourceFactory(directFactory);
