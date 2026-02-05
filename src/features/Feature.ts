export interface Feature {
    mount(): void;
    unmount(): void;
    updateSettings(settings: any): void;
}
