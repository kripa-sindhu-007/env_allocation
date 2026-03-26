const supabase = require('./supabase');

const HISTORY_LIMIT = 20;

module.exports = async function purgeHistory(envId) {
  const { data: toKeep } = await supabase
    .from('history')
    .select('id')
    .eq('env_id', envId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (toKeep && toKeep.length >= HISTORY_LIMIT) {
    const keepIds = toKeep.map((r) => r.id);
    await supabase
      .from('history')
      .delete()
      .eq('env_id', envId)
      .not('id', 'in', `(${keepIds.join(',')})`);
  }
};
