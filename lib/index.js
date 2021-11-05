"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var minimist_1 = __importDefault(require("minimist"));
var core_1 = __importDefault(require("@babel/core"));
var fs_1 = __importDefault(require("fs"));
var shelljs_1 = __importDefault(require("shelljs"));
var utils_1 = require("./utils");
var args = (0, minimist_1.default)(process.argv.slice(2));
var write = ((_a = args['write']) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
var ignore = ((_b = args['ignore']) === null || _b === void 0 ? void 0 : _b.split(',')) || [];
var targetDir = args['_'][0];
var cwd = process.cwd();
var existPathMap = {};
if (!targetDir) {
    console.error('目标文件目录不能为空。ex: pluto-escape app/javascript');
    process.exit();
}
if (write.length === 0) {
    console.error('写入 yml 文件不能为空。ex: pluto-escape app/javascript --write config/locales/javascript.zh-CN.yml,config/locales/javascript.en.yml');
    process.exit();
}
var targetFiles = (0, utils_1.getTargetFile)(targetDir, ignore);
targetFiles.forEach(function (file, index) {
    console.log("\u6B63\u5728\u5904\u7406\u6587\u4EF6 (" + (index + 1) + "/" + targetFiles.length + ", " + ((index + 1 / targetFiles.length) * 100).toFixed(2) + "%): " + file);
    // TODO: 项目中目标文件夹在第二层级 project/xxx/target 以后优化做通用配置
    var _a = file.split('/'), paths = _a.slice(2);
    var line = '';
    var addNothing = true;
    var lineMap = {};
    for (var i = 0; i < paths.length; i++) {
        var existPathKey = paths.slice(0, i + 1).join('.');
        var addLine = Array((i + 2) * 2).join(' ') + ' ' + paths[i] + ':' + '\n';
        if (!existPathMap[existPathKey]) {
            line += addLine.toLowerCase();
            existPathMap[existPathKey] = true;
        }
    }
    core_1.default.transformFileSync(file, {
        ast: false,
        code: false,
        plugins: [
            function () {
                return {
                    visitor: {
                        /**
                         * 内嵌在标签中的 文本
                         * <div>我是文本</div>
                         */
                        JSXText: function (_path) {
                            var node = _path.node;
                            /**
                             * 使用 \n 分割为数组
                             * 每个 item 去掉前后空格
                             * 过滤空串
                             */
                            var values = node.value
                                .split('\n')
                                .map(function (_) { return _.replace(/(^\s*)|(\s*$)/g, ''); })
                                .filter(function (_) { return _.length > 0; });
                            values.forEach(function (value) {
                                var _a = (0, utils_1.genShellInfo)(value, node, paths, lineMap), item = _a[0], key = _a[1], newLine = _a[2], canGoOn = _a[3];
                                if (!canGoOn)
                                    return _path.skip();
                                line += newLine;
                                addNothing = false;
                                var target = "{t(\"js." + paths.join('.').toLowerCase() + "." + key + "\")}";
                                (0, utils_1.sedLine)(item, target, file);
                            });
                            _path.skip();
                        },
                        /**
                         * 第一种 const person = { name: "大黄" }; "大黄" -> t("js.xxx.xxx.xxx")
                         * 第二种 const Item = () => <Label title="全干工程师" />; "全干工程师" -> {t("js.xxx.xxx.xxx")}
                         * 根据 父节点 type === JSXAttribute 判定
                         */
                        StringLiteral: function (_path) {
                            var node = _path.node;
                            var parentNode = _path.parentPath.node;
                            var needBrace = parentNode.type === 'JSXAttribute';
                            var value = node.value;
                            var _a = (0, utils_1.genShellInfo)(value, node, paths, lineMap), item = _a[0], key = _a[1], newLine = _a[2], canGoOn = _a[3];
                            if (!canGoOn)
                                return _path.skip();
                            line += newLine;
                            addNothing = false;
                            var target = '';
                            if (needBrace) {
                                target = "{t(\\\"js." + paths.join('.').toLowerCase() + "." + key + "\\\")}";
                            }
                            else {
                                target = "t(\\\"js." + paths.join('.').toLowerCase() + "." + key + "\\\")";
                            }
                            shelljs_1.default.exec("gsed -i '" + item.line + "," + item.endLine + "s/\"" + (0, utils_1.dealEscapeString)(item.value) + "\"/" + target + "/' " + file, { cwd: cwd });
                            shelljs_1.default.exec("gsed -i \"" + item.line + "," + item.endLine + "s/'" + (0, utils_1.dealEscapeString)(item.value) + "'/" + target + "/\" " + file, { cwd: cwd });
                            _path.skip();
                        },
                        TemplateLiteral: function (_path) {
                            var node = _path.node;
                            var hasCN = node.quasis.some(function (_node) {
                                var value = typeof _node.value === 'object' ? _node.value.cooked || _node.value.raw : _node.value;
                                return /\p{Unified_Ideograph}/u.test(value);
                            });
                            var hanDeal = node.expressions.every(function (exp) { return exp.type === 'Identifier' || exp.type === 'MemberExpression'; });
                            var singleLine = node.loc.start.line === node.loc.end.line;
                            var canGoOn = true;
                            if (singleLine && hasCN && hanDeal) {
                                var quasis = node.quasis.filter(function (_) { var _a; return ((_a = _.value) === null || _a === void 0 ? void 0 : _a.raw.length) > 0; });
                                var key = (0, utils_1.genKeyFromValue)(quasis.map(function (_) { return _.value.raw; }).join(''));
                                var QE = quasis.concat(node.expressions).sort(function (q, e) { return q.start - e.start; });
                                var expIndex_1 = 0;
                                var tValues_1 = [];
                                var qeValue_1 = '';
                                QE.forEach(function (item) {
                                    switch (item.type) {
                                        case 'Identifier':
                                            expIndex_1++;
                                            qeValue_1 += "{{value" + expIndex_1 + "}}";
                                            tValues_1.push("value" + expIndex_1 + ": " + item.name);
                                            break;
                                        case 'MemberExpression':
                                            expIndex_1++;
                                            qeValue_1 += "{{value" + expIndex_1 + "}}";
                                            var simpleExpressionValue = (0, utils_1.dealSimpleMemberExpression)(item);
                                            if (simpleExpressionValue) {
                                                tValues_1.push("value" + expIndex_1 + ": " + simpleExpressionValue);
                                            }
                                            else {
                                                canGoOn = false;
                                            }
                                            break;
                                        case 'TemplateElement':
                                            qeValue_1 += item.value.raw;
                                            break;
                                        default:
                                            canGoOn = false;
                                            break;
                                    }
                                });
                                if (!canGoOn)
                                    return _path.skip();
                                var newLine = '';
                                if (!lineMap[key]) {
                                    newLine = Array((paths.length + 2) * 2).join(' ') + ' ' + key + ': ' + ("'" + qeValue_1 + "'") + '\n';
                                    line += newLine;
                                    addNothing = false;
                                }
                                var target = "t(\"js." + paths.join('.').toLowerCase() + "." + key + "\", { " + tValues_1.join(', ') + " })";
                                shelljs_1.default.exec("gsed -i '" + node.loc.start.line + "s/`.*`/" + target + "/' " + file, { cwd: cwd });
                                lineMap[key] = true;
                            }
                            _path.skip();
                        },
                    },
                };
            },
        ],
    });
    if (addNothing) {
        line += Array((paths.length + 2) * 2).join(' ') + " empty_i18n_placeholder: null\n";
    }
    console.log('写入 yml 文件:\n', line);
    write.forEach(function (wFile) { return fs_1.default.writeFileSync(wFile, line, { flag: 'a' }); });
});
