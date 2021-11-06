# pluto-escape

js 端 i18n 自动转化工具

- `path/file.js`

```diff
const Demo = () => {
-  const panda = "熊猫"
+	 const panda = t("js.path.file.xiong_mao")
  return (
-  	<Banner name={panda} title="老鼠" action={`今天中午吃${snack}和${animals.frog}`}>
+   <Banner name={panda} title={t("js.path.file.lao_shu")} action={t("js.path.file.jin_tian_zhong_wu_chi_he", { value1: snack, value2: animals.frog })}>
-    	老虎、{panda}
+    	{t("js.path.file.lao_hu")}{panda}
    </Banner>
  )
}
```

- `zh-CN.yml`

```diff
zh-CN:
  js:
+  	path:
+  		file:
+  			xiong_nmao: 熊猫
+  			lao_shu: 老鼠
+  			jin_tian_zhong_wu_chi_he: 今天中午吃{{value1}}和{{value2}}
+  			lao_hu: '老虎、'
```

### 安装

使用 `yarn`

```shell
yarn global add pluto-escape
```

### 用法

```shell
pluto-escape "src/javascript/**/*.[jt]s{,x}" --write zh-CN.yml,en.yml --ignore "src/javascript/test/*","src/javascript/a/b.js"
```

### 待完善

- [ ] 非首次某文件/文件夹时，`yml` 会写入重复的 `key`
- [ ] 多行文本处理可能出现问题
- [ ] 带有特殊字符的串可能出现问题
- [ ] 优化提示语和命令行界面
- [ ] 添加命令行 helper

