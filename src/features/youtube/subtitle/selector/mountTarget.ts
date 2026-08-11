type ParentLinkedElement = {
    parentElement: ParentLinkedElement | null;
};

export function resolveSubtitleButtonMountTarget<T extends ParentLinkedElement>(
    controls: T,
    settingsButton: T | null
): { container: T; reference: T | null } {
    const settingsParent = settingsButton?.parentElement;
    let current = settingsParent;

    while (current && current !== controls) {
        current = current.parentElement;
    }

    if (settingsButton && settingsParent && current === controls) {
        return {
            container: settingsParent as T,
            reference: settingsButton
        };
    }

    return { container: controls, reference: null };
}
