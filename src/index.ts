const args = require('minimist')(process.argv.slice(2));

const write = args['write']?.split(',');
const ignore = args['ignore']?.split(',') || [];
const [targetDir] = args["_"];
const cwd = process.cwd();
const existPathMap = {};