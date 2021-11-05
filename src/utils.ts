import glob from 'glob';
import minimatch from 'minimatch';
import md5 from 'md5';
import pinyin from 'pinyin';
import shell from 'shelljs';
import { PlutoNode } from './interface';

/**
 * 获取所有需要处理的文件
 * @param dir 目标目录
 * @return 需处理的文件
 */
export function getTargetFile(dir: string, ignore: string[]): string[] {
  const files = glob.sync(dir);
  const matchedFiles = files.filter((file) => {
    const isIgnore = ignore.some((pattern) => minimatch(file, pattern));
    if (isIgnore) return false;
    const match = minimatch(file, '**/*.[jt]s{,x}'); // true/false
    return match;
  });
  return matchedFiles;
}
/**
 * 生成需要执行的 shell 命令
 * @param value 待转义的文本
 * @param node ast 节点
 * @param p 文件路径
 * @param lineMap 当前节点是否已经处理过了
 * @returns [PlutoNode | null, string | null, string, boolean]
 */
export function genShellInfo(
  value: string,
  node: any,
  p: string[],
  lineMap: { [key: string]: boolean }
): [PlutoNode | null, string | null, string, boolean] {
  if (/\p{Unified_Ideograph}/u.test(value) && node.loc) {
    let newLine = '';
    const item: PlutoNode = {
      value: value,
      line: node.loc.start.line,
      endLine: node.loc.end.line,
    };
    const key = genKeyFromValue(value);
    if (!lineMap[key]) {
      newLine = Array((p.length + 2) * 2).join(' ') + ' ' + key + ': ' + `'${item.value}'` + '\n';
    }
    lineMap[key] = true;
    return [item, key, newLine.toLowerCase(), true];
  }
  return [null, null, '', false];
}
/**
 * 从 value 生成 key
 * @param value
 * @returns key
 */
export function genKeyFromValue(value: string): string {
  const [cnStrings, md5String] = longValueShuffle(filterSymbol(value).replace(/\ +/g, ''));
  return flatten(
    pinyin(cnStrings, {
      style: pinyin.STYLE_NORMAL, // 设置拼音风格
    })
  )
    .map((_) => clearKey(_))
    .concat([md5String])
    .filter((_) => _.length > 0)
    .join('_')
    .toLowerCase();
}
/**
 * 长文本生成 key 的方法
 * @param str
 * @returns key
 */
function longValueShuffle(str: string) {
  if (str.length < 16) {
    return [str, ''];
  }
  return [str.slice(0, 4), md5(str).slice(0, 4)];
}
/**
 * 过滤掉字符串中的回车和空格，用来作为 key 使用
 * @param str
 * @returns 合法的 key
 */
function clearKey(str: string) {
  const noReturnSpace = str.replace(/[\r\n]/g, '').replace(/\s+/g, '');
  return filterSymbol(noReturnSpace);
}
/**
 * 过滤特殊符号
 * @param str
 */
function filterSymbol(str: string): string {
  const pattern = /[`~!@#_$%^&*()=|{}':;',\\\[\\\].<>/?~！@#￥……&*（）——|{}【】‘；：”“'。，、？]/g;
  return str.replace(pattern, '');
}
/**
 * 处理转义字符
 * @param str 原本文
 * @returns 在 shell 中执行的文本
 */
export function dealEscapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\/+/g, '\\/')
    .replace(/[\r\n]/g, '\\\\n')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*');
}
/**
 * 处理 AST 中 `${info.person.name}`
 * @param item ast node
 * @returns 解析的表达式结果
 */
export function dealSimpleMemberExpression(item: any): string | null {
  const { object, property } = item;
  if (object?.type === 'Identifier' && property?.type === 'Identifier') {
    return `${object.name}.${property.name}`;
  } else if (object?.type === 'MemberExpression' && property?.type === 'Identifier') {
    return `${dealSimpleMemberExpression(object)}.${property.name}`;
  }
  return null;
}
/**
 * 将 pinyin 转化出的二维数组转化为一维数组
 * @param arr
 * @returns
 */
function flatten(arr: string[][] | string[]): string[] {
  // @ts-ignore
  return arr.reduce((result, item) => {
    return result.concat(Array.isArray(item) ? flatten(item) : item).filter((_: string) => _.length !== 0);
  }, []);
}
/**
 * 执行脚本 
 * @param item: PlutoNode
 * @param target 替换过后的文本
 * @param file 文件路径
 */
export function sedLine(item: PlutoNode, target: string, file: string) {
  const shellCommand = `gsed -i '${item.line},${item.endLine}s/${dealEscapeString(item.value)}/${target}/' ${file}`;
  shell.exec(shellCommand, { cwd: process.cwd() });
}

