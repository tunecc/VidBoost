const EDITABLE_SELECTORS = [
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
    '[role="searchbox"]'
].join(',');

const HTML_INTERACTIVE_SELECTORS = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'label',
    'summary',
    'details',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]:not([contenteditable="false"])'
].join(',');

const INTERACTIVE_ROLE_VALUES = new Set([
    'button',
    'link',
    'menu',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'checkbox',
    'radio',
    'switch',
    'option',
    'tab',
    'tablist',
    'textbox',
    'searchbox',
    'combobox',
    'listbox',
    'slider',
    'spinbutton',
    'dialog',
    'toolbar'
]);

const PROTECTED_CURSOR_VALUES = new Set([
    'text',
    'vertical-text',
    'grab',
    'grabbing',
    'move',
    'all-scroll'
]);

export const INTERACTION_ROOT_ATTRIBUTE = 'data-vb-interaction-root';

type CaretPositionLike = {
    offsetNode: Node | null;
};

type CaretPointDocument = Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPositionLike | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function normalizeCssValue(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase();
}

function normalizeCursorValue(value: string | null | undefined): string {
    const normalized = normalizeCssValue(value);
    if (!normalized) return '';
    const segments = normalized.split(',');
    return segments[segments.length - 1].trim();
}

function getRoleTokens(element: Element): string[] {
    const role = normalizeCssValue(element.getAttribute('role'));
    if (!role) return [];
    return role.split(/\s+/).filter(Boolean);
}

function isEditableElement(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return false;

    const tag = element.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (element.isContentEditable) return true;
    return element.closest(EDITABLE_SELECTORS) !== null;
}

function isElementRelatedToEventPath(element: Element, pathElements: Element[]): boolean {
    return pathElements.some((pathElement) =>
        pathElement === element
        || pathElement.contains(element)
        || element.contains(pathElement)
    );
}

function getCaretNodeFromPoint(event: MouseEvent): Node | null {
    const doc = document as CaretPointDocument;

    if (typeof doc.caretPositionFromPoint === 'function') {
        return doc.caretPositionFromPoint(event.clientX, event.clientY)?.offsetNode || null;
    }

    if (typeof doc.caretRangeFromPoint === 'function') {
        return doc.caretRangeFromPoint(event.clientX, event.clientY)?.startContainer || null;
    }

    return null;
}

function getPointerElement(event: MouseEvent): Element | null {
    const fromPoint = document.elementFromPoint(event.clientX, event.clientY);
    if (fromPoint) return fromPoint;

    const [firstElement] = getEventElements(event);
    return firstElement || null;
}

function hasProtectedCursor(element: Element): boolean {
    let current: Element | null = element;

    while (current) {
        const cursor = normalizeCursorValue(window.getComputedStyle(current).cursor);
        if (PROTECTED_CURSOR_VALUES.has(cursor)) {
            return true;
        }
        current = current.parentElement;
    }

    return false;
}

function isManagedInteractionRoot(element: Element): boolean {
    return element.closest(`[${INTERACTION_ROOT_ATTRIBUTE}]`) !== null;
}

function hasInteractiveRole(element: Element): boolean {
    return getRoleTokens(element).some((role) => INTERACTIVE_ROLE_VALUES.has(role));
}

function hasInteractiveAriaState(element: Element): boolean {
    return element.hasAttribute('aria-haspopup')
        || element.hasAttribute('aria-controls')
        || element.hasAttribute('aria-expanded');
}

function isGenericInteractiveElement(element: Element): boolean {
    if (isManagedInteractionRoot(element)) return true;
    if (element.matches(HTML_INTERACTIVE_SELECTORS)) return true;
    if (hasInteractiveRole(element)) return true;
    return hasInteractiveAriaState(element);
}

function isSelectableTextContainer(element: Element): boolean {
    let current: Element | null = element;

    while (current) {
        if (isEditableElement(current)) return true;

        if (current instanceof HTMLElement) {
            const style = window.getComputedStyle(current);
            const userSelect = normalizeCssValue(style.userSelect);

            if (userSelect === 'none') return false;
            if (userSelect === 'text' || userSelect === 'all' || userSelect === 'contain') {
                return true;
            }

            const cursor = normalizeCssValue(style.cursor);
            if (cursor === 'text' || cursor === 'vertical-text') return true;
        }

        current = current.parentElement;
    }

    // If the browser can resolve a caret position onto real text in the event path,
    // treat it as selectable text and do not let fast-pause steal the click.
    return true;
}

export function getEventElements(e: Event): Element[] {
    const out: Element[] = [];
    const visited = new Set<Element>();

    const addElement = (node: EventTarget | null) => {
        if (!node) return;

        let element: Element | null = null;
        if (node instanceof Element) element = node;
        else if (node instanceof Node) element = node.parentElement;

        if (!element || visited.has(element)) return;

        visited.add(element);
        out.push(element);
    };

    addElement(e.target);
    const path = e.composedPath?.() || [];
    path.forEach((node) => addElement(node));

    return out;
}

export function eventMatchesSelectors(e: Event, selectors: string[]): boolean {
    if (selectors.length === 0) return false;

    const elements = getEventElements(e);
    return elements.some((element) => selectors.some((selector) => element.closest(selector) !== null));
}

export function markInteractionRoot(element: HTMLElement) {
    element.setAttribute(INTERACTION_ROOT_ATTRIBUTE, '');
}

export function installInteractionRootIsolation(element: HTMLElement): () => void {
    markInteractionRoot(element);

    const stopPropagation = (event: Event) => {
        event.stopPropagation();
    };

    const eventTypes = ['mousedown', 'click', 'dblclick'] as const;
    eventTypes.forEach((eventType) => {
        element.addEventListener(eventType, stopPropagation, true);
    });

    return () => {
        eventTypes.forEach((eventType) => {
            element.removeEventListener(eventType, stopPropagation, true);
        });
    };
}

export function eventTargetsGenericInteractive(e: Event): boolean {
    const elements = getEventElements(e);
    return elements.some((element) => isGenericInteractiveElement(element));
}

export function eventTargetsSelectableText(e: Event): boolean {
    if (!(e instanceof MouseEvent)) return false;

    const pathElements = getEventElements(e);

    if (pathElements.some((element) => isEditableElement(element))) {
        return true;
    }

    const caretNode = getCaretNodeFromPoint(e);
    if (!caretNode || !caretNode.textContent?.trim()) return false;

    const caretElement = caretNode instanceof Element ? caretNode : caretNode.parentElement;
    if (!caretElement) return false;
    if (!isElementRelatedToEventPath(caretElement, pathElements)) return false;

    return isSelectableTextContainer(caretElement);
}

export function eventTargetsProtectedCursor(e: Event): boolean {
    if (!(e instanceof MouseEvent)) return false;

    const pointerElement = getPointerElement(e);
    if (!pointerElement) return false;

    return hasProtectedCursor(pointerElement);
}

export function eventHitsVideoSurface(
    e: Event,
    video: HTMLVideoElement | null | undefined
): boolean {
    if (!(e instanceof MouseEvent) || !video) return false;

    const pointerElement = getPointerElement(e);
    if (!pointerElement) return false;

    return pointerElement === video || pointerElement.closest('video') === video;
}
