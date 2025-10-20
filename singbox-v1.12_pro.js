/**
 * Sub-Store 远程脚本（v1.5_pro, IIFE）
 * 功能：
 *  1) 从 合集(coll)/订阅(names) 产出 sing-box 节点（internal 数组）
 *  2) 注入：⚙️ 手动切换、🎚️ 自动选择、地区分组（🇭🇰/🇯🇵/🇸🇬/🇺🇸/🇹🇼）
 *  3) 业务分组“瘦身 + 定向地区白名单”
 *  4) 强力兜底与自检：禁止空 outbounds；自动补齐基础分组
 *  5) 【v1.5 修复】强制所有“地区分组”为 selector（避免 Must be a Selector）
 *
 * 用法：
 *  - Sub-Store「脚本操作 → 远程连接」填本文件 raw 链接（末尾加 ?v=xxx 规避缓存）
 *  - 「文件」里选择规则模板：singbox_for_wrt_template_plus.json / pro.json
 *  - 参数其一：coll=你的合集名  或  names=订阅1,订阅2（英文逗号）
 *  - 若不传参，可直接在脚本顶部写死 COLL/NAMES（合集优先）
 */

(function(){
  /* ==== 可选兜底（不在 UI 里传参时才用；合集优先） ==== */
  var COLL  = '';              // 例：'MyCollection'
  var NAMES = [];              // 例：['1233345','mitce']

  /* ==== 地区匹配（按你的节点命名调整关键字/正则） ==== */
  var regionMap = {
    "🇭🇰 香港节点": /香港|HK|Hong\s*Kong/i,
    "🇯🇵 日本节点": /日本|JP|Japan/i,
    "🇸🇬 新加坡节点": /新加坡|SG|Singapore/i,
    "🇺🇸 美国节点": /美国|美國|US|USA|United\s*States/i,
    "🇹🇼 台湾节点": /台湾|台灣|TW|Taiwan/i
  };

  /* ==== 需要“瘦身/定向”的业务分组清单 ==== */
  var bizGroups = new Set([
    "🚅 国内流量","📺 哔哩哔哩","🤖 海外AI服务","🎥 海外流媒体",
    "🎵 TikTok","📟 Telegram","🗃️ PayPal","📽️ 黑猫emby",
    "📹 YouTube","🔍 Google","🐙 GitHub","🪟 Microsoft","☁️ OneDrive",
    "💬 Discord","📘 Meta"," Apple","🏁 Speedtest"
  ]);

  /* ==== 业务分组 → 地区白名单策略（只保留这些地区选择器） ==== */
  var bizRegionPolicy = {
    "🚅 国内流量": ["🇭🇰 香港节点","🇹🇼 台湾节点","🇯🇵 日本节点"],
    "📺 哔哩哔哩": ["🇭🇰 香港节点","🇹🇼 台湾节点"],
    "🤖 海外AI服务": ["🇺🇸 美国节点","🇸🇬 新加坡节点","🇯🇵 日本节点"],
    "🎥 海外流媒体": ["🇭🇰 香港节点","🇸🇬 新加坡节点","🇯🇵 日本节点","🇺🇸 美国节点"],
    "🎵 TikTok": ["🇯🇵 日本节点","🇸🇬 新加坡节点","🇺🇸 美国节点"],
    "📟 Telegram": ["🇭🇰 香港节点","🇯🇵 日本节点","🇸🇬 新加坡节点"],
    "🗃️ PayPal": ["🇺🇸 美国节点","🇸🇬 新加坡节点"],
    "📽️ 黑猫emby": ["🇭🇰 香港节点","🇯🇵 日本节点","🇸🇬 新加坡节点"],
    "📹 YouTube": ["🇺🇸 美国节点","🇸🇬 新加坡节点","🇭🇰 香港节点"],
    "🔍 Google": ["🇸🇬 新加坡节点","🇭🇰 香港节点","🇺🇸 美国节点"],
    "🐙 GitHub": ["🇺🇸 美国节点","🇯🇵 日本节点"],
    "🪟 Microsoft": ["🇸🇬 新加坡节点","🇺🇸 美国节点"],
    "☁️ OneDrive": ["🇸🇬 新加坡节点","🇺🇸 美国节点"],
    "💬 Discord": ["🇺🇸 美国节点","🇸🇬 新加坡节点"],
    "📘 Meta": ["🇺🇸 美国节点","🇸🇬 新加坡节点"],
    " Apple": ["🇭🇰 香港节点","🇸🇬 新加坡节点","🇺🇸 美国节点"],
    "🏁 Speedtest": ["🇭🇰 香港节点","🇯🇵 日本节点","🇸🇬 新加坡节点","🇺🇸 美国节点","🇹🇼 台湾节点"]
  };

  /* ==== 会把“全部节点展开”的聚合选择器（需从业务分组移除） ==== */
  var antiFlatten = new Set(["⚙️ 手动切换","🎚️ 自动选择","🚀 节点选择"]);

  /* ==== 工具 ==== */
  function opt(k, d){ return (typeof $options!=='undefined' && $options && typeof $options[k]!=='undefined') ? $options[k] : d; }
  function ensureList(v){ return Array.isArray(v) ? v : []; }
  function mergeUnique(a,b){ var s=new Set([].concat(a||[], b||[])); return Array.from(s); }
  function byTag(tpl, tag){ return tpl.outbounds.find(function(o){ return o && o.tag===tag; }); }

  /* ==== 1) 读取模板 ==== */
  var rawText = (typeof $content==='string' && $content.trim()) ? $content : ($files && $files[0]) ? $files[0] : '';
  if (!rawText) throw new Error("未读取到规则模板内容：请在‘文件’里选择模板 JSON。");
  var tpl;
  try { tpl = JSON.parse(rawText); } catch(e){ throw new Error("规则模板不是合法 JSON：" + e.message); }
  if (!Array.isArray(tpl.outbounds)) tpl.outbounds = [];

  /* ==== 2) 补齐基础出站（若缺少则创建） ==== */
  function ensureOutboundExists(tag, factory){
    if (!byTag(tpl, tag)) tpl.outbounds.push(factory());
  }
  ensureOutboundExists("🔄 直连入口", function(){ return { type:"direct", tag:"🔄 直连入口" }; });
  ensureOutboundExists("⚙️ 手动切换", function(){ return { type:"selector", tag:"⚙️ 手动切换", outbounds:[] }; });
  ensureOutboundExists("🎚️ 自动选择", function(){ return { type:"urltest", tag:"🎚️ 自动选择", url:"https://cp.cloudflare.com", interval:"300s", outbounds:[] }; });
  ensureOutboundExists("🐋 默认节点", function(){ return { type:"selector", tag:"🐋 默认节点", outbounds:["⚙️ 手动切换","🎚️ 自动选择","🔄 直连入口"] }; });
  // 确保地区分组对象存在（初始为空，后续填充）
  Object.keys(regionMap).forEach(function(tag){
    ensureOutboundExists(tag, function(){ return { type:"selector", tag:tag, outbounds:[] }; });
  });

  /* ==== 【v1.5 新增】将所有地区分组强制为 selector（避免 urltest 导致 Must be a Selector） ==== */
  Object.keys(regionMap).forEach(function(tag){
    var ob = byTag(tpl, tag);
    if (!ob) return;
    if (ob.type !== 'selector') {
      ob.type = 'selector';
      // 清理 urltest 专用字段
      if ('url' in ob) delete ob.url;
      if ('interval' in ob) delete ob.interval;
      ob.outbounds = ensureList(ob.outbounds);
    }
  });

  /* ==== 3) 解析参数（UI 优先，其次兜底） ==== */
  var collName = String(opt('coll', COLL)||'').trim();
  var namesArg = String(opt('names','')||'').trim();
  var namesLst = namesArg ? namesArg.split(',').map(function(s){return s.trim();}).filter(Boolean)
                          : (Array.isArray(NAMES) ? NAMES : []);

  /* ==== 4) 产出节点（Promise 串行，避免顶层 await） ==== */
  function fetchNodes(type, name){
    return produceArtifact({ type:type, name:name, platform:'sing-box', produceType:'internal' });
  }
  function uniqByTag(list){
    var seen=new Set(), out=[];
    list.forEach(function(it){ if (it && it.tag && !seen.has(it.tag)) { seen.add(it.tag); out.push(it); } });
    return out;
  }
  function appendNodesIfNotExists(arr){
    var existing=new Set(tpl.outbounds.map(function(o){return o && o.tag;}).filter(Boolean));
    arr.forEach(function(n){ if (!existing.has(n.tag)) { tpl.outbounds.push(n); existing.add(n.tag); } });
  }
  function ensureSelectorHas(tag, candidates){
    var sel = byTag(tpl, tag); if (!sel || sel.type!=='selector') return;
    sel.outbounds = mergeUnique(ensureList(sel.outbounds), candidates);
  }
  function ensureUrltestHas(tag, candidates){
    var ut = byTag(tpl, tag); if (!ut || ut.type!=='urltest') return;
    ut.outbounds = mergeUnique(ensureList(ut.outbounds), candidates);
  }

  (function run(){
    var p = Promise.resolve().then(function(){
      if (collName) {
        return fetchNodes('collection', collName).then(function(arr){
          if (!Array.isArray(arr) || !arr.length) throw new Error("合集 "+collName+" 未产出节点");
          return arr;
        });
      } else if (namesLst.length) {
        var seq = Promise.resolve([]);
        namesLst.forEach(function(n){
          seq = seq.then(function(acc){
            return fetchNodes('subscription', String(n)).then(function(arr){
              if (!Array.isArray(arr) || !arr.length) throw new Error("订阅 "+n+" 未产出节点");
              return acc.concat(arr);
            });
          });
        });
        return seq;
      } else {
        throw new Error("未配置 合集(coll) 或 订阅列表(names)；可在 UI 传参，或改脚本顶部 COLL/NAMES。");
      }
    }).then(function(nodes){
      nodes = (nodes||[]).filter(function(n){ return n && n.tag; });
      nodes = uniqByTag(nodes);
      var allTags = nodes.map(function(n){ return n.tag; });

      // 注入：手动/自动/地区
      appendNodesIfNotExists(nodes);
      ensureSelectorHas("⚙️ 手动切换", allTags);
      ensureUrltestHas("🎚️ 自动选择", allTags);

      Object.keys(regionMap).forEach(function(group){
        var re = regionMap[group];
        var tags = allTags.filter(function(t){ return re.test(t); });
        // 若该地区一个候选都没有，兜底用“默认节点”，保证 selector 非空
        if (!tags.length) tags = ["🐋 默认节点"];
        ensureSelectorHas(group, tags);
      });

      // 业务分组：瘦身 + 定向地区白名单；若空则兜底为直连/默认
      var mustKeepBase = ["🔄 直连入口","🐋 默认节点"];
      Object.keys(bizRegionPolicy).forEach(function(tag){
        var ob = byTag(tpl, tag); if (!ob || ob.type!=='selector') return;
        var outs = ensureList(ob.outbounds);
        // 去掉会“全量展开”的聚合选择器
        outs = outs.filter(function(x){ return !antiFlatten.has(x); });
        // 只保留 直连/默认 + 策略白名单中的地区分组
        var allow = bizRegionPolicy[tag] || [];
        outs = outs.filter(function(x){
          return (mustKeepBase.indexOf(x)>=0) || (allow.indexOf(x)>=0);
        });
        // 兜底：至少含 直连/默认
        outs = mergeUnique(mustKeepBase, outs);
        ob.outbounds = outs;
      });

      // 最后一轮自检与修复：剔除非字符串，selector/urltest 禁止空数组
      tpl.outbounds = tpl.outbounds.filter(function(o){ return o && o.tag; });
      tpl.outbounds.forEach(function(o){
        if (o.type==='selector' || o.type==='urltest') {
          o.outbounds = ensureList(o.outbounds).filter(function(x){ return typeof x==='string' && x; });
          if (!o.outbounds.length) {
            o.outbounds = ["🐋 默认节点","🔄 直连入口"]; // 兜底
          }
        }
      });

      $content = JSON.stringify(tpl, null, 2);
    });

    p.catch(function(e){ throw e; });
  })();
})();
