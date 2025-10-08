// -------------------------------
// 1) Constraints 
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
// 2) Catálogo de Roles
// -------------------------------
CREATE CONSTRAINT role_name_unique IF NOT EXISTS
FOR (r:Role) REQUIRE r.name IS UNIQUE;

MERGE (:Role {name:'admin'});
MERGE (:Role {name:'member'});

// -------------------------------
// 3) Relación de seguidores (followers)
//    (u1)-[:FOLLOWS {createdAt}]->(u2)
// -------------------------------

CREATE CONSTRAINT follows_createdAt_exists IF NOT EXISTS
FOR ()-[f:FOLLOWS]-() REQUIRE (f.createdAt) IS NOT NULL;

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
  admin.id           = randomUUID(),
  admin.email        = $admin_email,
  admin.fullName     = $admin_fullName,
  admin.birthDate    = $admin_birthDate,
  admin.avatarUrl    = $admin_avatarUrl,
  admin.createdAt    = datetime(),
  admin.status       = 'ACTIVE',
  admin.salt         = $admin_salt,
  admin.passwordHash = $admin_passwordHash,
  admin.roles        = ['admin']
ON MATCH SET
  // Mantén datos críticos; puedes permitir edición desde la interfaz según tu API
  admin.email        = coalesce($admin_email, admin.email),
  admin.fullName     = coalesce($admin_fullName, admin.fullName),
  admin.avatarUrl    = coalesce($admin_avatarUrl, admin.avatarUrl),
  admin.status       = coalesce(admin.status, 'ACTIVE'),
  admin.roles        = CASE WHEN 'admin' IN admin.roles THEN admin.roles ELSE coalesce(admin.roles,[]) + ['admin'] END;

MATCH (r:Role {name:'admin'})
MERGE (admin)-[:HAS_ROLE]->(r);

