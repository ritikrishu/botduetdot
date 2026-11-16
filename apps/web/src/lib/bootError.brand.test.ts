import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { describe, expect, it, vi } from "vite-plus/test";

describe.each(["upstream", "standalone"] as const)("%s boot recovery", (id) => {
  it("offers triage only when enabled and reports to the brand issue tracker", async () => {
    vi.resetModules();
    const brand = resolveBrandProfile(id);
    vi.doMock("@t3tools/contracts/brand", () => ({ BRAND: brand }));
    using _error = vi.spyOn(console, "error").mockImplementation(() => {});
    const nodes: Array<Record<string, unknown>> = [];
    const replaceChildren = vi.fn();
    const getState = vi.fn(async () => ({ launcherPath: null }));
    vi.stubGlobal("document", {
      getElementById: () => ({ replaceChildren }),
      createElement: (tag: string) => {
        const node = { tag, append: vi.fn(), setAttribute: vi.fn(), addEventListener: vi.fn() };
        nodes.push(node);
        return node;
      },
    });
    vi.stubGlobal("window", {
      desktopBridge: {
        cliCommand: { getState },
        getClientPlatform: () => "darwin",
        onUpdateState: vi.fn(),
        getUpdateState: async () => ({ status: "disabled" }),
      },
    });
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Test", onLine: true });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn() });
    try {
      const { showBootError } = await import("./bootError");
      showBootError(new Error("Test boot failure"));
      expect(replaceChildren).toHaveBeenCalledOnce();
      expect(nodes.find((node) => node.tag === "h1")?.textContent).toBe(
        `${brand.name} failed to start`,
      );
      const command = nodes.find((node) => node.tag === "code");
      const issue = nodes.find((node) => node.textContent === "File a bug report on GitHub")!;
      const text = nodes.map((node) => node.textContent).join(" ");
      if (brand.features.triage) {
        expect(command?.textContent).toContain("npx t3 triage");
        expect(text).toContain("Your agent can check the local logs");
        const url = new URL(String(issue.href));
        expect(url.origin + url.pathname).toBe(brand.links.issues);
        expect(url.searchParams.get("template")).toBe("bug_report.yml");
        expect(url.searchParams.get("title")).toBe("T3 Code failed to start");
      } else {
        expect(command).toBeUndefined();
        expect(text).not.toMatch(/triage|Your agent can check|T3 Code/);
        expect(issue.href).toBe(brand.links.issues);
        expect(getState).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock("@t3tools/contracts/brand");
      vi.resetModules();
    }
  });
});
