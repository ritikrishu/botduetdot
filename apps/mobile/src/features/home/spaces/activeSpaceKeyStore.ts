export function createActiveSpaceKeyStore(io: {
  readonly read: () => Promise<string | null>;
  readonly write: (key: string | null) => Promise<void>;
  readonly publish: (key: string | null) => void;
}): {
  readonly hydrate: () => Promise<void>;
  readonly set: (key: string | null) => void;
} {
  let dirty = false;
  let known: string | null | undefined;
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  return {
    hydrate: () => {
      hydration ??= Promise.resolve()
        .then(io.read)
        .then(
          (key) => {
            if (dirty) return;
            known = key;
            io.publish(key);
          },
          () => {
            if (!dirty) known = null;
          },
        );
      return hydration;
    },
    set: (key) => {
      dirty = true;
      io.publish(key);
      if (known === key) return;
      known = key;
      writes = writes.then(() => io.write(key)).catch(() => {});
    },
  };
}
