
// -------------------------------
// 1) Constraints / Índices de Usuario
// -------------------------------

// Unicidad
CREATE CONSTRAINT user_username_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.username IS UNIQUE;

CREATE CONSTRAINT user_email_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE;

// Existencia (campos mínimos para tu interfaz/API)
CREATE CONSTRAINT user_username_exists IF NOT EXISTS
FOR (u:User) REQUIRE (u.username) IS NOT NULL;

CREATE CONSTRAINT user_passwordHash_exists IF NOT EXISTS
FOR (u:User) REQUIRE (u.passwordHash) IS NOT NULL;

CREATE CONSTRAINT user_salt_exists IF NOT EXISTS
FOR (u:User) REQUIRE (u.salt) IS NOT NULL;

CREATE CONSTRAINT user_fullName_exists IF NOT EXISTS
FOR (u:User) REQUIRE (u.fullName) IS NOT NULL;

CREATE CONSTRAINT user_birthDate_exists IF NOT EXISTS
FOR (u:User) REQUIRE (u.birthDate) IS NOT NULL;

// Índices útiles
CREATE INDEX user_fullName_idx IF NOT EXISTS FOR (u:User) ON (u.fullName);
CREATE INDEX user_createdAt_idx IF NOT EXISTS FOR (u:User) ON (u.createdAt);

// Búsqueda de texto completo en la interfaz (buscar usuarios)
CREATE FULLTEXT INDEX user_search_fts IF NOT EXISTS
FOR (u:User) ON EACH [u.username, u.fullName, u.email];



// -------------------------------
// 3) Relación de seguidores (followers)
//    (u1)-[:FOLLOWS {createdAt}]->(u2)
// -------------------------------
CREATE CONSTRAINT follows_createdAt_exists IF NOT EXISTS
FOR ()-[f:FOLLOWS]-() REQUIRE (f.createdAt) IS NOT NULL;

MATCH ()-[r:FOLLOWS]->()
WHERE r.createdAt IS NULL
SET r.createdAt = datetime();

// Nota: Evitar duplicados se logra usando MERGE al crear la relación en tu API:
// MATCH (a:User {username:$follower}), (b:User {username:$followee})
// WHERE a <> b
// MERGE (a)-[r:FOLLOWS]->(b)
//   ON CREATE SET r.createdAt = datetime()
// RETURN a.username, b.username;

// -------------------------------
// 4) Seed del usuario Admin (parametrizado)
//    Rellena estos :param ANTES de ejecutar este bloque
// -------------------------------

:param admin_username => 'admin';
:param admin_email => 'admin@example.com';
:param admin_fullName => 'System Administrator';
:param admin_birthDate => date('1990-01-01');
:param admin_avatarUrl => 'https://example.com/admin.png';

// IMPORTANTE: genera fuera (Node) y pega aquí:
:param admin_salt => '97b50b9ef50f113af5e9d1c723c2da69';
:param admin_passwordHash => '$argon2id$v=19$m=65536,t=3,p=4$18Pg8sKeZo7hrA7I4+XSvQ$D55pyxKsuSLADHYcAMdr7dPgxSole1gVS3w3j4Rb5vI'; 

// Upsert de Admin, set de propiedades mínimas, rol y relación HAS_ROLE
MERGE (admin:User {username:$admin_username})
ON CREATE SET
  admin.id = randomUUID(),
  admin.email = $admin_email,
  admin.fullName = $admin_fullName,
  admin.birthDate = $admin_birthDate,
  admin.avatarUrl = $admin_avatarUrl,
  admin.createdAt = datetime(),
  admin.status = 'ACTIVE',
  admin.salt = $admin_salt,
  admin.passwordHash = $admin_passwordHash,
  admin.role = 'admin'
ON MATCH SET
  admin.email = coalesce($admin_email, admin.email),
  admin.fullName = coalesce($admin_fullName, admin.fullName),
  admin.avatarUrl = coalesce($admin_avatarUrl, admin.avatarUrl),
  admin.status = coalesce(admin.status, 'ACTIVE'),
  admin.role = 'admin';

// Seed Member
:param member_username => 'ana';
:param member_email => 'ana@example.com';
:param member_fullName => 'Ana Montero';
:param member_birthDate => date('1998-05-15');
:param member_avatarUrl => 'https://example.com/ana.png';
:param member_salt => '52c734030c9c71d1c8399089461b05e2';
:param member_passwordHash => '$argon2id$v=19$m=65536,t=3,p=4$I7JJgtjMcPrQoCRACLZ5yw$BVJYc6OuP1EIWYk/G39TVFpLRgaITdRiJf5C64gW198';

MERGE (m:User {username:$member_username})
ON CREATE SET
  m.id = randomUUID(),
  m.email = $member_email,
  m.fullName = $member_fullName,
  m.birthDate = $member_birthDate,
  m.avatarUrl = $member_avatarUrl,
  m.createdAt = datetime(),
  m.status = 'ACTIVE',
  m.salt = $member_salt,
  m.passwordHash = $member_passwordHash,
  m.role = 'member'
ON MATCH SET
  m.email = coalesce($member_email, m.email),
  m.fullName = coalesce($member_fullName, m.fullName),
  m.avatarUrl = coalesce($member_avatarUrl, m.avatarUrl),
  m.status = coalesce(m.status, 'ACTIVE'),
  m.role = 'member';