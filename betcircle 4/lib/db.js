// lib/db.js — Upstash Redis wrappers + shared utilities

import { Redis } from '@upstash/redis';
import jwt from 'jsonwebtoken';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const JWT_SECRET = process.env.JWT_SECRET || 'betcircle-dev-secret-change-in-prod';

// ── CORS helper ─────────────────────────────────────────────────────────────
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.status(200).end(); return true; }
  return false;
}

// ── JWT ─────────────────────────────────────────────────────────────────────
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

export function authMiddleware(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

// ── ID helpers ───────────────────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const inviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ── KV wrappers (Upstash Redis) ──────────────────────────────────────────────
const kv = {
  get: (key) => redis.get(key),
  set: (key, value) => redis.set(key, value),
  del: (key) => redis.del(key),
};

// ── User ops ─────────────────────────────────────────────────────────────────
export async function getUser(id) {
  return kv.get(`user:${id}`);
}

export async function getUserByEmail(email) {
  const id = await kv.get(`email:${email.toLowerCase()}`);
  if (!id) return null;
  return getUser(id);
}

export async function getUserByUsername(username) {
  const id = await kv.get(`username:${username.toLowerCase()}`);
  if (!id) return null;
  return getUser(id);
}

export async function saveUser(user) {
  await kv.set(`user:${user.id}`, user);
  await kv.set(`email:${user.email.toLowerCase()}`, user.id);
  await kv.set(`username:${user.username.toLowerCase()}`, user.id);
}

export async function updateUser(id, patch) {
  const user = await getUser(id);
  if (!user) return null;
  const updated = { ...user, ...patch };
  await kv.set(`user:${id}`, updated);
  return updated;
}

// ── Circle ops ───────────────────────────────────────────────────────────────
export async function getCircle(id) {
  return kv.get(`circle:${id}`);
}

export async function saveCircle(circle) {
  await kv.set(`circle:${circle.id}`, circle);
}

export async function getCircleBets(circleId) {
  return (await kv.get(`circle:${circleId}:bets`)) || [];
}

export async function saveCircleBets(circleId, bets) {
  await kv.set(`circle:${circleId}:bets`, bets);
}

export async function getUserCircleIds(userId) {
  return (await kv.get(`user:${userId}:circles`)) || [];
}

export async function addUserToCircle(userId, circleId) {
  const ids = await getUserCircleIds(userId);
  if (!ids.includes(circleId)) {
    await kv.set(`user:${userId}:circles`, [...ids, circleId]);
  }
}

export async function removeUserFromCircle(userId, circleId) {
  const ids = await getUserCircleIds(userId);
  await kv.set(`user:${userId}:circles`, ids.filter(id => id !== circleId));
}

export async function getCircleByInviteCode(code) {
  const id = await kv.get(`invite:${code.toUpperCase()}`);
  if (!id) return null;
  return getCircle(id);
}

export async function setInviteCode(code, circleId) {
  await kv.set(`invite:${code.toUpperCase()}`, circleId);
}

// ── Friends ops ───────────────────────────────────────────────────────────────
export async function getFriendIds(userId) {
  return (await kv.get(`user:${userId}:friends`)) || [];
}

export async function getFriendRequests(userId) {
  return (await kv.get(`user:${userId}:friendReqs`)) || [];
}

export async function saveFriendRequests(userId, reqs) {
  await kv.set(`user:${userId}:friendReqs`, reqs);
}

export async function addFriend(userId, friendId) {
  const [uFriends, fFriends] = await Promise.all([getFriendIds(userId), getFriendIds(friendId)]);
  if (!uFriends.includes(friendId)) await kv.set(`user:${userId}:friends`, [...uFriends, friendId]);
  if (!fFriends.includes(userId)) await kv.set(`user:${friendId}:friends`, [...fFriends, userId]);
}

export async function removeFriend(userId, friendId) {
  const [uFriends, fFriends] = await Promise.all([getFriendIds(userId), getFriendIds(friendId)]);
  await kv.set(`user:${userId}:friends`, uFriends.filter(id => id !== friendId));
  await kv.set(`user:${friendId}:friends`, fFriends.filter(id => id !== userId));
}

// ── History ops ───────────────────────────────────────────────────────────────
export async function getUserHistory(userId) {
  return (await kv.get(`user:${userId}:history`)) || [];
}

export async function addUserHistory(userId, entry) {
  const hist = await getUserHistory(userId);
  await kv.set(`user:${userId}:history`, [...hist, entry]);
}

// ── Safe public user shape ────────────────────────────────────────────────────
export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}
