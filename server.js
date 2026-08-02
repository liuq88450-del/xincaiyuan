const http = require('http');
const fs = require('fs');
const path = require('path');

// ====== 百度AI配置 ======
// 图像识别Key（旧版access_token方式）
let BAIDU_API_KEY = 'cl2hmepmhQ5S4K0d1Kor76dN';     // 百度AI API Key
let BAIDU_SECRET_KEY = 'kxmUEp4l342Kg1urGWCfvTLMXEhPbxWP';  // 百度AI Secret Key

// 千帆大模型Key（新版Bearer Token方式，ERNIE-5.1）
let QIANFAN_API_KEY = 'bce-v3/ALTAK-67HYNjrmcb3c@ma1RXf0s/d899537a1843bff2ce22b29d9146054501a9c4a0';

// 也支持从环境变量读取
if(process.env.BAIDU_API_KEY) BAIDU_API_KEY = process.env.BAIDU_API_KEY;
if(process.env.BAIDU_SECRET_KEY) BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY;
if(process.env.QIANFAN_API_KEY) QIANFAN_API_KEY = process.env.QIANFAN_API_KEY;

let baiduToken = null;
let baiduTokenTime = 0;

const ROOT = __dirname;
const PORT = 8799;

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getBaiduToken(){
  return new Promise(function(resolve){
    if(baiduToken && Date.now() - baiduTokenTime < 86400000*29){
      resolve(baiduToken);
      return;
    }
    if(!BAIDU_API_KEY || !BAIDU_SECRET_KEY){
      resolve(null);
      return;
    }
    var url = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id='+BAIDU_API_KEY+'&client_secret='+BAIDU_SECRET_KEY;
    fetch(url, {method:'POST'})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.access_token){
          baiduToken = d.access_token;
          baiduTokenTime = Date.now();
          resolve(baiduToken);
        } else {
          resolve(null);
        }
      })
      .catch(function(e){
        console.log('[百度AI] 获取token失败:', e.message);
        resolve(null);
      });
  });
}

async function handleBaiduPlantRecognize(body){
  if(!BAIDU_API_KEY || !BAIDU_SECRET_KEY){
    return {error:'no_api_key', message:'服务器未配置百度AI Key'};
  }
  var token = await getBaiduToken();
  if(!token){
    return {error:'token_failed', message:'获取百度AI token失败'};
  }
  var pure64 = body.image;
  if(pure64 && pure64.indexOf(',') >= 0) pure64 = pure64.split(',')[1];

  var url = 'https://aip.baidubce.com/rest/2.0/image-classify/v1/plant?access_token='+token;
  var params = new URLSearchParams();
  params.append('image', pure64);
  params.append('baike_num', '3');

  var resp = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: params.toString()
  });
  var data = await resp.json();
  return data;
}

