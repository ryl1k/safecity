// Thin haptics wrappers. Best-effort: failures (e.g. unsupported device) are swallowed.
import * as Haptics from 'expo-haptics';

export function tapFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function warningFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
