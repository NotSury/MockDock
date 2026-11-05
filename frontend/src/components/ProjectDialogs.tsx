import { FileJson, Upload } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "../api/client";
import { useCreateProject, useImportProject, useUpdateProject } from "../api/hooks";
import type { Project } from "../api/types";
import { cn } from "../lib/cn";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

interface Ctx {
  openNew: () => void;
  openEdit: (p: Project) => void;
  openImport: () => void;
}

const ProjectDialogContext = createContext<Ctx>({ openNew() {}, openEdit() {}, openImport() {} });

export const useProjectDialogs = () => useContext(ProjectDialogContext);
export const useNewProjectDialog = () => useContext(ProjectDialogContext).openNew;

export const slugify = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");

function ProjectForm({
  project,
  onDone,
}: {
  project?: Project;
  onDone: (p: Project) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!project);
  const [description, setDescription] = useState(project?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateProject();
  const update = useUpdateProject();
  const pending = create.isPending || update.isPending;

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!name.trim()) return setErrors({ name: "Give your project a name." });
    try {
      const body = { name: name.trim(), slug: effectiveSlug || undefined, description };
      const p = project ? await update.mutateAsync({ id: project.id, ...body }) : await create.mutateAsync(body);
      toast.success(project ? "Project updated" : `Project “${p.name}” created`);
      onDone(p);
    } catch (err) {
      if (err instanceof ApiError) {
        const fe: Record<string, string> = {};
        err.fieldErrors.forEach((f) => (fe[f.field] = f.message));
        if (err.code === "conflict") fe.slug = err.message;
        setErrors(Object.keys(fe).length ? fe : { form: err.message });
      }
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" id="project-form">
      <div>
        <label className="label" htmlFor="pf-name">
          Name
        </label>
        <input
          id="pf-name"
          className={cn("field", errors.name && "border-err/60")}
          value={name}
          autoFocus
          maxLength={80}
          placeholder="e.g. Payments API"
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <p className="mt-1 text-[11.5px] text-err">{errors.name}</p>}
      </div>
      <div>
        <label className="label" htmlFor="pf-slug">
          URL slug
        </label>
        <div
          className={cn(
            "flex h-8 items-center overflow-hidden rounded-md border border-ink-600 bg-ink-900 focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-400/15",
            errors.slug && "border-err/60",
          )}
        >
          <span className="border-r border-ink-700 bg-ink-800 px-2.5 font-mono text-[11.5px] leading-8 text-fg-subtle">
            /mock/
          </span>
          <input
            id="pf-slug"
            className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
            value={effectiveSlug}
            maxLength={48}
            placeholder="payments-api"
            spellCheck={false}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
          />
        </div>
        {errors.slug ? (
          <p className="mt-1 text-[11.5px] text-err">{errors.slug}</p>
        ) : (
          <p className="mt-1 text-[11.5px] text-fg-faint">Every endpoint in this project is served under this prefix.</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="pf-desc">
          Description <span className="text-fg-faint">(optional)</span>
        </label>
        <textarea
          id="pf-desc"
          className="field h-20 resize-none py-2"
          value={description}
          maxLength={2000}
          placeholder="What does this API do?"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {errors.form && <p className="rounded-md bg-err/10 px-3 py-2 text-[12px] text-err">{errors.form}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" variant="primary" loading={pending}>
          {project ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

function ImportForm({ onDone }: { onDone: (p: Project) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importProject = useImportProject();

  const readFile = async (file: File) => {
    if (file.size > 5_000_000) return setError("That file is larger than 5 MB.");
    setText(await file.text());
    setError(null);
  };

  const submit = async () => {
    setError(null);
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      return setError("That isn't valid JSON. Paste or drop a file exported from MockDock.");
    }
    try {
      const p = await importProject.mutateAsync(doc);
      toast.success(`Imported “${p.name}” with ${p.endpoint_count} endpoints`);
      onDone(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) readFile(f);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          drag ? "border-brand-400 bg-brand-400/5" : "border-ink-600 bg-ink-900",
        )}
      >
        <Upload className="size-5 text-fg-subtle" />
        <div className="text-[12.5px] text-fg-muted">
          Drop a <span className="font-mono text-fg">.mockdock.json</span> file, or{" "}
          <button className="text-brand-400 hover:underline" onClick={() => fileRef.current?.click()}>
            browse
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
        />
      </div>
      <textarea
        aria-label="Project JSON"
        className="field h-36 resize-none py-2 font-mono text-[11.5px]"
        placeholder='{"mockdock_version": 1, "project": {"name": "…", "endpoints": […]}}'
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {error && <p className="rounded-md bg-err/10 px-3 py-2 text-[12px] text-err">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon={<FileJson className="size-3.5" />} disabled={!text.trim()} loading={importProject.isPending} onClick={submit}>
          Import project
        </Button>
      </div>
    </div>
  );
}

export function ProjectDialogsProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"new" | "edit" | "import" | null>(null);
  const [editing, setEditing] = useState<Project | undefined>();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === null) setEditing(undefined);
  }, [mode]);

  const ctx: Ctx = {
    openNew: () => setMode("new"),
    openEdit: (p) => {
      setEditing(p);
      setMode("edit");
    },
    openImport: () => setMode("import"),
  };

  return (
    <ProjectDialogContext.Provider value={ctx}>
      {children}
      <Dialog
        open={mode === "new" || mode === "edit"}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "edit" ? "Project settings" : "New project"}
        description={mode === "edit" ? "Rename the project or change its URL slug." : "A project groups related mock endpoints under one URL prefix."}
      >
        {(mode === "new" || mode === "edit") && (
          <ProjectForm
            key={editing?.id ?? "new"}
            project={editing}
            onDone={(p) => {
              setMode(null);
              if (!editing) navigate(`/projects/${p.id}`);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={mode === "import"}
        onOpenChange={(o) => !o && setMode(null)}
        title="Import project"
        description="Restore a project exported from MockDock. It's added as a new project."
        className="max-w-lg"
      >
        {mode === "import" && (
          <ImportForm
            onDone={(p) => {
              setMode(null);
              navigate(`/projects/${p.id}`);
            }}
          />
        )}
      </Dialog>
    </ProjectDialogContext.Provider>
  );
}
