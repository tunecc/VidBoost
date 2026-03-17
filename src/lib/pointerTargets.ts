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

const GENERIC_INTERACTIVE_SELECTORS = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="link"]',
    'input',
    'textarea',
    'select',
    'label',
    'summary',
    'details'
].join(',');

const PROTECTED_CURSOR_VALUES = new Set([
    'text',
    'vertical-text',
    'grab',
    'grabbing',
    'move',
    'all-scroll'
]);

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

export function eventTargetsGenericInteractive(e: Event): boolean {
    return eventMatchesSelectors(e, [GENERIC_INTERACTIVE_SELECTORS]);
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
