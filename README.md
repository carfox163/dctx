# 单词听写音频生成器
<br>
🔥 [外语学习资料空间](http://2006b.ys168.com) 
<br>
🔥  [在线单词听写] (https://dctx.netlify.app/)

粘贴单词列表，一键生成标准听写音频：开场口播与全部中文朗读使用 Microsoft Xiaoxiao（zh-CN-XiaoxiaoNeural）、英文单词与序号朗读使用 Microsoft Ryan（en-GB-RyanNeural），每个单词朗读两遍、自动报序号（默认阿拉伯数字英语朗读）、两遍之间有 6~7 秒书写间隔。可在线播放，也可直接下载 MP3（后台合成，无需录音）。

## 部署（GitHub → Netlify）

1. 新建 GitHub 仓库，上传本目录全部内容（`index.html`、`netlify/`、`package.json`）。
2. 打开 Netlify（netlify.com）→ **Add new site → Import an existing project** → 选择该 GitHub 仓库。
3. 构建设置全部留空（纯静态站点，无需构建命令），点击 **Deploy**。
4. 部署完成后访问 `https://<你的站点名>.netlify.app` 即可使用。

> 下载功能依赖 `netlify/functions/tts.js`（Netlify Function），Netlify 导入仓库后会自动识别并部署，无需额外配置。

## 本地预览

- 直接双击 `index.html` 可体验"在线播放"（浏览器内置语音）。
- 下载功能需要合成服务：本地开发可在控制台设置 `window.TTS_API_BASE` 指向自建的转发服务；正式使用请走上面的 Netlify 部署。

## 使用说明

- 单词列表：每行一个单词/短语，或用逗号、分号、冒号、顿号分隔均可；也支持 `单词：释义` 格式（只朗读单词部分）。
- 设置：序号朗读方式（阿拉伯数字英语 / 中文第N题）、英文语速（默认 0.80×）、中文语速（默认 1.00×）、书写间隔（默认 6s / 6.5s）。
- 默认音色：中文（含开场口播）为 `zh-CN-XiaoxiaoNeural`（Microsoft Xiaoxiao），英文为 `en-GB-RyanNeural`（Microsoft Ryan）。

## 文件结构

```
单词听写音频生成器/
├── index.html              # 主工具页面（单文件，含全部界面与音频处理逻辑）
├── netlify/functions/tts.js # 语音合成转发函数（解决浏览器无法携带 Edg UA 的问题）
└── package.json            # Netlify 函数依赖（ws）
```
🔥  [单词挑战在线 Vocabulary Challenge](https://creativelearners.netlify.app)
     [github](https://carfox163.github.io/cr/)
