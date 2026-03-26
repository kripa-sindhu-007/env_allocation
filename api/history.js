const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  // GET: fetch history
  if (req.method === 'GET') {
    const { envId, category, limit } = req.query;
    const fetchLimit = Math.min(parseInt(limit) || 20, 20);

    let query = supabase
      .from('history')
      .select('*, environments(name, category)')
      .order('created_at', { ascending: false });

    if (envId) {
      query = query.eq('env_id', envId).limit(fetchLimit);
    } else if (category) {
      const { data: envs } = await supabase
        .from('environments')
        .select('id')
        .eq('category', category);
      const ids = (envs || []).map((e) => e.id);
      if (ids.length) {
        query = query.in('env_id', ids);
      }
      query = query.limit(20);
    } else {
      query = query.limit(20);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST: purge old history entries for an env, keeping last N
  if (req.method === 'POST') {
    const { envId, keepLast } = req.body;
    if (!envId || !keepLast) {
      return res.status(400).json({ error: 'envId and keepLast are required' });
    }

    const { data: toKeep } = await supabase
      .from('history')
      .select('id')
      .eq('env_id', envId)
      .order('created_at', { ascending: false })
      .limit(keepLast);

    if (toKeep && toKeep.length >= keepLast) {
      const keepIds = toKeep.map((r) => r.id);
      await supabase
        .from('history')
        .delete()
        .eq('env_id', envId)
        .not('id', 'in', `(${keepIds.join(',')})`);
    }

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
