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

// ============ 用户数据统计系统 ============
const DATA_FILE = path.join(ROOT, 'data.json');
let appData = { visits: 0, users: {}, chats: [], plants: [] };

// 加载数据
function loadData(){
  try{
    if(fs.existsSync(DATA_FILE)){
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      appData = JSON.parse(content);
    }
  }catch(e){
    console.log('加载数据失败:', e.message);
  }
}

// 保存数据
function saveData(){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(appData, null, 2));
  }catch(e){
    console.log('保存数据失败:', e.message);
  }
}

// 记录访问
function recordVisit(uid, info = {}){
  appData.visits++;
  if(!appData.users[uid]){
    appData.users[uid] = { 
      firstVisit: new Date().toISOString(), 
      lastVisit: new Date().toISOString(),
      visitCount: 1,
      ...info 
    };
  }else{
    appData.users[uid].lastVisit = new Date().toISOString();
    appData.users[uid].visitCount++;
  }
  saveData();
}

// 记录对话
function recordChat(uid, message, reply){
  appData.chats.push({
    uid, message, reply,
    time: new Date().toISOString()
  });
  // 只保留最近500条
  if(appData.chats.length > 500) appData.chats = appData.chats.slice(-500);
  saveData();
}

// 记录植物
function recordPlant(uid, plantName, action){
  appData.plants.push({ uid, plantName, action, time: new Date().toISOString() });
  if(appData.plants.length > 500) appData.plants = appData.plants.slice(-500);
  saveData();
}

// 启动时加载数据
loadData();

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

