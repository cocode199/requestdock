# 本地断言插件

插件扩展响应检查，适合业务约束、协议约定或独有响应格式。当前接口只承诺断言钩子，不支持 UI 组件、请求前脚本、自动安装或远程插件市场。

**插件是可信代码，没有沙箱。** `.mjs` 模块在当前 Node.js 进程运行，可访问文件、网络和环境变量。使用审计过的本地文件，并通过 CLI 或服务启动参数显式加载。Web 上传集合不能安装插件。

## 接口

```js
// content-type.mjs
export default {
  name: 'content-type',
  version: '1.0.0',
  assert({ response, options }) {
    const expected = String(options.contains ?? 'application/json');
    const actual = response.headers['content-type'] ?? '';
    return {
      name: 'Content type',
      passed: actual.includes(expected),
      message: actual.includes(expected)
        ? `Content type includes ${expected}`
        : `Expected ${expected}; received ${actual || '(missing)'}`
    };
  }
};
```

`assert` 可以返回 Promise。返回值必须包含字符串 `name`、布尔 `passed`、字符串 `message`。`response` 的字段见 [RequestResult](../src/shared/types.ts)，包含状态、响应头、文本 body、耗时和现有检查结果。不要在诊断消息中输出敏感响应内容；`version` 是插件自身元数据，当前尚无自动版本协商或依赖解析。

在请求的 `assertions` 中通过插件名引用：

```json
{
  "type": "plugin",
  "plugin": "content-type",
  "options": { "contains": "application/json" }
}
```

## 加载

```sh
npm run cli -- run collection.json --plugin ./content-type.mjs
npm run cli -- serve --plugin ./content-type.mjs
```

先把上方代码保存为 `content-type.mjs`，再运行命令。仓库还提供 [required-keys 示例](../examples/plugins/required-keys.mjs)，使用 `name: "required-keys"` 和 `options: { "keys": ["ok"] }` 检查 JSON 根对象字段。

集合中的名称必须与导出对象 `name` 一致。相对文件路径以启动进程的工作目录为基准。Web UI 使用服务启动时加载的插件，浏览器本身不执行这些模块。多个插件可重复传递 `--plugin`。仅加载模块不会运行断言，需要在集合中添加对应的插件断言。

为插件测试成功、失败、缺字段、非 JSON body、网络异常响应和异常抛出。不要在模块加载时进行写文件或网络请求；保持断言可重复、快速且不修改输入。由于无沙箱，永不结束的插件也可能阻塞执行，不适合运行不可信扩展。

Docker 中可以将已审核插件目录只读挂载到 `/plugins`，并向 `serve` 增加 `--plugin /plugins/your-plugin.mjs`。插件的额外依赖由部署者管理，运行时不会自动下载。
