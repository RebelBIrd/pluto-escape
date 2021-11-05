"use strict";
var _a, _b;
var args = require('minimist')(process.argv.slice(2));
var write = (_a = args['write']) === null || _a === void 0 ? void 0 : _a.split(',');
var ignore = ((_b = args['ignore']) === null || _b === void 0 ? void 0 : _b.split(',')) || [];
var targetDir = args["_"][0];
var cwd = process.cwd();
var existPathMap = {};
//# sourceMappingURL=index.js.map