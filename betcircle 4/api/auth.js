// api/auth.js
import bcrypt from 'bcryptjs';
import {
  cors, handleOptions, authMiddleware, signToken,
  getUserByEmail, getUserByUsername, saveUser, updateUser, getUser,
  uid, publicUser
} from '../lib/db.js';

const COLORS = ['#7c6af7','#1D9E75','#D85A30','#378ADD','#D4537E','#BA7517','#3dd68c','#a855f7','#0891b2','#E24B4A'];

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;

  const { action } = req.query;

  // ── POST /api/auth?action=register ──────────────────────────────────────────
  if (action === 'register' && req.method === 'POST') {
    const { email, username, displayName, password } = req.body;
    if (!email || !username || !displayName || !password)
      return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: 'Username: 3–20 chars, letters/numbers/underscores only' });

    const [existingEmail, existingUsername] = await Promise.all([
      getUserByEmail(email),
      getUserByUsername(username),
    ]);
    if (existingEmail) return res.status(400).json({ error: 'Email already in use' });
    if (existingUsername) return res.status(400).json({ error: 'Username taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: uid(),
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      displayName,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      passwordHash,
      xp: 0, level: 1, coins: 50,
      streak: 0, totalWon: 0, totalLost: 0,
      createdAt: Date.now(),
    };
    await saveUser(user);
    const token = signToken({ id: user.id, email: user.email });
    return res.status(201).json({ token, user: publicUser(user) });
  }

  // ── POST /api/auth?action=login ─────────────────────────────────────────────
  if (action === 'login' && req.method === 'POST') {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken({ id: user.id, email: user.email });
    return res.status(200).json({ token, user: publicUser(user) });
  }

  // ── GET /api/auth?action=me ─────────────────────────────────────────────────
  if (action === 'me' && req.method === 'GET') {
    const session = authMiddleware(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const user = await getUser(session.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ user: publicUser(user) });
  }

  // ── PATCH /api/auth?action=profile ──────────────────────────────────────────
  if (action === 'profile' && req.method === 'PATCH') {
    const session = authMiddleware(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const { displayName, color } = req.body;
    const patch = {};
    if (displayName && displayName.trim()) patch.displayName = displayName.trim();
    if (color) patch.color = color;
    const updated = await updateUser(session.id, patch);
    return res.status(200).json({ user: publicUser(updated) });
  }

  return res.status(404).json({ error: 'Not found' });
}
