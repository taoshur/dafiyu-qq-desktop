/**
 * Lightweight concept expansion for Chinese memory recall.
 * This is deliberately deterministic and local: it bridges common paraphrases
 * (e.g. 不开心 / 迷茫) without pretending to be a full embedding model.
 */
const CONCEPTS = {
  'emotion:negative': ['不开心', '难过', '伤心', '迷茫', '焦虑', '压力', '委屈', '烦', '痛苦', '失落', '孤独', 'emo'],
  'emotion:positive': ['开心', '高兴', '快乐', '幸福', '满足', '兴奋', '喜欢', '愉快'],
  study: ['学习', '读书', '考试', '努力', '成绩', '学校', '知识', '意义'],
  travel: ['旅游', '旅行', '出去玩', '景点', '出发', '旅游'],
  work: ['工作', '上班', '加班', '工资', '收入', '项目', '同事', '公司'],
  tech: ['系统', '代码', '修复', '报错', '重启', '进程', '服务', '记忆', '程序'],
  relationship: ['爸爸', '妈妈', '朋友', '关系', '陪伴', '家人', '一起'],
  memory: ['记忆', '回忆', '记得', '以前', '小时候', '过去', '曾经'],
  health: ['生病', '健康', '医院', '身体', '睡觉', '累', '休息']
};

export function conceptTokens(input) {
  const text = String(input || '').toLowerCase();
  if (!text) return [];
  const out = new Set();
  for (const [name, words] of Object.entries(CONCEPTS)) {
    if (words.some((word) => text.includes(word))) out.add(`concept:${name}`);
  }
  return [...out];
}

export { CONCEPTS };
