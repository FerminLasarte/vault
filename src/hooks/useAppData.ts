import { useContext } from "react";
import {
  AppActionsContext,
  AppDataContext,
  AppStatusContext,
  type AppActions,
  type AppData,
  type AppStatus,
} from "@/context/AppDataContext";

// Three hooks for the provider's three halves, so a component re-renders only
// when what it reads changes: the data on a write, the status while one runs,
// the actions never.
function required<T>(value: T | null, hook: string): T {
  if (value === null) {
    throw new Error(`${hook} must be used within an AppDataProvider`);
  }
  return value;
}

export function useAppData(): AppData {
  return required(useContext(AppDataContext), "useAppData");
}

export function useAppActions(): AppActions {
  return required(useContext(AppActionsContext), "useAppActions");
}

export function useAppStatus(): AppStatus {
  return required(useContext(AppStatusContext), "useAppStatus");
}
