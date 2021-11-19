#!/usr/bin/env node
import minimist from 'minimist';
import { transformFileSync } from '@babel/core';
import fs from 'fs';
import shell from 'shelljs';
import {
  dealEscapeString,
  dealSimpleMemberExpression,
  genKeyFromValue,
  genShellInfo,
  getTargetFile,
  sedLine,
} from './utils';

const args = minimist(process.argv.slice(2));
const write: string[] = args['write']?.split(',') || [];
const ignore: string[] = args['ignore']?.split(',') || [];
const [targetDir] = args['_'];
const cwd = process.cwd();
const existPathMap: { [key: string]: boolean } = {};

if (!targetDir) {
  console.error('目标文件目录不能为空。ex: pluto-escape app/javascript');
  process.exit();
}
if (write.length === 0) {
  console.error(
    '写入 yml 文件不能为空。ex: pluto-escape app/javascript --write config/locales/javascript.zh-CN.yml,config/locales/javascript.en.yml'
  );
  process.exit();
}

const targetFiles = getTargetFile(targetDir, ignore);
targetFiles.forEach((file, index) => {
  console.log(
    `正在处理文件 (${index + 1}/${targetFiles.length}, ${(((index + 1) / targetFiles.length) * 100).toFixed(
      2
    )}%): ${file}`
  );
  // TODO: 项目中目标文件夹在第二层级 project/xxx/target 以后优化做通用配置
  const [, , ...paths] = file.split('.')[0]?.split('/');
  let line = '';
  let addNothing = true;
  const lineMap: { [key: string]: boolean } = {};
  for (let i = 0; i < paths.length; i++) {
    const existPathKey = paths.slice(0, i + 1).join('.');
    const addLine = Array((i + 2) * 2).join(' ') + ' ' + paths[i] + ':' + '\n';
    if (!existPathMap[existPathKey]) {
      line += addLine
      existPathMap[existPathKey] = true;
    }
  }
  transformFileSync(file, {
    ast: false,
    code: false,
    plugins: [
      () => {
        return {
          visitor: {
            /**
             * 内嵌在标签中的 文本
             * <div>我是文本</div>
             */
            JSXText: (_path: any) => {
              const node = _path.node;
              /**
               * 使用 \n 分割为数组
               * 每个 item 去掉前后空格
               * 过滤空串
               */
              const values: string[] = node.value
                .split('\n')
                .map((_: string) => _.replace(/(^\s*)|(\s*$)/g, ''))
                .filter((_: string) => _.length > 0);
              values.forEach((value) => {
                const [item, key, newLine, canGoOn] = genShellInfo(value, node, paths, lineMap);
                if (!canGoOn) return _path.skip();
                line += newLine;
                addNothing = false;
                const target = `{t("js.${paths.join('.').toLowerCase()}.${key}")}`;
                sedLine(item!, target, file);
              });
              _path.skip();
            },
            /**
             * 第一种 const person = { name: "大黄" }; "大黄" -> t("js.xxx.xxx.xxx")
             * 第二种 const Item = () => <Label title="全干工程师" />; "全干工程师" -> {t("js.xxx.xxx.xxx")}
             * 根据 父节点 type === JSXAttribute 判定
             */
            StringLiteral: (_path: any) => {
              const node = _path.node;
              const parentNode = _path.parentPath.node;
              const needBrace = parentNode.type === 'JSXAttribute';
              const value = node.value;
              const [item, key, newLine, canGoOn] = genShellInfo(value, node, paths, lineMap);
              if (!canGoOn) return _path.skip();
              line += newLine;
              addNothing = false;
              let target = '';
              if (needBrace) {
                target = `{t(\\"js.${paths.join('.').toLowerCase()}.${key}\\")}`;
              } else {
                target = `t(\\"js.${paths.join('.').toLowerCase()}.${key}\\")`;
              }
              shell.exec(
                `gsed -i '${item!.line},${item!.endLine}s/\"${dealEscapeString(item!.value)}\"/${target}/' ${file}`,
                { cwd: cwd }
              );
              shell.exec(
                `gsed -i "${item!.line},${item!.endLine}s/\'${dealEscapeString(item!.value)}\'/${target}/" ${file}`,
                { cwd: cwd }
              );
              _path.skip();
            },
            TemplateLiteral: (_path: any) => {
              const node = _path.node;
              const hasCN = node.quasis.some((_node: any) => {
                let value = typeof _node.value === 'object' ? _node.value.cooked || _node.value.raw : _node.value;
                return /\p{Unified_Ideograph}/u.test(value);
              });
              const hanDeal = node.expressions.every(
                (exp: any) => exp.type === 'Identifier' || exp.type === 'MemberExpression'
              );
              const singleLine = node.loc.start.line === node.loc.end.line;
              let canGoOn = true;
              if (singleLine && hasCN && hanDeal) {
                const quasis = node.quasis.filter((_: any) => _.value?.raw.length > 0);
                const key = genKeyFromValue(quasis.map((_: any) => _.value.raw).join(''));
                const QE = quasis.concat(node.expressions).sort((q: any, e: any) => q.start - e.start);
                let expIndex = 0;
                const tValues: string[] = [];
                let qeValue = '';
                QE.forEach((item: any) => {
                  switch (item.type) {
                    case 'Identifier':
                      expIndex++;
                      qeValue += `{{value${expIndex}}}`;
                      tValues.push(`value${expIndex}: ${item.name}`);
                      break;
                    case 'MemberExpression':
                      expIndex++;
                      qeValue += `{{value${expIndex}}}`;
                      const simpleExpressionValue = dealSimpleMemberExpression(item);
                      if (simpleExpressionValue) {
                        tValues.push(`value${expIndex}: ${simpleExpressionValue}`);
                      } else {
                        canGoOn = false;
                      }
                      break;
                    case 'TemplateElement':
                      qeValue += item.value.raw;
                      break;
                    default:
                      canGoOn = false;
                      break;
                  }
                });
                if (!canGoOn) return _path.skip();
                let newLine = '';
                if (!lineMap[key]) {
                  newLine = Array((paths.length + 2) * 2).join(' ') + ' ' + key + ': ' + `'${qeValue}'` + '\n';
                  line += newLine;
                  addNothing = false;
                }
                const target = `t("js.${paths.join('.').toLowerCase()}.${key}", { ${tValues.join(', ')} })`;
                shell.exec(`gsed -i '${node.loc.start.line}s/\`.*\`/${target}/' ${file}`, { cwd: cwd });
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
    line += `${Array((paths.length + 2) * 2).join(' ')} empty_i18n_placeholder: null\n`;
  }
  console.log('写入 yml 文件:\n', line);
  write.forEach((wFile) => fs.writeFileSync(wFile, line, { flag: 'a' }));
});
console.log("处理完成");
