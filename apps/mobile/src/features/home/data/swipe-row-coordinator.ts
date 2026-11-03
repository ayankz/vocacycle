export class SwipeRowCoordinator {
  private current: { id: string; close(): void } | null = null;
  open(id: string, close: () => void) {
    if (this.current?.id !== id) this.current?.close();
    this.current = { id, close };
  }
  dispose(id: string) { if (this.current?.id === id) this.current = null; }
}
