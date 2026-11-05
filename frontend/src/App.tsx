import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ApiError } from "./api/client";
import { CommandPaletteProvider } from "./components/CommandPalette";
import { ConfirmProvider } from "./components/Confirm";
import { Layout } from "./components/Layout";
import { ProjectDialogsProvider } from "./components/ProjectDialogs";
import { TooltipProvider } from "./components/Tooltip";
import { DashboardPage } from "./pages/Dashboard";
import { InspectorPage } from "./pages/Inspector";
import { NotFoundPage } from "./pages/NotFound";
import { ProjectPage } from "./pages/Project";
import { ProjectsPage } from "./pages/Projects";
import { TesterPage } from "./pages/Tester";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 3000,
        refetchOnWindowFocus: true,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

const queryClient = makeQueryClient();

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route path="/projects/:projectId/endpoints/:endpointId" element={<ProjectPage />} />
      <Route path="/tester" element={<TesterPage />} />
      <Route path="/inspector" element={<InspectorPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <ProjectDialogsProvider>
              <CommandPaletteProvider>
                <Layout>
                  <AppRoutes />
                </Layout>
              </CommandPaletteProvider>
            </ProjectDialogsProvider>
          </ConfirmProvider>
        </TooltipProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-ink-800 !border-ink-600 !text-fg !text-[13px] !rounded-xl !shadow-2xl !shadow-black/50",
              description: "!text-fg-subtle",
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
