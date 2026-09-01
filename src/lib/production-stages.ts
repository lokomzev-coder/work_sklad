export interface StageProgress {
  totalQuantity: number;
  completedQuantity: number;
  /** How much can be worked on right now. */
  availableQuantity: number;
  /** How much is still waiting on the preceding stage to complete. */
  blockedQuantity: number;
  isLast: boolean;
}

/**
 * Pure, DB-free stage-progress math, shared by completeProductionStage
 * (server-side validation) and the UI (display). Deliberately not stored on
 * ProductionStage — always derived from totalQuantity/completedQuantity of
 * this stage and the preceding one, so there's no denormalized number that
 * can drift out of sync.
 */
export function computeStageProgress(
  stage: { totalQuantity: number; completedQuantity: number; position: number },
  precedingStage: { completedQuantity: number } | null,
  maxPosition: number,
): StageProgress {
  const unlocked = precedingStage ? precedingStage.completedQuantity : stage.totalQuantity;
  const availableQuantity = Math.max(0, Math.min(unlocked, stage.totalQuantity) - stage.completedQuantity);
  const blockedQuantity = stage.totalQuantity - stage.completedQuantity - availableQuantity;
  return {
    totalQuantity: stage.totalQuantity,
    completedQuantity: stage.completedQuantity,
    availableQuantity,
    blockedQuantity,
    isLast: stage.position === maxPosition,
  };
}
