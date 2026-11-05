import { ArrowRight, Download, FileJson, FolderKanban, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDeleteProject, useInfo, useProjects, useRestoreSample } from "../api/hooks";
import type { Project } from "../api/types";
import { useConfirm } from "../components/Confirm";
import { CopyButton } from "../components/CopyButton";
import { projectColor } from "../components/Layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../components/Menu";
import { useProjectDialogs } from "../components/ProjectDialogs";
import { Button, EmptyState, IconButton, PageHeader, Skeleton } from "../components/ui";
import { formatNumber, timeAgo } from "../lib/format";
import { mockBaseUrl } from "../lib/http";
import { exportProjectFile } from "../lib/projectActions";

export function useProjectMenuActions() {
  const dialogs = useProjectDialogs();
  const confirm = useConfirm();
  const del = useDeleteProject();
  const navigate = useNavigate();
  return {
    edit: dialogs.openEdit,
    exportFile: exportProjectFile,
    remove: async (p: Project, after?: () => void) => {
      const ok = await confirm({
        title: `Delete “${p.name}”?`,
        description: `This permanently removes the project and its ${p.endpoint_count} endpoints. Requests to /mock/${p.slug} will start returning 404. Request history is kept.`,
        confirmLabel: "Delete project",
        danger: true,
      });
      if (!ok) return;
      await del.mutateAsync(p.id);
      toast.success(`Deleted ${p.name}`);
      after ? after() : navigate("/projects");
    },
  };
}

function ProjectCard({ p, base }: { p: Project; base: string }) {
  const actions = useProjectMenuActions();
  const url = `${base}/${p.slug}`;
  return (
    <div className="panel group relative flex flex-col overflow-hidden transition-all hover:-translate-y-px hover:border-ink-600">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${projectColor(p.id)}, transparent)` }}
      />
      <Link to={`/projects/${p.id}`} className="flex-1 p-5 pb-4">
        <div className="flex items-start gap-3">
          <div
            className="grid size-9 shrink-0 place-items-center rounded-lg border text-[13px] font-bold"
            style={{
              color: projectColor(p.id),
              borderColor: `${projectColor(p.id)}40`,
              background: `${projectColor(p.id)}12`,
            }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <div className="truncate text-[14px] font-semibold text-fg">{p.name}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-fg-subtle">
              {p.description || <span className="italic text-fg-faint">No description</span>}
            </div>
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3.5">
        <Menu>
          <MenuTrigger asChild>
            <IconButton label={`Actions for ${p.name}`}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Settings2 />} onSelect={() => actions.edit(p)}>
              Project settings
            </MenuItem>
            <MenuItem icon={<Download />} onSelect={() => actions.exportFile(p)}>
              Export as JSON
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger onSelect={() => actions.remove(p, () => {})}>
              Delete project
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="mx-5 flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900 py-0.5 pl-2.5 pr-0.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">{url}</span>
        <CopyButton value={url} label="Copy base URL" size="xs" className="size-6" />
      </div>
      <div className="flex items-center gap-4 px-5 py-3.5 text-[11.5px] text-fg-subtle">
        <span>
          <span className="font-semibold text-fg-muted">{p.endpoint_count}</span> endpoints
        </span>
        <span>
          <span className="font-semibold text-fg-muted">{formatNumber(p.request_count)}</span> requests
        </span>
        <span className="ml-auto text-fg-faint">Updated {timeAgo(p.updated_at)}</span>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const projects = useProjects();
  const info = useInfo();
  const dialogs = useProjectDialogs();
  const restore = useRestoreSample();
  const navigate = useNavigate();
  const base = mockBaseUrl(info.data?.mock_base_url);
  const hasSample = projects.data?.some((p) => p.slug === "shop");

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 animate-slide-up">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Each project is an independent mock API with its own URL prefix."
        actions={
          <>
            <Button icon={<FileJson className="size-3.5" />} onClick={dialogs.openImport}>
              Import
            </Button>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={dialogs.openNew}>
              New project
            </Button>
          </>
        }
      />
      {projects.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : projects.isError ? (
        <div className="panel">
          <EmptyState icon={<FolderKanban />} title="Couldn't load projects" description={(projects.error as Error).message} />
        </div>
      ) : projects.data.length === 0 ? (
        <div className="panel grid-bg">
          <EmptyState
            icon={<FolderKanban />}
            title="Start your first mock API"
            description="Projects keep related endpoints together and give them a shared base URL, like /mock/payments."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={dialogs.openNew}>
                  New project
                </Button>
                <Button
                  loading={restore.isPending}
                  onClick={() => restore.mutate(undefined, { onSuccess: (p) => navigate(`/projects/${p.id}`) })}
                >
                  Load Acme Shop sample
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.map((p) => (
              <ProjectCard key={p.id} p={p} base={base} />
            ))}
            <button
              onClick={dialogs.openNew}
              className="group flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-600 text-fg-subtle transition-colors hover:border-brand-400/50 hover:bg-brand-400/[0.03] hover:text-fg-muted"
            >
              <span className="grid size-9 place-items-center rounded-lg border border-ink-600 bg-ink-850 transition-colors group-hover:border-brand-400/40 group-hover:text-brand-400">
                <Plus className="size-4" />
              </span>
              <span className="text-[12.5px] font-medium">New project</span>
            </button>
          </div>
          {!hasSample && (
            <button
              onClick={() =>
                restore.mutate(undefined, {
                  onSuccess: (p) => {
                    toast.success("Sample project restored");
                    navigate(`/projects/${p.id}`);
                  },
                })
              }
              className="mt-6 flex items-center gap-1.5 text-[12px] text-fg-subtle hover:text-fg-muted"
            >
              Want the Acme Shop sample back? <span className="text-brand-400">Restore it</span>
              <ArrowRight className="size-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
