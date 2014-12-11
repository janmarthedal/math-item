﻿/// <reference path="math-ui-microjq.ts" />
/// <reference path="../../typings/jquery.d.ts" />

module MathUI {
    'use strict';

    export interface QueryStaticBase {
        (element: Element): MicroJQ;
        (element: Node): MicroJQ;
        (elements: Element[]): MicroJQ;
    }

    var $: QueryStaticBase = microJQ;
    var _ = getUtils();

    export function get$(): QueryStaticBase {
        return $;
    }

    export class Handler {
        canHandle(el: Element): boolean {
            // disable auto-discover by default
            return false;
        }
        init(el: Element) {
        }
        clonePresentation(from: Element, to: Element) {
            $(to).append($(from).contents().clone());
        }
        getSourceTypes(el?: Element): string[] {
            return [];
        }
        getSourceFor(type: string, el: Element, callback?: (value: any) => void): any {
            return null;
        }
    }

    class HandlerStore {
        private handlerDict: Dictionary<Handler> = {};
        private handlerOrder: string[] = [];
        put(type: string, handler: Handler): Handler {
            var previous = this.remove(type);
            this.handlerDict[type] = handler;
            this.handlerOrder.splice(0, 0, type);
            return previous;
        }
        get(type: string): Handler {
            return this.handlerDict[type];
        }
        remove(type: string): Handler {
            if (type in this.handlerDict) {
                var k = _.indexOf(this.handlerOrder, type);
                if (k >= 0)
                    this.handlerOrder.splice(k, 1);
                delete this.handlerDict[type];
            }
            return null;
        }
        find(fn: (handler: Handler) => boolean): Handler {
            for (var k = 0; k < this.handlerOrder.length; k++) {
                var handler = this.handlerDict[this.handlerOrder[k]];
                if (fn(handler)) return handler;
            }
        }
    }

    var handlerStore = new HandlerStore();

    interface MenuItem {
        label: string;
        action: (el?: any) => void;
    }

    var mathUIElementDict: Dictionary<MathUIElement> = {};
    var highlighted = false;

    function create(tagName: string): HTMLElement {
        return document.createElement(tagName);
    }

    function stopEvent(event: Event) {
        event.stopPropagation();
        event.preventDefault();
    }

    class Dialog {
        private documentHandler: MicroJQEventHandler;
        private element: MicroJQ;
        private dialog: MicroJQ;
        private wrapper: MicroJQ;
        show(className: string, prepareDialog: (container: MicroJQ) => void, parent?: Element) {
            parent = parent || document.body;
            this.wrapper = $(create('div')).addClass('math-ui-wrapper');
            this.dialog = $(create('div')).addClass(className).append(this.wrapper);
            this.element = parent === document.body
                ? $(create('div')).addClass('math-ui-backdrop').append(this.dialog) : this.dialog;
            prepareDialog(this.wrapper);
            this.documentHandler = (event: MicroJQEventObject) => {
                if (event.type === 'click' || event.which === 27) {
                    stopEvent(event);
                    this.close();
                } else if (event.type === 'keydown')
                    this.keydown(event);
            };
            $(parent).append(this.element);
            $(document).on('click keydown', this.documentHandler);
            this.dialog.on('click', (event: MicroJQEventObject) => {
                stopEvent(event);
                this.click(event);
            });
        }
        close() {
            $(document).off('click keydown', this.documentHandler);
            this.element.remove();
            this.element = this.documentHandler = undefined;
        }
        fitContentHeight() {
            setTimeout(() => {   // IE8 seems to want this
                this.dialog.css('height', this.wrapper.height() + 'px');
            });
        }
        click(event: MicroJQMouseEventObject) {
        }
        keydown(event: MicroJQKeyEventObject) {
        }
    }

    class ZoomDialog extends Dialog {
        constructor(private host: MathUIElement) {
            super();
        }
        show(): void {
            super.show('math-ui-zoom', (container: MicroJQ) => {
                this.host.clonePresentation(container);
            }, this.host.element);
        }
        click() {
            this.close();
        }
    }

    function sourceToString(obj: any): string {
        var st;
        if (obj === null)
            st = 'Unable to get source';
        if (typeof obj === 'string') {
            st = obj;
        } else if ((<Node> obj).nodeType === 1 /*Node.ELEMENT_NODE*/) {
            st = (<HTMLElement> obj).outerHTML;
        } else if ((<Node> obj).nodeType === 3 /*Node.TEXT_NODE*/) {
            st = (<Text> obj).nodeValue;
        } else if ((<Node> obj).nodeType === 11 /*Node.DOCUMENT_FRAGMENT_NODE*/) {
            st = _.map((<DocumentFragment> obj).childNodes, sourceToString).join('');
        } else
            st = '[Unknown type]';
        return _.trim(st);
    }

