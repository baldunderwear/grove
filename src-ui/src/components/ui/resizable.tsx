import { GripVertical } from "lucide-react";
import { Group, Panel, Separator, type GroupProps, type PanelProps, type SeparatorProps } from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: GroupProps) {
  return (
    <Group
      className={cn(
        "flex h-full w-full",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel(props: PanelProps) {
  return <Panel {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      className={cn(
        "relative flex items-center justify-center bg-[var(--grove-canopy)] [&[data-resize-handle-active]]:bg-[var(--grove-leaf)]",
        "[&[data-panel-group-direction=vertical]]:h-px [&[data-panel-group-direction=vertical]]:w-full [&[data-panel-group-direction=vertical]]:after:absolute [&[data-panel-group-direction=vertical]]:after:inset-x-0 [&[data-panel-group-direction=vertical]]:after:-top-1 [&[data-panel-group-direction=vertical]]:after:-bottom-1",
        "[&[data-panel-group-direction=horizontal]]:w-px [&[data-panel-group-direction=horizontal]]:h-full [&[data-panel-group-direction=horizontal]]:after:absolute [&[data-panel-group-direction=horizontal]]:after:inset-y-0 [&[data-panel-group-direction=horizontal]]:after:-left-1 [&[data-panel-group-direction=horizontal]]:after:-right-1",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-3 w-4 items-center justify-center rounded-sm border border-[var(--grove-canopy)] bg-[var(--grove-deep)]">
          <GripVertical className="h-2.5 w-2.5 rotate-90 text-[var(--grove-fog)]" />
        </div>
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
