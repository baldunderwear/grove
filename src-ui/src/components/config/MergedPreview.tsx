interface MergedPreviewProps {
  globalContent: string | null;
  projectContent: string | null;
}

/**
 * Read-only preview of merged global + project CLAUDE.md content.
 * Shows what Claude Code will actually see when both files exist.
 */
export function MergedPreview({ globalContent, projectContent }: MergedPreviewProps) {
  return (
    <div className="h-full overflow-auto bg-[var(--grove-void)] p-4 font-mono text-sm text-[var(--grove-fog)]">
      {/* Global CLAUDE.md section */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--grove-stone)] mb-2">
          Global CLAUDE.md
        </h3>
        {globalContent != null ? (
          <pre className="whitespace-pre-wrap break-words text-[var(--grove-fog)] leading-relaxed">
            {globalContent}
          </pre>
        ) : (
          <p className="italic text-[var(--grove-stone)]">(not found)</p>
        )}
      </div>

      {/* Divider */}
      <hr className="border-[var(--grove-canopy)] my-4" />

      {/* Project CLAUDE.md section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--grove-stone)] mb-2">
          Project CLAUDE.md
        </h3>
        {projectContent != null ? (
          <pre className="whitespace-pre-wrap break-words text-[var(--grove-fog)] leading-relaxed">
            {projectContent}
          </pre>
        ) : (
          <p className="italic text-[var(--grove-stone)]">(not found)</p>
        )}
      </div>
    </div>
  );
}
