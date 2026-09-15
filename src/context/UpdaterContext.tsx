import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdaterStatus =
  "idle" | "checking" | "current" | "available" | "downloading" | "error";

export interface AvailableUpdate {
  version: string;
  notes?: string;
}

export interface Updater {
  status: UpdaterStatus;
  update: AvailableUpdate | null;
  // Fraction of the download completed, or null while the server has not said
  // how large the package is. Some responses omit the length entirely, and a
  // progress bar that invents one is worse than no bar at all.
  progress: number | null;
  error: string | null;
  // Resolves with what this check found, so whoever started it can act on its
  // own answer rather than on whatever the shared state says by then.
  check: () => Promise<AvailableUpdate | null>;
  install: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const UpdaterContext = createContext<Updater | null>(null);

// Looking for a new version and installing it, once for the whole app. The
// launch toast and the card in Ajustes used to hold a copy each: the card did
// not know the toast had offered a version, installing from the toast showed no
// progress in the card, and a check from the menu opened a second update
// resource on the Rust side.
//
// The endpoint and the signing key live in tauri.conf.json: a package that is
// not signed by the matching private key is rejected before it is ever run, so
// a tampered download cannot pass itself off as an update.
export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The Update handle owns a resource on the Rust side and is what performs the
  // download, but none of it belongs in render state — only the version and the
  // notes are ever displayed.
  const pending = useRef<Update | null>(null);

  useEffect(() => {
    return () => {
      void pending.current?.close();
    };
  }, []);

  const runCheck = useCallback(async (): Promise<AvailableUpdate | null> => {
    setStatus("checking");
    setError(null);

    try {
      const found = await check();

      if (!found) {
        setUpdate(null);
        setStatus("current");
        return null;
      }

      // One handle at a time: a later check replaces the earlier one rather
      // than leaving it open beside it.
      await pending.current?.close();
      pending.current = found;
      const available = { version: found.version, notes: found.body };
      setUpdate(available);
      setStatus("available");
      return available;
    } catch (cause) {
      console.error("Failed to check for updates:", cause);
      setError("No se pudo comprobar si hay una versión nueva");
      setStatus("error");
      return null;
    }
  }, []);

  const install = useCallback(async () => {
    const found = pending.current;
    if (!found) return;

    setStatus("downloading");
    setProgress(null);
    setError(null);

    let total = 0;
    let received = 0;

    try {
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          if (total > 0) setProgress(0);
          return;
        }

        if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(received / total, 1));
        }
      });

      // Reached only on macOS and Linux. The Windows installer replaces the
      // running executable, which means the process is gone before this line.
      await relaunch();
    } catch (cause) {
      console.error("Failed to install the update:", cause);
      setError("No se pudo instalar la actualización");
      setStatus("error");
    }
  }, []);

  const value = useMemo<Updater>(
    () => ({ status, update, progress, error, check: runCheck, install }),
    [status, update, progress, error, runCheck, install],
  );

  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>;
}
