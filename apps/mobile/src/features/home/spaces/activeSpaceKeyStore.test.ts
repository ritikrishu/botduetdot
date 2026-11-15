import { describe, expect, it, vi } from "vite-plus/test";
import { createActiveSpaceKeyStore } from "./activeSpaceKeyStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("active space persistence", () => {
  it.each([
    ["env:k", false],
    [null, false],
    ["env:k", true],
    [null, true],
  ] as const)("keeps local %s over late hydration (rejects: %s)", async (key, rejects) => {
    const read = deferred<string | null>();
    const publish = vi.fn();
    const store = createActiveSpaceKeyStore({
      read: () => read.promise,
      write: async () => {},
      publish,
    });
    const hydration = store.hydrate();
    store.set(key);
    expect(publish).toHaveBeenLastCalledWith(key);
    if (rejects) read.reject(new Error("storage unavailable"));
    else read.resolve("env:old");
    await hydration;
    expect(publish.mock.calls).toEqual([[key]]);
  });

  it("hydrates once and accepts later local choices without redundant writes", async () => {
    const persisted = deferred<void>();
    const read = vi.fn(async () => "env:old");
    const write = vi.fn(async () => {
      persisted.resolve();
    });
    const publish = vi.fn();
    const store = createActiveSpaceKeyStore({ read, write, publish });
    const hydration = store.hydrate();
    expect(store.hydrate()).toBe(hydration);
    await hydration;
    expect(read).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith("env:old");
    store.set("env:old");
    expect(write).not.toHaveBeenCalled();
    store.set("env:k");
    store.set("env:k");
    expect(publish).toHaveBeenLastCalledWith("env:k");
    await persisted.promise;
    expect(write.mock.calls).toEqual([["env:k"]]);
  });

  it("serializes writes so a later selection persists after an earlier All", async () => {
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const lastPersisted = deferred<void>();
    const persisted: Array<string | null> = [];
    const write = vi.fn(async (key: string | null) => {
      if (key === null) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      persisted.push(key);
      if (key !== null) lastPersisted.resolve();
    });
    const store = createActiveSpaceKeyStore({ read: async () => null, write, publish: () => {} });
    store.set(null);
    store.set("env:k");
    await firstStarted.promise;
    expect(write.mock.calls).toEqual([[null]]);
    releaseFirst.resolve();
    await lastPersisted.promise;
    expect(persisted).toEqual([null, "env:k"]);
  });

  it("deletes a stale persisted key after a failed read without publishing", async () => {
    const read = deferred<string | null>();
    const publish = vi.fn();
    const write = vi.fn(async () => {});
    const store = createActiveSpaceKeyStore({ read: () => read.promise, write, publish });
    const hydration = store.hydrate();
    read.reject(new Error("storage unavailable"));
    await hydration;
    expect(publish).not.toHaveBeenCalled();
    await store.set(null);
    expect(publish).toHaveBeenLastCalledWith(null);
    expect(write.mock.calls).toEqual([[null]]);
  });

  it("retries the same selection after a rejected write", async () => {
    const write = vi
      .fn<(key: string | null) => Promise<void>>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValue(undefined);
    const store = createActiveSpaceKeyStore({ read: async () => null, write, publish: () => {} });
    await store.set("env:k");
    await store.set("env:k");
    expect(write.mock.calls).toEqual([["env:k"], ["env:k"]]);
  });

  it("continues persisting selections after a rejected write", async () => {
    const persisted = deferred<string | null>();
    const store = createActiveSpaceKeyStore({
      read: async () => null,
      write: async (key) => {
        if (key === "env:old") throw new Error("storage unavailable");
        persisted.resolve(key);
      },
      publish: () => {},
    });
    store.set("env:old");
    store.set("env:k");
    expect(await persisted.promise).toBe("env:k");
  });
});