async function handleBaiduChat(body){
  // 优先使用千帆v2 API（ERNIE-5.1）
  if(QIANFAN_API_KEY){
    var systemPrompt = '你是"小芯"，芯菜园APP的AI种植管家。你只回答水培种植、家庭菜园、营养液、病虫害防治等种植相关问题。\n\n【格式规则 - 绝对遵守】\n1. 禁止使用任何markdown语法！禁止用|表格、禁止用>引用、禁止用---分割线、禁止用#标题、禁止用**标记\n2. 加粗用<b>文字</b>，换行用\\n，列表用•\n3. 回答不超过250字，简短有力\n4. 多用emoji\n5. 只回答种植相关问题，问别的就说"这个我不太懂，但我可以帮您解决种植问题哦"\n6. 芯菜园设备：M(1口¥198)、S(13口¥498)、D(44口¥998)、T(66口¥1680)、F(120口¥2980)\n7. 核心卖点：0农残、0激素、0催熟、0重金属、0污染\n\n【选设备规则 - 严格遵守】\n用户问"哪款够用/选哪款/推荐设备"时，根据以下信息直接推荐，不要反问已知信息：\n- 家里几口人 → 决定型号\n  • 1-2人 → S型(13口，¥498，新手入门首选)\n  • 3-4人 → D型(44口，¥998，家庭常吃，性价比最高)\n  • 5-6人 → T型(66口，¥1680，每日采收)\n  • 7人+或多代人 → F型(120口，¥2980)\n  • 1人想种花草 → M型(1口，¥198，桌面款)\n- 关键话术："以后不想买菜了"或"完全自给" → 选大一号（4口人选T/F）\n- 关键话术："阳台/客厅/厨房" + "放得下" → 推荐D/T型\n- 关键话术："预算有限/便宜点" → 推荐S或D\n- 已经知道的信息不要重复问，直接给推荐+理由\n\n【回复模板示例】\n"4口人+以后不想买菜" → "D型(44口¥998)或T型(66口¥1680)都够用。想完全自给选T，每日现摘；想过渡选D，性价比高~"\n"1-2人+新手" → "推荐S型(13口¥498)，3口正好够吃，新手首选，1周能上手~"';

    try{
      var resp = await fetch('https://qianfan.baidubce.com/v2/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + QIANFAN_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'ernie-5.1',
          messages: [
            {role: 'system', content: systemPrompt},
            {role: 'user', content: body.message || '你好'}
          ],
          temperature: 0.7,
          max_output_tokens: 800
        })
      });
      var data = await resp.json();
      if(data.choices && data.choices[0] && data.choices[0].message){
        var reply = data.choices[0].message.content;
        // 记录用户问题（用于分析测试反馈）
        console.log('[用户问题]', new Date().toISOString(), '|', body.message, '=>', reply.slice(0, 80));
        // 兜底清理：彻底清除所有markdown痕迹
        var lines = reply.split('\n');
        var cleaned = [];
        for(var i=0; i<lines.length; i++){
          var line = lines[i];
          // 跳过表格分割行（只有-、|、空格、逗号）
          if(/^[\|\-\s,]+$/.test(line)) continue;
          // 跳过代码块标记
          if(/^```/.test(line.trim())) continue;
          // 去掉行首>引用
          line = line.replace(/^>\s*/, '');
          // 去掉行首#标题
          line = line.replace(/^#{1,6}\s*/, '');
          // 表格行转普通文字
          if(line.trim().startsWith('|') && line.trim().endsWith('|')){
            line = line.split('|').map(function(s){return s.trim();}).filter(function(s){return s;}).join('，');
          }
          // **加粗** 转 <b>
          line = line.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
          // 去掉单*斜体
          line = line.replace(/\*([^*]+)\*/g, '$1');
          // 去掉`代码`
          line = line.replace(/`([^`]+)`/g, '$1');
          // 列表- 转 •
          line = line.replace(/^[\-\*]\s+/, '• ');
          cleaned.push(line);
        }
        reply = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        // 超过500字截断
        if(reply.length > 500){
          reply = reply.slice(0, 497) + '...';
        }
        return {reply: reply};
      }
      console.log('[千帆AI] 回复异常:', JSON.stringify(data).slice(0,200));
      return {error: 'chat_failed', message: data.error_msg || data.error || 'AI回复失败'};
    }catch(e){
      console.log('[千帆AI] 调用失败:', e.message);
      return {error: 'chat_failed', message: 'AI服务暂时不可用：' + e.message};
    }
  }

  // Fallback: 旧版access_token方式（如果千帆Key没配）
  if(!BAIDU_API_KEY || !BAIDU_SECRET_KEY){
    return {error:'no_api_key', message:'服务器未配置AI Key'};
  }
  var token = await getBaiduToken();
  if(!token){
    return {error:'token_failed', message:'获取token失败'};
  }

  var url = 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-speed-128k?access_token=' + token;
  var resp2 = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      messages: [{role:'user', content: body.message || '你好'}],
      temperature: 0.7,
      max_output_tokens: 800
    })
  });
  var data2 = await resp2.json();
  if(data2.result){
    return {reply: data2.result};
  }
  return {error: 'chat_failed', message: data2.error_msg || 'AI回复失败'};
}

var server = http.createServer(function(req, res){
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS'){
    res.writeHead(200);
    res.end();
    return;
  }

  // API routes
  if(req.url === '/api/plant-recognize' && req.method === 'POST'){
    var bodyStr = '';
    req.on('data', function(chunk){ bodyStr += chunk; });
    req.on('end', async function(){
      try{
        var body = JSON.parse(bodyStr);
        var result = await handleBaiduPlantRecognize(body);
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify(result));
      }catch(e){
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'server_error', message:e.message}));
      }
    });
    return;
  }

  // AI Chat (ERNIE Bot)
  if(req.url === '/api/chat' && req.method === 'POST'){
    var chatBody = '';
    req.on('data', function(chunk){ chatBody += chunk; });
    req.on('end', async function(){
      try{
        var body = JSON.parse(chatBody);
        var result = await handleBaiduChat(body);
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify(result));
      }catch(e){
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'server_error', message:e.message}));
      }
    });
    return;
  }

  // Check API key status
  if(req.url === '/api/baidu-status' && req.method === 'GET'){
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
      configured: !!(BAIDU_API_KEY && BAIDU_SECRET_KEY),
      hasToken: !!baiduToken,
      llmReady: !!QIANFAN_API_KEY
    }));
    return;
  }

  // Static file serving
  var filePath = decodeURIComponent(req.url.split('?')[0]);
  if(filePath === '/') filePath = '/芯菜园_AI_Agent版_v3.html';

  var fullPath = path.join(ROOT, filePath);
  // Security: prevent path traversal
  if(!fullPath.startsWith(ROOT)){
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, function(err, data){
    if(err){
      res.writeHead(404, {'Content-Type':'text/plain'});
      res.end('Not Found: ' + filePath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime});
    res.end(data);
  });
});

server.listen(PORT, function(){
  console.log('芯菜园服务器已启动: http://localhost:' + PORT);
  console.log('百度AI植物识别: ' + (BAIDU_API_KEY ? '已配置' : '未配置'));
  console.log('千帆大模型(ERNIE-5.1): ' + (QIANFAN_API_KEY ? '已配置' : '未配置'));
  console.log('API代理路由: /api/plant-recognize, /api/baidu-status, /api/chat');
});
