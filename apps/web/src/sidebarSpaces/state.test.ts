import { DEFAULT_SERVER_SETTINGS, EnvironmentId, type SidebarSpace } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

type SettingsWrite = {
  environmentId: EnvironmentId;
  input: { patch: { sidebarSpaces: ReadonlyArray<SidebarSpace> } };
};

const mocks = vi.hoisted(() => ({
  atoms: new Map<string, unknown>(),
  listeners: new Map<string, Set<(value: unknown) => void>>(),
  initialSettings: { current: null as unknown },
  updateSettings: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../components/ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("../hooks/useSettings", () => ({}));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: (atom: string) => mocks.atoms.get(atom) ?? mocks.initialSettings.current,
  },
  subscribeAtomChanges: (atom: string, listener: (value: unknown) => void) => {
    const listeners = mocks.listeners.get(atom) ?? new Set();
    listeners.add(listener);
    mocks.listeners.set(atom, listeners);
    return () => listeners.delete(listener);
  },
}));
vi.mock("../state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("../state/presentation", () => ({ environmentSummaries: {} }));
vi.mock("../state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: undefined }));
vi.mock("../state/server", () => ({
  serverEnvironment: {
    settingsValueAtom: (environmentId: EnvironmentId) => `settings:${environmentId}`,
    updateSettings: {},
  },
}));
vi.mock("../state/session", () => ({
  environmentSession: {
    initialConfigValueAtom: (environmentId: EnvironmentId) => `session:${environmentId}`,
  },
  readEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => mocks.updateSettings }));

import { useSidebarSpaceWriter } from "./state";

function space(id: string): SidebarSpace {
  return { id, name: id, icon: "lucide:folder", projectRefs: [] };
}

const base = space("base");
const first = space("first");
const second = space("second");
const third = space("third");
const external = space("external");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(initialSpaces: ReadonlyArray<SidebarSpace>) {
  mocks.atoms.clear();
  mocks.listeners.clear();
  mocks.initialSettings.current = { sidebarSpaces: initialSpaces };
  mocks.updateSettings.mockReset();
  mocks.toast.mockReset();

  const persisted = new Map<EnvironmentId, ReadonlyArray<SidebarSpace>>();
  const deferWrite = (acknowledgedSpaces?: ReadonlyArray<SidebarSpace>) => {
    const started = deferred<SettingsWrite>();
    const completed = deferred<boolean>();
    mocks.updateSettings.mockImplementationOnce(async (write: SettingsWrite) => {
      started.resolve(write);
      if (!(await completed.promise)) {
        return AsyncResult.failure(Cause.fail(new Error("Save rejected")));
      }
      const sidebarSpaces = acknowledgedSpaces ?? write.input.patch.sidebarSpaces;
      persisted.set(write.environmentId, sidebarSpaces);
      return AsyncResult.success({ ...DEFAULT_SERVER_SETTINGS, sidebarSpaces });
    });
    return { started: started.promise, complete: completed.resolve };
  };
  const run = async (operation: () => Promise<boolean>) => {
    const write = deferWrite();
    const result = operation();
    const patch = await write.started;
    write.complete(true);
    expect(await result).toBe(true);
    return patch.input.patch.sidebarSpaces;
  };
  const notify = (atom: string, value: unknown) => {
    mocks.atoms.set(atom, value);
    for (const listener of mocks.listeners.get(atom) ?? []) listener(value);
  };
  const push = (environmentId: EnvironmentId, sidebarSpaces: ReadonlyArray<SidebarSpace>) =>
    notify(`settings:${environmentId}`, { sidebarSpaces });
  const reconnect = (environmentId: EnvironmentId, sidebarSpaces: ReadonlyArray<SidebarSpace>) =>
    notify(`session:${environmentId}`, { settings: { sidebarSpaces } });

  return { persisted, deferWrite, run, push, reconnect };
}

describe("useSidebarSpaceWriter", () => {
  it.each([
    {
      name: "a delayed echo of the first save",
      during: [],
      after: [[base, first]],
      expected: [base, first, second, third],
    },
    {
      name: "a delayed echo of the first save during the second",
      during: [[base, first]],
      after: [],
      expected: [base, first, second, third],
    },
    {
      name: "another device removing the second save after both echoed",
      during: [],
      after: [
        [base, first],
        [base, first, second],
        [base, first],
      ],
      expected: [base, first, third],
    },
  ])("builds overlapping saves on acknowledgements until echoed: $name", async (row) => {
    const environmentId = EnvironmentId.make(`echo:${row.name}`);
    const { persisted, deferWrite, run, push } = setup([base]);
    const firstWrite = deferWrite();
    const secondWrite = deferWrite();
    const firstWriter = useSidebarSpaceWriter();
    const secondWriter = useSidebarSpaceWriter();

    const firstSave = firstWriter.save(first, environmentId);
    await firstWrite.started;
    const secondSave = secondWriter.save(second, environmentId);
    firstWrite.complete(true);
    expect(await firstSave).toBe(true);
    const secondPatch = await secondWrite.started;
    for (const spaces of row.during) push(environmentId, spaces);
    secondWrite.complete(true);
    expect(await secondSave).toBe(true);
    expect(secondPatch.input.patch.sidebarSpaces).toEqual([base, first, second]);
    expect(persisted.get(environmentId)).toEqual([base, first, second]);

    for (const spaces of row.after) push(environmentId, spaces);
    expect(await run(() => firstWriter.save(third, environmentId))).toEqual(row.expected);
  });

  it("matches an echo to the earliest acknowledgement with that list", async () => {
    const environmentId = EnvironmentId.make("repeated-list");
    const { run, push } = setup([base]);
    const writer = useSidebarSpaceWriter();
    await run(() => writer.save(first, environmentId));
    await run(() => writer.remove(`${environmentId}:first`));
    await run(() => writer.save(first, environmentId));

    push(environmentId, [base, first]);
    push(environmentId, [base]);
    expect(await run(() => writer.save(third, environmentId))).toEqual([base, first, third]);
  });

  it.each([false, true])(
    "preserves acknowledged saves after draining (push before acknowledgement: %s)",
    async (pushBeforeAcknowledgement) => {
      const environmentId = EnvironmentId.make(`drained-save-${pushBeforeAcknowledgement}`);
      const acknowledgedFirst = { ...first, name: "Server-confirmed first" };
      const { persisted, deferWrite, push } = setup([base]);
      const firstWrite = deferWrite([base, acknowledgedFirst]);
      const firstWriter = useSidebarSpaceWriter();
      const firstSave = firstWriter.save(first, environmentId);
      await firstWrite.started;
      if (pushBeforeAcknowledgement) push(environmentId, [base]);
      firstWrite.complete(true);
      expect(await firstSave).toBe(true);

      const secondWrite = deferWrite();
      const secondWriter = useSidebarSpaceWriter();
      const secondSave = secondWriter.save(second, environmentId);
      const secondPatch = await secondWrite.started;
      secondWrite.complete(true);
      expect(await secondSave).toBe(true);

      expect(secondPatch.input.patch.sidebarSpaces).toEqual([base, acknowledgedFirst, second]);
      expect(persisted.get(environmentId)).toEqual([base, acknowledgedFirst, second]);
    },
  );

  it("follows the server once a save's echo arrives before its reply", async () => {
    const environmentId = EnvironmentId.make("echo-before-reply");
    const { deferWrite, run, push } = setup([base]);
    const firstWrite = deferWrite();
    const writer = useSidebarSpaceWriter();
    const firstSave = writer.save(first, environmentId);
    await firstWrite.started;
    push(environmentId, [base, first]);
    push(environmentId, [base, first, external]);
    firstWrite.complete(true);
    expect(await firstSave).toBe(true);

    expect(await run(() => writer.save(second, environmentId))).toEqual([
      base,
      first,
      external,
      second,
    ]);
  });

  it("builds on a new connection's first config instead of an unechoed save", async () => {
    const environmentId = EnvironmentId.make("reconnected");
    const { run, reconnect } = setup([base]);
    const writer = useSidebarSpaceWriter();
    await run(() => writer.save(first, environmentId));

    reconnect(environmentId, [base, first, external]);
    expect(await run(() => writer.save(second, environmentId))).toEqual([
      base,
      first,
      external,
      second,
    ]);
  });

  it("stops holding an acknowledgement whose echo is overdue", async () => {
    using now = vi.spyOn(Date, "now").mockReturnValue(0);
    const environmentId = EnvironmentId.make("overdue-echo");
    const { run, push } = setup([base]);
    const writer = useSidebarSpaceWriter();
    await run(() => writer.save(first, environmentId));
    push(environmentId, [base, first, external]);

    now.mockReturnValue(15_000);
    expect(await run(() => writer.save(second, environmentId))).toEqual([
      base,
      first,
      external,
      second,
    ]);
  });

  it("keeps the last successful list when a queued write fails", async () => {
    const environmentId = EnvironmentId.make("failed-save");
    const good = space("good");
    const { persisted, deferWrite } = setup([base]);
    const goodWrite = deferWrite();
    const failedWrite = deferWrite();
    const moveWrite = deferWrite();
    const writer = useSidebarSpaceWriter();

    const goodSave = writer.save(good, environmentId);
    await goodWrite.started;
    const failedSave = writer.save(space("failed"), environmentId);
    const move = writer.move(`${environmentId}:good`, -1);

    goodWrite.complete(true);
    expect(await goodSave).toBe(true);
    await failedWrite.started;
    failedWrite.complete(false);
    expect(await failedSave).toBe(false);
    await moveWrite.started;
    moveWrite.complete(true);
    expect(await move).toBe(true);

    expect(persisted.get(environmentId)).toEqual([good, base]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", title: "Space not saved" }),
    );
  });

  it("keeps environments independent", async () => {
    const firstEnvironment = EnvironmentId.make("first-environment");
    const secondEnvironment = EnvironmentId.make("second-environment");
    const { persisted, deferWrite, run, push } = setup([base]);
    const firstWrite = deferWrite();
    const secondWrite = deferWrite();
    const writer = useSidebarSpaceWriter();

    const firstSave = writer.save(first, firstEnvironment);
    await firstWrite.started;
    const secondSave = writer.save(second, secondEnvironment);
    await secondWrite.started;
    secondWrite.complete(true);
    expect(await secondSave).toBe(true);
    expect(persisted.has(firstEnvironment)).toBe(false);

    firstWrite.complete(true);
    expect(await firstSave).toBe(true);
    expect(persisted.get(firstEnvironment)).toEqual([base, first]);
    expect(persisted.get(secondEnvironment)).toEqual([base, second]);

    push(secondEnvironment, [base, first]);
    expect(await run(() => writer.save(third, firstEnvironment))).toEqual([base, first, third]);
  });
});
