import type { ProjectSpec } from '@nl2pl/shared';

interface ProjectHeaderProps {
  spec: ProjectSpec | null;
}

export function ProjectHeader({ spec }: ProjectHeaderProps) {
  const tags = [
    spec?.language,
    spec?.framework,
    spec?.db,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-zinc-100">NL2PL</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded">
          MVP
        </span>
      </div>

      <div className="w-px h-4 bg-zinc-800" />

      <span className="text-sm text-zinc-400 truncate">
        {spec?.purpose || '프로젝트'}
      </span>

      {tags.length > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-800" />
          <div className="flex gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/50 rounded-md text-zinc-400 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
