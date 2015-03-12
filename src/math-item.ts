/// <reference path="utils.ts" />

interface ShadowRoot extends DocumentFragment { }

interface HTMLElement {
    createShadowRoot(): ShadowRoot;
    shadowRoot: ShadowRoot;
}

interface GetSourceOptions {
    render?: boolean;
    markup?: boolean;
    type?: string;
}

interface IHTMLMathItemElement extends HTMLElement {
    render(): void;
    clean(): void;
    getSources(options?: GetSourceOptions): IHTMLMathSourceElement[];
    getMainMarkup(): { type: string; markup: string; };
}

interface HTMLMathItemElementStatic {
    prototype: {
        render(): void;
        clean(): void;
        getSources(options?: GetSourceOptions): IHTMLMathSourceElement[];
        getMainMarkup(): { type: string; markup: string; };
    }
    manualCreate(mathItem: IHTMLMathItemElement, deep?: boolean): void;
    manualAttach(mathItem: IHTMLMathItemElement, deep?: boolean): void;
}

interface IHTMLMathSourceElement extends HTMLElement {
}

interface HTMLMathSourceElementStatic {
    manualCreate(mathSource: IHTMLMathSourceElement): void;
    manualAttach(mathSource: IHTMLMathSourceElement): void;
}

interface Document {
    registerElement(tagName: string, options: any): any;
    registerElement(tagName: 'math-item', options: any): HTMLMathItemElementStatic;
    registerElement(tagName: 'math-source', options: any): HTMLMathSourceElementStatic;
    createElement(tagName: 'math-item'): IHTMLMathItemElement;
    createElement(tagName: 'math-source'): IHTMLMathSourceElement;
}

interface Window {
    HTMLMathItemElement: HTMLMathItemElementStatic;
    HTMLMathSourceElement: HTMLMathSourceElementStatic;
}

declare var HTMLMathItemElement: HTMLMathItemElementStatic;
declare var HTMLMathSourceElement: HTMLMathSourceElementStatic;

module FlorianMath {

    export var
        MATH_ITEM_TAG = 'math-item',
        MATH_SOURCE_TAG = 'math-source',
        MIME_TYPE_PLAIN = 'text/plain',
        MIME_TYPE_HTML = 'text/html',
        MIME_TYPE_TEX = 'application/x-tex',
        MIME_TYPE_MATHML = 'application/mathml+xml';

    var global: Window = window,
        doc: Document = document,
        counter = 0;

    export interface IHTMLMathItemElementPrivate extends IHTMLMathItemElement {
        _private: {
            updatePending: boolean;
            firstPass: boolean;
            id?: number;
        };
    }

    function iterateChildren(n: Node, fn: (c: Node) => void) {
        var c = n.firstChild, next;
        while (c) {
            next = c.nextSibling;
            fn(c);
            c = next;
        }
    }

    function iterateSourceElements(el: IHTMLMathItemElement, fn: (source: IHTMLMathSourceElement) => void) {
        iterateChildren(el, (c: Node) => {
            if (c.nodeType === 1 && (<Element> c).tagName.toLowerCase() === MATH_SOURCE_TAG)
                fn(<IHTMLMathSourceElement> c);
        });
    }

    function mathItemRenderDone(mathItem: IHTMLMathItemElement) {
    }

    export function mathItemInsertContent(mathItem: IHTMLMathItemElement): { element: Node; done: () => void; } {
        mathItem.clean();
        return {
            element: mathItem.shadowRoot || (mathItem.createShadowRoot ? mathItem.createShadowRoot() : mathItem),
            done: () => {
                mathItemRenderDone(mathItem);
            }
        };
    }

    export function mathItemShowSources(mathItem: IHTMLMathItemElement, sources: IHTMLMathSourceElement[]) {
        mathItem.clean();
        each(sources, (source: IHTMLMathSourceElement) => {
            source.style.display = '';
        });
        if (mathItem.shadowRoot)
            mathItem.shadowRoot.appendChild(document.createElement('content'));
        mathItemRenderDone(mathItem);
    }

    function doPreview(mathItem: IHTMLMathItemElement) {
        var previewSources = mathItem.getSources({ render: false, markup: false });
        if (previewSources.length) {
            each(previewSources, (source: IHTMLMathSourceElement) => {
                source.style.display = '';
            });
        }
    }

