/**
 * Sub-Store 远程脚本（顶层 await 版，无 module.exports）
 * 功能：
 * 1) 从 合集(coll)/订阅(names) 生成 sing-box 节点
 * 2) 仅注入到：⚙️ 手动切换、🎚️ 自动选择、各地区分组（🇭🇰/🇯🇵/🇸🇬/🇺🇸/🇹🇼）
 * 3) 对业务分组“瘦身”：移除 ⚙️/🎚️/🚀（会展开全节点），仅保留 🔄/🐋/地区分组
 *
 * 用法：
 *  - Sub-Store「脚本操作 → 远程连接」填本文件 raw 链接
 *  - 「文件」里选择规则模板：singbox_for_wrt_template_pro.json 或 plus 版
 *  - 参数任选其一：
 *      coll=你的合集名
 *      或 names=订阅1,订阅2   （英文逗号）
 *  - 若不传，使用下方写死的 COLL/NAMES 作兜底（合集优先）
 */

/*** 可选兜底（不在 UI 传参时才会用到） ***/
const COLL  = '';                 // 例：'MyCollection'（留空表示不用兜底合集）
const NAMES = [];                 // 例：['1233345','mitce']（留空表示不用兜底订阅）

/*** 地区匹配（按你的机场命名必要时调整） ***/
const regionMap = {
  "🇭🇰 香港节点": /香港|HK|Hong\s*Kong/i,
  "🇯🇵 日本节点": /日本|JP|Japan/i,
  "🇸🇬 新加坡节点": /新加坡|SG|Singapore/i,
  "🇺🇸 美国节点": /美国|美國|US|USA|United\s*States/i,
  "🇹🇼 台湾节点": /台湾|台灣|TW|Taiwan/i
};

/*** 需要“瘦身”的业务分组 ***/
const bizGroups = new Set([
  "🚅 国内流量","📺 哔哩哔哩","🤖 海外AI服务","🎥 海外流媒体",
  "🎵 TikTok","📟 Telegram","🗃️ PayPal","📽️ 黑猫emby",
  "📹 YouTube","🔍 Google","🐙 GitHub","🪟 Microsoft","☁️ OneDrive",
  "💬 Discord","📘 Meta"," Apple","🏁 Speedtest"
]);

/*** 会把“全部节点展开”的聚合选择器（须从业务分组移除） ***/
const antiFlatten = new Set(["⚙️ 手动切换","🎚️ 自动选择","🚀 节点选择"]);

/*** 1) 读取模板（从 $content 或 $files[0]） ***/
const rawText = (typeof $content === 'string' && $content.trim()) ? $content
             : ($files && $files[0]) ? $files[0] : '';
if (!rawText) throw new Error("未读取到规则模板内容：请在‘文件’里选择模板 JSON。");

let tpl;
try { tpl = JSON.parse(rawText); }
catch(e){ throw new Error("规则模板不是合法 JSON：" + e.message); }
if (!Array.isArray(tpl.outbounds)) tpl.outbounds = [];

/*** 2) 获取参数（UI 传参优先；否则用兜底） ***/
const opt = (k, d) => ($options && typeof $options[k] !== 'undefined') ? $options[k] : d;
const collName = String(opt('coll', COLL)).trim();
const namesArg = String(opt('names', '')).trim();
const namesLst = namesArg ? namesArg.split(',').map(s=>s.trim()).filter(Boolean)
                          : (Array.isArray(NAMES) ? NAMES : []);

/*** 3) 拉取 sing-box 节点（合集优先） ***/
async function fetchNodes(type, name) {
  return await produceArtifact({
    type,                    // 'collection' | 'subscription'
    name,
    platform: 'sing-box',
    produceType: 'internal'  // 返回 Array<Outbound>
  });
}

let nodes = [];
if (collName) {
  const arr = await fetchNodes('collection', collName);
  if (!Array.isArray(arr) || !arr.length) throw new Error(`合集 ${collName} 未产出节点`);
  nodes.push(...arr);
} else if (namesLst.length) {
  for (const n of namesLst) {
    const arr = await fetchNodes('subscription', String(n));
    if (!Array.isArray(arr) || !arr.length) throw new Error(`订阅 ${n} 未产出节点`);
    nodes.push(...arr);
  }
} else {
  throw new Error("未配置 合集(coll) 或 订阅列表(names)；可在 UI 传参，或改脚本顶部 COLL/NAMES。");
}

/*** 4) 去重（按 tag） ***/
nodes = (nodes || []).filter(n => n && n.tag);
{
  const seen = new Set(); const out = [];
  for (const it of nodes) if (!seen.has(it.tag)) { seen.add(it.tag); out.push(it); }
  nodes = out;
}
const allTags = nodes.map(n => n.tag);

/*** 5) 工具函数 ***/
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
const appendNodesIfNotExists = (arr) => {
  const existing = new Set(tpl.outbounds.map(o => o && o.tag).filter(Boolean));
  for (const n of arr) if (!existing.has(n.tag)) { tpl.outbounds.push(n); existing.add(n.tag); }
};

/*** 6) 注入到 手动/自动/地区分组 ***/
appendNodesIfNotExists(nodes);
ensureSelectorHas("⚙️ 手动切换", allTags);
ensureUrltestHas("🎚️ 自动选择", allTags);

for (const [group, re] of Object.entries(regionMap)) {
  const tags = allTags.filter(t => re.test(t));
  if (tags.length) ensureSelectorHas(group, tags);
}

/*** 7) 瘦身业务分组：移除会“全量展开”的选择器，仅保留 直连/默认/地区分组 ***/
const mustKeep = new Set(["🔄 直连入口","🐋 默认节点", ...Object.keys(regionMap)]);
for (const ob of tpl.outbounds) {
  if (!ob || ob.type !== 'selector' || !bizGroups.has(ob.tag)) continue;
  let outs = ensureList(ob.outbounds);

  // 去掉会展开所有节点的聚合选择器
  outs = outs.filter(x => !antiFlatten.has(x));

  // 仅保留 直连/默认/地区分组，或其它“非聚合”的 selector
  outs = outs.filter(x => mustKeep.has(x) || (byTag(x)?.type === 'selector' && !antiFlatten.has(x)));

  // 兜底确保存在直连/默认
  outs = mergeUnique(["🔄 直连入口","🐋 默认节点"], outs);

  ob.outbounds = outs;
}

/*** 8) 输出最终 JSON 给下一个操作（或直接作为文件内容） ***/
$content = JSON.stringify(tpl, null, 2);
