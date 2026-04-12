import { useEffect, useRef } from "react";
import { spcStore } from "../store/spc-store.js";
import { bootApp } from "../store/actions.js";

export default function useAppBoot() {
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true;
      bootApp();
    }
  }, []);

  // Unsaved changes guard
  useEffect(() => {
    const handler = (e) => {
      if (spcStore.getState().dataPrep.unsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
