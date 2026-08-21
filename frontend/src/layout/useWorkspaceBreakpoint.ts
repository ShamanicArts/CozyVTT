import { useEffect, useState } from "react";
import type { WorkspaceBreakpoint } from "./contracts";

const MEDIUM_QUERY = "(min-width: 768px)";
const WIDE_QUERY = "(min-width: 1024px)";

function readBreakpoint(): WorkspaceBreakpoint {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  if (window.matchMedia(WIDE_QUERY).matches) return "wide";
  if (window.matchMedia(MEDIUM_QUERY).matches) return "medium";
  return "compact";
}

/** Keeps exactly one responsive workspace mounted at a time. */
export function useWorkspaceBreakpoint(): WorkspaceBreakpoint {
  const [breakpoint, setBreakpoint] = useState(readBreakpoint);

  useEffect(() => {
    const medium = window.matchMedia(MEDIUM_QUERY);
    const wide = window.matchMedia(WIDE_QUERY);
    const update = () => setBreakpoint(readBreakpoint());
    medium.addEventListener("change", update);
    wide.addEventListener("change", update);
    update();
    return () => {
      medium.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}
