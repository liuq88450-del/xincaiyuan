const http = require('http');
const fs = require('fs');
const path = require('path');

// 全部从环境变量读取，文件内不含任何密钥
const LLM_KEY = process.env.QIANFAN_API_KEY || process.env.LLM_KEY || '';
const IMG_KEY = process.env.BAIDU_API_KEY || process.env.IMG_KEY || '';
const IMG_SECRET = process.env.BAIDU_SECRET_KEY || process.env.IMG_SECRET || '';

let imgToken = null;
let imgTokenTime = 0;

const ROOT = __dirname;
const PORT = process.env.PORT || 8799;

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp'
};

// 植物信息库（25种常见水培蔬菜）
const CROP_LIB = {
  'ice_plant': {name:'冰菜', days:35, tips:'喜光耐旱少浇水,茎叶有冰晶口感清脆'},
  'lettuce': {name:'生菜', days:30, tips:'喜凉15-20°C,光照12小时,定植7天后追氮肥'},
  'romaine': {name:'罗马生菜', days:32, tips:'比普通生菜耐热,营养液EC值1.0-1.4'},
  'basil': {name:'罗勒', days:25, tips:'喜温20-25°C,定期摘心促分枝'},
  'tomato': {name:'圣女果', days:60, tips:'需要支架,授粉可轻摇花枝,留主茎去侧芽'},
  'strawberry': {name:'草莓', days:90, tips:'需要蜜蜂或人工授粉,通风防灰霉病'},
  'spinach': {name:'菠菜', days:30, tips:'喜凉怕热,营养液EC值1.4-1.8'},
  'kale': {name:'羽衣甘蓝', days:55, tips:'耐寒,可户外越冬,营养价值极高'},
  'arugula': {name:'芝麻菜', days:25, tips:'生长快,带辛辣味,凉拌最佳'},
  'pakchoi': {name:'上海青', days:28, tips:'小白菜类,生长迅速,间苗后留健壮苗'},
  'mibuna': {name:'壬生菜', days:28, tips:'日本品种,耐寒,口感柔和'},
  'mizuna': {name:'水菜', days:25, tips:'日本水菜,茎叶多汁,做汤极佳'},
  'bokchoi': {name:'小白菜', days:25, tips:'速生叶菜,7天一周期可采收'},
  'redleaf': {name:'红叶生菜', days:35, tips:'紫色品种含花青素,喜光'},
  'butterhead': {name:'奶油生菜', days:30, tips:'叶片柔软,口感细腻'},
  'frillice': {name:'苦菊', days:40, tips:'略带苦味,清热去火'},
  'mint': {name:'薄荷', days:30, tips:'极易繁殖,定期修剪,泡茶提神'},
  'rosemary': {name:'迷迭香', days:60, tips:'喜光耐旱,西餐常用,扦插繁殖'},
  'thyme': {name:'百里香', days:50, tips:'耐旱香草,地中海风味'},
  'oregano': {name:'牛至', days:45, tips:'意大利菜常用,披萨草'},
  'cilantro': {name:'香菜', days:30, tips:'喜凉怕热,高温易抽薹'},
  'dill': {name:'莳萝', days:35, tips:'叶片羽毛状,鱼肉去腥'},
  'fennel': {name:'茴香', days:50, tips:'根茎叶均可食用'},
  'celery': {name:'芹菜', days:60, tips:'喜湿喜肥,长期收获'},
  'chard': {name:'牛皮菜', days:40, tips:'彩色品种观赏食用兼具'}
};

const SYSTEM_PROMPT = '你是"小芯",芯菜园APP的AI种植管家。你只回答水培种植、家庭菜园、营养液、病虫害防治等种植相关问题。\n\n【格式规则 - 绝对遵守】\n1. 禁止使用任何markdown语法！禁止用|表格、禁止用>引用、禁止用---分割线、禁止用#标题、禁止用**标记\n2. 加粗用<b>文字</b>,换行用\\n,列表用•\n3. 回答不超过250字,简短有力\n4. 多用emoji\n5. 只回答种植相关问题,问别的就说"这个我不太懂,但我可以帮您解决种植问题哦"\n6. 芯菜园设备:M(1口¥198)、S(13口¥498)、D(44口¥998)、T(66口¥1680)、F(120口¥2980)\n7. 核心卖点:0农残、0激素、0催熟、0重金属、0污染\n\n【选设备规则 - 严格遵守】\n- 1-2人 → S(¥498)\n- 3-4人 → D(¥998)\n- 5-6人 → T(¥1680)\n- 7人+ → F(¥2980)\n- "以后不想买菜" → 选大一号\n- "预算有限" → S或D\n- 已知信息不要重复问,直接给推荐';

