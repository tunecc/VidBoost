/**
 * Shadow DOM builder for Svelte components
 * Provides style isolation and clean component mounting
 */
export class ShadowHostBuilder {
  private shadowRoot: ShadowRoot | null = null;
  private hostElement: HTMLElement | null = null;
  private component: any = null;

  private constructor() {}

  static create(): ShadowHostBuilder {
    return new ShadowHostBuilder();
  }

  withStyles(css: string): this {
    if (this.shadowRoot) {
      const style = document.createElement('style');
      style.textContent = css;
      this.shadowRoot.appendChild(style);
    }
    return this;
  }

  mount(Component: any, props: any, target: HTMLElement): this {
    this.hostElement = target;
    this.shadowRoot = target.attachShadow({ mode: 'open' });

    // Create container for Svelte component
    const container = document.createElement('div');
    this.shadowRoot.appendChild(container);

    // Mount Svelte component
    this.component = new Component({
      target: container,
      props
    });

    return this;
  }

  destroy(): void {
    if (this.component && this.component.$destroy) {
      this.component.$destroy();
      this.component = null;
    }

    if (this.shadowRoot) {
      while (this.shadowRoot.firstChild) {
        this.shadowRoot.removeChild(this.shadowRoot.firstChild);
      }
      this.shadowRoot = null;
    }

    this.hostElement = null;
  }

  getShadowRoot(): ShadowRoot | null {
    return this.shadowRoot;
  }

  getComponent(): any {
    return this.component;
  }
}
