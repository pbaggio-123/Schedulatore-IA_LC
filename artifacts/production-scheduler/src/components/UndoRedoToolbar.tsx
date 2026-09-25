import { Button } from "@/components/ui/button";
import { Undo2, Redo2 } from "lucide-react";

interface UndoRedoToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  testIdPrefix: string;
}

export default function UndoRedoToolbar({ canUndo, canRedo, onUndo, onRedo, testIdPrefix }: UndoRedoToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline" size="sm" className="h-8 px-2"
        disabled={!canUndo} onClick={onUndo}
        title="Annulla (Ctrl+Z)" data-testid={`button-undo-${testIdPrefix}`}
      >
        <Undo2 size={14} />
      </Button>
      <Button
        variant="outline" size="sm" className="h-8 px-2"
        disabled={!canRedo} onClick={onRedo}
        title="Ripeti (Ctrl+Shift+Z)" data-testid={`button-redo-${testIdPrefix}`}
      >
        <Redo2 size={14} />
      </Button>
    </div>
  );
}
