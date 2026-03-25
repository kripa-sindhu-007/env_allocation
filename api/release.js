const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { envId, user } = req.body;
  if (!envId || !user) {
    return res.status(400).json({ error: 'envId and user are required' });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('environments')
    .update({ status: 'free', owner: null, note: null, updated_at: now })
    .eq('id', envId)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Environment not found' });
  }

  await supabase.from('history').insert({
    env_id: envId,
    action: 'release',
    user_name: user,
    created_at: now
  });

  res.json(data);
});
