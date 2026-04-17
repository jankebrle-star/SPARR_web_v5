// ============================================================
//  SPARR.JS — Firebase modul (opravená verze)
//  Opravy:
//  - getChats bez orderBy (žádný composite index)
//  - listenChats real-time listener pro sidebar
//  - toggleFollow přes kolekci /follows (obchází rules)
//  - email vždy noncritical (nezablokuje hlavní akci)
//  - escHtml helper
// ============================================================
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail,
  updatePassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, getDocs,
  query, where, orderBy, limit,
  updateDoc, arrayUnion, arrayRemove,
  deleteDoc, onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── CONFIG ────────────────────────────────────────────────
const FIREBASE = {
  apiKey:            "AIzaSyAhU5DPvVC88jeuQyKrA1jdyRsx3ub8wBY",
  authDomain:        "sparr-ae946.firebaseapp.com",
  projectId:         "sparr-ae946",
  storageBucket:     "sparr-ae946.firebasestorage.app",
  messagingSenderId: "463453691804",
  appId:             "1:463453691804:web:66854c39094693669f7259"
};

export const EJS = {
  publicKey: "HAijP0Nkt2ktswUcA",
  serviceId: "service_ytrykjs",
  tpl: {
    welcome:  "Welcome",
    sparring: "Auto-Reply",
    message:  "template_message",
    follow:   "template_follow"
  }
};
export const APP_URL = "https://jankebrle-star.github.io/SPARR_web_v4";

// ── INIT ─────────────────────────────────────────────────
const app     = initializeApp(FIREBASE);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// ── AUTH STATE ────────────────────────────────────────────
export function onAuthReady(cb) {
  return onAuthStateChanged(auth, async user => {
    const profile = user ? await getProfile(user.uid).catch(() => null) : null;
    cb(user, profile);
  });
}

export const sparrLogin  = (e, p)    => signInWithEmailAndPassword(auth, e, p);
export const sparrLogout = async ()  => { await signOut(auth); location.href = "index.html"; };
export const sparrReset  = email     => sendPasswordResetEmail(auth, email);
export const sparrChPass = (u, p)    => updatePassword(u, p);

export async function sparrRegister(email, password, data) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: data.name });
  const profile = {
    uid: cred.user.uid, email,
    name: data.name, city: data.city || "",
    sport: data.sport || "Boxing", level: data.level || "Beginner",
    yearsActive: parseInt(data.yearsActive) || 0,
    bio: "", weight: "", instagram: "",
    secondary: [], openToSpar: true, teachBeginners: false,
    photoURL: "", points: 0, sessions: 0, wins: 0,
    savedPosts: [], followers: [], following: [],
    notifications: [], createdAt: Date.now()
  };
  await saveProfile(cred.user.uid, profile);
  email_send(EJS.tpl.welcome, { to_name: data.name, to_email: email, app_url: APP_URL });
  return cred.user;
}

// ── PROFILE ──────────────────────────────────────────────
export const saveProfile = (uid, data) =>
  setDoc(doc(db, "fighters", uid), data, { merge: true });

