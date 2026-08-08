// phntm-supabase.js — cloud sync + auth for PHNTM.
// Backs the app's existing localStorage keys with a single Supabase key-value table
// (one row per user per key), so data is identical on any device you sign in from.
// Loads the Supabase client from a CDN as an ES module; if that fails, the app keeps
// working from localStorage (offline mode) and simply doesn't sync.
(function () {
  var SUPABASE_URL = 'https://gpprkhckltrcqjdnhpbl.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_mBsR_F44Nsf7SZ6bT1PAFA_2fqUaabx';

  var _client = null;
  var _readyP = (async function () {
    try {
      // Pinned deliberately: a floating "@2" has shipped breaking patches before
      // (e.g. 2.84.0), and auth breaking silently would lock every user out.
      var mod = await import('https://esm.sh/@supabase/supabase-js@2.110.8');
      _client = mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'phntm-sb-auth' }
      });
      return _client;
    } catch (e) {
      console.warn('[PHNTM] Supabase client unavailable — running offline (localStorage only).', e);
      return null;
    }
  })();

  async function ready() { return _readyP; }

  // getSession() reads the session Supabase persisted locally (refreshing the token
  // if needed). getUser() hits the network, so a slow or flaky connection made it
  // answer "signed out" for a signed-in user — which bounced the dashboard back to
  // the login page mid-login.
  async function currentSession() {
    var c = await ready(); if (!c) return null;
    try { var r = await c.auth.getSession(); return (r && r.data && r.data.session) || null; }
    catch (e) { return null; }
  }

  async function currentUser() {
    var s = await currentSession();
    return (s && s.user) || null;
  }

  // Right after sign-in (or a fresh page load) the client may still be restoring the
  // session from storage. Give it a moment before concluding nobody is signed in.
  async function sessionReady(ms) {
    var deadline = Date.now() + (ms || 1800);
    var s = await currentSession();
    while (!s && Date.now() < deadline) {
      await new Promise(function (r) { setTimeout(r, 150); });
      s = await currentSession();
    }
    return s;
  }

  var auth = {
    ready: ready,
    currentUser: currentUser,
    currentSession: currentSession,
    sessionReady: sessionReady,
    async signIn(email, password) {
      var c = await ready(); if (!c) throw new Error('Auth unavailable.');
      var r = await c.auth.signInWithPassword({ email: email, password: password });
      if (r.error) throw r.error;
      return r.data;
    },
    async signUp(email, password, name) {
      var c = await ready(); if (!c) throw new Error('Auth unavailable.');
      var r = await c.auth.signUp({ email: email, password: password, options: { data: { name: name || '' } } });
      if (r.error) throw r.error;
      try { if (r.data && r.data.session) await cloud.set('phntm-name', name || ''); } catch (e) {}
      return r.data; // r.data.session is null when email confirmation is required
    },
    // Google / Apple. The provider must be enabled in Supabase → Authentication →
    // Providers; if it isn't, Supabase returns a clear error we surface to the user.
    async signInWithProvider(provider) {
      var c = await ready(); if (!c) throw new Error('Auth unavailable.');
      var base = location.href.split('#')[0].split('?')[0];
      var redirect = base.replace(/[^/]*$/, 'PHNTM%20Dashboard.dc.html');
      var r = await c.auth.signInWithOAuth({ provider: provider, options: { redirectTo: redirect } });
      if (r.error) throw r.error;
      return r.data;
    },
    async resetPassword(email) {
      var c = await ready(); if (!c) throw new Error('Auth unavailable.');
      var r = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (r.error) throw r.error;
      return true;
    },
    async signOut() { var c = await ready(); if (c) { try { await c.auth.signOut(); } catch (e) {} } }
  };

  var cloud = {
    ready: ready,
    currentUser: currentUser,
    sessionReady: sessionReady,
    // value may be a JSON string (as passed to localStorage.setItem) or a raw value.
    async set(key, value) {
      var c = await ready(); if (!c) return false;
      var u = await currentUser(); if (!u) return false;
      var v = value;
      if (typeof value === 'string') { try { v = JSON.parse(value); } catch (e) { v = value; } }
      var r = await c.from('kv').upsert(
        { user_id: u.id, k: key, v: v, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,k' }
      );
      if (r.error) console.warn('[PHNTM] cloud save failed for ' + key, r.error);
      return !r.error;
    },
    // returns { key: value } for every stored key, or null when offline / signed out.
    async loadAll() {
      var c = await ready(); if (!c) return null;
      var u = await currentUser(); if (!u) return null;
      var r = await c.from('kv').select('k,v').eq('user_id', u.id);
      if (r.error) { console.warn('[PHNTM] cloud load failed', r.error); return null; }
      var out = {};
      (r.data || []).forEach(function (row) { out[row.k] = row.v; });
      return out;
    }
  };

  // ---- image storage -------------------------------------------------------
  // Note/trade images live in a public Storage bucket instead of being embedded
  // as base64 in the note row, so rows stay small and sync stays fast.
  var BUCKET = 'phntm-media';

  function dataUrlToBlob(u) {
    var parts = String(u).split(',');
    var mime = (/:(.*?);/.exec(parts[0]) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1] || ''), n = bin.length, arr = new Uint8Array(n);
    while (n--) arr[n] = bin.charCodeAt(n);
    return new Blob([arr], { type: mime });
  }

  var storage = {
    ready: ready,
    bucket: BUCKET,
    // data: a data: URL or a Blob/File. Returns a public URL, or null on failure.
    async upload(data, ext) {
      var c = await ready(); if (!c) return null;
      var u = await currentUser(); if (!u) return null;
      try {
        var blob = typeof data === 'string' ? dataUrlToBlob(data) : data;
        if (!blob || !blob.size) return null;
        var name = u.id + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'jpg');
        var r = await c.storage.from(BUCKET).upload(name, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (r.error) { console.warn('[PHNTM] image upload failed', r.error); return null; }
        var pub = c.storage.from(BUCKET).getPublicUrl(name);
        return (pub && pub.data && pub.data.publicUrl) || null;
      } catch (e) { console.warn('[PHNTM] image upload failed', e); return null; }
    },
    // Replaces every inline base64 image in an HTML string with an uploaded URL.
    async liftHtml(html) {
      var s = String(html || '');
      if (s.indexOf('data:image') < 0) return s;
      var seen = {}, matches = s.match(/data:image\/[a-z+]+;base64,[^"')\s]+/gi) || [];
      for (var i = 0; i < matches.length; i++) {
        var d = matches[i];
        if (seen[d]) continue;
        var url = await storage.upload(d, (/data:image\/(png|jpe?g|webp|gif)/i.exec(d) || [])[1] === 'png' ? 'png' : 'jpg');
        if (url) { seen[d] = url; s = s.split(d).join(url); }
      }
      return s;
    }
  };

  window.PHNTM = window.PHNTM || {};
  window.PHNTM.auth = auth;
  window.PHNTM.cloud = cloud;
  window.PHNTM.storage = storage;
})();
