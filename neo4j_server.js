require('dotenv').config();
const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();



app.use(express.json({ limit: '5mb' }));


// --- Neo4j driver
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASS)
);
const sRO = () => driver.session({ defaultAccessMode: neo4j.session.READ,  database: "neo4j" });
const sRW = () => driver.session({ defaultAccessMode: neo4j.session.WRITE, database: "neo4j" });

// Para desarrollo (acepta también file:// y cualquier origen HTTP local)
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false
}));
// Si quieres manejar explícitamente preflight en Express 5:
app.options(/.*/, cors());



// --- Helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

// --- Endpoint rápido para crear constraints mínimos (una vez)
app.post('/api/dev/setup', async (_req, res) => {
  const session = sRW();
  try {
    await session.run(`
      CREATE CONSTRAINT user_username_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.username IS UNIQUE;
      CREATE CONSTRAINT user_id_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.id IS UNIQUE;
    `);
    res.json({ ok: true });
  } catch (e) {
    console.error('setup error:', e);
    res.status(500).json({ message: 'Error creando constraints' });
  } finally {
    await session.close();
  }
});

// POST /api/auth/signup  (crea usuario normal, NO admin)
app.post('/api/auth/signup', async (req, res) => {
  const { username, password, fullName, birthDate, avatarBase64 } = req.body || {};
  if (!username || !password || !fullName || !birthDate) {
    return res.status(400).json({ message: 'Faltan campos requeridos' });
  }

  const salt = require('crypto').randomBytes(16).toString('hex');
  let passwordHash;
  try {
    passwordHash = await require('argon2').hash(password + salt);
  } catch (e) {
    console.error('hash error:', e);
    return res.status(500).json({ message: 'Error generando hash' });
  }

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE, database: 'neo4j' });
  try {
    const result = await session.run(`
      MERGE (u:User {username:$username})
      ON CREATE SET
        u.id           = randomUUID(),
        u.passwordHash = $passwordHash,
        u.salt         = $salt,
        u.fullName     = $fullName,
        u.birthDate    = date($birthDate),
        u.avatar       = coalesce($avatarBase64, ''),   // opcional: guarda base64
        u.role         = 'member',
        u.createdAt    = datetime()
      ON MATCH SET
        u.fullName     = coalesce($fullName, u.fullName),
        u.birthDate    = coalesce(date($birthDate), u.birthDate),
        u.avatar       = coalesce($avatarBase64, u.avatar)
      RETURN u { .id, .username, .fullName, .role } AS user
    `, { username, passwordHash, salt, fullName, birthDate, avatarBase64 });

    const user = result.records[0]?.get('user');
    if (!user) return res.status(500).json({ message: 'No se pudo crear usuario' });
    res.status(201).json({ message: 'Usuario creado', user });
  } catch (e) {
    if (String(e).includes('already exists')) {
      return res.status(409).json({ message: 'El username ya existe' });
    }
    console.error('signup error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// --- LOGIN (lo básico)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username y password son requeridos' });
  }

  const session = sRO();
  try {
    const result = await session.run(
      `
      MATCH (u:User {username:$username})
      RETURN u { .id, .username, .passwordHash, .salt } AS user
      LIMIT 1
      `,
      { username }
    );
    if (result.records.length === 0) {
      return res.status(401).json({ message: 'Usuario o contraseña inválidos' });
    }
    const user = result.records[0].get('user');

    if (!user?.passwordHash || !user?.salt) {
      return res.status(500).json({ message: 'Usuario sin credenciales válidas en BD' });
    }

    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, password + user.salt);
    } catch (e) {
      console.error('verify error:', e);
      return res.status(500).json({ message: 'Error verificando credenciales' });
    }
    if (!ok) return res.status(401).json({ message: 'Usuario o contraseña inválidos' });

    const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, username: user.username });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// --- (Opcional) quién soy
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const session = sRO();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id:$id})
      RETURN u { .id, .username, .email, .fullName, .createdAt, birthDate: toString(u.birthDate), .avatar, .role} AS user
      `,
      { id: req.user.sub }
    );
    res.json(result.records[0]?.get('user') || {});
  } catch (e) {
    console.error('me error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// BUSCAR
app.get('/api/users', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const session = sRO();
  try {
    const result = await session.run(
      `
      MATCH (u:User)
      WHERE u.id <> $me
        AND (
          $q = '' OR
          toLower(u.username) CONTAINS toLower($q) OR
          toLower(u.fullName)  CONTAINS toLower($q)
        )
      OPTIONAL MATCH (me:User {id:$me})-[:FOLLOWS]->(u)
      RETURN u { .id, .username, .fullName, .avatar, following: me IS NOT NULL } AS user
      ORDER BY coalesce(u.fullName, u.username)
      `,
      { me: req.user.sub, q }
    );
    const users = result.records.map(r => r.get('user'));
    res.json({ users });
  } catch (e) {
    console.error('users list error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// --- UPDATE MY ACCOUNT
app.put('/api/account', requireAuth, async (req, res) => {
  const { username, fullName, birthDate, avatarBase64 } = req.body || {};
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE, database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (u:User {id:$id})
      // Sólo setea lo que venga; si es null, conserva el valor
      SET
        u.username  = coalesce($username, u.username),
        u.fullName  = coalesce($fullName, u.fullName),
        u.birthDate = coalesce(date($birthDate), u.birthDate),
        u.avatar    = coalesce($avatarBase64, u.avatar)
      RETURN u { .id, .username, .fullName, birthDate: toString(u.birthDate), .avatar} AS user
      `,
      { id: req.user.sub, username, fullName, birthDate, avatarBase64 }
    );

    const user = result.records[0]?.get('user');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (e) {
    // Conflicto de username (constraint unique) u otros errores
    const msg = String(e);
    if (msg.includes('already exists') || msg.includes('is not unique')) {
      return res.status(409).json({ message: 'El username ya existe' });
    }
    console.error('update account error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// --- FOLLOW: crear relación me -> target
app.post('/api/follow', requireAuth, async (req, res) => {
  const { targetId } = req.body || {};
  if (!targetId) return res.status(400).json({ message: 'Falta targetId' });
  if (targetId === req.user.sub) return res.status(400).json({ message: 'No puedes seguirte a ti mism@' });

  const session = sRW();
  try {
    const result = await session.run(
      `
      MATCH (me:User {id:$me}), (u:User {id:$target})
      MERGE (me)-[r:FOLLOWS]->(u)
      ON CREATE SET r.createdAt = datetime()
      ON MATCH  SET r.createdAt = coalesce(r.createdAt, datetime())
      RETURN true AS ok
      `,
      { me: req.user.sub, target: targetId }
    );
    if (result.records.length === 0) return res.status(404).json({ message: 'Usuario objetivo no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('follow error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});

// --- FOLLOW status: ¿ya sigo a :id?
app.get('/api/follow/:id', requireAuth, async (req, res) => {
  const targetId = req.params.id;
  const session = sRO();
  try {
    const result = await session.run(
      `
      MATCH (me:User {id:$me}), (u:User {id:$target})
      OPTIONAL MATCH (me)-[r:FOLLOWS]->(u)
      RETURN r IS NOT NULL AS following
      `,
      { me: req.user.sub, target: targetId }
    );
    const following = result.records[0]?.get('following') === true;
    res.json({ following });
  } catch (e) {
    console.error('follow status error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});

// --- (Opcional) Unfollow: borrar relación
app.delete('/api/follow/:id', requireAuth, async (req, res) => {
  const targetId = req.params.id;
  const session = sRW();
  try {
    await session.run(
      `
      MATCH (me:User {id:$me})-[r:FOLLOWS]->(u:User {id:$target})
      DELETE r
      `,
      { me: req.user.sub, target: targetId }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('unfollow error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});





// Lista de seguidores: usuarios que SIGUEN a "me"
app.get('/api/followers', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const session = sRO();
  try {
    const result = await session.run(
      `
      MATCH (me:User {id:$me})
      MATCH (u:User)-[:FOLLOWS]->(me)
      WHERE $q = '' OR toLower(u.username) CONTAINS toLower($q)
                  OR toLower(u.fullName)  CONTAINS toLower($q)
      RETURN u { .id, .username, .fullName, .avatar } AS user
      ORDER BY coalesce(u.fullName, u.username)
      `,
      { me: req.user.sub, q }
    );
    const users = result.records.map(r => r.get('user'));
    res.json({ users });
  } catch (e) {
    console.error('followers error:', e);
    res.status(500).json({ message: 'Error de servidor' });
  } finally {
    await session.close();
  }
});



// --- Levantar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ API escuchando en http://localhost:${PORT}`);
});

// Cierre ordenado
process.on('SIGINT', async () => {
  try { await driver.close(); } catch {}
  process.exit(0);
});
