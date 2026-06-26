export function installDomMutationGuard() {
  if (typeof window === 'undefined') return;
  const guardedWindow = window as typeof window & {
    __paperlensDomMutationGuardInstalled?: boolean;
  };
  if (guardedWindow.__paperlensDomMutationGuardInstalled) return;
  guardedWindow.__paperlensDomMutationGuardInstalled = true;

  const removeChild = Node.prototype.removeChild;
  const insertBefore = Node.prototype.insertBefore;
  const appendChild = Node.prototype.appendChild;

  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return appendChild.call(this, newNode) as T;
    }
    return insertBefore.call(this, newNode, referenceNode) as T;
  } as typeof Node.prototype.insertBefore;
}

installDomMutationGuard();