const server = http.createServer(async function(req, res){
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS'){
    res.writeHead(200);
    res.end();
    return;
  }

  // 植物识别
  if(req.url === '/api/plant-recognize' && req.method === 'POST'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try{
        const data = JSON.parse(body);
        const result = await handleImgRecognition(data.image);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      }catch(e){
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // AI对话
  if(req.url === '/api/chat' && req.method === 'POST'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try{
        const data = JSON.parse(body);
        const reply = await handleLLMChat(data.message || '你好');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({reply: reply}));
      }catch(e){
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message, reply: '抱歉,AI服务暂时不可用,请稍后重试'}));
      }
    });
    return;
  }

  // 状态检查
  if(req.url === '/api/baidu-status' && req.method === 'GET'){
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      llmReady: !!LLM_KEY,
      imgReady: !!IMG_KEY,
      message: '芯菜园AI服务'
    }));
    return;
  }

  // 静态文件
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  if(filePath === '/') filePath = '/app.html';

  const fullPath = path.join(ROOT, filePath);
  if(!fullPath.startsWith(ROOT)){
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, function(err, data){
    if(err){
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not Found: ' + filePath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime});
    res.end(data);
  });
});

// 处理图像识别
async function handleImgRecognition(imgBase64){
  if(!IMG_KEY || !IMG_SECRET){
    return {success: false, message: '图像识别未配置', fallback: true};
  }

  // 获取access_token
  const now = Date.now();
  if(imgToken && now - imgTokenTime < 2592000000){
    // token有效
  } else {
    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${IMG_KEY}&client_secret=${IMG_SECRET}`;
    try{
      const tokenResp = await fetch(tokenUrl);
      const tokenData = await tokenResp.json();
      if(tokenData.access_token){
        imgToken = tokenData.access_token;
        imgTokenTime = now;
      }
    }catch(e){
      return {success: false, message: '获取token失败', fallback: true};
    }
  }

  if(!imgToken){
    return {success: false, message: '无法获取token', fallback: true};
  }

  // 调用植物识别API
  const apiUrl = `https://aip.baidubce.com/rest/2.0/image-classify/v1/plant?access_token=${imgToken}`;
  try{
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `image=${encodeURIComponent(imgBase64)}&baike_num=1`
    });
    const result = await resp.json();
    if(result.result && result.result.length > 0){
      const top = result.result[0];
      return {
        success: true,
        name: top.name,
        score: top.score,
        baike: top.baike_info || null
      };
    }
    return {success: false, message: '未识别到植物', fallback: true};
  }catch(e){
    return {success: false, message: '识别失败', fallback: true};
  }
}

// 处理LLM对话
async function handleLLMChat(userMessage){
  if(!LLM_KEY){
    return 'AI服务暂时未配置,请联系管理员。';
  }

  try{
    const resp = await fetch('https://qianfan.baidubce.com/v2/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + LLM_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'ernie-5.1',
        messages: [
          {role: 'system', content: SYSTEM_PROMPT},
          {role: 'user', content: userMessage}
        ],
        temperature: 0.7,
        max_output_tokens: 800
      })
    });

    const data = await resp.json();
    if(data.choices && data.choices[0] && data.choices[0].message){
      let reply = data.choices[0].message.content;
      // 清理markdown符号
      reply = cleanReply(reply);
      console.log('[' + new Date().toISOString() + '] 用户:', userMessage.substring(0,50));
      console.log('[' + new Date().toISOString() + '] 小芯:', reply.substring(0,100));
      return reply;
    }
    return '抱歉,我在想,稍后再试试~';
  }catch(e){
    console.error('LLM调用失败:', e.message);
    return '抱歉,网络有点问题,稍后再试试~';
  }
}

// 清理markdown符号
function cleanReply(text){
  if(!text) return text;
  let lines = text.split('\n');
  let result = [];
  for(let line of lines){
    // 跳过表格分割行 (只包含 -,|,空格,逗号的行)
    if(/^[\s\-|,]+$/.test(line.trim())) continue;
    // 去掉行首的#号(标题)
    line = line.replace(/^#+\s*/g, '');
    // 去掉>引用
    line = line.replace(/^>\s*/g, '');
    // **加粗** 转 <b>加粗</b>
    line = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    // 表格行转文字
    if(line.includes('|')){
      line = line.split('|').filter(c => c.trim()).join(', ');
    }
    result.push(line);
  }
  // 限制长度
  return result.join('\n').substring(0, 500);
}

server.listen(PORT, function(){
  console.log('芯菜园服务器已启动: http://localhost:' + PORT);
  console.log('LLM(千帆大模型): ' + (LLM_KEY ? '已配置' : '未配置'));
  console.log('图像识别: ' + (IMG_KEY ? '已配置' : '未配置'));
});