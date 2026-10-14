/*
 * 单词听写音频生成器 —— Netlify Function
 * 作用：把浏览器的合成请求转发到微软 Edge Read Aloud 服务。
 * 为什么需要它：微软在 2026 年迁移 TTS 端点后，服务端校验请求头
 * User-Agent 必须包含 "Edg/"（浏览器 WebSocket 无法伪造 UA，纯前端会 403），
 * 因此必须由服务端（本函数，Node 环境可自定义请求头）代为合成。
 *
 * 部署：本文件位于 netlify/functions/tts.js，Netlify 会自动识别并部署。
 * 浏览器端 POST {voice, rate, text, offsetMs} → 返回单段 MP3 音频。
 * 每个请求合成一段（单个 voice、无 break），停顿由前端本地静音拼接。
 */
const crypto = require('crypto');

const TRUSTED = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const WIN_EPOCH = 11644473600;

/* ---------------- v1 令牌（新主机兼容，备用） ---------------- */
function edgeTokenV1(){
  const now = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  const ticks = Math.round(now - (now % 300)) * 1e7;
  return crypto.createHash('sha256').update(String(ticks) + TRUSTED).digest('hex').toUpperCase();
}

/* ---------------- v2 令牌（旧主机官方修复方向，主通道） ---------------- */
const MASK = 0xFFFFFFFFn;
const rol16 = v => ((v << 16n) | (v >> 16n)) & MASK;
const sigma0 = v => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & MASK;
const sigma1 = v => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & MASK;

const SHA256_INITIAL = [0x6A09E667n,0xBB67AE85n,0x3C6EF372n,0xA54FF53An,0x510E527Fn,0x9B05688Cn,0x1F83D9ABn,0x5BE0CD19n];
const SHA256_STATE   = [0xFD9FBEA2n,0x91243CE7n,0xBE499094n,0xCD2E1E0An,0x6C006F49n,0x04BD35ABn,0xFEB0A7E4n,0x03EFFBD2n];
const SHA256_SCHEDULE=[0xEB24BF9En,0x1558691Fn,0xA0C09EE2n,0x0CFA32BAn,0xA622EE8Cn,0xD1DD9491n,0xC0DD25A0n,0xF9E70AB6n,0xF0C31573n,0x7058CE4En,0x7188E606n,0x00E5AB33n,0xD258B060n,0x72766564n];
const SHA256_ROUND=[0x428A2F98n,0x71374491n,0xB5C0FBCFn,0xE9B5DBA5n,0x3956C25Bn,0x59F111F1n,0x923F82A4n,0xAB1C5ED5n,0xD807AA98n,0x12835B01n,0x243185BEn,0x550C7DC3n,0x72BE5D74n,0x80DEB1FEn,0x9BDC06A7n,0xC19BF174n,0xE49B69C1n,0xEFBE4786n,0x0FC19DC6n,0x240CA1CCn,0x2DE92C6Fn,0x4A7484AAn,0x5CB0A9DCn,0x76F988DAn,0x983E5152n,0xA831C66Dn,0xB00327C8n,0xBF597FC7n,0xC6E00BF3n,0xD5A79147n,0x06CA6351n,0x14292967n,0x27B70A85n,0x2E1B2138n,0x4D2C6DFCn,0x53380D13n,0x650A7354n,0x766A0ABBn,0x81C2C92En,0x92722C85n,0xA2BFE8A1n,0xA81A664Bn,0xC24B8B70n,0xC76C51A3n,0xD192E819n,0xD6990624n,0xF40E3585n,0x106AA070n,0x19A4C116n,0x1E376C08n,0x2748774Cn,0x34B0BCB5n,0x391C0CB3n,0x4ED8AA4An,0x5B9CCA4Fn,0x682E6FF3n,0x748F82EEn,0x78A5636Fn,0x84C87814n,0x8CC70208n,0x90BEFFFAn,0xA4506CEBn,0xBEF9A3F7n,0xC67178F2n];
const SHA256_ADJUSTMENT = 0xC9DC06A7n;
const SHA256_BLOCK = [...SHA256_ROUND.slice(0,14), SHA256_ADJUSTMENT, ...SHA256_ROUND.slice(15)];
const SIGMA0_ADJ = 0x059C0B80n, SIGMA1_ADJ = 0x000B92C0n;
const CS64_COEFF = [
 [0xE82E91B1n,0xB32700D0n],[0x44DE24C6n,0x88DFF51Dn],[0x3BEB65BCn,0x29514038n],[0xC89C5933n,0xB328CBDFn],
 [0x8D1EC211n,0xD405B4D5n],[0x314EF5D5n,0x26E55F3Cn],[0xE92491B1n,0x607801C6n],[0xF0A5B9D5n,0x82B2C1FBn],
 [0x06064CF3n,0xFA51A3DAn],[0xDA79FA60n,0x207CC464n],[0xBED20560n,0x3C3C74F3n],[0x89F9C9F8n,0xD2D14B61n],
 [0x35FA38C6n,0xBB04A2C1n],[0xCB49E3C6n,0xC5626167n]];
