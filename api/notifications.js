const supabase = require('./_lib/supabase');
const cors = require('./_lib/cors');

module.exports = cors(async (req, res) => {
  // GET: fetch unread notifications for a user
  if (req.method === 'GET') {
    const { user } = req.query;
    if (!user) {
      return res.status(400).json({ error: 'user query param is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('to_user', user)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
    return res.json(data);
  }

  // POST: mark notifications as read
  if (req.method === 'POST') {
    const { notificationIds } = req.body;
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'notificationIds array is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', notificationIds)
      .select();

    if (error) {
      return res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
    return res.json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
