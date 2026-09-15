import { useContext } from "react";
import { UpdaterContext, type Updater } from "@/context/UpdaterContext";

export function useUpdater(): Updater {
  const context = useContext(UpdaterContext);
  if (!context) {
    throw new Error("useUpdater must be used within an UpdaterProvider");
  }
  return context;
}
