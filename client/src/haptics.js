import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

function safe(promise) {
  Promise.resolve(promise).catch(() => {});
}

export function tap() {
  safe(Haptics.impact({ style: ImpactStyle.Medium }));
}

export function tick() {
  safe(Haptics.impact({ style: ImpactStyle.Light }));
}

export function reject() {
  safe(Haptics.notification({ type: NotificationType.Error }));
}
