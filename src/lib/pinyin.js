// Compact pinyin lookup for CJK characters (without tone marks)
const dict = {
  '编':'bian','格':'ge','校':'xiao','颜':'yan','色':'se','彩':'cai',
  '翻':'fan','译':'yi','命':'ming',
  '哈':'ha','希':'xi','摘':'zhai','要':'yao','正':'zheng','则':'ze',
  '表':'biao','达':'da','式':'shi','时':'shi','间':'jian','戳':'chuo',
  '日':'ri','期':'qi','唯':'wei','一':'yi','解':'jie','码':'ma',
  '计':'ji','算':'suan','测':'ce','试':'shi','转':'zhuan','换':'huan',
  '生':'sheng','成':'cheng','器':'qi','时':'shi','加':'jia','密':'mi',
  '字':'zi','符':'fu','串':'chuan','文':'wen','本':'ben','数':'shu',
  '据':'ju','类':'lei','型':'xing','转':'zhuan','处':'chu','理':'li',
  '工':'gong','具':'ju','箱':'xiang','效':'xiao','率':'lv','快':'kuai',
  '速':'su','搜':'sou','索':'suo','粘':'zhan','贴':'tie','图':'tu',
  '片':'pian','文':'wen','件':'jian','复':'fu','制':'zhi','清':'qing',
  '空':'kong','删':'shan','除':'chu','添':'tian','加':'jia','编':'bian',
  '辑':'ji','保':'bao','存':'cun','取':'qu','消':'xiao','确':'que',
  '认':'ren','返':'fan','回':'hui','上':'shang','下':'xia','左':'zuo',
  '右':'you','中':'zhong','大':'da','小':'xiao','自':'zi','动':'dong',
  '手':'shou','显':'xian','示':'shi','隐':'yin','藏':'cang','启':'qi',
  '停':'ting','开':'kai','关':'guan','设':'she','置':'zhi','配':'pei',
  '选':'xuan','择':'ze','查':'cha','找':'zhao','替':'ti','批':'pi',
  '量':'liang','全':'quan','部':'bu','分':'fen','预':'yu','览':'lan',
  '导':'dao','入':'ru','出':'chu','生':'sheng','源':'yuan','目':'mu',
  '标':'biao','参':'can','默':'mo','认':'ren','值':'zhi','范':'fan',
  '围':'wei','长':'chang','短':'duan','高':'gao','低':'di','宽':'kuan',
  '窄':'zhai','新':'xin','旧':'jiu','原':'yuan','始':'shi','结':'jie',
  '果':'guo','错':'cuo','误':'wu','警':'jing','告':'gao','提':'ti',
  '示':'shi','帮':'bang','助':'zhu','信':'xin','息':'xi','详':'xiang',
  '情':'qing','名':'ming','称':'cheng','描':'miao','述':'shu','版':'ban',
  '本':'ben','状':'zhuang','态':'tai','属':'shu','性':'xing','方':'fang',
  '法':'fa','接':'jie','口':'kou','调':'diao','用':'yong','返':'fan',
  '回':'hui','参':'can','数':'shu','组':'zu','对':'dui','象':'xiang',
  '函':'han','定':'ding','义':'yi','声':'sheng','明':'ming','调':'tiao',
  '整':'zheng','优':'you','化':'hua','性':'xing','能':'neng','安':'an',
  '全':'quan','网':'wang','络':'luo','链':'lian','接':'jie','页':'ye',
  '面':'mian','按':'an','钮':'niu','输':'shu','入':'ru','框':'kuang',
  '标':'biao','签':'qian','菜':'cai','单':'dan','滚':'gun','动':'dong',
  '加':'jia','载':'zai','刷':'shua','新':'xin','发':'fa','送':'song',
  '接':'jie','收':'shou','请':'qing','求':'qiu','响':'xiang','应':'ying',
  '头':'tou','体':'ti','状':'zhuang','码':'ma','超':'chao','时':'shi',
  '重':'chong','向':'xiang','代':'dai','理':'li','缓':'huan','存':'cun',
  '压':'ya','缩':'suo','解':'jie','压':'ya','格':'ge','式':'shi',
  '编':'bian','解':'jie','转':'zhuan','码':'ma','签':'qian','名':'ming',
  '验':'yan','证':'zheng','登':'deng','录':'lu','注':'zhu','册':'ce',
  '退':'tui','权':'quan','限':'xian','角':'jiao','色':'se','用':'yong',
  '户':'hu','密':'mi','令':'ling','钥':'yao','牌':'pai','证':'zheng',
  '书':'shu','签':'qian','章':'zhang','效':'xiao','过':'guo','期':'qi',
  '失':'shi','败':'bai','成':'cheng','功':'gong','等':'deng','待':'dai',
  '进':'jin','行':'xing','完':'wan','毕':'bi','就':'jiu','绪':'xu',
};

export function computePinyin(text) {
  const fullParts = [];
  const initParts = [];
  for (const ch of text) {
    const py = dict[ch];
    if (py) {
      fullParts.push(py);
      initParts.push(py[0]);
    } else {
      const lower = ch.toLowerCase();
      fullParts.push(lower);
      if (/[a-z]/.test(lower)) initParts.push(lower);
    }
  }
  return { full: fullParts.join(''), initials: initParts.join('') };
}

export function matchPinyin(chineseText, query) {
  const { full, initials } = computePinyin(chineseText);
  const q = query.toLowerCase();
  if (!q) return false;
  if (full.includes(q) || initials.includes(q)) return true;
  for (const ch of chineseText) {
    const py = dict[ch];
    if (py && py.startsWith(q)) return true;
  }
  return false;
}
