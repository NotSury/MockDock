import { ArrowLeft, Download, FlaskConical, MoreHorizontal, MousePointerClick, Plus, ScrollText, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useEndpoints, useInfo, useProject } from "../api/hooks";
import { CopyButton } from "../components/CopyButton";
import { EndpointEditor, toInput } from "../components/endpoint/EndpointEditor";
import { EndpointList } from "../components/endpoint/EndpointList";
import { projectColor } from "../components/Layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../components/Menu";
import { Button, EmptyState, IconButton, Kbd, Skeleton } from "../components/ui";
import { cn } from "../lib/cn";
import { mockBaseUrl, newEndpoint } from "../lib/http";
import { useProjectMenuActions } from "./Projects";
import { useConfirm } from "../components/Confirm";

export function ProjectPage() {
  const params = useParams();
  const projectId = Number(params.projectId);
  const endpointParam = params.endpointId;
  const creating = endpointParam === "new";
  const endpointId = endpointParam && !creating ? Number(endpointParam) : null;

  const navigate = useNavigate();
  const confirm = useConfirm();
  const project = useProject(projectId);
  const endpoints = useEndpoints(projectId);
  const info = useInfo();
  const actions = useProjectMenuActions();
  const base = mockBaseUrl(info.data?.mock_base_url);

  const dirtyRef = useRef(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const guardedNavigate = async (to: string) => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        description: "You have edits to this endpoint that haven't been saved.",
        confirmLabel: "Discard",
        danger: true,
      });
      if (!ok) return;
      dirtyRef.current = false;
    }
    navigate(to);
  };

  const selected = endpointId !== null ? endpoints.data?.find((e) => e.id === endpointId) ?? null : null;
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  useEffect(() => setMobileShowEditor(endpointParam !== undefined), [endpointParam]);

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <div className="grid h-full place-items-center">
        <EmptyState
          title={notFound ? "Project not found" : "Couldn't load project"}
          description={notFound ? "It may have been deleted." : (project.error as Error).message}
          action={
            <Link to="/projects">
              <Button>Back to projects</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const p = project.data;
  const editorKey = creating ? "new" : String(endpointId);

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      {/* Project header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-700/70 px-5 py-3.5">
        <Link to="/projects" aria-label="Back to projects" className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-ink-700 hover:text-fg">
          <ArrowLeft className="size-4" />
        </Link>
        {p ? (
          <>
            <span className="size-2.5 rounded-[3px]" style={{ background: projectColor(p.id) }} />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">{p.name}</h1>
            </div>
            <div className="hidden min-w-0 items-center gap-0.5 rounded-md border border-ink-700 bg-ink-850 py-0.5 pl-2.5 pr-0.5 md:flex">
              <span className="truncate font-mono text-[11.5px] text-fg-muted">
                {base}/{p.slug}
              </span>
              <CopyButton value={`${base}/${p.slug}`} label="Copy base URL" size="xs" className="size-6" />
            </div>
          </>
        ) : (
          <Skeleton className="h-5 w-48" />
        )}
        <div className="flex-1" />
        {p && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<ScrollText className="size-3.5" />} onClick={() => navigate(`/inspector?project=${p.id}`)} className="hidden sm:inline-flex">
              Requests
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => guardedNavigate(`/projects/${p.id}/endpoints/new`)}>
              New endpoint
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="Project actions" variant="outline">
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
                <MenuItem icon={<FlaskConical />} onSelect={() => navigate("/tester", { state: { method: "GET", url: `${base}/${p.slug}/` } })}>
                  Open in API tester
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger onSelect={() => actions.remove(p)}>
                  Delete project
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "w-full shrink-0 border-r border-ink-700/70 bg-ink-950/30 md:block md:w-[300px] xl:w-[330px]",
            mobileShowEditor ? "hidden" : "block",
          )}
        >
          <EndpointList
            endpoints={endpoints.data}
            loading={endpoints.isPending}
            selectedId={endpointId}
            creating={creating}
            onSelect={(id) => guardedNavigate(`/projects/${projectId}/endpoints/${id}`)}
            onNew={() => guardedNavigate(`/projects/${projectId}/endpoints/new`)}
          />
        </aside>
        <section className={cn("min-w-0 flex-1", mobileShowEditor ? "block" : "hidden md:block")}>
          {mobileShowEditor && (
            <button onClick={() => guardedNavigate(`/projects/${projectId}`)} className="flex items-center gap-1.5 px-5 pt-3 text-[12px] text-fg-subtle md:hidden">
              <ArrowLeft className="size-3.5" /> All endpoints
            </button>
          )}
          {!p || endpoints.isPending ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-9" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-80" />
            </div>
          ) : creating ? (
            <EndpointEditor key={editorKey} project={p} endpoint={null} initial={newEndpoint()} mockBase={base} onDirtyChange={setDirty} />
          ) : selected ? (
            <EndpointEditor key={editorKey} project={p} endpoint={selected} initial={toInput(selected)} mockBase={base} onDirtyChange={setDirty} />
          ) : endpointId !== null ? (
            <EmptyState title="Endpoint not found" description="It may have been deleted." />
          ) : (
            <div className="grid h-full place-items-center grid-bg">
              <EmptyState
                icon={<MousePointerClick />}
                title={endpoints.data?.length ? "Select an endpoint to edit" : "This project has no endpoints yet"}
                description={
                  endpoints.data?.length ? (
                    <>
                      Pick a route on the left, or press <Kbd>⌘K</Kbd> to jump to any endpoint.
                    </>
                  ) : (
                    <>Create a route such as <span className="font-mono text-fg-muted">GET /users</span> and it's live instantly.</>
                  )
                }
                action={
                  <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => navigate(`/projects/${projectId}/endpoints/new`)}>
                    New endpoint
                  </Button>
                }
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
