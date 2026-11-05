import { toast } from "sonner";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { downloadJson } from "./format";

export async function exportProjectFile(p: Project) {
  try {
    const doc = await api.exportProject(p.id);
    downloadJson(`${p.slug}.mockdock.json`, doc);
    toast.success(`Exported ${p.name}`, { description: `${doc.project.endpoints.length} endpoints saved to ${p.slug}.mockdock.json` });
  } catch (e) {
    toast.error("Export failed", { description: (e as Error).message });
  }
}
