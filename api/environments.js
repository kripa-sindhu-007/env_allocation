const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category } = req.query;

  let query = supabase
    .from('environments')
    .select('*')
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
