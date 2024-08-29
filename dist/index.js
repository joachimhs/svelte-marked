(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Name = factory());
})(this, (function () { 'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function empty() {
        return text('');
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    class HtmlTag {
        constructor(is_svg = false) {
            this.is_svg = false;
            this.is_svg = is_svg;
            this.e = this.n = null;
        }
        c(html) {
            this.h(html);
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                if (this.is_svg)
                    this.e = svg_element(target.nodeName);
                /** #7364  target for <template> may be provided as #document-fragment(11) */
                else
                    this.e = element((target.nodeType === 11 ? 'TEMPLATE' : target.nodeName));
                this.t = target.tagName !== 'TEMPLATE' ? target : target.content;
                this.c(html);
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.nodeName === 'TEMPLATE' ? this.e.content.childNodes : this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /**
     * marked v14.1.0 - a markdown parser
     * Copyright (c) 2011-2024, Christopher Jeffrey. (MIT Licensed)
     * https://github.com/markedjs/marked
     */

    /**
     * DO NOT EDIT THIS FILE
     * The code in this file is generated from files in ./src/
     */

    /**
     * Gets the original marked default options.
     */
    function _getDefaults() {
        return {
            async: false,
            breaks: false,
            extensions: null,
            gfm: true,
            hooks: null,
            pedantic: false,
            renderer: null,
            silent: false,
            tokenizer: null,
            walkTokens: null,
        };
    }
    let _defaults = _getDefaults();
    function changeDefaults(newDefaults) {
        _defaults = newDefaults;
    }

    /**
     * Helpers
     */
    const escapeTest = /[&<>"']/;
    const escapeReplace = new RegExp(escapeTest.source, 'g');
    const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
    const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, 'g');
    const escapeReplacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    const getEscapeReplacement = (ch) => escapeReplacements[ch];
    function escape$1(html, encode) {
        if (encode) {
            if (escapeTest.test(html)) {
                return html.replace(escapeReplace, getEscapeReplacement);
            }
        }
        else {
            if (escapeTestNoEncode.test(html)) {
                return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
            }
        }
        return html;
    }
    const caret = /(^|[^\[])\^/g;
    function edit(regex, opt) {
        let source = typeof regex === 'string' ? regex : regex.source;
        opt = opt || '';
        const obj = {
            replace: (name, val) => {
                let valSource = typeof val === 'string' ? val : val.source;
                valSource = valSource.replace(caret, '$1');
                source = source.replace(name, valSource);
                return obj;
            },
            getRegex: () => {
                return new RegExp(source, opt);
            },
        };
        return obj;
    }
    function cleanUrl(href) {
        try {
            href = encodeURI(href).replace(/%25/g, '%');
        }
        catch {
            return null;
        }
        return href;
    }
    const noopTest = { exec: () => null };
    function splitCells(tableRow, count) {
        // ensure that every cell-delimiting pipe has a space
        // before it to distinguish it from an escaped pipe
        const row = tableRow.replace(/\|/g, (match, offset, str) => {
            let escaped = false;
            let curr = offset;
            while (--curr >= 0 && str[curr] === '\\')
                escaped = !escaped;
            if (escaped) {
                // odd number of slashes means | is escaped
                // so we leave it alone
                return '|';
            }
            else {
                // add space before unescaped |
                return ' |';
            }
        }), cells = row.split(/ \|/);
        let i = 0;
        // First/last cell in a row cannot be empty if it has no leading/trailing pipe
        if (!cells[0].trim()) {
            cells.shift();
        }
        if (cells.length > 0 && !cells[cells.length - 1].trim()) {
            cells.pop();
        }
        if (count) {
            if (cells.length > count) {
                cells.splice(count);
            }
            else {
                while (cells.length < count)
                    cells.push('');
            }
        }
        for (; i < cells.length; i++) {
            // leading or trailing whitespace is ignored per the gfm spec
            cells[i] = cells[i].trim().replace(/\\\|/g, '|');
        }
        return cells;
    }
    /**
     * Remove trailing 'c's. Equivalent to str.replace(/c*$/, '').
     * /c*$/ is vulnerable to REDOS.
     *
     * @param str
     * @param c
     * @param invert Remove suffix of non-c chars instead. Default falsey.
     */
    function rtrim(str, c, invert) {
        const l = str.length;
        if (l === 0) {
            return '';
        }
        // Length of suffix matching the invert condition.
        let suffLen = 0;
        // Step left until we fail to match the invert condition.
        while (suffLen < l) {
            const currChar = str.charAt(l - suffLen - 1);
            if (currChar === c && !invert) {
                suffLen++;
            }
            else if (currChar !== c && invert) {
                suffLen++;
            }
            else {
                break;
            }
        }
        return str.slice(0, l - suffLen);
    }
    function findClosingBracket(str, b) {
        if (str.indexOf(b[1]) === -1) {
            return -1;
        }
        let level = 0;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '\\') {
                i++;
            }
            else if (str[i] === b[0]) {
                level++;
            }
            else if (str[i] === b[1]) {
                level--;
                if (level < 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    function outputLink(cap, link, raw, lexer) {
        const href = link.href;
        const title = link.title ? escape$1(link.title) : null;
        const text = cap[1].replace(/\\([\[\]])/g, '$1');
        if (cap[0].charAt(0) !== '!') {
            lexer.state.inLink = true;
            const token = {
                type: 'link',
                raw,
                href,
                title,
                text,
                tokens: lexer.inlineTokens(text),
            };
            lexer.state.inLink = false;
            return token;
        }
        return {
            type: 'image',
            raw,
            href,
            title,
            text: escape$1(text),
        };
    }
    function indentCodeCompensation(raw, text) {
        const matchIndentToCode = raw.match(/^(\s+)(?:```)/);
        if (matchIndentToCode === null) {
            return text;
        }
        const indentToCode = matchIndentToCode[1];
        return text
            .split('\n')
            .map(node => {
            const matchIndentInNode = node.match(/^\s+/);
            if (matchIndentInNode === null) {
                return node;
            }
            const [indentInNode] = matchIndentInNode;
            if (indentInNode.length >= indentToCode.length) {
                return node.slice(indentToCode.length);
            }
            return node;
        })
            .join('\n');
    }
    /**
     * Tokenizer
     */
    class _Tokenizer {
        options;
        rules; // set by the lexer
        lexer; // set by the lexer
        constructor(options) {
            this.options = options || _defaults;
        }
        space(src) {
            const cap = this.rules.block.newline.exec(src);
            if (cap && cap[0].length > 0) {
                return {
                    type: 'space',
                    raw: cap[0],
                };
            }
        }
        code(src) {
            const cap = this.rules.block.code.exec(src);
            if (cap) {
                const text = cap[0].replace(/^ {1,4}/gm, '');
                return {
                    type: 'code',
                    raw: cap[0],
                    codeBlockStyle: 'indented',
                    text: !this.options.pedantic
                        ? rtrim(text, '\n')
                        : text,
                };
            }
        }
        fences(src) {
            const cap = this.rules.block.fences.exec(src);
            if (cap) {
                const raw = cap[0];
                const text = indentCodeCompensation(raw, cap[3] || '');
                return {
                    type: 'code',
                    raw,
                    lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, '$1') : cap[2],
                    text,
                };
            }
        }
        heading(src) {
            const cap = this.rules.block.heading.exec(src);
            if (cap) {
                let text = cap[2].trim();
                // remove trailing #s
                if (/#$/.test(text)) {
                    const trimmed = rtrim(text, '#');
                    if (this.options.pedantic) {
                        text = trimmed.trim();
                    }
                    else if (!trimmed || / $/.test(trimmed)) {
                        // CommonMark requires space before trailing #s
                        text = trimmed.trim();
                    }
                }
                return {
                    type: 'heading',
                    raw: cap[0],
                    depth: cap[1].length,
                    text,
                    tokens: this.lexer.inline(text),
                };
            }
        }
        hr(src) {
            const cap = this.rules.block.hr.exec(src);
            if (cap) {
                return {
                    type: 'hr',
                    raw: rtrim(cap[0], '\n'),
                };
            }
        }
        blockquote(src) {
            const cap = this.rules.block.blockquote.exec(src);
            if (cap) {
                let lines = rtrim(cap[0], '\n').split('\n');
                let raw = '';
                let text = '';
                const tokens = [];
                while (lines.length > 0) {
                    let inBlockquote = false;
                    const currentLines = [];
                    let i;
                    for (i = 0; i < lines.length; i++) {
                        // get lines up to a continuation
                        if (/^ {0,3}>/.test(lines[i])) {
                            currentLines.push(lines[i]);
                            inBlockquote = true;
                        }
                        else if (!inBlockquote) {
                            currentLines.push(lines[i]);
                        }
                        else {
                            break;
                        }
                    }
                    lines = lines.slice(i);
                    const currentRaw = currentLines.join('\n');
                    const currentText = currentRaw
                        // precede setext continuation with 4 spaces so it isn't a setext
                        .replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g, '\n    $1')
                        .replace(/^ {0,3}>[ \t]?/gm, '');
                    raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
                    text = text ? `${text}\n${currentText}` : currentText;
                    // parse blockquote lines as top level tokens
                    // merge paragraphs if this is a continuation
                    const top = this.lexer.state.top;
                    this.lexer.state.top = true;
                    this.lexer.blockTokens(currentText, tokens, true);
                    this.lexer.state.top = top;
                    // if there is no continuation then we are done
                    if (lines.length === 0) {
                        break;
                    }
                    const lastToken = tokens[tokens.length - 1];
                    if (lastToken?.type === 'code') {
                        // blockquote continuation cannot be preceded by a code block
                        break;
                    }
                    else if (lastToken?.type === 'blockquote') {
                        // include continuation in nested blockquote
                        const oldToken = lastToken;
                        const newText = oldToken.raw + '\n' + lines.join('\n');
                        const newToken = this.blockquote(newText);
                        tokens[tokens.length - 1] = newToken;
                        raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
                        text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
                        break;
                    }
                    else if (lastToken?.type === 'list') {
                        // include continuation in nested list
                        const oldToken = lastToken;
                        const newText = oldToken.raw + '\n' + lines.join('\n');
                        const newToken = this.list(newText);
                        tokens[tokens.length - 1] = newToken;
                        raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
                        text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
                        lines = newText.substring(tokens[tokens.length - 1].raw.length).split('\n');
                        continue;
                    }
                }
                return {
                    type: 'blockquote',
                    raw,
                    tokens,
                    text,
                };
            }
        }
        list(src) {
            let cap = this.rules.block.list.exec(src);
            if (cap) {
                let bull = cap[1].trim();
                const isordered = bull.length > 1;
                const list = {
                    type: 'list',
                    raw: '',
                    ordered: isordered,
                    start: isordered ? +bull.slice(0, -1) : '',
                    loose: false,
                    items: [],
                };
                bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
                if (this.options.pedantic) {
                    bull = isordered ? bull : '[*+-]';
                }
                // Get next list item
                const itemRegex = new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`);
                let endsWithBlankLine = false;
                // Check if current bullet point can start a new List Item
                while (src) {
                    let endEarly = false;
                    let raw = '';
                    let itemContents = '';
                    if (!(cap = itemRegex.exec(src))) {
                        break;
                    }
                    if (this.rules.block.hr.test(src)) { // End list if bullet was actually HR (possibly move into itemRegex?)
                        break;
                    }
                    raw = cap[0];
                    src = src.substring(raw.length);
                    let line = cap[2].split('\n', 1)[0].replace(/^\t+/, (t) => ' '.repeat(3 * t.length));
                    let nextLine = src.split('\n', 1)[0];
                    let blankLine = !line.trim();
                    let indent = 0;
                    if (this.options.pedantic) {
                        indent = 2;
                        itemContents = line.trimStart();
                    }
                    else if (blankLine) {
                        indent = cap[1].length + 1;
                    }
                    else {
                        indent = cap[2].search(/[^ ]/); // Find first non-space char
                        indent = indent > 4 ? 1 : indent; // Treat indented code blocks (> 4 spaces) as having only 1 indent
                        itemContents = line.slice(indent);
                        indent += cap[1].length;
                    }
                    if (blankLine && /^ *$/.test(nextLine)) { // Items begin with at most one blank line
                        raw += nextLine + '\n';
                        src = src.substring(nextLine.length + 1);
                        endEarly = true;
                    }
                    if (!endEarly) {
                        const nextBulletRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`);
                        const hrRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`);
                        const fencesBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`);
                        const headingBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`);
                        // Check if following lines should be included in List Item
                        while (src) {
                            const rawLine = src.split('\n', 1)[0];
                            nextLine = rawLine;
                            // Re-align to follow commonmark nesting rules
                            if (this.options.pedantic) {
                                nextLine = nextLine.replace(/^ {1,4}(?=( {4})*[^ ])/g, '  ');
                            }
                            // End list item if found code fences
                            if (fencesBeginRegex.test(nextLine)) {
                                break;
                            }
                            // End list item if found start of new heading
                            if (headingBeginRegex.test(nextLine)) {
                                break;
                            }
                            // End list item if found start of new bullet
                            if (nextBulletRegex.test(nextLine)) {
                                break;
                            }
                            // Horizontal rule found
                            if (hrRegex.test(src)) {
                                break;
                            }
                            if (nextLine.search(/[^ ]/) >= indent || !nextLine.trim()) { // Dedent if possible
                                itemContents += '\n' + nextLine.slice(indent);
                            }
                            else {
                                // not enough indentation
                                if (blankLine) {
                                    break;
                                }
                                // paragraph continuation unless last line was a different block level element
                                if (line.search(/[^ ]/) >= 4) { // indented code block
                                    break;
                                }
                                if (fencesBeginRegex.test(line)) {
                                    break;
                                }
                                if (headingBeginRegex.test(line)) {
                                    break;
                                }
                                if (hrRegex.test(line)) {
                                    break;
                                }
                                itemContents += '\n' + nextLine;
                            }
                            if (!blankLine && !nextLine.trim()) { // Check if current line is blank
                                blankLine = true;
                            }
                            raw += rawLine + '\n';
                            src = src.substring(rawLine.length + 1);
                            line = nextLine.slice(indent);
                        }
                    }
                    if (!list.loose) {
                        // If the previous item ended with a blank line, the list is loose
                        if (endsWithBlankLine) {
                            list.loose = true;
                        }
                        else if (/\n *\n *$/.test(raw)) {
                            endsWithBlankLine = true;
                        }
                    }
                    let istask = null;
                    let ischecked;
                    // Check for task list items
                    if (this.options.gfm) {
                        istask = /^\[[ xX]\] /.exec(itemContents);
                        if (istask) {
                            ischecked = istask[0] !== '[ ] ';
                            itemContents = itemContents.replace(/^\[[ xX]\] +/, '');
                        }
                    }
                    list.items.push({
                        type: 'list_item',
                        raw,
                        task: !!istask,
                        checked: ischecked,
                        loose: false,
                        text: itemContents,
                        tokens: [],
                    });
                    list.raw += raw;
                }
                // Do not consume newlines at end of final item. Alternatively, make itemRegex *start* with any newlines to simplify/speed up endsWithBlankLine logic
                list.items[list.items.length - 1].raw = list.items[list.items.length - 1].raw.trimEnd();
                list.items[list.items.length - 1].text = list.items[list.items.length - 1].text.trimEnd();
                list.raw = list.raw.trimEnd();
                // Item child tokens handled here at end because we needed to have the final item to trim it first
                for (let i = 0; i < list.items.length; i++) {
                    this.lexer.state.top = false;
                    list.items[i].tokens = this.lexer.blockTokens(list.items[i].text, []);
                    if (!list.loose) {
                        // Check if list should be loose
                        const spacers = list.items[i].tokens.filter(t => t.type === 'space');
                        const hasMultipleLineBreaks = spacers.length > 0 && spacers.some(t => /\n.*\n/.test(t.raw));
                        list.loose = hasMultipleLineBreaks;
                    }
                }
                // Set all items to loose if list is loose
                if (list.loose) {
                    for (let i = 0; i < list.items.length; i++) {
                        list.items[i].loose = true;
                    }
                }
                return list;
            }
        }
        html(src) {
            const cap = this.rules.block.html.exec(src);
            if (cap) {
                const token = {
                    type: 'html',
                    block: true,
                    raw: cap[0],
                    pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style',
                    text: cap[0],
                };
                return token;
            }
        }
        def(src) {
            const cap = this.rules.block.def.exec(src);
            if (cap) {
                const tag = cap[1].toLowerCase().replace(/\s+/g, ' ');
                const href = cap[2] ? cap[2].replace(/^<(.*)>$/, '$1').replace(this.rules.inline.anyPunctuation, '$1') : '';
                const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, '$1') : cap[3];
                return {
                    type: 'def',
                    tag,
                    raw: cap[0],
                    href,
                    title,
                };
            }
        }
        table(src) {
            const cap = this.rules.block.table.exec(src);
            if (!cap) {
                return;
            }
            if (!/[:|]/.test(cap[2])) {
                // delimiter row must have a pipe (|) or colon (:) otherwise it is a setext heading
                return;
            }
            const headers = splitCells(cap[1]);
            const aligns = cap[2].replace(/^\||\| *$/g, '').split('|');
            const rows = cap[3] && cap[3].trim() ? cap[3].replace(/\n[ \t]*$/, '').split('\n') : [];
            const item = {
                type: 'table',
                raw: cap[0],
                header: [],
                align: [],
                rows: [],
            };
            if (headers.length !== aligns.length) {
                // header and align columns must be equal, rows can be different.
                return;
            }
            for (const align of aligns) {
                if (/^ *-+: *$/.test(align)) {
                    item.align.push('right');
                }
                else if (/^ *:-+: *$/.test(align)) {
                    item.align.push('center');
                }
                else if (/^ *:-+ *$/.test(align)) {
                    item.align.push('left');
                }
                else {
                    item.align.push(null);
                }
            }
            for (let i = 0; i < headers.length; i++) {
                item.header.push({
                    text: headers[i],
                    tokens: this.lexer.inline(headers[i]),
                    header: true,
                    align: item.align[i],
                });
            }
            for (const row of rows) {
                item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
                    return {
                        text: cell,
                        tokens: this.lexer.inline(cell),
                        header: false,
                        align: item.align[i],
                    };
                }));
            }
            return item;
        }
        lheading(src) {
            const cap = this.rules.block.lheading.exec(src);
            if (cap) {
                return {
                    type: 'heading',
                    raw: cap[0],
                    depth: cap[2].charAt(0) === '=' ? 1 : 2,
                    text: cap[1],
                    tokens: this.lexer.inline(cap[1]),
                };
            }
        }
        paragraph(src) {
            const cap = this.rules.block.paragraph.exec(src);
            if (cap) {
                const text = cap[1].charAt(cap[1].length - 1) === '\n'
                    ? cap[1].slice(0, -1)
                    : cap[1];
                return {
                    type: 'paragraph',
                    raw: cap[0],
                    text,
                    tokens: this.lexer.inline(text),
                };
            }
        }
        text(src) {
            const cap = this.rules.block.text.exec(src);
            if (cap) {
                return {
                    type: 'text',
                    raw: cap[0],
                    text: cap[0],
                    tokens: this.lexer.inline(cap[0]),
                };
            }
        }
        escape(src) {
            const cap = this.rules.inline.escape.exec(src);
            if (cap) {
                return {
                    type: 'escape',
                    raw: cap[0],
                    text: escape$1(cap[1]),
                };
            }
        }
        tag(src) {
            const cap = this.rules.inline.tag.exec(src);
            if (cap) {
                if (!this.lexer.state.inLink && /^<a /i.test(cap[0])) {
                    this.lexer.state.inLink = true;
                }
                else if (this.lexer.state.inLink && /^<\/a>/i.test(cap[0])) {
                    this.lexer.state.inLink = false;
                }
                if (!this.lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
                    this.lexer.state.inRawBlock = true;
                }
                else if (this.lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
                    this.lexer.state.inRawBlock = false;
                }
                return {
                    type: 'html',
                    raw: cap[0],
                    inLink: this.lexer.state.inLink,
                    inRawBlock: this.lexer.state.inRawBlock,
                    block: false,
                    text: cap[0],
                };
            }
        }
        link(src) {
            const cap = this.rules.inline.link.exec(src);
            if (cap) {
                const trimmedUrl = cap[2].trim();
                if (!this.options.pedantic && /^</.test(trimmedUrl)) {
                    // commonmark requires matching angle brackets
                    if (!(/>$/.test(trimmedUrl))) {
                        return;
                    }
                    // ending angle bracket cannot be escaped
                    const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), '\\');
                    if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
                        return;
                    }
                }
                else {
                    // find closing parenthesis
                    const lastParenIndex = findClosingBracket(cap[2], '()');
                    if (lastParenIndex > -1) {
                        const start = cap[0].indexOf('!') === 0 ? 5 : 4;
                        const linkLen = start + cap[1].length + lastParenIndex;
                        cap[2] = cap[2].substring(0, lastParenIndex);
                        cap[0] = cap[0].substring(0, linkLen).trim();
                        cap[3] = '';
                    }
                }
                let href = cap[2];
                let title = '';
                if (this.options.pedantic) {
                    // split pedantic href and title
                    const link = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(href);
                    if (link) {
                        href = link[1];
                        title = link[3];
                    }
                }
                else {
                    title = cap[3] ? cap[3].slice(1, -1) : '';
                }
                href = href.trim();
                if (/^</.test(href)) {
                    if (this.options.pedantic && !(/>$/.test(trimmedUrl))) {
                        // pedantic allows starting angle bracket without ending angle bracket
                        href = href.slice(1);
                    }
                    else {
                        href = href.slice(1, -1);
                    }
                }
                return outputLink(cap, {
                    href: href ? href.replace(this.rules.inline.anyPunctuation, '$1') : href,
                    title: title ? title.replace(this.rules.inline.anyPunctuation, '$1') : title,
                }, cap[0], this.lexer);
            }
        }
        reflink(src, links) {
            let cap;
            if ((cap = this.rules.inline.reflink.exec(src))
                || (cap = this.rules.inline.nolink.exec(src))) {
                const linkString = (cap[2] || cap[1]).replace(/\s+/g, ' ');
                const link = links[linkString.toLowerCase()];
                if (!link) {
                    const text = cap[0].charAt(0);
                    return {
                        type: 'text',
                        raw: text,
                        text,
                    };
                }
                return outputLink(cap, link, cap[0], this.lexer);
            }
        }
        emStrong(src, maskedSrc, prevChar = '') {
            let match = this.rules.inline.emStrongLDelim.exec(src);
            if (!match)
                return;
            // _ can't be between two alphanumerics. \p{L}\p{N} includes non-english alphabet/numbers as well
            if (match[3] && prevChar.match(/[\p{L}\p{N}]/u))
                return;
            const nextChar = match[1] || match[2] || '';
            if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
                // unicode Regex counts emoji as 1 char; spread into array for proper count (used multiple times below)
                const lLength = [...match[0]].length - 1;
                let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
                const endReg = match[0][0] === '*' ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
                endReg.lastIndex = 0;
                // Clip maskedSrc to same section of string as src (move to lexer?)
                maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
                while ((match = endReg.exec(maskedSrc)) != null) {
                    rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
                    if (!rDelim)
                        continue; // skip single * in __abc*abc__
                    rLength = [...rDelim].length;
                    if (match[3] || match[4]) { // found another Left Delim
                        delimTotal += rLength;
                        continue;
                    }
                    else if (match[5] || match[6]) { // either Left or Right Delim
                        if (lLength % 3 && !((lLength + rLength) % 3)) {
                            midDelimTotal += rLength;
                            continue; // CommonMark Emphasis Rules 9-10
                        }
                    }
                    delimTotal -= rLength;
                    if (delimTotal > 0)
                        continue; // Haven't found enough closing delimiters
                    // Remove extra characters. *a*** -> *a*
                    rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
                    // char length can be >1 for unicode characters;
                    const lastCharLength = [...match[0]][0].length;
                    const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
                    // Create `em` if smallest delimiter has odd char count. *a***
                    if (Math.min(lLength, rLength) % 2) {
                        const text = raw.slice(1, -1);
                        return {
                            type: 'em',
                            raw,
                            text,
                            tokens: this.lexer.inlineTokens(text),
                        };
                    }
                    // Create 'strong' if smallest delimiter has even char count. **a***
                    const text = raw.slice(2, -2);
                    return {
                        type: 'strong',
                        raw,
                        text,
                        tokens: this.lexer.inlineTokens(text),
                    };
                }
            }
        }
        codespan(src) {
            const cap = this.rules.inline.code.exec(src);
            if (cap) {
                let text = cap[2].replace(/\n/g, ' ');
                const hasNonSpaceChars = /[^ ]/.test(text);
                const hasSpaceCharsOnBothEnds = /^ /.test(text) && / $/.test(text);
                if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
                    text = text.substring(1, text.length - 1);
                }
                text = escape$1(text, true);
                return {
                    type: 'codespan',
                    raw: cap[0],
                    text,
                };
            }
        }
        br(src) {
            const cap = this.rules.inline.br.exec(src);
            if (cap) {
                return {
                    type: 'br',
                    raw: cap[0],
                };
            }
        }
        del(src) {
            const cap = this.rules.inline.del.exec(src);
            if (cap) {
                return {
                    type: 'del',
                    raw: cap[0],
                    text: cap[2],
                    tokens: this.lexer.inlineTokens(cap[2]),
                };
            }
        }
        autolink(src) {
            const cap = this.rules.inline.autolink.exec(src);
            if (cap) {
                let text, href;
                if (cap[2] === '@') {
                    text = escape$1(cap[1]);
                    href = 'mailto:' + text;
                }
                else {
                    text = escape$1(cap[1]);
                    href = text;
                }
                return {
                    type: 'link',
                    raw: cap[0],
                    text,
                    href,
                    tokens: [
                        {
                            type: 'text',
                            raw: text,
                            text,
                        },
                    ],
                };
            }
        }
        url(src) {
            let cap;
            if (cap = this.rules.inline.url.exec(src)) {
                let text, href;
                if (cap[2] === '@') {
                    text = escape$1(cap[0]);
                    href = 'mailto:' + text;
                }
                else {
                    // do extended autolink path validation
                    let prevCapZero;
                    do {
                        prevCapZero = cap[0];
                        cap[0] = this.rules.inline._backpedal.exec(cap[0])?.[0] ?? '';
                    } while (prevCapZero !== cap[0]);
                    text = escape$1(cap[0]);
                    if (cap[1] === 'www.') {
                        href = 'http://' + cap[0];
                    }
                    else {
                        href = cap[0];
                    }
                }
                return {
                    type: 'link',
                    raw: cap[0],
                    text,
                    href,
                    tokens: [
                        {
                            type: 'text',
                            raw: text,
                            text,
                        },
                    ],
                };
            }
        }
        inlineText(src) {
            const cap = this.rules.inline.text.exec(src);
            if (cap) {
                let text;
                if (this.lexer.state.inRawBlock) {
                    text = cap[0];
                }
                else {
                    text = escape$1(cap[0]);
                }
                return {
                    type: 'text',
                    raw: cap[0],
                    text,
                };
            }
        }
    }

    /**
     * Block-Level Grammar
     */
    const newline = /^(?: *(?:\n|$))+/;
    const blockCode = /^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/;
    const fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
    const hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
    const heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
    const bullet = /(?:[*+-]|\d{1,9}[.)])/;
    const lheading = edit(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/)
        .replace(/bull/g, bullet) // lists can interrupt
        .replace(/blockCode/g, / {4}/) // indented code blocks can interrupt
        .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/) // fenced code blocks can interrupt
        .replace(/blockquote/g, / {0,3}>/) // blockquote can interrupt
        .replace(/heading/g, / {0,3}#{1,6}/) // ATX heading can interrupt
        .replace(/html/g, / {0,3}<[^\n>]+>\n/) // block html can interrupt
        .getRegex();
    const _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
    const blockText = /^[^\n]+/;
    const _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
    const def = edit(/^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/)
        .replace('label', _blockLabel)
        .replace('title', /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/)
        .getRegex();
    const list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/)
        .replace(/bull/g, bullet)
        .getRegex();
    const _tag = 'address|article|aside|base|basefont|blockquote|body|caption'
        + '|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption'
        + '|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe'
        + '|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option'
        + '|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title'
        + '|tr|track|ul';
    const _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
    const html = edit('^ {0,3}(?:' // optional indentation
        + '<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)' // (1)
        + '|comment[^\\n]*(\\n+|$)' // (2)
        + '|<\\?[\\s\\S]*?(?:\\?>\\n*|$)' // (3)
        + '|<![A-Z][\\s\\S]*?(?:>\\n*|$)' // (4)
        + '|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)' // (5)
        + '|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (6)
        + '|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (7) open tag
        + '|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (7) closing tag
        + ')', 'i')
        .replace('comment', _comment)
        .replace('tag', _tag)
        .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
        .getRegex();
    const paragraph = edit(_paragraph)
        .replace('hr', hr)
        .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
        .replace('|lheading', '') // setext headings don't interrupt commonmark paragraphs
        .replace('|table', '')
        .replace('blockquote', ' {0,3}>')
        .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
        .replace('list', ' {0,3}(?:[*+-]|1[.)]) ') // only lists starting from 1 can interrupt
        .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)')
        .replace('tag', _tag) // pars can be interrupted by type (6) html blocks
        .getRegex();
    const blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/)
        .replace('paragraph', paragraph)
        .getRegex();
    /**
     * Normal Block Grammar
     */
    const blockNormal = {
        blockquote,
        code: blockCode,
        def,
        fences,
        heading,
        hr,
        html,
        lheading,
        list,
        newline,
        paragraph,
        table: noopTest,
        text: blockText,
    };
    /**
     * GFM Block Grammar
     */
    const gfmTable = edit('^ *([^\\n ].*)\\n' // Header
        + ' {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)' // Align
        + '(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)') // Cells
        .replace('hr', hr)
        .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
        .replace('blockquote', ' {0,3}>')
        .replace('code', ' {4}[^\\n]')
        .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
        .replace('list', ' {0,3}(?:[*+-]|1[.)]) ') // only lists starting from 1 can interrupt
        .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)')
        .replace('tag', _tag) // tables can be interrupted by type (6) html blocks
        .getRegex();
    const blockGfm = {
        ...blockNormal,
        table: gfmTable,
        paragraph: edit(_paragraph)
            .replace('hr', hr)
            .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
            .replace('|lheading', '') // setext headings don't interrupt commonmark paragraphs
            .replace('table', gfmTable) // interrupt paragraphs with table
            .replace('blockquote', ' {0,3}>')
            .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
            .replace('list', ' {0,3}(?:[*+-]|1[.)]) ') // only lists starting from 1 can interrupt
            .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)')
            .replace('tag', _tag) // pars can be interrupted by type (6) html blocks
            .getRegex(),
    };
    /**
     * Pedantic grammar (original John Gruber's loose markdown specification)
     */
    const blockPedantic = {
        ...blockNormal,
        html: edit('^ *(?:comment *(?:\\n|\\s*$)'
            + '|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)' // closed tag
            + '|<tag(?:"[^"]*"|\'[^\']*\'|\\s[^\'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))')
            .replace('comment', _comment)
            .replace(/tag/g, '(?!(?:'
            + 'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub'
            + '|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)'
            + '\\b)\\w+(?!:|[^\\w\\s@]*@)\\b')
            .getRegex(),
        def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
        heading: /^(#{1,6})(.*)(?:\n+|$)/,
        fences: noopTest, // fences not supported
        lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
        paragraph: edit(_paragraph)
            .replace('hr', hr)
            .replace('heading', ' *#{1,6} *[^\n]')
            .replace('lheading', lheading)
            .replace('|table', '')
            .replace('blockquote', ' {0,3}>')
            .replace('|fences', '')
            .replace('|list', '')
            .replace('|html', '')
            .replace('|tag', '')
            .getRegex(),
    };
    /**
     * Inline-Level Grammar
     */
    const escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
    const inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
    const br = /^( {2,}|\\)\n(?!\s*$)/;
    const inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
    // list of unicode punctuation marks, plus any missing characters from CommonMark spec
    const _punctuation = '\\p{P}\\p{S}';
    const punctuation = edit(/^((?![*_])[\spunctuation])/, 'u')
        .replace(/punctuation/g, _punctuation).getRegex();
    // sequences em should skip over [title](link), `code`, <html>
    const blockSkip = /\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g;
    const emStrongLDelim = edit(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/, 'u')
        .replace(/punct/g, _punctuation)
        .getRegex();
    const emStrongRDelimAst = edit('^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)' // Skip orphan inside strong
        + '|[^*]+(?=[^*])' // Consume to delim
        + '|(?!\\*)[punct](\\*+)(?=[\\s]|$)' // (1) #*** can only be a Right Delimiter
        + '|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)' // (2) a***#, a*** can only be a Right Delimiter
        + '|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])' // (3) #***a, ***a can only be Left Delimiter
        + '|[\\s](\\*+)(?!\\*)(?=[punct])' // (4) ***# can only be Left Delimiter
        + '|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])' // (5) #***# can be either Left or Right Delimiter
        + '|[^punct\\s](\\*+)(?=[^punct\\s])', 'gu') // (6) a***a can be either Left or Right Delimiter
        .replace(/punct/g, _punctuation)
        .getRegex();
    // (6) Not allowed for _
    const emStrongRDelimUnd = edit('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)' // Skip orphan inside strong
        + '|[^_]+(?=[^_])' // Consume to delim
        + '|(?!_)[punct](_+)(?=[\\s]|$)' // (1) #___ can only be a Right Delimiter
        + '|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)' // (2) a___#, a___ can only be a Right Delimiter
        + '|(?!_)[punct\\s](_+)(?=[^punct\\s])' // (3) #___a, ___a can only be Left Delimiter
        + '|[\\s](_+)(?!_)(?=[punct])' // (4) ___# can only be Left Delimiter
        + '|(?!_)[punct](_+)(?!_)(?=[punct])', 'gu') // (5) #___# can be either Left or Right Delimiter
        .replace(/punct/g, _punctuation)
        .getRegex();
    const anyPunctuation = edit(/\\([punct])/, 'gu')
        .replace(/punct/g, _punctuation)
        .getRegex();
    const autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
        .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
        .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/)
        .getRegex();
    const _inlineComment = edit(_comment).replace('(?:-->|$)', '-->').getRegex();
    const tag = edit('^comment'
        + '|^</[a-zA-Z][\\w:-]*\\s*>' // self-closing tag
        + '|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>' // open tag
        + '|^<\\?[\\s\\S]*?\\?>' // processing instruction, e.g. <?php ?>
        + '|^<![a-zA-Z]+\\s[\\s\\S]*?>' // declaration, e.g. <!DOCTYPE html>
        + '|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>') // CDATA section
        .replace('comment', _inlineComment)
        .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/)
        .getRegex();
    const _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
    const link = edit(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/)
        .replace('label', _inlineLabel)
        .replace('href', /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/)
        .replace('title', /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/)
        .getRegex();
    const reflink = edit(/^!?\[(label)\]\[(ref)\]/)
        .replace('label', _inlineLabel)
        .replace('ref', _blockLabel)
        .getRegex();
    const nolink = edit(/^!?\[(ref)\](?:\[\])?/)
        .replace('ref', _blockLabel)
        .getRegex();
    const reflinkSearch = edit('reflink|nolink(?!\\()', 'g')
        .replace('reflink', reflink)
        .replace('nolink', nolink)
        .getRegex();
    /**
     * Normal Inline Grammar
     */
    const inlineNormal = {
        _backpedal: noopTest, // only used for GFM url
        anyPunctuation,
        autolink,
        blockSkip,
        br,
        code: inlineCode,
        del: noopTest,
        emStrongLDelim,
        emStrongRDelimAst,
        emStrongRDelimUnd,
        escape,
        link,
        nolink,
        punctuation,
        reflink,
        reflinkSearch,
        tag,
        text: inlineText,
        url: noopTest,
    };
    /**
     * Pedantic Inline Grammar
     */
    const inlinePedantic = {
        ...inlineNormal,
        link: edit(/^!?\[(label)\]\((.*?)\)/)
            .replace('label', _inlineLabel)
            .getRegex(),
        reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/)
            .replace('label', _inlineLabel)
            .getRegex(),
    };
    /**
     * GFM Inline Grammar
     */
    const inlineGfm = {
        ...inlineNormal,
        escape: edit(escape).replace('])', '~|])').getRegex(),
        url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, 'i')
            .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/)
            .getRegex(),
        _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
        del: /^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,
        text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/,
    };
    /**
     * GFM + Line Breaks Inline Grammar
     */
    const inlineBreaks = {
        ...inlineGfm,
        br: edit(br).replace('{2,}', '*').getRegex(),
        text: edit(inlineGfm.text)
            .replace('\\b_', '\\b_| {2,}\\n')
            .replace(/\{2,\}/g, '*')
            .getRegex(),
    };
    /**
     * exports
     */
    const block = {
        normal: blockNormal,
        gfm: blockGfm,
        pedantic: blockPedantic,
    };
    const inline = {
        normal: inlineNormal,
        gfm: inlineGfm,
        breaks: inlineBreaks,
        pedantic: inlinePedantic,
    };

    /**
     * Block Lexer
     */
    class _Lexer {
        tokens;
        options;
        state;
        tokenizer;
        inlineQueue;
        constructor(options) {
            // TokenList cannot be created in one go
            this.tokens = [];
            this.tokens.links = Object.create(null);
            this.options = options || _defaults;
            this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
            this.tokenizer = this.options.tokenizer;
            this.tokenizer.options = this.options;
            this.tokenizer.lexer = this;
            this.inlineQueue = [];
            this.state = {
                inLink: false,
                inRawBlock: false,
                top: true,
            };
            const rules = {
                block: block.normal,
                inline: inline.normal,
            };
            if (this.options.pedantic) {
                rules.block = block.pedantic;
                rules.inline = inline.pedantic;
            }
            else if (this.options.gfm) {
                rules.block = block.gfm;
                if (this.options.breaks) {
                    rules.inline = inline.breaks;
                }
                else {
                    rules.inline = inline.gfm;
                }
            }
            this.tokenizer.rules = rules;
        }
        /**
         * Expose Rules
         */
        static get rules() {
            return {
                block,
                inline,
            };
        }
        /**
         * Static Lex Method
         */
        static lex(src, options) {
            const lexer = new _Lexer(options);
            return lexer.lex(src);
        }
        /**
         * Static Lex Inline Method
         */
        static lexInline(src, options) {
            const lexer = new _Lexer(options);
            return lexer.inlineTokens(src);
        }
        /**
         * Preprocessing
         */
        lex(src) {
            src = src
                .replace(/\r\n|\r/g, '\n');
            this.blockTokens(src, this.tokens);
            for (let i = 0; i < this.inlineQueue.length; i++) {
                const next = this.inlineQueue[i];
                this.inlineTokens(next.src, next.tokens);
            }
            this.inlineQueue = [];
            return this.tokens;
        }
        blockTokens(src, tokens = [], lastParagraphClipped = false) {
            if (this.options.pedantic) {
                src = src.replace(/\t/g, '    ').replace(/^ +$/gm, '');
            }
            else {
                src = src.replace(/^( *)(\t+)/gm, (_, leading, tabs) => {
                    return leading + '    '.repeat(tabs.length);
                });
            }
            let token;
            let lastToken;
            let cutSrc;
            while (src) {
                if (this.options.extensions
                    && this.options.extensions.block
                    && this.options.extensions.block.some((extTokenizer) => {
                        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
                            src = src.substring(token.raw.length);
                            tokens.push(token);
                            return true;
                        }
                        return false;
                    })) {
                    continue;
                }
                // newline
                if (token = this.tokenizer.space(src)) {
                    src = src.substring(token.raw.length);
                    if (token.raw.length === 1 && tokens.length > 0) {
                        // if there's a single \n as a spacer, it's terminating the last line,
                        // so move it there so that we don't get unnecessary paragraph tags
                        tokens[tokens.length - 1].raw += '\n';
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                // code
                if (token = this.tokenizer.code(src)) {
                    src = src.substring(token.raw.length);
                    lastToken = tokens[tokens.length - 1];
                    // An indented code block cannot interrupt a paragraph.
                    if (lastToken && (lastToken.type === 'paragraph' || lastToken.type === 'text')) {
                        lastToken.raw += '\n' + token.raw;
                        lastToken.text += '\n' + token.text;
                        this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                // fences
                if (token = this.tokenizer.fences(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // heading
                if (token = this.tokenizer.heading(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // hr
                if (token = this.tokenizer.hr(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // blockquote
                if (token = this.tokenizer.blockquote(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // list
                if (token = this.tokenizer.list(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // html
                if (token = this.tokenizer.html(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // def
                if (token = this.tokenizer.def(src)) {
                    src = src.substring(token.raw.length);
                    lastToken = tokens[tokens.length - 1];
                    if (lastToken && (lastToken.type === 'paragraph' || lastToken.type === 'text')) {
                        lastToken.raw += '\n' + token.raw;
                        lastToken.text += '\n' + token.raw;
                        this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
                    }
                    else if (!this.tokens.links[token.tag]) {
                        this.tokens.links[token.tag] = {
                            href: token.href,
                            title: token.title,
                        };
                    }
                    continue;
                }
                // table (gfm)
                if (token = this.tokenizer.table(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // lheading
                if (token = this.tokenizer.lheading(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // top-level paragraph
                // prevent paragraph consuming extensions by clipping 'src' to extension start
                cutSrc = src;
                if (this.options.extensions && this.options.extensions.startBlock) {
                    let startIndex = Infinity;
                    const tempSrc = src.slice(1);
                    let tempStart;
                    this.options.extensions.startBlock.forEach((getStartIndex) => {
                        tempStart = getStartIndex.call({ lexer: this }, tempSrc);
                        if (typeof tempStart === 'number' && tempStart >= 0) {
                            startIndex = Math.min(startIndex, tempStart);
                        }
                    });
                    if (startIndex < Infinity && startIndex >= 0) {
                        cutSrc = src.substring(0, startIndex + 1);
                    }
                }
                if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
                    lastToken = tokens[tokens.length - 1];
                    if (lastParagraphClipped && lastToken?.type === 'paragraph') {
                        lastToken.raw += '\n' + token.raw;
                        lastToken.text += '\n' + token.text;
                        this.inlineQueue.pop();
                        this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    lastParagraphClipped = (cutSrc.length !== src.length);
                    src = src.substring(token.raw.length);
                    continue;
                }
                // text
                if (token = this.tokenizer.text(src)) {
                    src = src.substring(token.raw.length);
                    lastToken = tokens[tokens.length - 1];
                    if (lastToken && lastToken.type === 'text') {
                        lastToken.raw += '\n' + token.raw;
                        lastToken.text += '\n' + token.text;
                        this.inlineQueue.pop();
                        this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                if (src) {
                    const errMsg = 'Infinite loop on byte: ' + src.charCodeAt(0);
                    if (this.options.silent) {
                        console.error(errMsg);
                        break;
                    }
                    else {
                        throw new Error(errMsg);
                    }
                }
            }
            this.state.top = true;
            return tokens;
        }
        inline(src, tokens = []) {
            this.inlineQueue.push({ src, tokens });
            return tokens;
        }
        /**
         * Lexing/Compiling
         */
        inlineTokens(src, tokens = []) {
            let token, lastToken, cutSrc;
            // String with links masked to avoid interference with em and strong
            let maskedSrc = src;
            let match;
            let keepPrevChar, prevChar;
            // Mask out reflinks
            if (this.tokens.links) {
                const links = Object.keys(this.tokens.links);
                if (links.length > 0) {
                    while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
                        if (links.includes(match[0].slice(match[0].lastIndexOf('[') + 1, -1))) {
                            maskedSrc = maskedSrc.slice(0, match.index) + '[' + 'a'.repeat(match[0].length - 2) + ']' + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
                        }
                    }
                }
            }
            // Mask out other blocks
            while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
                maskedSrc = maskedSrc.slice(0, match.index) + '[' + 'a'.repeat(match[0].length - 2) + ']' + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
            }
            // Mask out escaped characters
            while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
                maskedSrc = maskedSrc.slice(0, match.index) + '++' + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
            }
            while (src) {
                if (!keepPrevChar) {
                    prevChar = '';
                }
                keepPrevChar = false;
                // extensions
                if (this.options.extensions
                    && this.options.extensions.inline
                    && this.options.extensions.inline.some((extTokenizer) => {
                        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
                            src = src.substring(token.raw.length);
                            tokens.push(token);
                            return true;
                        }
                        return false;
                    })) {
                    continue;
                }
                // escape
                if (token = this.tokenizer.escape(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // tag
                if (token = this.tokenizer.tag(src)) {
                    src = src.substring(token.raw.length);
                    lastToken = tokens[tokens.length - 1];
                    if (lastToken && token.type === 'text' && lastToken.type === 'text') {
                        lastToken.raw += token.raw;
                        lastToken.text += token.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                // link
                if (token = this.tokenizer.link(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // reflink, nolink
                if (token = this.tokenizer.reflink(src, this.tokens.links)) {
                    src = src.substring(token.raw.length);
                    lastToken = tokens[tokens.length - 1];
                    if (lastToken && token.type === 'text' && lastToken.type === 'text') {
                        lastToken.raw += token.raw;
                        lastToken.text += token.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                // em & strong
                if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // code
                if (token = this.tokenizer.codespan(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // br
                if (token = this.tokenizer.br(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // del (gfm)
                if (token = this.tokenizer.del(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // autolink
                if (token = this.tokenizer.autolink(src)) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // url (gfm)
                if (!this.state.inLink && (token = this.tokenizer.url(src))) {
                    src = src.substring(token.raw.length);
                    tokens.push(token);
                    continue;
                }
                // text
                // prevent inlineText consuming extensions by clipping 'src' to extension start
                cutSrc = src;
                if (this.options.extensions && this.options.extensions.startInline) {
                    let startIndex = Infinity;
                    const tempSrc = src.slice(1);
                    let tempStart;
                    this.options.extensions.startInline.forEach((getStartIndex) => {
                        tempStart = getStartIndex.call({ lexer: this }, tempSrc);
                        if (typeof tempStart === 'number' && tempStart >= 0) {
                            startIndex = Math.min(startIndex, tempStart);
                        }
                    });
                    if (startIndex < Infinity && startIndex >= 0) {
                        cutSrc = src.substring(0, startIndex + 1);
                    }
                }
                if (token = this.tokenizer.inlineText(cutSrc)) {
                    src = src.substring(token.raw.length);
                    if (token.raw.slice(-1) !== '_') { // Track prevChar before string of ____ started
                        prevChar = token.raw.slice(-1);
                    }
                    keepPrevChar = true;
                    lastToken = tokens[tokens.length - 1];
                    if (lastToken && lastToken.type === 'text') {
                        lastToken.raw += token.raw;
                        lastToken.text += token.text;
                    }
                    else {
                        tokens.push(token);
                    }
                    continue;
                }
                if (src) {
                    const errMsg = 'Infinite loop on byte: ' + src.charCodeAt(0);
                    if (this.options.silent) {
                        console.error(errMsg);
                        break;
                    }
                    else {
                        throw new Error(errMsg);
                    }
                }
            }
            return tokens;
        }
    }

    /**
     * Renderer
     */
    class _Renderer {
        options;
        parser; // set by the parser
        constructor(options) {
            this.options = options || _defaults;
        }
        space(token) {
            return '';
        }
        code({ text, lang, escaped }) {
            const langString = (lang || '').match(/^\S*/)?.[0];
            const code = text.replace(/\n$/, '') + '\n';
            if (!langString) {
                return '<pre><code>'
                    + (escaped ? code : escape$1(code, true))
                    + '</code></pre>\n';
            }
            return '<pre><code class="language-'
                + escape$1(langString)
                + '">'
                + (escaped ? code : escape$1(code, true))
                + '</code></pre>\n';
        }
        blockquote({ tokens }) {
            const body = this.parser.parse(tokens);
            return `<blockquote>\n${body}</blockquote>\n`;
        }
        html({ text }) {
            return text;
        }
        heading({ tokens, depth }) {
            return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>\n`;
        }
        hr(token) {
            return '<hr>\n';
        }
        list(token) {
            const ordered = token.ordered;
            const start = token.start;
            let body = '';
            for (let j = 0; j < token.items.length; j++) {
                const item = token.items[j];
                body += this.listitem(item);
            }
            const type = ordered ? 'ol' : 'ul';
            const startAttr = (ordered && start !== 1) ? (' start="' + start + '"') : '';
            return '<' + type + startAttr + '>\n' + body + '</' + type + '>\n';
        }
        listitem(item) {
            let itemBody = '';
            if (item.task) {
                const checkbox = this.checkbox({ checked: !!item.checked });
                if (item.loose) {
                    if (item.tokens.length > 0 && item.tokens[0].type === 'paragraph') {
                        item.tokens[0].text = checkbox + ' ' + item.tokens[0].text;
                        if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === 'text') {
                            item.tokens[0].tokens[0].text = checkbox + ' ' + item.tokens[0].tokens[0].text;
                        }
                    }
                    else {
                        item.tokens.unshift({
                            type: 'text',
                            raw: checkbox + ' ',
                            text: checkbox + ' ',
                        });
                    }
                }
                else {
                    itemBody += checkbox + ' ';
                }
            }
            itemBody += this.parser.parse(item.tokens, !!item.loose);
            return `<li>${itemBody}</li>\n`;
        }
        checkbox({ checked }) {
            return '<input '
                + (checked ? 'checked="" ' : '')
                + 'disabled="" type="checkbox">';
        }
        paragraph({ tokens }) {
            return `<p>${this.parser.parseInline(tokens)}</p>\n`;
        }
        table(token) {
            let header = '';
            // header
            let cell = '';
            for (let j = 0; j < token.header.length; j++) {
                cell += this.tablecell(token.header[j]);
            }
            header += this.tablerow({ text: cell });
            let body = '';
            for (let j = 0; j < token.rows.length; j++) {
                const row = token.rows[j];
                cell = '';
                for (let k = 0; k < row.length; k++) {
                    cell += this.tablecell(row[k]);
                }
                body += this.tablerow({ text: cell });
            }
            if (body)
                body = `<tbody>${body}</tbody>`;
            return '<table>\n'
                + '<thead>\n'
                + header
                + '</thead>\n'
                + body
                + '</table>\n';
        }
        tablerow({ text }) {
            return `<tr>\n${text}</tr>\n`;
        }
        tablecell(token) {
            const content = this.parser.parseInline(token.tokens);
            const type = token.header ? 'th' : 'td';
            const tag = token.align
                ? `<${type} align="${token.align}">`
                : `<${type}>`;
            return tag + content + `</${type}>\n`;
        }
        /**
         * span level renderer
         */
        strong({ tokens }) {
            return `<strong>${this.parser.parseInline(tokens)}</strong>`;
        }
        em({ tokens }) {
            return `<em>${this.parser.parseInline(tokens)}</em>`;
        }
        codespan({ text }) {
            return `<code>${text}</code>`;
        }
        br(token) {
            return '<br>';
        }
        del({ tokens }) {
            return `<del>${this.parser.parseInline(tokens)}</del>`;
        }
        link({ href, title, tokens }) {
            const text = this.parser.parseInline(tokens);
            const cleanHref = cleanUrl(href);
            if (cleanHref === null) {
                return text;
            }
            href = cleanHref;
            let out = '<a href="' + href + '"';
            if (title) {
                out += ' title="' + title + '"';
            }
            out += '>' + text + '</a>';
            return out;
        }
        image({ href, title, text }) {
            const cleanHref = cleanUrl(href);
            if (cleanHref === null) {
                return text;
            }
            href = cleanHref;
            let out = `<img src="${href}" alt="${text}"`;
            if (title) {
                out += ` title="${title}"`;
            }
            out += '>';
            return out;
        }
        text(token) {
            return 'tokens' in token && token.tokens ? this.parser.parseInline(token.tokens) : token.text;
        }
    }

    /**
     * TextRenderer
     * returns only the textual part of the token
     */
    class _TextRenderer {
        // no need for block level renderers
        strong({ text }) {
            return text;
        }
        em({ text }) {
            return text;
        }
        codespan({ text }) {
            return text;
        }
        del({ text }) {
            return text;
        }
        html({ text }) {
            return text;
        }
        text({ text }) {
            return text;
        }
        link({ text }) {
            return '' + text;
        }
        image({ text }) {
            return '' + text;
        }
        br() {
            return '';
        }
    }

    /**
     * Parsing & Compiling
     */
    class _Parser {
        options;
        renderer;
        textRenderer;
        constructor(options) {
            this.options = options || _defaults;
            this.options.renderer = this.options.renderer || new _Renderer();
            this.renderer = this.options.renderer;
            this.renderer.options = this.options;
            this.renderer.parser = this;
            this.textRenderer = new _TextRenderer();
        }
        /**
         * Static Parse Method
         */
        static parse(tokens, options) {
            const parser = new _Parser(options);
            return parser.parse(tokens);
        }
        /**
         * Static Parse Inline Method
         */
        static parseInline(tokens, options) {
            const parser = new _Parser(options);
            return parser.parseInline(tokens);
        }
        /**
         * Parse Loop
         */
        parse(tokens, top = true) {
            let out = '';
            for (let i = 0; i < tokens.length; i++) {
                const anyToken = tokens[i];
                // Run any renderer extensions
                if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
                    const genericToken = anyToken;
                    const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
                    if (ret !== false || !['space', 'hr', 'heading', 'code', 'table', 'blockquote', 'list', 'html', 'paragraph', 'text'].includes(genericToken.type)) {
                        out += ret || '';
                        continue;
                    }
                }
                const token = anyToken;
                switch (token.type) {
                    case 'space': {
                        out += this.renderer.space(token);
                        continue;
                    }
                    case 'hr': {
                        out += this.renderer.hr(token);
                        continue;
                    }
                    case 'heading': {
                        out += this.renderer.heading(token);
                        continue;
                    }
                    case 'code': {
                        out += this.renderer.code(token);
                        continue;
                    }
                    case 'table': {
                        out += this.renderer.table(token);
                        continue;
                    }
                    case 'blockquote': {
                        out += this.renderer.blockquote(token);
                        continue;
                    }
                    case 'list': {
                        out += this.renderer.list(token);
                        continue;
                    }
                    case 'html': {
                        out += this.renderer.html(token);
                        continue;
                    }
                    case 'paragraph': {
                        out += this.renderer.paragraph(token);
                        continue;
                    }
                    case 'text': {
                        let textToken = token;
                        let body = this.renderer.text(textToken);
                        while (i + 1 < tokens.length && tokens[i + 1].type === 'text') {
                            textToken = tokens[++i];
                            body += '\n' + this.renderer.text(textToken);
                        }
                        if (top) {
                            out += this.renderer.paragraph({
                                type: 'paragraph',
                                raw: body,
                                text: body,
                                tokens: [{ type: 'text', raw: body, text: body }],
                            });
                        }
                        else {
                            out += body;
                        }
                        continue;
                    }
                    default: {
                        const errMsg = 'Token with "' + token.type + '" type was not found.';
                        if (this.options.silent) {
                            console.error(errMsg);
                            return '';
                        }
                        else {
                            throw new Error(errMsg);
                        }
                    }
                }
            }
            return out;
        }
        /**
         * Parse Inline Tokens
         */
        parseInline(tokens, renderer) {
            renderer = renderer || this.renderer;
            let out = '';
            for (let i = 0; i < tokens.length; i++) {
                const anyToken = tokens[i];
                // Run any renderer extensions
                if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
                    const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
                    if (ret !== false || !['escape', 'html', 'link', 'image', 'strong', 'em', 'codespan', 'br', 'del', 'text'].includes(anyToken.type)) {
                        out += ret || '';
                        continue;
                    }
                }
                const token = anyToken;
                switch (token.type) {
                    case 'escape': {
                        out += renderer.text(token);
                        break;
                    }
                    case 'html': {
                        out += renderer.html(token);
                        break;
                    }
                    case 'link': {
                        out += renderer.link(token);
                        break;
                    }
                    case 'image': {
                        out += renderer.image(token);
                        break;
                    }
                    case 'strong': {
                        out += renderer.strong(token);
                        break;
                    }
                    case 'em': {
                        out += renderer.em(token);
                        break;
                    }
                    case 'codespan': {
                        out += renderer.codespan(token);
                        break;
                    }
                    case 'br': {
                        out += renderer.br(token);
                        break;
                    }
                    case 'del': {
                        out += renderer.del(token);
                        break;
                    }
                    case 'text': {
                        out += renderer.text(token);
                        break;
                    }
                    default: {
                        const errMsg = 'Token with "' + token.type + '" type was not found.';
                        if (this.options.silent) {
                            console.error(errMsg);
                            return '';
                        }
                        else {
                            throw new Error(errMsg);
                        }
                    }
                }
            }
            return out;
        }
    }

    class _Hooks {
        options;
        block;
        constructor(options) {
            this.options = options || _defaults;
        }
        static passThroughHooks = new Set([
            'preprocess',
            'postprocess',
            'processAllTokens',
        ]);
        /**
         * Process markdown before marked
         */
        preprocess(markdown) {
            return markdown;
        }
        /**
         * Process HTML after marked is finished
         */
        postprocess(html) {
            return html;
        }
        /**
         * Process all tokens before walk tokens
         */
        processAllTokens(tokens) {
            return tokens;
        }
        /**
         * Provide function to tokenize markdown
         */
        provideLexer() {
            return this.block ? _Lexer.lex : _Lexer.lexInline;
        }
        /**
         * Provide function to parse tokens
         */
        provideParser() {
            return this.block ? _Parser.parse : _Parser.parseInline;
        }
    }

    class Marked {
        defaults = _getDefaults();
        options = this.setOptions;
        parse = this.parseMarkdown(true);
        parseInline = this.parseMarkdown(false);
        Parser = _Parser;
        Renderer = _Renderer;
        TextRenderer = _TextRenderer;
        Lexer = _Lexer;
        Tokenizer = _Tokenizer;
        Hooks = _Hooks;
        constructor(...args) {
            this.use(...args);
        }
        /**
         * Run callback for every token
         */
        walkTokens(tokens, callback) {
            let values = [];
            for (const token of tokens) {
                values = values.concat(callback.call(this, token));
                switch (token.type) {
                    case 'table': {
                        const tableToken = token;
                        for (const cell of tableToken.header) {
                            values = values.concat(this.walkTokens(cell.tokens, callback));
                        }
                        for (const row of tableToken.rows) {
                            for (const cell of row) {
                                values = values.concat(this.walkTokens(cell.tokens, callback));
                            }
                        }
                        break;
                    }
                    case 'list': {
                        const listToken = token;
                        values = values.concat(this.walkTokens(listToken.items, callback));
                        break;
                    }
                    default: {
                        const genericToken = token;
                        if (this.defaults.extensions?.childTokens?.[genericToken.type]) {
                            this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
                                const tokens = genericToken[childTokens].flat(Infinity);
                                values = values.concat(this.walkTokens(tokens, callback));
                            });
                        }
                        else if (genericToken.tokens) {
                            values = values.concat(this.walkTokens(genericToken.tokens, callback));
                        }
                    }
                }
            }
            return values;
        }
        use(...args) {
            const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
            args.forEach((pack) => {
                // copy options to new object
                const opts = { ...pack };
                // set async to true if it was set to true before
                opts.async = this.defaults.async || opts.async || false;
                // ==-- Parse "addon" extensions --== //
                if (pack.extensions) {
                    pack.extensions.forEach((ext) => {
                        if (!ext.name) {
                            throw new Error('extension name required');
                        }
                        if ('renderer' in ext) { // Renderer extensions
                            const prevRenderer = extensions.renderers[ext.name];
                            if (prevRenderer) {
                                // Replace extension with func to run new extension but fall back if false
                                extensions.renderers[ext.name] = function (...args) {
                                    let ret = ext.renderer.apply(this, args);
                                    if (ret === false) {
                                        ret = prevRenderer.apply(this, args);
                                    }
                                    return ret;
                                };
                            }
                            else {
                                extensions.renderers[ext.name] = ext.renderer;
                            }
                        }
                        if ('tokenizer' in ext) { // Tokenizer Extensions
                            if (!ext.level || (ext.level !== 'block' && ext.level !== 'inline')) {
                                throw new Error("extension level must be 'block' or 'inline'");
                            }
                            const extLevel = extensions[ext.level];
                            if (extLevel) {
                                extLevel.unshift(ext.tokenizer);
                            }
                            else {
                                extensions[ext.level] = [ext.tokenizer];
                            }
                            if (ext.start) { // Function to check for start of token
                                if (ext.level === 'block') {
                                    if (extensions.startBlock) {
                                        extensions.startBlock.push(ext.start);
                                    }
                                    else {
                                        extensions.startBlock = [ext.start];
                                    }
                                }
                                else if (ext.level === 'inline') {
                                    if (extensions.startInline) {
                                        extensions.startInline.push(ext.start);
                                    }
                                    else {
                                        extensions.startInline = [ext.start];
                                    }
                                }
                            }
                        }
                        if ('childTokens' in ext && ext.childTokens) { // Child tokens to be visited by walkTokens
                            extensions.childTokens[ext.name] = ext.childTokens;
                        }
                    });
                    opts.extensions = extensions;
                }
                // ==-- Parse "overwrite" extensions --== //
                if (pack.renderer) {
                    const renderer = this.defaults.renderer || new _Renderer(this.defaults);
                    for (const prop in pack.renderer) {
                        if (!(prop in renderer)) {
                            throw new Error(`renderer '${prop}' does not exist`);
                        }
                        if (['options', 'parser'].includes(prop)) {
                            // ignore options property
                            continue;
                        }
                        const rendererProp = prop;
                        const rendererFunc = pack.renderer[rendererProp];
                        const prevRenderer = renderer[rendererProp];
                        // Replace renderer with func to run extension, but fall back if false
                        renderer[rendererProp] = (...args) => {
                            let ret = rendererFunc.apply(renderer, args);
                            if (ret === false) {
                                ret = prevRenderer.apply(renderer, args);
                            }
                            return ret || '';
                        };
                    }
                    opts.renderer = renderer;
                }
                if (pack.tokenizer) {
                    const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
                    for (const prop in pack.tokenizer) {
                        if (!(prop in tokenizer)) {
                            throw new Error(`tokenizer '${prop}' does not exist`);
                        }
                        if (['options', 'rules', 'lexer'].includes(prop)) {
                            // ignore options, rules, and lexer properties
                            continue;
                        }
                        const tokenizerProp = prop;
                        const tokenizerFunc = pack.tokenizer[tokenizerProp];
                        const prevTokenizer = tokenizer[tokenizerProp];
                        // Replace tokenizer with func to run extension, but fall back if false
                        // @ts-expect-error cannot type tokenizer function dynamically
                        tokenizer[tokenizerProp] = (...args) => {
                            let ret = tokenizerFunc.apply(tokenizer, args);
                            if (ret === false) {
                                ret = prevTokenizer.apply(tokenizer, args);
                            }
                            return ret;
                        };
                    }
                    opts.tokenizer = tokenizer;
                }
                // ==-- Parse Hooks extensions --== //
                if (pack.hooks) {
                    const hooks = this.defaults.hooks || new _Hooks();
                    for (const prop in pack.hooks) {
                        if (!(prop in hooks)) {
                            throw new Error(`hook '${prop}' does not exist`);
                        }
                        if (['options', 'block'].includes(prop)) {
                            // ignore options and block properties
                            continue;
                        }
                        const hooksProp = prop;
                        const hooksFunc = pack.hooks[hooksProp];
                        const prevHook = hooks[hooksProp];
                        if (_Hooks.passThroughHooks.has(prop)) {
                            // @ts-expect-error cannot type hook function dynamically
                            hooks[hooksProp] = (arg) => {
                                if (this.defaults.async) {
                                    return Promise.resolve(hooksFunc.call(hooks, arg)).then(ret => {
                                        return prevHook.call(hooks, ret);
                                    });
                                }
                                const ret = hooksFunc.call(hooks, arg);
                                return prevHook.call(hooks, ret);
                            };
                        }
                        else {
                            // @ts-expect-error cannot type hook function dynamically
                            hooks[hooksProp] = (...args) => {
                                let ret = hooksFunc.apply(hooks, args);
                                if (ret === false) {
                                    ret = prevHook.apply(hooks, args);
                                }
                                return ret;
                            };
                        }
                    }
                    opts.hooks = hooks;
                }
                // ==-- Parse WalkTokens extensions --== //
                if (pack.walkTokens) {
                    const walkTokens = this.defaults.walkTokens;
                    const packWalktokens = pack.walkTokens;
                    opts.walkTokens = function (token) {
                        let values = [];
                        values.push(packWalktokens.call(this, token));
                        if (walkTokens) {
                            values = values.concat(walkTokens.call(this, token));
                        }
                        return values;
                    };
                }
                this.defaults = { ...this.defaults, ...opts };
            });
            return this;
        }
        setOptions(opt) {
            this.defaults = { ...this.defaults, ...opt };
            return this;
        }
        lexer(src, options) {
            return _Lexer.lex(src, options ?? this.defaults);
        }
        parser(tokens, options) {
            return _Parser.parse(tokens, options ?? this.defaults);
        }
        parseMarkdown(blockType) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parse = (src, options) => {
                const origOpt = { ...options };
                const opt = { ...this.defaults, ...origOpt };
                const throwError = this.onError(!!opt.silent, !!opt.async);
                // throw error if an extension set async to true but parse was called with async: false
                if (this.defaults.async === true && origOpt.async === false) {
                    return throwError(new Error('marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.'));
                }
                // throw error in case of non string input
                if (typeof src === 'undefined' || src === null) {
                    return throwError(new Error('marked(): input parameter is undefined or null'));
                }
                if (typeof src !== 'string') {
                    return throwError(new Error('marked(): input parameter is of type '
                        + Object.prototype.toString.call(src) + ', string expected'));
                }
                if (opt.hooks) {
                    opt.hooks.options = opt;
                    opt.hooks.block = blockType;
                }
                const lexer = opt.hooks ? opt.hooks.provideLexer() : (blockType ? _Lexer.lex : _Lexer.lexInline);
                const parser = opt.hooks ? opt.hooks.provideParser() : (blockType ? _Parser.parse : _Parser.parseInline);
                if (opt.async) {
                    return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src)
                        .then(src => lexer(src, opt))
                        .then(tokens => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens)
                        .then(tokens => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens)
                        .then(tokens => parser(tokens, opt))
                        .then(html => opt.hooks ? opt.hooks.postprocess(html) : html)
                        .catch(throwError);
                }
                try {
                    if (opt.hooks) {
                        src = opt.hooks.preprocess(src);
                    }
                    let tokens = lexer(src, opt);
                    if (opt.hooks) {
                        tokens = opt.hooks.processAllTokens(tokens);
                    }
                    if (opt.walkTokens) {
                        this.walkTokens(tokens, opt.walkTokens);
                    }
                    let html = parser(tokens, opt);
                    if (opt.hooks) {
                        html = opt.hooks.postprocess(html);
                    }
                    return html;
                }
                catch (e) {
                    return throwError(e);
                }
            };
            return parse;
        }
        onError(silent, async) {
            return (e) => {
                e.message += '\nPlease report this to https://github.com/markedjs/marked.';
                if (silent) {
                    const msg = '<p>An error occurred:</p><pre>'
                        + escape$1(e.message + '', true)
                        + '</pre>';
                    if (async) {
                        return Promise.resolve(msg);
                    }
                    return msg;
                }
                if (async) {
                    return Promise.reject(e);
                }
                throw e;
            };
        }
    }

    const markedInstance = new Marked();
    function marked(src, opt) {
        return markedInstance.parse(src, opt);
    }
    /**
     * Sets the default options.
     *
     * @param options Hash of options
     */
    marked.options =
        marked.setOptions = function (options) {
            markedInstance.setOptions(options);
            marked.defaults = markedInstance.defaults;
            changeDefaults(marked.defaults);
            return marked;
        };
    /**
     * Gets the original marked default options.
     */
    marked.getDefaults = _getDefaults;
    marked.defaults = _defaults;
    /**
     * Use Extension
     */
    marked.use = function (...args) {
        markedInstance.use(...args);
        marked.defaults = markedInstance.defaults;
        changeDefaults(marked.defaults);
        return marked;
    };
    /**
     * Run callback for every token
     */
    marked.walkTokens = function (tokens, callback) {
        return markedInstance.walkTokens(tokens, callback);
    };
    /**
     * Compiles markdown to HTML without enclosing `p` tag.
     *
     * @param src String of markdown source to be compiled
     * @param options Hash of options
     * @return String of compiled HTML
     */
    marked.parseInline = markedInstance.parseInline;
    /**
     * Expose
     */
    marked.Parser = _Parser;
    marked.parser = _Parser.parse;
    marked.Renderer = _Renderer;
    marked.TextRenderer = _TextRenderer;
    marked.Lexer = _Lexer;
    marked.lexer = _Lexer.lex;
    marked.Tokenizer = _Tokenizer;
    marked.Hooks = _Hooks;
    marked.parse = marked;
    marked.options;
    marked.setOptions;
    marked.use;
    marked.walkTokens;
    marked.parseInline;
    _Parser.parse;
    _Lexer.lex;

    /* src/lib/Markdown.svelte generated by Svelte v3.59.2 */

    function create_if_block(ctx) {
    	let html_tag;
    	let raw_value = marked(/*toHtml*/ ctx[0]) + "";
    	let html_anchor;

    	return {
    		c() {
    			html_tag = new HtmlTag(false);
    			html_anchor = empty();
    			html_tag.a = html_anchor;
    		},
    		m(target, anchor) {
    			html_tag.m(raw_value, target, anchor);
    			insert(target, html_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*toHtml*/ 1 && raw_value !== (raw_value = marked(/*toHtml*/ ctx[0]) + "")) html_tag.p(raw_value);
    		},
    		d(detaching) {
    			if (detaching) detach(html_anchor);
    			if (detaching) html_tag.d();
    		}
    	};
    }

    function create_fragment(ctx) {
    	let if_block_anchor;
    	let if_block = /*toHtml*/ ctx[0] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*toHtml*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { toHtml = '' } = $$props;
    	marked.use({ mangle: false, headerIds: false });

    	$$self.$$set = $$props => {
    		if ('toHtml' in $$props) $$invalidate(0, toHtml = $$props.toHtml);
    	};

    	return [toHtml];
    }

    class Markdown extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { toHtml: 0 });
    	}
    }

    return Markdown;

}));
