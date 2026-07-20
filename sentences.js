(function () {
  const levels = ['A2', 'B1', 'B2'];
  const custom = window.MY_SENTENCES || {};

  window.SENTENCES = levels.flatMap(level =>
    (custom[level] || []).map((item, index) => ({
      id: item.id || `${level}-${String(index + 1).padStart(3, '0')}`,
      level,
      zh: item.zh || '',
      nl: item.nl || '',
      topic: item.topic || '未分类',
      source: item.source || '自建句库'
    }))
  ).filter(item => item.zh && item.nl);
})();