const SYSTEM_PROMPT = '你是"小芯",芯菜园APP的AI种植管家,像豆包一样什么都能聊的智能助手。你的主业是水培种植、家庭菜园、营养液、病虫害防治等种植相关问题,同时也要正常回答用户的时间、天气、计算、翻译、写作、知识问答、日常闲聊等各种问题,做个有温度的全能小助手。\n\n【格式规则 - 绝对遵守】\n1. 禁止使用任何markdown语法！禁止用|表格、禁止用>引用、禁止用---分割线、禁止用#标题、禁止用**标记\n2. 加粗用<b>文字</b>,换行用\\n,列表用•\n3. 日常问题回答简洁(250字内);复杂问题(写诗、翻译、详细解答)可以答长一些,以回答清楚为准\n4. 多用emoji\n5. 种植相关问题优先认真回答并顺便推荐芯菜园;时间/日期/星期/天气基于提供的实况信息回答;其他任何问题(计算、翻译、知识、闲聊)都正常回答,不要拒绝\n6. 芯菜园设备:M(1口¥198)、S(13口¥498)、D(44口¥998)、T(66口¥1680)、F(120口¥2980)\n7. 核心卖点:0农残、0激素、0催熟、0重金属、0污染\n\n【选设备规则 - 严格遵守】\n- 1-2人 → S(¥498)\n- 3-4人 → D(¥998)\n- 5-6人 → T(¥1680)\n- 7人+ → F(¥2980)\n- "以后不想买菜" → 选大一号\n- "预算有限" → S或D\n- 已知信息不要重复问,直接给推荐';

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

  // ============ 统计API ============
  // 记录访问
  if(req.url === '/api/record-visit' && req.method === 'POST'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try{
        const data = JSON.parse(body);
        recordVisit(data.uid || 'unknown', data.info || {});
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      }catch(e){
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // 记录对话
  if(req.url === '/api/record-chat' && req.method === 'POST'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try{
        const data = JSON.parse(body);
        recordChat(data.uid || 'unknown', data.message || '', data.reply || '');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      }catch(e){
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // 记录植物操作
  if(req.url === '/api/record-plant' && req.method === 'POST'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try{
        const data = JSON.parse(body);
        recordPlant(data.uid || 'unknown', data.plantName || '', data.action || '');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      }catch(e){
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // 获取统计数据（后台）
  if(req.url === '/api/stats' && req.method === 'GET'){
    const stats = {
      totalVisits: appData.visits,
      totalUsers: Object.keys(appData.users).length,
      totalChats: appData.chats.length,
      totalPlants: appData.plants.length,
      recentUsers: Object.values(appData.users).slice(-10).reverse(),
      recentChats: appData.chats.slice(-20).reverse(),
      recentPlants: appData.plants.slice(-20).reverse()
    };
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(stats));
    return;
  }

  // 后台页面
  if(req.url === '/admin' || req.url === '/admin.html'){
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>芯菜园后台 - 数据统计</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:20px}
    .header{background:linear-gradient(135deg,#00c853,#69f0ae);color:white;padding:20px;border-radius:12px;margin-bottom:20px}
    .header h1{font-size:24px;margin-bottom:5px}
    .header p{opacity:0.9}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:20px}
    .stat-card{background:white;padding:20px;border-radius:12px;text-align:center;box-shadow:0 2px8px rgba(0,0,0,0.08)}
    .stat-card .num{font-size:32px;font-weight:bold;color:#00c853}
    .stat-card .label{color:#666;font-size:14px;margin-top:5px}
    .section{background:white;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px8px rgba(0,0,0,0.08)}
    .section h2{font-size:18px;margin-bottom:15px;color:#333;border-bottom:2px solid #00c853;padding-bottom:10px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px;text-align:left;border-bottom:1px solid #eee}
    th{background:#f8f8f8;font-weight:600;color:#666}
    tr:hover{background:#fafafa}
    .time{color:#999;font-size:12px}
    .action-add{color:#00c853}
    .action-harvest{color:#ff9800}
    .empty{text-align:center;color:#999;padding:40px}
    .btn{background:#00c853;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-right:5px}
    .btn:hover{background:#00a844}
    .btn-refresh{float:right}
  </style>
</head>
<body>
  <div class="header">
    <h1>🌱 芯菜园后台管理系统</h1>
    <p>数据统计 · 用户分析 · 运营监控</p>
  </div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="num" id="totalVisits">-</div>
      <div class="label">总访问量</div>
    </div>
    <div class="stat-card">
      <div class="num" id="totalUsers">-</div>
      <div class="label">用户数</div>
    </div>
    <div class="stat-card">
      <div class="num" id="totalChats">-</div>
      <div class="label">对话数</div>
    </div>
    <div class="stat-card">
      <div class="num" id="totalPlants">-</div>
      <div class="label">植物记录</div>
    </div>
  </div>

  <div class="section">
    <h2>📊 最近用户 <button class="btn btn-refresh" onclick="loadStats()">刷新</button></h2>
    <table id="usersTable">
      <thead><tr><th>首次访问</th><th>最后访问</th><th>访问次数</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="section">
    <h2>💬 最近对话</h2>
    <table id="chatsTable">
      <thead><tr><th>时间</th><th>用户</th><th>提问</th><th>AI回复</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="section">
    <h2>🌿 植物操作记录</h2>
    <table id="plantsTable">
      <thead><tr><th>时间</th><th>用户</th><th>操作</th><th>植物</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <script>
    async function loadStats(){
      try{
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        document.getElementById('totalVisits').textContent = data.totalVisits;
        document.getElementById('totalUsers').textContent = data.totalUsers;
        document.getElementById('totalChats').textContent = data.totalChats;
        document.getElementById('totalPlants').textContent = data.totalPlants;
        
        // 最近用户
        const usersBody = document.querySelector('#usersTable tbody');
        if(data.recentUsers.length === 0){
          usersBody.innerHTML = '<tr><td colspan="3" class="empty">暂无数据</td></tr>';
        }else{
          usersBody.innerHTML = data.recentUsers.map(u => '<tr><td>'+u.firstVisit.substring(0,19)+'</td><td>'+u.lastVisit.substring(0,19)+'</td><td>'+u.visitCount+'</td></tr>').join('');
        }
        
        // 最近对话
        const chatsBody = document.querySelector('#chatsTable tbody');
        if(data.recentChats.length === 0){
          chatsBody.innerHTML = '<tr><td colspan="4" class="empty">暂无对话</td></tr>';
        }else{
          chatsBody.innerHTML = data.recentChats.map(c => '<tr><td class="time">'+c.time.substring(0,19)+'</td><td>'+(c.uid||'匿名').substring(0,8)+'</td><td>'+c.message.substring(0,30)+'</td><td>'+(c.reply||'').substring(0,50)+'</td></tr>').join('');
        }
        
        // 植物记录
        const plantsBody = document.querySelector('#plantsTable tbody');
        if(data.recentPlants.length === 0){
          plantsBody.innerHTML = '<tr><td colspan="4" class="empty">暂无记录</td></tr>';
        }else{
          plantsBody.innerHTML = data.recentPlants.map(p => '<tr><td class="time">'+p.time.substring(0,19)+'</td><td>'+(p.uid||'匿名').substring(0,8)+'</td><td class="action-'+p.action+'">'+p.action+'</td><td>'+p.plantName+'</td></tr>').join('');
        }
      }catch(e){
        console.error('加载失败:', e);
      }
    }
    loadStats();
    setInterval(loadStats, 30000);
  </script>
</body>
</html>`;
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
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

// ====== 天气查询（open-meteo 免费API） ======
// WMO天气代码 → 中文
const WEATHER_CODE_MAP = {
  0:'晴',1:'晴间多云',2:'多云',3:'阴',
  45:'雾',48:'雾凇',
  51:'毛毛雨',53:'毛毛雨',55:'毛毛雨',
  61:'小雨',63:'中雨',65:'大雨',
  71:'小雪',73:'中雪',75:'大雪',
  80:'阵雨',81:'阵雨',82:'强阵雨',
  95:'雷阵雨',96:'雷阵雨伴冰雹',99:'雷阵雨伴冰雹'
};
// 主要中国城市列表（用于匹配用户提到的城市）
const CITY_LIST = ['北京','上海','广州','深圳','杭州','南京','苏州','成都','重庆','武汉','西安','天津','郑州','长沙','合肥','福州','厦门','济南','青岛','大连','沈阳','哈尔滨','长春','昆明','贵阳','南宁','海口','三亚','乌鲁木齐','拉萨','兰州','西宁','银川','呼和浩特','太原','石家庄','南昌','无锡','宁波','温州','佛山','东莞','中山','泉州','常州','徐州','南通','烟台','潍坊','淄博','唐山','保定','洛阳','襄阳','宜昌','桂林','绵阳','遵义','大理','丽江','珠海','汕头','湛江','惠州','江门','肇庆','扬州','镇江','泰州','盐城','淮安','连云港','宿迁','嘉兴','湖州','绍兴','金华','台州','丽水','衢州','舟山','莆田','漳州','龙岩','三明','南平','宁德','芜湖','蚌埠','淮南','马鞍山','淮北','铜陵','安庆','黄山','滁州','阜阳','宿州','六安','亳州','池州','宣城','萍乡','九江','新余','鹰潭','赣州','吉安','宜春','抚州','上饶','株洲','湘潭','衡阳','邵阳','岳阳','常德','张家界','益阳','郴州','永州','怀化','娄底','湘西','开封','平顶山','安阳','鹤壁','新乡','焦作','濮阳','许昌','漯河','三门峡','南阳','商丘','信阳','周口','驻马店','十堰','荆州','宜昌','襄樊','鄂州','荆门','孝感','黄冈','咸宁','随州','恩施','秦皇岛','邯郸','邢台','张家口','承德','廊坊','沧州','衡水','大同','阳泉','长治','晋城','朔州','晋中','运城','忻州','临汾','吕梁','包头','乌海','赤峰','通辽','鄂尔多斯','呼伦贝尔','巴彦淖尔','乌兰察布','锦州','营口','阜新','辽阳','盘锦','铁岭','朝阳','葫芦岛','吉林','四平','辽源','通化','白山','松原','白城','齐齐哈尔','牡丹江','佳木斯','大庆','鸡西','双鸭山','伊春','七台河','鹤岗','黑河','绥化','南通'];
// 从消息中提取城市名
function extractCity(msg){
  for(const c of CITY_LIST){
    if(msg.indexOf(c) >= 0) return c;
  }
  return null;
}
// 查询城市天气
async function fetchWeather(city){
  try{
    // 1. 城市转经纬度
    const geoResp = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json');
    const geoData = await geoResp.json();
    if(!geoData.results || geoData.results.length === 0) return null;
    const loc = geoData.results[0];
    // 2. 查实时天气
    const wResp = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai');
    const wData = await wResp.json();
    if(!wData.current) return null;
    const code = wData.current.weather_code;
    return {
      city: city,
      temp: Math.round(wData.current.temperature_2m),
      humidity: wData.current.relative_humidity_2m,
      wind: Math.round(wData.current.wind_speed_10m),
      desc: WEATHER_CODE_MAP[code] || '天气',
      max: Math.round(wData.daily.temperature_2m_max[0]),
      min: Math.round(wData.daily.temperature_2m_min[0])
    };
  }catch(e){
    console.error('天气查询失败:', e.message);
    return null;
  }
}
// 判断是否天气问题
const WEATHER_KEYWORDS = ['天气','下雨','下雪','气温','温度','冷不冷','热不热','要不要带伞','湿度','风力','刮风','降温','升温','预报'];
function isWeatherQuestion(msg){
  for(const k of WEATHER_KEYWORDS){
    if(msg.indexOf(k) >= 0) return true;
  }
  return false;
}

// 处理LLM对话
async function handleLLMChat(userMessage){
  if(!LLM_KEY){
    return 'AI服务暂时未配置,请联系管理员。';
  }

  try{
    // 天气问题：先查真实天气再交给大模型组织回答
    let context = '[当前时间:' + new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}) + ']';
    if(isWeatherQuestion(userMessage)){
      const city = extractCity(userMessage);
      if(city){
        const weather = await fetchWeather(city);
        if(weather){
          context += '[天气实况:' + weather.city + ' 当前' + weather.temp + '℃ ' + weather.desc +
            ' 湿度' + weather.humidity + '% 风力' + weather.wind + 'km/h 今日' + weather.min + '~' + weather.max + '℃]';
        } else {
          context += '[天气查询失败,告诉用户暂时查不到' + city + '的天气,可以问种植相关问题]';
        }
      } else {
        context += '[用户问天气但没提城市,主动询问他在哪个城市]';
      }
    }
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
          {role: 'user', content: context + ' ' + userMessage}
        ],
        temperature: 0.7,
        max_output_tokens: 1200
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