    function mathItemEnqueueRender(mathItem: IHTMLMathItemElementPrivate) {
        if (!mathItem._private.updatePending) {
            mathItem._private.updatePending = true;
            async(() => {
                mathItem._private.updatePending = false;
                if (mathItem._private.firstPass) {
                    mathItem._private.firstPass = false;
                    //normalize(el);
                    doPreview(mathItem);
                }
                mathItem.render();
            });
        }
    }

    export function getSourceType(source: IHTMLMathSourceElement) {
        return source.getAttribute('type') || MIME_TYPE_HTML;
    }

    export function getSourceMarkup(source: IHTMLMathSourceElement): string {
        var value = source.firstChild && !source.firstChild.nextSibling && source.firstChild.nodeType === 3 ? source.firstChild.nodeValue : source.innerHTML;
        return trim(value);
    }

    function render() {
        var toShow = (<IHTMLMathItemElement> this).getSources({ render: true, type: MIME_TYPE_HTML });
        if (toShow.length)
            mathItemShowSources(<IHTMLMathItemElement> this, toShow);
    };

    function clean() {
        var shadow: Node = (<IHTMLMathItemElement> this).shadowRoot;
        iterateChildren(<IHTMLMathItemElement> this, (c: Node) => {
            if (c.nodeType === 1 && (<Element> c).tagName.toLowerCase() === MATH_SOURCE_TAG)
                (<HTMLElement> c).style.display = 'none';
            else
                (<IHTMLMathItemElement> this).removeChild(c);
        });
        if (shadow) {
            iterateChildren(shadow, (c: Node) => {
                shadow.removeChild(c);
            });
        }
    }

    /*
     * render  markup  usage
     * -       -       'preview'
     * +       -       'nomarkup'
     * -       +       'norender'
     * +       +       ''
     */
    function getSources(options?: GetSourceOptions): IHTMLMathSourceElement[] {
        var result: IHTMLMathSourceElement[] = [], render, markup, encoding;
        options = options || {};
        if (options.render !== undefined) render = !!options.render;
        if (options.markup !== undefined) markup = !!options.markup;
        encoding = options.type;
        iterateSourceElements(this, (source: IHTMLMathSourceElement) => {
            var usage = source.getAttribute('usage');
            if (render !== undefined && render === (usage === 'preview' || usage === 'norender')) return;
            if (markup !== undefined && markup === (usage === 'preview' || usage === 'nomarkup')) return;
            if (encoding !== undefined && encoding !== getSourceType(source)) return;
            result.push(source);
        });
        return result;
    }

    var MARKUP_PREFERENCE = [MIME_TYPE_MATHML, MIME_TYPE_TEX, MIME_TYPE_HTML];

    function getMainMarkup(): { type: string; markup: string; } {
        var k, type, sources;
        for (k = 0; k < MARKUP_PREFERENCE.length; k++) {
            type = MARKUP_PREFERENCE[k];
            sources = (<IHTMLMathItemElement> this).getSources({ type: type, markup: true });
            if (sources.length)
                return { type: type, markup: getSourceMarkup(sources[0]) };
        }
        return null;
    }

    function baseItemCreate() {
        (<IHTMLMathItemElementPrivate> this)._private = {
            updatePending: false,
            firstPass: true,
            id: counter++
        };
    }

    function baseItemAttach() {
        mathItemEnqueueRender(<IHTMLMathItemElementPrivate> this);
    }

    function baseSourceCreate() {
        (<IHTMLMathSourceElement> this).style.display = 'none';
    }

    function baseSourceAttach() {
        var usage = (<IHTMLMathSourceElement> this).getAttribute('usage') || '';
        if (usage === '' || usage === 'nomarkup') {
            var parent = (<IHTMLMathSourceElement> this).parentElement;
            if (parent && parent.tagName.toLowerCase() === MATH_ITEM_TAG)
                mathItemEnqueueRender(<IHTMLMathItemElementPrivate> <IHTMLMathItemElement> parent);
        }
    }

    var initializedResolver: () => void;
    
