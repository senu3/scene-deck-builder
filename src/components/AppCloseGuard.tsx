import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  buildProjectCloseConfirmContent,
  getCloseGuardResult,
} from '../features/project/closeGuard';
import {
  onAppCloseRequestBridge,
  respondToAppCloseRequestBridge,
} from '../features/platform/electronGateway';
import { useDialog } from '../ui';

export default function AppCloseGuard() {
  const {
    projectLoaded,
    projectName,
    vaultPath,
    scenes,
    sceneOrder,
    cutRuntimeById,
    targetTotalDurationSec,
    getSourcePanelState,
    lastPersistedSnapshot,
  } = useStore();
  const { confirm } = useDialog();

  useEffect(() => {
    const unsubscribe = onAppCloseRequestBridge(async () => {
      const result = getCloseGuardResult({
        projectLoaded,
        lastPersistedSnapshot,
        currentProject: {
          projectName,
          vaultPath,
          scenes,
          sceneOrder,
          cutRuntimeById,
          targetTotalDurationSec,
          getSourcePanelState,
        },
        target: 'app',
      });

      if (result.kind === 'blocked') {
        respondToAppCloseRequestBridge(false);
        return;
      }
      if (result.kind === 'confirm-warning') {
        const content = buildProjectCloseConfirmContent('app');
        const confirmed = await confirm({
          ...content,
          variant: 'warning',
        });
        respondToAppCloseRequestBridge(confirmed);
        return;
      }
      respondToAppCloseRequestBridge(true);
    });
    return unsubscribe ?? undefined;
  }, [
    confirm,
    cutRuntimeById,
    getSourcePanelState,
    lastPersistedSnapshot,
    projectLoaded,
    projectName,
    sceneOrder,
    scenes,
    targetTotalDurationSec,
    vaultPath,
  ]);

  return null;
}
