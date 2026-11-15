import { EnvironmentId, type SidebarSpace } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

type SettingsWrite = {
  environmentId: EnvironmentId;
  input: { patch: { sidebarSpaces: ReadonlyArray<SidebarSpace> } };
};

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  updateSettings: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../components/ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("../hooks/useSettings", () => ({}));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: { get: mocks.readSettings } }));
vi.mock("../state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("../state/presentation", () => ({ environmentSummaries: {} }));
vi.mock("../state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: undefined }));
vi.mock("../state/server", () => ({
  serverEnvironment: {
    settingsValueAtom: (environmentId: EnvironmentId) => environmentId,
    updateSettings: {},
  },
}));
vi.mock("../state/session", () => ({
  readEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => mocks.updateSettings }));

import { useSidebarSpaceWriter } from "./state";

function space(id: string): SidebarSpace {
  return { id, name: id, icon: "lucide:folder", projectRefs: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(initialSpaces: ReadonlyArray<SidebarSpace>) {
  mocks.readSettings.mockReset().mockReturnValue({ sidebarSpaces: initialSpaces });
  mocks.updateSettings.mockReset();
  mocks.toast.mockReset();

  const persisted = new Map<EnvironmentId, ReadonlyArray<SidebarSpace>>();
  const deferWrite = () => {
    const started = deferred<SettingsWrite>();
    const completed = deferred<boolean>();
    mocks.updateSettings.mockImplementationOnce(async (write: SettingsWrite) => {
      started.resolve(write);
      if (!(await completed.promise)) {
        return AsyncResult.failure(Cause.fail(new Error("Save rejected")));
      }
      persisted.set(write.environmentId, write.input.patch.sidebarSpaces);
      return AsyncResult.success(undefined);
    });
    return { started: started.promise, complete: completed.resolve };
  };

  return { persisted, deferWrite };
}

describe("useSidebarSpaceWriter", () => {
  it("preserves overlapping saves across writer instances and refreshes after draining", async () => {
    const environmentId = EnvironmentId.make("overlapping-saves");
    const base = space("base");
    const first = space("first");
    const second = space("second");
    const external = space("external");
    const { persisted, deferWrite } = setup([base]);
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
    secondWrite.complete(true);
    expect(await secondSave).toBe(true);

    expect(secondPatch.input.patch.sidebarSpaces).toEqual([base, first, second]);
    expect(persisted.get(environmentId)).toEqual([base, first, second]);

    mocks.readSettings.mockReturnValue({ sidebarSpaces: [base, first, second, external] });
    const removeWrite = deferWrite();
    const remove = firstWriter.remove(`${environmentId}:base`);
    await removeWrite.started;
    removeWrite.complete(true);
    expect(await remove).toBe(true);
    expect(persisted.get(environmentId)).toEqual([first, second, external]);
  });

  it("keeps the last successful list when a queued write fails", async () => {
    const environmentId = EnvironmentId.make("failed-save");
    const base = space("base");
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

  it("lets another environment write while the first environment is pending", async () => {
    const firstEnvironment = EnvironmentId.make("first-environment");
    const secondEnvironment = EnvironmentId.make("second-environment");
    const base = space("base");
    const first = space("first");
    const second = space("second");
    const { persisted, deferWrite } = setup([base]);
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
  });
});
