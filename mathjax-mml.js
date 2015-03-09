/// <reference path="../dist/math-item.d.ts" />
/// <reference path="mathjax.d.ts" />
var FlorianMath;
(function (FlorianMath) {
    var global = window;
    var doc = document;
    function triggerQueue(queue) {
        FlorianMath.each(queue, function (fn) {
            fn();
        });
    }
    if (!MathJax || !MathJax.Hub) {
        throw Error("MathJax not loaded");
    }
    FlorianMath.mathjaxTypeset = (function () {
        var scriptQueue = [], doneQueue = [], postQueue = [], typesetting = false;
        function start() {
            var sq = scriptQueue, dq = doneQueue;
            function done() {
                triggerQueue(dq);
                if (!scriptQueue.length) {
                    var pq = postQueue;
                    postQueue = [];
                    typesetting = false;
                    triggerQueue(pq);
                }
                else
                    start();
            }
            scriptQueue = [];
            doneQueue = [];
            MathJax.Hub.Queue(['Process', MathJax.Hub, sq, done]);
        }
        return function (script, done, post) {
            scriptQueue.push(script);
            doneQueue.push(done);
            postQueue.push(post);
            if (!typesetting) {
                typesetting = true;
                start();
            }
        };
    })();
    FlorianMath.mathjaxAddMMLSource = (function () {
        function toMathML(jax, callback) {
            try {
                callback(jax.root.toMathML(''));
            }
            catch (err) {
                if (!err.restart) {
                    throw err;
                } // an actual error
                MathJax.Callback.After([toMathML, jax, callback], err.restart);
            }
        }
        return function (mathItem, script) {
            var jax = MathJax.Hub.getJaxFor(script);
            if (!jax)
                return;
            toMathML(jax, function (mml) {
                var mathSrc = doc.createElement(FlorianMath.MATH_SOURCE_TAG);
                global.HTMLMathSourceElement.manualCreate(mathSrc);
                mathSrc.setAttribute('type', 'application/mathml+xml');
                mathSrc.setAttribute('name', 'MathJax');
                mathSrc.setAttribute('usage', 'norender');
                mathSrc.appendChild(doc.createTextNode(mml));
                mathItem.appendChild(mathSrc);
                global.HTMLMathSourceElement.manualAttach(mathSrc);
            });
        };
    })();
})(FlorianMath || (FlorianMath = {}));
/// <reference path="../dist/math-item.d.ts" />
/// <reference path="mathjax-helpers.ts" />
var FlorianMath;
(function (FlorianMath) {
    var global = window;
    var doc = document;
    function tagsToLowerCase(mml) {
        var beginTagConvert = function (match, m1, m2) { return '<' + m1.toLowerCase() + m2 + '>'; };
        var endTagConvert = function (match, m1) { return '</' + m1.toLowerCase() + '>'; };
        return mml.replace(/<([a-zA-Z0-9_-]+)\s*(| [^>]+)>/g, beginTagConvert).replace(/<\s*\/\s*([a-zA-Z0-9_-]+)\s*>/g, endTagConvert);
    }
    if (global.HTMLMathItemElement) {
        var origRender = global.HTMLMathItemElement.render;
        global.HTMLMathItemElement.render = function () {
            var mathItem = this, sources = mathItem.getSources({ render: true, type: FlorianMath.MIME_TYPE_MATHML });
            if (sources.length) {
                var script = doc.createElement('script'), output = FlorianMath.mathItemInsertContent(this);
                script.type = 'math/mml';
                // lower case tags are important to MathJax (IE8 converts to upper case)
                script.text = FlorianMath.trim(tagsToLowerCase(sources[0].innerHTML));
                output.element.appendChild(script);
                FlorianMath.mathjaxTypeset(script, output.done, function () {
                    FlorianMath.mathjaxAddMMLSource(mathItem, script);
                });
            }
            else
                origRender.call(this);
        };
    }
})(FlorianMath || (FlorianMath = {}));
//# sourceMappingURL=mathjax-mml.js.map