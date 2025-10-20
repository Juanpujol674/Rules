/**
 * Sub-Store 远程脚本（JS）：
 * - 从 合集/订阅 产出 sing-box 节点
 * - 注入到：⚙️ 手动切换、🎚️ 自动选择、地区分组（🇭🇰/🇯🇵/🇸🇬/🇺🇸/🇹🇼）
 * - “瘦身”业务分组：移除会展开全量节点的选择器（⚙️/🎚️/🚀），只保留 直连/默认/地区分组
 *
 * 使用：
 *   1) Sub-Store「脚本操作 → 远程连接」填写本文件 raw 链接
 *   2) 「文件」里选择你的规则模板（如 singbox_for_wrt_template_pro.json 或 plus 版）
 *   3) 可在“脚本参数”里传：
 *      - coll=你的合集名
 *      - names=订阅1,订阅2
 *   4) 若不传，脚本将使用下方写死的 COLL/NAMES 兜底
 */

// === 兜底：写死合集名或订阅名（合集优先）；可留空，推荐用脚本参数传 ===
const COLL  = '';                           // 例：'LongLight-合集名'
const NAMES = [];                           // 例：['1233345','mitce']

// === 地区关键字（按你的机场命名修改关键字更精准）===
const regionMap = {
  "🇭🇰 香港节点": /香港|HK|Hong\s*Kong/i,
  "🇯🇵 日本节点": /日本|JP|Japan/i,
  "🇸🇬 新加坡节点": /新加坡|SG|Singapore/i,
  "🇺🇸 美国节点": /美国|美國|US|USA|United\s*States/i,
  "🇹🇼 台湾节点": /台湾|台灣|TW|Taiwan/i
};

// === 业务分组清单（需要瘦身的 selector 组）===
const bizGroups = new Set([
  "🚅 国内流量","📺 哔哩哔哩","🤖 海外AI服务","🎥 海外流媒体",
  "🎵 TikTok","📟 Telegram","🗃️ PayPal","📽️ 黑猫emby",
  "📹 YouTube","🔍 Google","🐙 GitHub","🪟 Microsoft","☁️ OneDrive",
  "💬 Discord","📘 Meta"," Apple","🏁 Speedtest"
]);

// === 会把“全部节点展开”的聚合选择器（需要从业务分组里剔除）===
const antiFlatten = new Set(["⚙️ 手动切换","🎚️ 自动选择","🚀 节点选择"]);

module.exports = async (raw, ctx) => {
  // 1) 读取模板 JSON
  let tpl;
  try {
    const text = raw ?? ctx?.files?.[0];
    if (!text) throw new Error("未读取到规则模板内容：请在‘文件’里选择模板 JSON。");
    tpl = JSON.parse(text);
  } catch (e) {
    throw new Error("规则模板不是合法 JSON，或未选择规则模板文件： " + e.message);
  }
  if (!Array.isArray(tpl.outbounds)) tpl.outbounds = [];

  // 2) 解析参数（脚本参数优先；否则走兜底）
  const opt = (k, d) => (ctx?.options && typeof ctx.options[k] !== 'undefined') ? ctx.options[k] : d;
  const collName = String(opt('coll', COLL)).trim();
  const namesArg = String(opt('names', '')).trim();
  const namesLst = namesArg ? namesArg.split(',').map(s=>s.trim()).filter(Boolean) : (Array.isArray(NAMES)?NAMES:[]);

  // 3) 取节点（合集优先，其次订阅列表）
  async function produce(type, name) {
    return await ctx.produceArtifact({
      type,                  // 'collection' | 'subscription'
      name,
      platform: 'sing-box',
      produceType: 'internal'
    });
  }

  let nodes = [];
  if (collName) {
    const arr = await produce('collection', collName);
    if (!Array.isArray(arr) || !arr.length) throw new Error(`合集 ${collName} 未产出节点`);
    nodes.push(...arr);
  } else if (namesLst.length) {
    for (const n of namesLst) {
      const arr = await produce('subscription', n);
      if (!Array.isArray(arr) || !arr.length) throw new Error(`订阅 ${n} 未产出节点`);
      nodes.push(...arr);
    }
  } else {
    throw new Error("未配置 合集(coll) 或 订阅列表(names)");
  }

  // 4) 去重（按 tag）
  nodes = (nodes || []).filter(n => n && n.tag);
  const uniqByTag = (list) => {
    const seen = new Set(), out=[];
    for (const it of list) if (!seen.has(it.tag)) { seen.add(it.tag); out.push(it); }
    return out;
  };
  nodes = uniqByTag(nodes);
  const allTags = nodes.map(n => n.tag);

  // 5) 小工具
  const byTag = (tag) => tpl.outbounds.find(o => o && o.tag === tag);
  const ensureList = (v) => Array.isArray(v) ? v : [];
  const mergeUnique = (a,b) => [...new Set([...(a||[]), ...(b||[])])];
  const ensureSelectorHas = (tag, candidates) => {
    const sel = byTag(tag); if (!sel || sel.type !== 'selector') return;
    sel.outbounds = mergeUnique(ensureList(sel.outbounds), candidates);
  };
  const ensureUrltestHas = (tag, candidates) => {
    const ut = byTag(tag); if (!ut || ut.type !== 'urltest') return;
    ut.outbounds = mergeUnique(ensureList(ut.outbounds), candidates);
  };
  const appendNodesIfNotExists = (ns) => {
    const existing = new Set(tpl.outbounds.map(o => o && o.tag).filter(Boolean));
    for (const n of ns) if (!existing.has(n.tag)) { tpl.outbounds.push(n); existing.add(n.tag); }
  };

  // 6) 注入到 手动/自动/地区分组
  appendNodesIfNotExists(nodes);
  ensureSelectorHas("⚙️ 手动切换", allTags);
  ensureUrltestHas("🎚️ 自动选择", allTags);

  const regionGroups = Object.keys(regionMap);
  for (const [group, re] of Object.entries(regionMap)) {
    const tags = allTags.filter(t => re.test(t));
    if (tags.length) ensureSelectorHas(group, tags);
  }

  // 7) “瘦身”业务分组：移除会导致“全量展开”的选择器，仅保留 直连/默认/地区分组
  const mustKeep = new Set(["🔄 直连入口","🐋 默认节点", ...Object.keys(regionMap)]);
  for (const ob of tpl.outbounds) {
    if (!ob || ob.type !== 'selector' || !bizGroups.has(ob.tag)) continue;
    let outs = ensureList(ob.outbounds);

    // 去掉聚合选择器（⚙️/🎚️/🚀）
    outs = outs.filter(x => !antiFlatten.has(x));

    // 仅保留 直连/默认/地区分组 或 其它“非聚合”的 selector
    outs = outs.filter(x => mustKeep.has(x) || (byTag(x)?.type === 'selector' && !antiFlatten.has(x)));

    // 兜底：确保有「直连/默认」
    outs = mergeUnique(["🔄 直连入口","🐋 默认节点"], outs);

    ob.outbounds = outs;
  }

  // 8) 输出最终 JSON
  return JSON.stringify(tpl, null, 2);
};
