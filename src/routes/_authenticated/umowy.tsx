import { createFileRoute, redirect } from "@tanstack/react-router";

// Agreements are temporarily disabled. Keep the route reserved so old links
// land safely without exposing the paused feature.
export const Route = createFileRoute("/_authenticated/umowy")({
  beforeLoad: () => {
    throw redirect({ to: "/panstwo", replace: true });
  },
});