    class SourceItem {
        public majorType: string;
        public minorType: string;
        public source: string = 'wait...';
        constructor(public type: string) {
            var subtypes = type.split('/', 2);
            this.majorType = subtypes[0];
            this.minorType = subtypes[1];
        }
        toString(): string {
            return this.minorType ? this.majorType + ' (' + this.minorType + ')' : this.majorType;
        }
    }

    class SourceDialog extends Dialog {
        private sources: SourceItem[];
        private sourceTabs: MicroJQ;
        private $source: MicroJQ;
        private selected: number;
        constructor(private host: MathUIElement) {
            super();
            var types = this.host.getSourceTypes();
            this.sources = _.map(types, (type: any, k: number) => {
                var item = new SourceItem(type),
                    src = this.host.getSourceFor(type, (src: any) => {
                        item.source = sourceToString(src);
                        if (k === this.selected)
                            this.updateSelected();
                    });
                if (src !== undefined)
                    item.source = sourceToString(src);
                return item;
            });
        }
        updateSelected() {
            this.$source.text(this.sources[this.selected].source);
        }
        setSelected(k: number) {
            if (this.sources.length === 0) return;
            k = (k + this.sources.length) % this.sources.length;
            if (k !== this.selected) {
                this.selected = k;
                this.updateSelected();
                this.sourceTabs.removeClass('math-ui-selected');
                $(this.sourceTabs[k]).addClass('math-ui-selected');
                this.updateSelected();
            }
        }
        show() {
            super.show('math-ui-dialog math-ui-source', (container: MicroJQ) => {
                this.sourceTabs = $(_.map(this.sources, (item: SourceItem) =>
                        $(create('span')).append(item.toString())[0]));
                this.$source = $(create('pre'));
                container.append(
                    $(create('div')).addClass('math-ui-header').append('Source for ' + this.host.name),
                    $(create('div')).addClass('math-ui-content').append(
                        $(create('div')).addClass('sourcetypes').append(this.sourceTabs),
                        this.$source
                        )
                    );
                this.setSelected(0);
            });
            this.fitContentHeight();
        }
        close() {
            this.sources = this.sourceTabs = this.$source = undefined;
            super.close();
        }
        click(event: MicroJQMouseEventObject) {
            var k = _.indexOf(this.sourceTabs.toArray(), event.target);
            if (k >= 0) this.setSelected(k);
        }
        keydown(event: MicroJQKeyEventObject) {
            var k = _.indexOf([37, 39], event.which);
            if (k >= 0) this.setSelected(this.selected + (k === 0 ? 1 : -1));
        }
    }

    class MathUIElement {
        static menuItems: MenuItem[] = [
            { label: 'Zoom', action: MathUIElement.prototype.zoomAction },
            { label: 'Source', action: MathUIElement.prototype.sourceAction },
            { label: 'Search', action: () => { alert('search'); } },
            { label: 'Share', action: () => { alert('share'); } },
            { label: 'Dashboard', action: showDashboard }
        ];
        public id: string;
        public name: string;
        private handler: Handler;
        constructor(public element: HTMLElement, index: number) {
            var el = $(element),
                type: string = el.data('type'),
                handler = handlerStore.get(type) ||
                    handlerStore.find((handler: Handler) => handler.canHandle(element));
            if (!handler)
                throw 'MathUI: No matching handler';
            this.id = 'math-ui-element-' + index;
            this.name = 'Equation ' + (index + 1);
            this.handler = handler;
            this.handler.init(element);
            el.attr('id', this.id).attr('tabindex', 0).on('focus', () => {
                this.gotFocus();
            });
        }
        clonePresentation(to: MicroJQ) {
            this.handler.clonePresentation(this.element, to[0]);
        }
        getSourceTypes(): string[] {
            return this.handler.getSourceTypes(this.element);
        }
        getSourceFor(type: string, callback: (src: any) => void): any {
            return this.handler.getSourceFor(type, this.element, callback);
        }
        changeHighlight(on: boolean) {
            var el = $(this.element);
            on ? el.addClass('highlight') : el.removeClass('highlight');
        }
        zoomAction() {
            var dialog = new ZoomDialog(this);
            dialog.show();
        }
        sourceAction() {
            var dialog = new SourceDialog(this);
            dialog.show();
        }
        gotFocus() {
            var el = $(this.element);
            var selectedIndex: number,
                triggerSelected = () => {
                    el.blur();
                    // IE8: Make sure focus menu is removed before triggering action
                    setTimeout(() => {
                        MathUIElement.menuItems[selectedIndex].action.call(this);
                    });
                },
                buttons = $(_.map(MathUIElement.menuItems, () => create('span'))).addClass('math-ui-item'),
                menu = $(create('div')).addClass('math-ui-eqn-menu').append(
                    $(create('span')).addClass('math-ui-header').append(this.name),
                    $(create('span')).addClass('math-ui-container').append(buttons)
                ),
                updateSelected = (index: number) => {
                    selectedIndex = index;
                    buttons.removeClass('math-ui-selected');
                    $(buttons[index]).addClass('math-ui-selected');
                },
                onkeydown = (ev: MicroJQEventObject) => {
                    switch (ev.which) {
                        case 13:
                            ev.preventDefault();  // don't trigger mouse click
                            triggerSelected();
                            break;
                        case 27:
                            el.blur();
                            break;
                        case 37:
                            updateSelected((selectedIndex + MathUIElement.menuItems.length - 1) % MathUIElement.menuItems.length);
                            break;
                        case 39:
                            updateSelected((selectedIndex + 1) % MathUIElement.menuItems.length);
                            break;
                    }
                },
                onblur = () => {
                    menu.remove();
                    el.off('keydown', onkeydown).off('blur', onblur);
                };
            buttons.each(function (k: number, btn: Element) {
                $(btn).append(MathUIElement.menuItems[k].label).on('mousedown', (event: MicroJQEventObject) => {
                    stopEvent(event);
                    updateSelected(k);
                    triggerSelected();
                });
            });
            el.append(menu).on('keydown', onkeydown).on('blur', onblur);
            updateSelected(0);
            menu.css('top', (el[0].offsetHeight - 3) + 'px');
        }
    }

