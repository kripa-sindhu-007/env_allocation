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

  // POST: register or restore user
  if (req.method === 'POST') {
    const { name, role, pin } = req.body;
    if (!name || !role || !pin) {
      return res.status(400).json({ error: 'name, role and pin are required' });
    }
    if (!['developer', 'qa'].includes(role)) {
      return res.status(400).json({ error: 'role must be "developer" or "qa"' });
    }
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    // Check if name already exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('name', name)
      .single();

    if (existing) {
      if (existing.pin !== pin) {
        return res.status(409).json({ error: 'Name already taken' });
      }
      return res.json({ ...existing, restored: true });
    }

    // New user — insert
    const { data, error } = await supabase
      .from('users')
      .insert({ name, role, pin })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ ...data, restored: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
