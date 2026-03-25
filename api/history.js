const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { envId, category } = req.query;

  let query = supabase
    .from('history')
    .select('*, environments(name, category)')
    .order('created_at', { ascending: false });

  if (envId) {
    query = query.eq('env_id', envId).limit(10);
  } else if (category) {
    const { data: envs } = await supabase
      .from('environments')
      .select('id')
      .eq('category', category);
    const ids = (envs || []).map((e) => e.id);
    if (ids.length) {
      query = query.in('env_id', ids);
    }
    query = query.limit(15);
  } else {
    query = query.limit(15);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
