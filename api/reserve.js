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

  // Atomically update only if still free
  const { data, error } = await supabase
    .from('environments')
    .update({ status: 'in-use', owner: user, updated_at: now })
    .eq('id', envId)
    .eq('status', 'free')
    .select()
    .single();

  if (error || !data) {
    return res.status(409).json({ error: 'Environment is not available' });
  }

  // Record history
  await supabase.from('history').insert({
    env_id: envId,
    action: 'reserve',
    user_name: user,
    created_at: now
  });

  res.json(data);
});
