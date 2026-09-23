import { useContext, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ViewStateContext } from "@/context/ViewStateContext";
import type { View } from "@/lib/navigation";

// `useState` for what a view should still be showing when the user comes back
// to it (see ViewStateProvider). The key names the view first, so two views
// can never share an entry by accident.
//
// The value lives in the view like any other state, and is copied out once
// each change has been committed. Nothing reads the copy until the view is
// opened again, so there is no hurry, and an effect is where a component may
// write to something that is not its own.
export function useViewState<T>(
  key: `${View}.${string}`,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const memory = useContext(ViewStateContext);
  if (memory === null) {
    throw new Error("useViewState must be used within a ViewStateProvider");
  }

  const [value, setValue] = useState<T>(() =>
    memory.has(key) ? (memory.get(key) as T) : initial,
  );

  useEffect(() => {
    memory.set(key, value);
  }, [memory, key, value]);

  return [value, setValue];
}
