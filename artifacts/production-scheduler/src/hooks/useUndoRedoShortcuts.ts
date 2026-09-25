import { useEffect } from "react";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Ctrl/Cmd+Z annulla, Ctrl/Cmd+Shift+Z o Ctrl/Cmd+Y ripete. Ignorato mentre si
 * scrive in un campo di testo, per non rompere l'annulla nativo del browser
 * dentro gli input (es. mentre si digita un nome in un dialog).
 */
export function useUndoRedoShortcuts(onUndo: () => void, onRedo: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) { e.preventDefault(); onRedo(); }
      else if (key === "z") { e.preventDefault(); onUndo(); }
      else if (key === "y") { e.preventDefault(); onRedo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onUndo, onRedo]);
}