const CS64_FACTOR = 0x82893933n, CS64_ADJ0 = 0xF2F90B1An, CS64_ADJ1 = 0x0B1A0000n;

function wordsLe4Even(bytes){
  const rem = bytes.length % 4;
  const padded = rem ? new Uint8Array(bytes.length + 4 - rem) : new Uint8Array(bytes);
  if (rem){ padded.set(bytes); }
  const words = [];
  for (let i = 0; i < padded.length; i += 4){
    words.push(BigInt(padded[i]) | (BigInt(padded[i+1]) << 8n) | (BigInt(padded[i+2]) << 16n) | (BigInt(padded[i+3]) << 24n));
  }
  if (words.length % 2) words.push(0n);
  return words;
}
function expandSchedule(words, firstWord){
  for (let index = firstWord; index < 64; index++){
    const x = words[index - 2], y = words[index - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    words.push((s1 + words[index - 7] + s0 + words[index - 16]) & MASK);
  }
}
function sha256Rounds(state, words, firstRound){
  let a=state[0],b=state[1],c=state[2],d=state[3],e=state[4],f=state[5],g=state[6],h=state[7];
  const constants = firstRound === 14 ? SHA256_BLOCK : SHA256_ROUND;
  const aligned = Math.min(64, Math.floor((firstRound + 7) / 8) * 8);
  for (let index = firstRound; index < aligned; index++){
    const rot_e = e * 0x100000001n, rot_a = a * 0x100000001n;
    const t1 = h + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + words[index];
    const t2 = ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)));
    const na = (t1 + t2) & MASK, ne = (d + t1) & MASK;
    const oa=a,ob=b,oc=c,od=d,oe=e,of=f,og=g,oh=h;
    a = na; b = oa; c = ob; d = oc; e = ne; f = oe; g = of; h = og;
  }
  for (let index = aligned; index < 64; index += 8){
    let rot_e = e * 0x100000001n, rot_a = a * 0x100000001n;
    let t1 = h + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + words[index];
    let nd = (d + t1) & MASK;
    let nh = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)))) & MASK;
    d = nd; h = nh;
    rot_e = d * 0x100000001n; rot_a = h * 0x100000001n;
    t1 = g + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (f ^ (d & (e ^ f))) + constants[index+1] + words[index+1];
    let nc = (c + t1) & MASK;
    let ng = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((h & a) | (b & (h | a)))) & MASK;
    c = nc; g = ng;
    rot_e = c * 0x100000001n; rot_a = g * 0x100000001n;
    t1 = f + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (e ^ (c & (d ^ e))) + constants[index+2] + words[index+2];
    let nb = (b + t1) & MASK;
    let nf = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((g & h) | (a & (g | h)))) & MASK;
    b = nb; f = nf;
    rot_e = b * 0x100000001n; rot_a = f * 0x100000001n;
    t1 = e + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (d ^ (b & (c ^ d))) + constants[index+3] + words[index+3];
    let na = (a + t1) & MASK;
    let ne = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((f & g) | (h & (f | g)))) & MASK;
    a = na; e = ne;
    rot_e = a * 0x100000001n; rot_a = e * 0x100000001n;
    t1 = d + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (c ^ (a & (b ^ c))) + constants[index+4] + words[index+4];
    let nh2 = (h + t1) & MASK;
    let nd2 = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((e & f) | (g & (e | f)))) & MASK;
    h = nh2; d = nd2;
    rot_e = h * 0x100000001n; rot_a = d * 0x100000001n;
    t1 = c + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (b ^ (h & (a ^ b))) + constants[index+5] + words[index+5];
    let ng2 = (g + t1) & MASK;
    let nc2 = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((d & e) | (f & (d | e)))) & MASK;
    g = ng2; c = nc2;
    rot_e = g * 0x100000001n; rot_a = c * 0x100000001n;
    t1 = b + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (a ^ (g & (h ^ a))) + constants[index+6] + words[index+6];
    let nf2 = (f + t1) & MASK;
    let nb2 = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((c & d) | (e & (c | d)))) & MASK;
    f = nf2; b = nb2;
    rot_e = f * 0x100000001n; rot_a = b * 0x100000001n;
    t1 = a + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (h ^ (f & (g ^ h))) + constants[index+7] + words[index+7];
    let ne2 = (e + t1) & MASK;
    let na2 = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((b & c) | (d & (b | c)))) & MASK;
    e = ne2; a = na2;
  }
  return [a,b,c,d,e,f,g,h];
}
function sha256Init(data){
  let words = new Array(14).fill(0n);
  words.push((BigInt(data[0]) << 16n) | (BigInt(data[1]) << 8n) | BigInt(data[2]));
  words.push((BigInt(data[3]) << 24n) | (BigInt(data[4]) << 16n) | (BigInt(data[5]) << 8n) | BigInt(data[6]));
  for (let index = 16; index < 30; index++){
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) value += (index === 16 ? (sigma1(words[index-2]) ^ SIGMA1_ADJ) : sigma1(words[index-2]));
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) value += (index === 29 ? (sigma0(words[index-15]) ^ SIGMA0_ADJ) : sigma0(words[index-15]));
    words.push(value & MASK);
  }
  words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND[14]) & MASK);
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => (x + working[i]) & MASK);
}
function sha256Digest(data){
  const length = 57 + data.length;
  const padded = new Uint8Array(64 * 4);
  let len = 0;
  for (let i = 7; i < data.length; i++) padded[len++] = data[i];
  padded[len++] = 0x80;
  const padLen = ((55 - length) % 64 + 64) % 64;
  for (let i = 0; i < padLen; i++) padded[len++] = 0;
  const bitLen = BigInt(length) * 8n;
  for (let i = 7; i >= 0; i--) padded[len++] = Number((bitLen >> BigInt(i * 8)) & 0xFFn);
  let state = sha256Init(data.slice(0, 7));
  const blockWords = [];
  for (let offset = 0; offset < len; offset += 64){
    blockWords.length = 0;
    for (let i = 0; i < 16; i++){
      const o = offset + i * 4;
      blockWords.push((BigInt(padded[o]) << 24n) | (BigInt(padded[o+1]) << 16n) | (BigInt(padded[o+2]) << 8n) | BigInt(padded[o+3]));
    }
    expandSchedule(blockWords, 16);
    const working = sha256Rounds(state, blockWords, 0);
    state = state.map((x, i) => (x + working[i]) & MASK);
  }
  const out = new Uint8Array(32);
  state.forEach((w, i) => {
    out[i*4] = Number((w >> 24n) & 0xFFn);
    out[i*4+1] = Number((w >> 16n) & 0xFFn);
    out[i*4+2] = Number((w >> 8n) & 0xFFn);
    out[i*4+3] = Number(w & 0xFFn);
  });
  return out;
}
function cs64Digest(data, digest){
  let keyA = BigInt(digest[0]) | (BigInt(digest[1]) << 8n) | (BigInt(digest[2]) << 16n) | (BigInt(digest[3]) << 24n);
  let keyB = BigInt(digest[4]) | (BigInt(digest[5]) << 8n) | (BigInt(digest[6]) << 16n) | (BigInt(digest[7]) << 24n);
  keyA |= 1n; keyB |= 1n;
  const factors = [(keyA * CS64_FACTOR) & MASK, (keyB * CS64_FACTOR) & MASK];
  const terms = CS64_COEFF.map(([coef], index) => (coef * factors[index % 2]) & MASK);
  const offsets = CS64_COEFF.map(([ ,off]) => off);
  const u = new Uint8Array(data.length + 1); u[0] = 0; u.set(data, 1);
  const words = wordsLe4Even(u);
  words.forEach((word, index) => {
    let term = word * (index % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (index % 2 === 0 ? 0xEF0569FBn : 0xC31713DBn);
    if (index === 0){
      term += CS64_ADJ0 * factors[0];
      offset += CS64_ADJ1;
    }
    terms.push(term & MASK);
    offsets.push(offset & MASK);
  });
  let swapAcc = 0n, swapLast = 0n, state = 0n, acc = 0n;
  for (let index = 0; index < terms.length; index += 2){
    const x = terms[index], y = terms[index + 1];
    let t = rol16((offsets[index] + x) & MASK);
    let q = (t * 0x76F50F34n) & MASK;
    swapAcc += (rol16(q) * 0xC3EFEA97n + q) & MASK;
    t = rol16((offsets[index + 1] + y) & MASK);
    q = (t * 0x1881CE3Cn) & MASK;
    swapLast = (rol16(q) * 0x35BD1EC9n + q) & MASK;
    swapAcc = (swapAcc + swapLast) & MASK;
    state = (state * keyA + x) & MASK;
    state = (rol16(state) * 0xCF98B111n) & MASK;
    state = (rol16(state) * 0x87085B9Fn) & MASK;
    state = (rol16(state) * 0x12CEB96Dn) & MASK;
    state = (rol16(state) * 0x257E1D83n) & MASK;
    acc += state;
    t = (state * keyB + y) & MASK;
    t = (rol16(t) * 0xA27416F5n) & MASK;
    t = (rol16(t) * 0xD38396FFn) & MASK;
    state = (rol16((rol16(t) * 0x7C932B89n) & MASK) * 0xBFA49F69n) & MASK;
    acc = (acc + state) & MASK;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}
function hex32LE(v){
  let s = '';
  for (let i = 0; i < 4; i++) s += ((v >> BigInt(i * 8)) & 0xFFn).toString(16).padStart(2, '0');
  return s.toUpperCase();
}
function hexBytes(u8){
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function generateSecMsGecV2(unixTimestamp){
  let ticks = unixTimestamp;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 10000000;
  const strToHash = Math.round(ticks).toString() + TRUSTED;
  const data = new TextEncoder().encode(strToHash);
  const digest = sha256Digest(data);
  const [csA, csB] = cs64Digest(data, digest);
  return hex32LE(csA) + hex32LE(csB) + '-' + hexBytes(digest);
}

/* ---------------- Edge Read Aloud 单段合成 ---------------- */
function edgeDateStr(){
  const d = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = x => String(x).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}
function buildSegSsml(voice, rate, text){
  const esc = String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody rate='${rate}'>${esc}</prosody></voice></speak>`;
}
function synthOne(voice, rate, text, offsetMs){
  return new Promise((resolve, reject) => {
    const gec = generateSecMsGecV2((Date.now() + (Number(offsetMs) || 0)) / 1000);
    const url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + TRUSTED +
      '&ConnectionId=' + crypto.randomUUID().replace(/-/g, '') +
      '&Sec-MS-GEC=' + gec + '&Sec-MS-GEC-Version=2-143.0.3650.75';
    let ws;
    try{
      ws = new (require('ws'))(url, {
        family: 4,
        headers: {
          'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': EDG_UA
        }
      });
    }catch(e){ reject(new Error('无法建立连接：' + e.message)); return; }
    const chunks = [];
    const ssml = buildSegSsml(voice, rate, text);
    let settled = false;
    const timeout = setTimeout(() => { if(!settled){ settled = true; try{ ws.terminate(); }catch(e){} reject(new Error('合成超时')); } }, 25000);
    ws.on('open', () => {
      ws.send(`X-Timestamp:${edgeDateStr()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
      setTimeout(() => {
        ws.send(`X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${edgeDateStr()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
      }, 350);
    });
    ws.on('message', (data, isBinary) => {
      if(!isBinary){
        const s = data.toString();
        if(s.includes('Path:turn.end')){
          if(!settled){ settled = true; clearTimeout(timeout); try{ ws.close(); }catch(e){} resolve(Buffer.concat(chunks)); }
        }else if(s.includes('Path:response') && s.includes('"error"')){
          if(!settled){ settled = true; clearTimeout(timeout); try{ ws.close(); }catch(e){} reject(new Error('语音服务返回错误：' + s.slice(s.indexOf('\r\n\r\n') + 4, s.indexOf('\r\n\r\n') + 204))); }
        }
        return;
      }
      const buf = Buffer.from(data);
      if(buf.length < 2){ return; }
      const hlen = buf.readUInt16BE(0);
      if(2 + hlen > buf.length){ return; }
      if(buf.slice(2, 2 + hlen).toString().includes('Path:audio')){ chunks.push(buf.subarray(2 + hlen)); }
    });
    ws.on('error', (e) => { if(!settled){ settled = true; clearTimeout(timeout); reject(new Error('连接语音服务失败：' + (e.message || e))); } });
    ws.on('close', (code, reason) => {
      if(!settled && !chunks.length){
        settled = true; clearTimeout(timeout);
        reject(new Error('语音服务连接中断 (' + code + ' ' + reason.toString().slice(0, 40) + ')'));
      }
    });
  });
}

/* ---------------- Handler ---------------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS'){ return { statusCode: 204, headers: CORS, body: '' }; }
  if(event.httpMethod !== 'POST'){ return { statusCode: 405, headers: CORS, body: 'POST only' }; }
  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch(e){ return { statusCode: 400, headers: CORS, body: 'bad json' }; }
  const voice = body.voice || 'en-AU-WilliamMultilingualNeural';
  const rate = String(body.rate || '1.00');
  const text = body.text;
  const offsetMs = Number(body.offsetMs) || 0;
  if(!text || typeof text !== 'string'){ return { statusCode: 400, headers: CORS, body: 'missing text' }; }
  try{
    const audio = await synthOne(voice, rate, text, offsetMs);
    if(!audio.length){ return { statusCode: 502, headers: CORS, body: JSON.stringify({error: 'empty audio'}) }; }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      isBase64Encoded: true,
      body: audio.toString('base64')
    };
  }catch(e){
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
//（注：内容由AI生成）
