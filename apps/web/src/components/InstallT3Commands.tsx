import { BRAND } from "@t3tools/contracts/brand";
import { cn } from "~/lib/utils";

import { CommandBlock } from "./CommandBlock";

/**
 * Setup steps for another computer: install `t3`, then run `command`. Both installers are shown
 * because the browser showing this is often not the computer being set up.
 */
export function InstallT3Commands({
  command,
  className,
}: {
  readonly command: string;
  readonly className?: string;
}) {
  if (!BRAND.links.installSh) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">macOS, Linux</p>
      <CommandBlock command={`curl -fsSL ${BRAND.links.installSh} | sh`} />
      {BRAND.links.installPs1 ? (
        <>
          <p className="text-xs text-muted-foreground">Windows (PowerShell)</p>
          <CommandBlock command={`irm ${BRAND.links.installPs1} | iex`} />
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">Then</p>
      <CommandBlock command={command} />
      <p className="text-xs text-muted-foreground">
        Skip the install if you already have <code className="font-mono">{BRAND.cliName}</code>. If{" "}
        <code className="font-mono">{BRAND.cliName}</code> is not found after installing, add the
        folder the installer names to your PATH.
      </p>
    </div>
  );
}
