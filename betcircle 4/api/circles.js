// api/circles.js
import {
  cors, handleOptions, authMiddleware,
  getCircle, saveCircle, getCircleBets, saveCircleBets,
  getUserCircleIds, addUserToCircle, removeUserFromCircle,
  getCircleByInviteCode, setInviteCode,
  getUser, updateUser, addUserHistory, getUserHistory,
  publicUser, uid, inviteCode
} from '../lib/db.js';

const LEVELS = [
  {lvl:1,name:'Rookie',xp:0},
  {lvl:2,name:'Hustler',xp:100},
  {lvl:3,name:'Sharpie',xp:250},
  {lvl:4,name:'Bookie',xp:500},
  {lvl:5,name:'High Roller',xp:1000},
  {lvl:6,name:'The House',xp:2000},
];

async function addXP(userId, amount, coins = 0) {
  const user = await getUser(userId);
  if (!user) return;
  const prevLevel = user.level;
  const newXP = (user.xp || 0) + amount;
  const newCoins = (user.coins || 0) + coins;
  const lvl = [...LEVELS].reverse().find(l => newXP >= l.xp) || LEVELS[0];
  await updateUser(userId, { xp: newXP, level: lvl.lvl, coins: newCoins });
  return { leveledUp: lvl.lvl > prevLevel, newLevel: lvl.lvl, levelName: lvl.name };
}

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;

  const session = authMiddleware(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.id;

  const { action, circleId, betId } = req.query;

  // ── GET /api/circles?action=list ─────────────────────────────────────────────
  if (action === 'list' && req.method === 'GET') {
    const ids = await getUserCircleIds(userId);
    const circles = await Promise.all(ids.map(id => getCircle(id)));
    const valid = circles.filter(Boolean);
    // Attach bets count + open bets pool
    const enriched = await Promise.all(valid.map(async c => {
      const bets = await getCircleBets(c.id);
      const open = bets.filter(b => b.status === 'open');
      return { ...c, betCount: bets.length, openBets: open.length, pool: open.reduce((a, b) => a + b.totalPool, 0) };
    }));
    return res.status(200).json({ circles: enriched });
  }

  // ── POST /api/circles?action=create ──────────────────────────────────────────
  if (action === 'create' && req.method === 'POST') {
    const { name, emoji } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Circle name required' });
    const user = await getUser(userId);
    const code = inviteCode();
    const circle = {
      id: uid(),
      name: name.trim(),
      emoji: emoji || '🎯',
      ownerId: userId,
      members: [{ userId, displayName: user.displayName, color: user.color }],
      inviteCode: code,
      balances: {},
      createdAt: Date.now(),
    };
    await saveCircle(circle);
    await setInviteCode(code, circle.id);
    await addUserToCircle(userId, circle.id);
    await addXP(userId, 30, 10);
    return res.status(201).json({ circle });
  }

  // ── GET /api/circles?action=get&circleId=xxx ─────────────────────────────────
  if (action === 'get' && req.method === 'GET') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (!circle.members.find(m => m.userId === userId))
      return res.status(403).json({ error: 'Not a member' });
    const bets = await getCircleBets(circleId);
    return res.status(200).json({ circle, bets });
  }

  // ── POST /api/circles?action=join ─────────────────────────────────────────────
  if (action === 'join' && req.method === 'POST') {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Invite code required' });
    const circle = await getCircleByInviteCode(code);
    if (!circle) return res.status(404).json({ error: 'Invalid invite code' });
    if (circle.members.find(m => m.userId === userId))
      return res.status(400).json({ error: 'Already a member' });
    const user = await getUser(userId);
    circle.members.push({ userId, displayName: user.displayName, color: user.color });
    await saveCircle(circle);
    await addUserToCircle(userId, circle.id);
    return res.status(200).json({ circle });
  }

  // ── DELETE /api/circles?action=leave&circleId=xxx ─────────────────────────────
  if (action === 'leave' && req.method === 'DELETE') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (circle.ownerId === userId) return res.status(400).json({ error: 'Owner cannot leave — transfer ownership or delete the circle' });
    circle.members = circle.members.filter(m => m.userId !== userId);
    await saveCircle(circle);
    await removeUserFromCircle(userId, circleId);
    return res.status(200).json({ ok: true });
  }

  // ── GET /api/circles?action=bets&circleId=xxx ─────────────────────────────────
  if (action === 'bets' && req.method === 'GET') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (!circle.members.find(m => m.userId === userId))
      return res.status(403).json({ error: 'Not a member' });
    const bets = await getCircleBets(circleId);
    return res.status(200).json({ bets });
  }

  // ── POST /api/circles?action=addbet&circleId=xxx ──────────────────────────────
  if (action === 'addbet' && req.method === 'POST') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (!circle.members.find(m => m.userId === userId))
      return res.status(403).json({ error: 'Not a member' });
    const { desc, type, participants, dueDate } = req.body;
    if (!desc || !participants || participants.length < 1)
      return res.status(400).json({ error: 'Bet description and at least one participant required' });
    const totalPool = participants.reduce((a, p) => a + (p.stake || 0), 0);
    const bet = { id: uid(), desc, type: type || 'pool', participants, totalPool, dueDate: dueDate || '', status: 'open', createdBy: userId, createdAt: Date.now() };
    const bets = await getCircleBets(circleId);
    bets.push(bet);
    await saveCircleBets(circleId, bets);
    await addXP(userId, 20, 5);
    return res.status(201).json({ bet });
  }

  // ── POST /api/circles?action=settle&circleId=xxx&betId=xxx ───────────────────
  if (action === 'settle' && req.method === 'POST') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (!circle.members.find(m => m.userId === userId))
      return res.status(403).json({ error: 'Not a member' });
    const { winner } = req.body; // winner = { userId, displayName }
    if (!winner) return res.status(400).json({ error: 'Winner required' });
    const bets = await getCircleBets(circleId);
    const bet = bets.find(b => b.id === betId);
    if (!bet) return res.status(404).json({ error: 'Bet not found' });
    if (bet.status === 'settled') return res.status(400).json({ error: 'Already settled' });

    const payouts = bet.participants.map(p => {
      const delta = p.userId === winner.userId ? bet.totalPool - p.stake : -p.stake;
      return { ...p, delta };
    });
    bet.status = 'settled';
    bet.winner = winner;
    bet.payouts = payouts;
    bet.settledAt = Date.now();

    // Update circle balances
    if (!circle.balances) circle.balances = {};
    payouts.forEach(p => {
      circle.balances[p.userId] = (circle.balances[p.userId] || 0) + p.delta;
    });
    await saveCircleBets(circleId, bets);
    await saveCircle(circle);

    // Update each participant's profile stats + history
    await Promise.all(payouts.map(async p => {
      const u = await getUser(p.userId);
      if (!u) return;
      const isWinner = p.userId === winner.userId;
      const patch = {};
      if (isWinner) { patch.totalWon = (u.totalWon || 0) + p.delta; patch.streak = (u.streak || 0) + 1; }
      else { patch.totalLost = (u.totalLost || 0) + Math.abs(p.delta); patch.streak = 0; }
      await updateUser(p.userId, patch);
      await addUserHistory(p.userId, {
        id: uid(), desc: bet.desc, winner: winner.displayName,
        type: isWinner ? 'win' : 'loss', delta: p.delta,
        pool: bet.totalPool, when: Date.now(), circleId, betId,
      });
      await addXP(p.userId, isWinner ? 50 : 10, isWinner ? 20 : 0);
    }));

    return res.status(200).json({ bet, circle });
  }

  // ── DELETE /api/circles?action=deletebet&circleId=xxx&betId=xxx ──────────────
  if (action === 'deletebet' && req.method === 'DELETE') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (!circle.members.find(m => m.userId === userId))
      return res.status(403).json({ error: 'Not a member' });
    const bets = await getCircleBets(circleId);
    const bet = bets.find(b => b.id === betId);
    if (!bet) return res.status(404).json({ error: 'Bet not found' });
    if (bet.status === 'settled') return res.status(400).json({ error: 'Cannot delete settled bets' });
    await saveCircleBets(circleId, bets.filter(b => b.id !== betId));
    return res.status(200).json({ ok: true });
  }

  // ── PATCH /api/circles?action=update&circleId=xxx ─────────────────────────────
  if (action === 'update' && req.method === 'PATCH') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (circle.ownerId !== userId) return res.status(403).json({ error: 'Only the owner can update' });
    const { name, emoji } = req.body;
    if (name) circle.name = name.trim();
    if (emoji) circle.emoji = emoji;
    await saveCircle(circle);
    return res.status(200).json({ circle });
  }

  // ── POST /api/circles?action=refreshcode&circleId=xxx ────────────────────────
  if (action === 'refreshcode' && req.method === 'POST') {
    const circle = await getCircle(circleId);
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    if (circle.ownerId !== userId) return res.status(403).json({ error: 'Only the owner can refresh the invite code' });
    const newCode = inviteCode();
    circle.inviteCode = newCode;
    await saveCircle(circle);
    await setInviteCode(newCode, circle.id);
    return res.status(200).json({ inviteCode: newCode });
  }

  return res.status(404).json({ error: 'Not found' });
}
