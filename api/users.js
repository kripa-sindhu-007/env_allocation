const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  // GET: list users, optionally filtered by role
  if (req.method === 'GET') {
    let query = supabase.from('users').select('*').order('name');

    const { role } = req.query;
    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    return res.json(data);
  }

  // POST: register a new user
  if (req.method === 'POST') {
    const { name, role } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: 'name and role are required' });
    }
    if (!['developer', 'qa'].includes(role)) {
      return res.status(400).json({ error: 'role must be "developer" or "qa"' });
    }

    // Upsert: if user already exists, update role
    const { data, error } = await supabase
      .from('users')
      .upsert({ name, role }, { onConflict: 'name' })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to register user' });
    }
    return res.json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
