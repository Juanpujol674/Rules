/**
 * Sub-Store 远程脚本（IIFE 版，无 module.exports、无顶层 await）
 * 功能：
 * 1) 从 合集(coll)/订阅(names) 生成 sing-box 节点
 * 2) 注入：⚙️ 手动切换、🎚️ 自动选择、地区分组（🇭🇰/🇯🇵/🇸🇬/🇺🇸/🇹🇼）
 * 3) “瘦身”业务分组：移除 ⚙️/🎚️/🚀，仅保留 🔄/🐋/地区分组
 */

(function(){
  // ---- 兜底参数（不在 UI 传参时才用到；合集优先）----
  var COLL  = '';         // 例：'MyCollection'
  var NAMES = [];         // 例：['1233345','mitce']

  // ---- 地区匹配（按你的机场命名可调整）----
  var regionMap = {
    "🇭🇰 香港节点": /香港|HK|Hong\s*Kong/i,
    "🇯🇵 日本节点": /日本|JP|Japan/i,
    "🇸🇬 新加坡节点": /新加坡|SG|Singapore/i,
    "🇺🇸 美国节点": /美国|美國|US|USA|United\s*States/i,
    "🇹🇼 台湾节点": /台湾|台灣|TW|Taiwan/i
  };

  // ---- 需要“瘦身”的业务分组 ----
  var bizGroups = new Set([
    "🚅 国内流量","📺 哔哩哔哩","🤖 海外AI服务","🎥 海外流媒体",
    "🎵 TikTok","📟 Telegram","🗃️ PayPal","📽️ 黑猫emby",
    "📹 YouTube","🔍 Google","🐙 GitHub","🪟 Microsoft","☁️ OneDrive",
    "💬 Discord","📘 Meta"," Apple","🏁 Speedtest"
  ]);

  // ---- 会导致“全量展开”的聚合选择器（需要从业务分组剔除）----
  var antiFlatten = new Set(["⚙️ 手动切换","🎚️ 自动选择","🚀 节点选择"]);

  // 小工具
  function opt(k, d){ return (typeof $options !== 'undefined' && $options && typeof $options[k] !== 'undefined') ? $options[k] : d; }
  function ensureList(v){ return Array.isArray(v) ? v : []; }
  function mergeUnique(a,b){ var s=new Set([].concat(a||[], b||[])); return Array.from(s); }
  function byTag(tpl, tag){ return tpl.outbounds.find(function(o){ return o && o.tag===tag; }); }

  // 1) 读取模板
  var rawText = (typeof $content === 'string' && $content.trim()) ? $content : ($files && $files[0]) ? $files[0] : '';
  if (!rawText) throw new Error("未读取到规则模板内容：请在‘文件’里选择模板 JSON。");

  var tpl;
  try { tpl = JSON.parse(rawText); }
  catch(e){ throw new Error("规则模板不是合法 JSON：" + e.message); }
  if (!Array.isArray(tpl.outbounds)) tpl.outbounds = [];

  // 2) 解析参数（UI 优先，其次兜底）
  var collName = String(opt('coll', COLL)||'').trim();
  var namesArg = String(opt('names', '')||'').trim();
  var namesLst = namesArg ? namesArg.split(',').map(function(s){return s.trim();}).filter(Boolean)
                          : (Array.isArray(NAMES) ? NAMES : []);

  // 3) 取节点（封装成 Promise 的顺序流程，避免顶层 await）
  function fetchNodes(type, name){
    return produceArtifact({
      type: type,                 // 'collection' | 'subscription'
      name: name,
      platform: 'sing-box',
      produceType: 'internal'
    });
  }

  function uniqByTag(list){
    var seen = new Set(), out=[];
    list.forEach(function(it){ if (it && it.tag && !seen.has(it.tag)) { seen.add(it.tag); out.push(it); }});
    return out;
  }

  function appendNodesIfNotExists(tpl, arr){
    var existing = new Set(tpl.outbounds.map(function(o){ return o && o.tag; }).filter(Boolean));
    arr.forEach(function(n){
      if (!existing.has(n.tag)) { tpl.outbounds.push(n); existing.add(n.tag); }
    });
  }

  function ensureSelectorHas(tpl, tag, candidates){
    var sel = byTag(tpl, tag); if (!sel || sel.type!=='selector') return;
    sel.outbounds = mergeUnique(ensureList(sel.outbounds), candidates);
  }

  function ensureUrltestHas(tpl, tag, candidates){
    var ut = byTag(tpl, tag); if (!ut || ut.type!=='urltest') return;
    ut.outbounds = mergeUnique(ensureList(ut.outbounds), candidates);
  }

  // 开始链式执行
  (function run(){
    var p = Promise.resolve().then(function(){
      if (collName) {
        return fetchNodes('collection', collName).then(function(arr){
          if (!Array.isArray(arr) || !arr.length) throw new Error("合集 "+collName+" 未产出节点");
          return arr;
        });
      } else if (namesLst.length) {
        // 串行拉取多个订阅，合并
        var seq = Promise.resolve([]); // 累积
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
      nodes = (nodes || []).filter(function(n){ return n && n.tag; });
      nodes = uniqByTag(nodes);
      var allTags = nodes.map(function(n){ return n.tag; });

      // 注入：手动/自动/地区
      appendNodesIfNotExists(tpl, nodes);
      ensureSelectorHas(tpl, "⚙️ 手动切换", allTags);
      ensureUrltestHas(tpl, "🎚️ 自动选择", allTags);

      Object.keys(regionMap).forEach(function(group){
        var re = regionMap[group];
        var tags = allTags.filter(function(t){ return re.test(t); });
        if (tags.length) ensureSelectorHas(tpl, group, tags);
      });

      // 瘦身业务分组
      var mustKeep = new Set(["🔄 直连入口","🐋 默认节点"].concat(Object.keys(regionMap)));
      tpl.outbounds.forEach(function(ob){
        if (!ob || ob.type!=='selector' || !bizGroups.has(ob.tag)) return;
        var outs = ensureList(ob.outbounds);
        // 去掉会展开全量节点的聚合分组
        outs = outs.filter(function(x){ return !antiFlatten.has(x); });
        // 仅保留 直连/默认/地区分组 或 其它“非聚合”的 selector
        outs = outs.filter(function(x){
          var target = byTag(tpl, x);
          return mustKeep.has(x) || (target && target.type==='selector' && !antiFlatten.has(x));
        });
        // 兜底：确保有直连/默认
        outs = mergeUnique(["🔄 直连入口","🐋 默认节点"], outs);
        ob.outbounds = outs;
      });

      // 输出
      $content = JSON.stringify(tpl, null, 2);
    });

    p.catch(function(e){
      // 抛出给 Sub-Store
      throw e;
    });
  })();
})();
