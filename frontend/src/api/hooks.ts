import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LogQuery } from "./client";
import type { Endpoint, EndpointInput, StatsRange } from "./types";

export const qk = {
  info: ["info"] as const,
  health: ["health"] as const,
  projects: ["projects"] as const,
  project: (id: number) => ["projects", id] as const,
  endpoints: (projectId: number) => ["endpoints", projectId] as const,
  endpoint: (id: number) => ["endpoint", id] as const,
  logs: (q: LogQuery) => ["logs", q] as const,
  log: (id: number) => ["log", id] as const,
  stats: (range: StatsRange, projectId?: number) => ["stats", range, projectId ?? null] as const,
};

export const useInfo = () => useQuery({ queryKey: qk.info, queryFn: api.info, staleTime: Infinity });

export const useHealth = () =>
  useQuery({ queryKey: qk.health, queryFn: api.health, refetchInterval: 5000, retry: false });

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: api.listProjects });

export const useProject = (id: number) =>
  useQuery({ queryKey: qk.project(id), queryFn: () => api.getProject(id), enabled: Number.isFinite(id) });

export const useEndpoints = (projectId: number) =>
  useQuery({
    queryKey: qk.endpoints(projectId),
    queryFn: () => api.listEndpoints(projectId),
    enabled: Number.isFinite(projectId),
  });

export const useLogs = (q: LogQuery, live: boolean) =>
  useQuery({
    queryKey: qk.logs(q),
    queryFn: () => api.listLogs(q),
    refetchInterval: live ? 2000 : false,
    placeholderData: keepPreviousData,
  });

export const useLog = (id: number | null) =>
  useQuery({ queryKey: qk.log(id ?? -1), queryFn: () => api.getLog(id!), enabled: id !== null });

export const useStats = (range: StatsRange, projectId?: number) =>
  useQuery({
    queryKey: qk.stats(range, projectId),
    queryFn: () => api.stats(range, projectId),
    refetchInterval: 4000,
    placeholderData: keepPreviousData,
  });

/** Invalidate everything derived from projects/endpoints (counts, stats...). */
function useInvalidateConfig() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["endpoints"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: api.createProject, onSuccess: invalidate });
}

export function useUpdateProject() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; slug?: string; description?: string }) =>
      api.updateProject(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: api.deleteProject, onSuccess: invalidate });
}

export function useImportProject() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: api.importProject, onSuccess: invalidate });
}

export function useRestoreSample() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: api.restoreSample, onSuccess: invalidate });
}

export function useCreateEndpoint(projectId: number) {
  const invalidate = useInvalidateConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EndpointInput) => api.createEndpoint(projectId, body),
    onSuccess: (ep) => {
      // Make the new endpoint selectable immediately, before the refetch lands.
      qc.setQueryData<Endpoint[]>(qk.endpoints(projectId), (old) => (old ? [...old, ep] : [ep]));
      invalidate();
    },
  });
}

export function useUpdateEndpoint() {
  const invalidate = useInvalidateConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<EndpointInput> }) => api.updateEndpoint(id, body),
    onSuccess: (ep) => {
      qc.setQueryData(qk.endpoint(ep.id), ep);
      invalidate();
    },
  });
}

export function useDeleteEndpoint() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: api.deleteEndpoint, onSuccess: invalidate });
}

export function useDuplicateEndpoint() {
  const invalidate = useInvalidateConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; project_id?: number; method?: string; path?: string }) =>
      api.duplicateEndpoint(id, body),
    onSuccess: (ep) => {
      qc.setQueryData<Endpoint[]>(qk.endpoints(ep.project_id), (old) => (old ? [...old, ep] : [ep]));
      invalidate();
    },
  });
}

export function useClearLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId?: number) => api.clearLogs(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
