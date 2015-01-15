﻿/// <reference path="math-ui-core.ts" />

// Built-in extensions

module MathUI {
    'use strict';

    var $: QueryStaticBase = microJQ, _ = getUtils();
    queryLibReady(qlib => $ = qlib);

    class PlainHandler extends Handler {
        canHandle(el: HTMLElement): boolean {
            return true;  // act as a catch-all
        }
        getSources(el: HTMLElement): IPromise<SourceData[]> {
            return Promise.resolve([{ type: 'HTML', source: el.innerHTML }]);
        }
    }

    class MathMLHandler extends Handler {
        static getMathRoot(el: HTMLElement): Element {
            var children = $(el).children();
            if (children.length === 1 && children[0].nodeName.toLowerCase() === 'math')
                return children[0];
            if (children.length && children[0] instanceof HTMLUnknownElement) {
                var doc = $.parseXML(el.innerHTML);
                if (doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'math')
                    return doc.documentElement;
            }
            return null;
        }
        canHandle(el: HTMLElement): boolean {
            return MathMLHandler.getMathRoot(el) !== null;
        }
        getSources(el: HTMLElement): IPromise<SourceData[]> {
            var root = MathMLHandler.getMathRoot(el);
            if (root === null)
                return Promise.resolve([]);
            return Promise.resolve([
                { type: 'MathML', subtype: 'original', source: el.innerHTML },
                { type: 'MathML', subtype: 'prettified', source: prettifyMathML(root) }
            ]);            
        }
    }

    registerHandler('plain-html', new PlainHandler());
    registerHandler('native-mathml', new MathMLHandler());
}

// MathJax extensions

module MathUI {
    'use strict';

    interface ICallback {
        After(fn: () => void, ...cbs: any[]);
    }

    interface JaxRoot {
        toMathML? (space: string): string;
    }

    interface Jax {
        root: JaxRoot;
        originalText: string;
    }

    interface IHub {
        Queue(fn: any[], ...fns: any[]);
        getAllJax(el: Element): Jax[];
    }

    interface IMathJax {
        Callback: ICallback;
        Hub: IHub;
    }

    declare var MathJax: IMathJax;

    var $: QueryStaticBase = microJQ;
    queryLibReady(qlib => $ = qlib);

    class MathJaxHandler extends Handler {
        constructor(private original: string[], private internal: string[]) {
            super();
        }
        init(el: HTMLElement): Promise<void> {
            var resolver, p = new Promise<void>(resolve => { resolver = resolve; });
            MathJax.Hub.Queue(['Typeset', MathJax.Hub, el], resolver);
            return p;
        }
        clonePresentation(from: HTMLElement, to: HTMLElement) {
            var script = $(from).find('script[type]');
            $(to).append(script.clone().removeAttr('id').removeAttr('MathJax'));
            MathJax.Hub.Queue(['Typeset', MathJax.Hub, to]);
        }
        getSources(el: HTMLElement): IPromise<SourceData[]> {
            var result: SourceData[] = [];
            var jaxs = MathJax.Hub.getAllJax(el);
            if (jaxs && jaxs.length === 1) {
                var jax = jaxs[0];
                result.push({ type: this.original[0], subtype: this.original[1], source: jax.originalText });
                if (jax.root.toMathML) {
                    result.push({ type: this.internal[0], subtype: this.internal[1], source: '' });
                    return new Promise<SourceData[]>((resolve: (value: SourceData[]) => void) => {
                        function getMathML() {
                            try {
                                result[1].source = jax.root.toMathML('');
                                resolve(result);
                            } catch (err) {
                                // to trigger: https://groups.google.com/d/msg/mathjax-dev/ZYirx681dv0/RWspFIVwA2AJ
                                if (!err.restart) { throw err; }
                                MathJax.Callback.After(getMathML, err.restart);
                            }
                        }
                        getMathML();
                    });
                }
            }
            return Promise.resolve(result);
        }
    }

    MathUI.registerHandler('tex', new MathJaxHandler(['TeX', 'original'], ['MathML', 'MathJax']));
    MathUI.registerHandler('mml', new MathJaxHandler(['MathML', 'original'], ['MathML', 'MathJax']));
}

// EqnStore extension

module MathUI {
    'use strict';

    var $: QueryStaticBase = microJQ;
    queryLibReady(qlib => $ = qlib);

    class EqnStoreHandler extends Handler {
        /*init(el: HTMLElement): Promise<void> {
            var imgs = $(el).find('img');
            if (imgs.length === 1) {
                var img = <HTMLImageElement> imgs[0];
                if (!img.complete) {
                    return new Promise<void>((resolve: () => void, reject: () => void) => {
                        $(img).on('load', () => { resolve(); }).on('error', () => { reject(); });
                    });
                }
            }
        }*/
        clonePresentation(from: Element, to: Element) {
            $(to).append($(from).find('img').clone());
        }
        getSources(el: HTMLElement): IPromise<SourceData[]> {
            var result: SourceData[] = [];
            var script = $(el).find('script[type="math/mml"]');
            if (script.length === 1) {
                var src = script.text(), doc = $.parseXML(src);
                result.push({
                    type: 'MathML',
                    subtype: 'original',
                    source: src
                });
                if (doc && doc.documentElement && doc.documentElement.nodeName === 'math')
                    result.push({
                        type: 'MathML',
                        subtype: 'prettified',
                        source: prettifyMathML(doc.documentElement)
                    });
            }
            return Promise.resolve(result);
        }
    }

    MathUI.registerHandler('eqnstore', new EqnStoreHandler());
}