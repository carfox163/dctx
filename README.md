# 单词听写音频生成器
<br>
🔥 [外语学习资料空间](http://2006b.ys168.com) 
<br>
🔥  [在线单词听写] (https://dctx.netlify.app/)

粘贴单词列表，一键生成标准听写音频：开场口播与全部中文朗读使用 Microsoft Xiaoxiao（zh-CN-XiaoxiaoNeural）、英文单词与序号朗读使用 Microsoft Ryan（en-GB-RyanNeural），每个单词朗读两遍、自动报序号（默认阿拉伯数字英语朗读）、两遍之间有 6~7 秒书写间隔。可在线播放，也可直接下载 MP3（后台合成，无需录音）。


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
🔥  [单词挑战在线 Vocabulary Challenge](https://creativelearners.netlify.app)<br>
     [github](https://carfox163.github.io/cr/)
