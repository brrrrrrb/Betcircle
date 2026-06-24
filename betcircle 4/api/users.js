// api/users.js
import {
  cors, handleOptions, authMiddleware,
  getUser, getUserByUsername, getUserByEmail,
  getFriendIds, getFriendRequests, saveFriendRequests, addFriend, removeFriend,
  getUserHistory, publicUser, uid
} from '../lib/db.js';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;

  const session = authMiddleware(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.id;

  const { action, targetId } = req.query;

  // ── GET /api/users?action=search&q=xxx ───────────────────────────────────────
  if (action === 'search' && req.method === 'GET') {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.status(200).json({ users: [] });
    // Try exact username match first, then email
    const byUsername = await getUserByUsername(q);
    const byEmail = await getUserByEmail(q);
    const found = new Map();
    if (byUsername && byUsername.id !== userId) found.set(byUsername.id, byUsername);
    if (byEmail && byEmail.id !== userId) found.set(byEmail.id, byEmail);
    const [myFriendIds, myReqs] = await Promise.all([getFriendIds(userId), getFriendRequests(userId)]);
    const inboundReqs = await getFriendRequests(userId);
    return res.status(200).json({
      users: [...found.values()].map(u => ({
        ...publicUser(u),
        isFriend: myFriendIds.includes(u.id),
        requestSent: myReqs.some(r => r.to === u.id && r.from === userId),
        requestReceived: inboundReqs.some(r => r.from === u.id),
      }))
    });
  }

  // ── GET /api/users?action=me ──────────────────────────────────────────────────
  if (action === 'me' && req.method === 'GET') {
    const user = await getUser(userId);
    const history = await getUserHistory(userId);
    return res.status(200).json({ user: publicUser(user), history });
  }

  // ── GET /api/users?action=friends ─────────────────────────────────────────────
  if (action === 'friends' && req.method === 'GET') {
    const ids = await getFriendIds(userId);
    const users = await Promise.all(ids.map(id => getUser(id)));
    return res.status(200).json({ friends: users.filter(Boolean).map(publicUser) });
  }

  // ── GET /api/users?action=friendrequests ──────────────────────────────────────
  if (action === 'friendrequests' && req.method === 'GET') {
    const reqs = await getFriendRequests(userId);
    const inbound = reqs.filter(r => r.to === userId);
    const withUsers = await Promise.all(inbound.map(async r => {
      const from = await getUser(r.from);
      return { ...r, fromUser: publicUser(from) };
    }));
    return res.status(200).json({ requests: withUsers });
  }

  // ── POST /api/users?action=friendrequest&targetId=xxx ─────────────────────────
  if (action === 'friendrequest' && req.method === 'POST') {
    if (!targetId) return res.status(400).json({ error: 'Target user required' });
    if (targetId === userId) return res.status(400).json({ error: 'Cannot friend yourself' });
    const [myFriendIds, theirReqs] = await Promise.all([getFriendIds(userId), getFriendRequests(targetId)]);
    if (myFriendIds.includes(targetId)) return res.status(400).json({ error: 'Already friends' });
    if (theirReqs.some(r => r.from === userId)) return res.status(400).json({ error: 'Request already sent' });
    theirReqs.push({ from: userId, to: targetId, createdAt: Date.now() });
    await saveFriendRequests(targetId, theirReqs);
    return res.status(200).json({ ok: true });
  }

  // ── POST /api/users?action=acceptfriend&targetId=xxx ─────────────────────────
  if (action === 'acceptfriend' && req.method === 'POST') {
    const reqs = await getFriendRequests(userId);
    const req2 = reqs.find(r => r.from === targetId && r.to === userId);
    if (!req2) return res.status(404).json({ error: 'No friend request from that user' });
    await saveFriendRequests(userId, reqs.filter(r => r !== req2));
    await addFriend(userId, targetId);
    return res.status(200).json({ ok: true });
  }

  // ── POST /api/users?action=declinefriend&targetId=xxx ────────────────────────
  if (action === 'declinefriend' && req.method === 'POST') {
    const reqs = await getFriendRequests(userId);
    await saveFriendRequests(userId, reqs.filter(r => !(r.from === targetId && r.to === userId)));
    return res.status(200).json({ ok: true });
  }

  // ── DELETE /api/users?action=unfriend&targetId=xxx ────────────────────────────
  if (action === 'unfriend' && req.method === 'DELETE') {
    await removeFriend(userId, targetId);
    return res.status(200).json({ ok: true });
  }

  // ── GET /api/users?action=profile&targetId=xxx ─────────────────────────────────
  if (action === 'profile' && req.method === 'GET') {
    const u = await getUser(targetId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const friendIds = await getFriendIds(userId);
    return res.status(200).json({
      user: publicUser(u),
      isFriend: friendIds.includes(targetId),
    });
  }

  return res.status(404).json({ error: 'Not found' });
}
