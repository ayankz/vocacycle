// Share Home's optimistic removal with other word readers, without another journal owner.
let pendingId: number | null = null;
const listeners = new Set<() => void>();
export const getPendingRemoval = () => pendingId;
export const subscribePendingRemoval = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setPendingRemoval(id: number | null) {
  if (pendingId === id) return;
  pendingId = id;
  listeners.forEach(listener => listener());
}