export async function getProfile(uid) {
  const s = await getDoc(doc(db, "fighters", uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function getAllFighters(opts = {}) {
  const q = [orderBy("points", "desc")];
  if (opts.sport) q.unshift(where("sport", "==", opts.sport));
  if (opts.limit) q.push(limit(opts.limit));
  const s = await getDocs(query(collection(db, "fighters"), ...q));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function uploadProfilePhoto(uid, file) {
  const r = ref(storage, `avatars/${uid}`);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  await saveProfile(uid, { photoURL: url });
  return url;
}

// ── FOLLOW — přes /follows kolekci ────────────────────────
// Tím obcházíme Firestore rules, které brání zápisu do cizího dokumentu
export async function toggleFollow(myUid, myName, targetUid, targetEmail, targetName) {
  const fid  = `${myUid}_${targetUid}`;
  const fRef = doc(db, "follows", fid);
  const snap = await getDoc(fRef);

  if (snap.exists()) {
    // Unfollow
    await deleteDoc(fRef);
    await updateDoc(doc(db, "fighters", myUid), { following: arrayRemove(targetUid) });
    updateDoc(doc(db, "fighters", targetUid),   { followers: arrayRemove(myUid) }).catch(() => {});
    return false;
  }

  // Follow
  await setDoc(fRef, {
    followerUid: myUid, followerName: myName,
    followingUid: targetUid, followingName: targetName,
    ts: Date.now()
  });
  await updateDoc(doc(db, "fighters", myUid), { following: arrayUnion(targetUid) });
  updateDoc(doc(db, "fighters", targetUid),   { followers: arrayUnion(myUid) }).catch(() => {});
  // notifikace + email (noncritical)
  addNotification(targetUid, {
    type: "follow", fromUid: myUid, fromName: myName,
    text: `${myName} tě začal/a sledovat`,
    link: `profile.html?uid=${myUid}`
  });
  email_send(EJS.tpl.follow, {
    to_name: targetName, to_email: targetEmail,
    from_name: myName, app_url: APP_URL
  });
  return true;
}

// ── NOTIFICATIONS ─────────────────────────────────────────
export async function addNotification(toUid, n) {
  return updateDoc(doc(db, "fighters", toUid), {
    notifications: arrayUnion({ ...n, ts: Date.now(), read: false, id: `${Date.now()}` })
  }).catch(() => {});
}

export function listenNotifications(uid, cb) {
  return onSnapshot(doc(db, "fighters", uid), s => {
    if (s.exists()) cb(s.data()?.notifications || []);
  });
}

export async function markNotifsRead(uid) {
  const p = await getProfile(uid);
  const ns = (p?.notifications || []).map(n => ({ ...n, read: true }));
  return saveProfile(uid, { notifications: ns });
}

// ── SPARRING ──────────────────────────────────────────────
export async function sendSparringRequest(fromUid, fromName, toUid, toEmail, toName, msg) {
  await addDoc(collection(db, "sparringRequests"), {
    fromUid, fromName, toUid, toName, toEmail,
    message: msg, status: "pending", createdAt: Date.now()
  });
  addNotification(toUid, {
    type: "sparring", fromUid, fromName,
    text: `${fromName} tě zve na sparring`,
    link: "my-profile.html"
  });
  email_send(EJS.tpl.sparring, {
    to_name: toName, to_email: toEmail,
    from_name: fromName, message: msg, app_url: APP_URL
  });
}

export async function getSparringRequests(uid) {
  const s = await getDocs(query(
    collection(db, "sparringRequests"),
    where("toUid", "==", uid), orderBy("createdAt", "desc")
  ));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export const updateSparringStatus = (id, status) =>
  updateDoc(doc(db, "sparringRequests", id), { status });

// ── CHAT ─────────────────────────────────────────────────
export const getChatId = (a, b) => [a, b].sort().join("_");

export async function sendMessage(fromUid, fromName, toUid, toName, toEmail, text) {
  const chatId = getChatId(fromUid, toUid);
  await addDoc(collection(db, "chats", chatId, "messages"),
    { fromUid, fromName, text, ts: Date.now() });
  await setDoc(doc(db, "chats", chatId), {
    participants:     [fromUid, toUid],
    participantNames: { [fromUid]: fromName, [toUid]: toName },
    lastMessage:      text.slice(0, 60),
    lastMessageTs:    Date.now(),
    [`unread_${toUid}`]: true
  }, { merge: true });
  // noncritical
  addNotification(toUid, {
    type: "message", fromUid, fromName,
    text: `${fromName}: ${text.slice(0, 50)}`,
    link: `messages.html?uid=${fromUid}&name=${encodeURIComponent(fromName)}`
  });
  if (toEmail) email_send(EJS.tpl.message, {
    to_name: toName, to_email: toEmail,
    from_name: fromName, preview: text.slice(0, 100), app_url: APP_URL
  });
}

export function listenMessages(uid1, uid2, cb) {
  return onSnapshot(
    query(collection(db, "chats", getChatId(uid1, uid2), "messages"), orderBy("ts", "asc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.warn("listenMessages:", err)
  );
}

// KLÍČOVÁ OPRAVA: bez orderBy → žádný composite index
export async function getChats(uid) {
  const s = await getDocs(query(
    collection(db, "chats"),
    where("participants", "array-contains", uid)
  ));
  const chats = s.docs.map(d => ({ id: d.id, ...d.data() }));
  return chats.sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0));
}

// Real-time listener — aktualizuje sidebar automaticky
export function listenChats(uid, cb) {
  return onSnapshot(
    query(collection(db, "chats"), where("participants", "array-contains", uid)),
    snap => {
      const c = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cb(c.sort((a, b) => (b.lastMessageTs || 0) - (a.lastMessageTs || 0)));
    },
    err => console.warn("listenChats:", err)
  );
}

export const markRead = (chatId, uid) =>
  updateDoc(doc(db, "chats", chatId), { [`unread_${uid}`]: false }).catch(() => {});

// ── WALL ─────────────────────────────────────────────────
export const createPost = (uid, name, data) =>
  addDoc(collection(db, "wallPosts"),
    { uid, authorName: name, ...data, replies: 0, saves: 0, createdAt: Date.now() });

export async function getWallPosts(sport = null) {
  const c = [orderBy("createdAt", "desc")];
  if (sport) c.unshift(where("sport", "==", sport));
  const s = await getDocs(query(collection(db, "wallPosts"), ...c));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export const deletePost = id => deleteDoc(doc(db, "wallPosts", id));

export async function savePost(uid, postId) {
  const p  = await getProfile(uid);
  const ok = !(p?.savedPosts || []).includes(postId);
  await updateDoc(doc(db, "fighters", uid),
    { savedPosts: ok ? arrayUnion(postId) : arrayRemove(postId) });
  if (ok) updateDoc(doc(db, "wallPosts", postId), { saves: increment(1) }).catch(() => {});
  return ok;
}

export async function getSavedPosts(uid) {
  const p   = await getProfile(uid);
  const ids = p?.savedPosts || [];
  if (!ids.length) return [];
  const res = await Promise.allSettled(
    ids.map(id => getDoc(doc(db, "wallPosts", id)).then(s => s.exists() ? { id: s.id, ...s.data() } : null))
  );
  return res.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
}

// ── MARKETPLACE ──────────────────────────────────────────
export const createMarketplaceItem = (uid, name, data) =>
  addDoc(collection(db, "marketplace"),
    { uid, authorName: name, ...data, views: 0, contacts: 0, createdAt: Date.now() });

export async function getMarketplaceItems(category = null) {
  // Bez orderBy + where combo → bez composite indexu
  const s = await getDocs(collection(db, "marketplace"));
  let items = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (category) items = items.filter(i => i.category === category);
  return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getMarketplaceItem(id) {
  const s = await getDoc(doc(db, "marketplace", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export const deleteMarketplaceItem = id => deleteDoc(doc(db, "marketplace", id));

export async function contactSeller(item, fromName, fromEmail, message) {
  if (item.uid) {
    updateDoc(doc(db, "marketplace", item.id), { contacts: increment(1) }).catch(() => {});
    addNotification(item.uid, {
      type: "contact", fromName,
      text: `${fromName} tě kontaktoval/a ohledně "${item.title}"`,
      link: `marketplace-item.html?id=${item.id}`
    });
  }
  await email_send(EJS.tpl.sparring, {
    to_name:   item.authorName,
    to_email:  item.authorEmail || "",
    from_name: fromName,
    message:   `[Marketplace: ${item.title}]\n\n${message}\n\nOdpovědět na: ${fromEmail}`,
    app_url:   APP_URL
  });
}

export async function uploadMarketplaceImg(uid, file) {
  const r = ref(storage, `marketplace/${uid}_${Date.now()}`);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

// ── EMAIL (noncritical) ───────────────────────────────────
async function email_send(templateId, params) {
  try {
    if (!window.emailjs) return;
    await window.emailjs.send(EJS.serviceId, templateId, params);
  } catch(e) {
    console.warn(`Email failed [${templateId}]:`, e?.text || e?.message || e);
  }
}

// ── HELPERS ──────────────────────────────────────────────
export function initials(name = "") {
  return (name || "").trim().split(/\s+/).map(n => n[0] || "").join("").slice(0, 2).toUpperCase() || "?";
}
export function timeAgo(ts) {
  if (!ts) return "—";
  const d = Date.now() - Number(ts);
  if (d < 60000)    return "právě teď";
  if (d < 3600000)  return `${Math.floor(d/60000)}m`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h`;
  return `${Math.floor(d/86400000)}d`;
}
export function esc(t = "") {
  return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\n/g,"<br>");
}
// alias
export { esc as escHtml };