    export var initialized: () => IPromise<void> = (function () {
        var promise = new Promise<void>((resolve: () => void) => {
            initializedResolver = resolve;
        });
        return () => promise;
    })();

    if (doc.registerElement) {

        var MathItemPrototype = Object.create(HTMLElement.prototype, {
            createdCallback: { enumerable: true, value: baseItemCreate },
            attachedCallback: { enumerable: true, value: baseItemAttach },
            render: { enumerable: true, value: render, writable: true },
            clean: { enumerable: true, value: clean, writable: true },
            getSources: { enumerable: true, value: getSources, writable: true },
            getMainMarkup: { enumerable: true, value: getMainMarkup, writable: true }
        });

        var MathSourcePrototype = Object.create(HTMLElement.prototype, {
            createdCallback: { enumerable: true, value: baseSourceCreate },
            attachedCallback: { enumerable: true, value: baseSourceAttach }
        });

        global.HTMLMathItemElement = doc.registerElement(FlorianMath.MATH_ITEM_TAG, { prototype: MathItemPrototype });
        global.HTMLMathSourceElement = doc.registerElement(FlorianMath.MATH_SOURCE_TAG, { prototype: MathSourcePrototype });

        global.HTMLMathItemElement.manualCreate =
        global.HTMLMathItemElement.manualAttach =
        global.HTMLMathSourceElement.manualCreate =
        global.HTMLMathSourceElement.manualAttach = function () { };

        initializedResolver();

    } else {

        (function () {

            function renderProxy() {
                global.HTMLMathItemElement.prototype.render.call(this);
            }

            function cleanProxy() {
                global.HTMLMathItemElement.prototype.clean.call(this);
            }

            function getSourcesProxy(options?: GetSourceOptions) {
                return global.HTMLMathItemElement.prototype.getSources.call(this, options);
            }

            function getMainMarkup() {
                return global.HTMLMathItemElement.prototype.getMainMarkup.call(this);
            }

            function manualItemCreate(mathItem: IHTMLMathItemElement, deep?: boolean) {
                mathItem.render = renderProxy;
                mathItem.clean = cleanProxy;
                mathItem.getSources = getSourcesProxy;
                mathItem.getMainMarkup = getMainMarkup;
                baseItemCreate.call(mathItem);
                if (deep) {
                    iterateSourceElements(this, (source: IHTMLMathSourceElement) => {
                        manualSourceCreate(source);
                    });
                }
            }

            function manualItemAttach(mathItem: IHTMLMathItemElement, deep?: boolean) {
                baseItemAttach.call(mathItem);
                if (deep) {
                    iterateSourceElements(this, (source: IHTMLMathSourceElement) => {
                        manualSourceAttach(source);
                    });
                }
            }

            function manualSourceCreate(mathSource: IHTMLMathSourceElement) {
                baseSourceCreate.call(mathSource);
            }

            function manualSourceAttach(mathSource: IHTMLMathSourceElement) {
                baseSourceAttach.call(mathSource);
            }

            doc.createElement(FlorianMath.MATH_ITEM_TAG);
            doc.createElement(FlorianMath.MATH_SOURCE_TAG);

            global.HTMLMathItemElement = <any> function () {
                throw Error('Use document.createElement instead');
            };
            global.HTMLMathItemElement.manualCreate = manualItemCreate;
            global.HTMLMathItemElement.manualAttach = manualItemAttach;
            global.HTMLMathItemElement.prototype.render = render;
            global.HTMLMathItemElement.prototype.clean = clean;
            global.HTMLMathItemElement.prototype.getSources = getSources;
            global.HTMLMathItemElement.prototype.getMainMarkup = getMainMarkup;

            global.HTMLMathSourceElement = <any> function () {
                throw Error('Use document.createElement instead');
            };
            global.HTMLMathSourceElement.manualCreate = manualSourceCreate;
            global.HTMLMathSourceElement.manualAttach = manualSourceAttach;

            domReady().then(() => {
                each(doc.querySelectorAll(MATH_ITEM_TAG),(mathItem: IHTMLMathItemElement) => {
                    manualItemCreate(mathItem, true);
                    manualItemAttach(mathItem, true);
                });
                initializedResolver();
            });

        })();

    }

}
