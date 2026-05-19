import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-fetching aggressively is more important than caching here — the
      // Keys / Usage tables should always reflect the freshest state when
      // the operator switches tabs back.
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element in index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