    function highlightAllEquations() {
        highlighted = !highlighted;
        _.each(mathUIElementDict, (mathUIElement: MathUIElement) => {
            mathUIElement.changeHighlight(highlighted);
        });
    }

    class DashboardDialog extends Dialog {
        static dashboardItems: MenuItem[] = [
            { label: 'Highlight All Equations', action: highlightAllEquations },
            { label: 'About MathUI', action: () => { alert('About MathUI'); } },
            { label: 'Action 3', action: () => { alert('Action 3 not implemented'); } },
            { label: 'Action 4', action: () => { alert('Action 4 not implemented'); } }
        ];
        private buttons: MicroJQ;
        show(): void {
            super.show('math-ui-dialog math-ui-dashboard', (container: MicroJQ) => {
                this.buttons = $(_.map(DashboardDialog.dashboardItems, () => create('button')))
                    .each((k: number, el: Element) => {
                        $(el).append(DashboardDialog.dashboardItems[k].label);
                    });
                container.append(
                    $(create('div')).addClass('math-ui-header').append('MathUI Dashboard'),
                    $(create('div')).addClass('math-ui-content').append(this.buttons)
                );
            });
            this.buttons.first().focus();
            this.fitContentHeight();
        }
        click(event: MicroJQEventObject): void {
            var nr = _.indexOf(this.buttons.toArray(), event.target);
            if (nr >= 0 && nr < DashboardDialog.dashboardItems.length) {
                var item = DashboardDialog.dashboardItems[nr];
                this.close();
                item.action(item.label);
            }
        }
    }

    function elementReady(k: number, element: Element): void {
        var id = 'math-ui-element-' + k;
        var mathUIElement = mathUIElementDict[id] = new MathUIElement(<HTMLElement> element, k);
        $(element).attr('id', id).attr('tabindex', 0).on('focus', () => {
            mathUIElement.gotFocus();
        });
    }

    microJQ.ready(function () {
        if ('jQuery' in window && jQuery.fn.on)
            $ = jQuery;
        $(document).find('.math-ui').each((k: number, element: Element) => {
            var mathUIElement = new MathUIElement(<HTMLElement> element, k);
            mathUIElementDict[mathUIElement.id] = mathUIElement;
        });
    });

    export function showDashboard(): void {
        var dialog = new DashboardDialog();
        dialog.show();
    }

    export function registerHandler(type: string, handler: Handler): Handler {
        return handlerStore.put(type, handler);
    }

    function dump(n: Node, indent: string): string {
        if (n.nodeType === 1) {
            var name = n.nodeName.toLowerCase();
            var children: Node[] = [];
            for (var c = (<Element> n).firstChild; c !== null; c = c.nextSibling)
                children.push(c);
            while (children.length !== 0 && children[0].nodeType === 3 && !_.trim(children[0].nodeValue))
                children.splice(0, 1);
            while (children.length !== 0 && children[children.length - 1].nodeType === 3 && !_.trim(children[children.length - 1].nodeValue))
                children.pop();
            if (children.length == 0)
                return '<' + name + '></' + name + '>';
            var r = '<' + name + '>';
            var prevIsText = false;
            _.each(children, (c: Node) => {
                if (c.nodeType === 3) {
                    r += dump(c, '');
                    prevIsText = true;
                } else if (prevIsText) {
                    r += dump(c, indent + '  ');
                    prevIsText = false;
                } else {
                    r += '\n  ' + indent + dump(c, indent + '  ');
                }
            });
            r += (prevIsText ? '' : '\n' + indent) + '</' + name + '>';
            return r;
        } else if (n.nodeType === 3) {
            return n.nodeValue;
        }
        return '[!]';
    }

    export function test() {
        var m = document.querySelector('math[display="block"]');
        //console.log(m);
        console.log(dump(m, ''));
    }

}
