type ObserverScope = string;
type ObserverName = string;

type ManagedObserver = {
    scope: ObserverScope;
    name: ObserverName;
    observer: MutationObserver;
    onDisconnect?: () => void;
};

type ObserveParams = {
    scope: ObserverScope;
    name: ObserverName;
    target: Node;
    options: MutationObserverInit;
    callback: MutationCallback;
    onDisconnect?: () => void;
};

/**
 * Centralized MutationObserver lifecycle manager.
 * - Named observers avoid accidental duplicates.
 * - Scope allows grouped teardown for SPA-style feature lifecycles.
 */
export class ObserverManager {
    private observers = new Map<string, ManagedObserver>();

    constructor(private readonly owner: string = 'observer-manager') { }

    private key(scope: ObserverScope, name: ObserverName): string {
        return `${this.owner}::${scope}::${name}`;
    }

    has(scope: ObserverScope, name: ObserverName): boolean {
        return this.observers.has(this.key(scope, name));
    }

    observe(params: ObserveParams): MutationObserver {
        this.disconnect(params.scope, params.name);
        const observer = new MutationObserver(params.callback);
        observer.observe(params.target, params.options);
        const managed: ManagedObserver = {
            scope: params.scope,
            name: params.name,
            observer,
            onDisconnect: params.onDisconnect
        };
        this.observers.set(this.key(params.scope, params.name), managed);
        return observer;
    }

    disconnect(scope: ObserverScope, name: ObserverName): void {
        const key = this.key(scope, name);
        const managed = this.observers.get(key);
        if (!managed) return;
        managed.observer.disconnect();
        managed.onDisconnect?.();
        this.observers.delete(key);
    }

    disconnectScope(scope: ObserverScope): void {
        for (const [key, managed] of this.observers) {
            if (managed.scope !== scope) continue;
            managed.observer.disconnect();
            managed.onDisconnect?.();
            this.observers.delete(key);
        }
    }

    disconnectAll(): void {
        for (const [key, managed] of this.observers) {
            managed.observer.disconnect();
            managed.onDisconnect?.();
            this.observers.delete(key);
        }
    }
}
